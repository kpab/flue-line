import type { Env, Handler } from 'hono';
import type { LineWebhookHandlerInput, LineWebhookHandlerResult } from './index.ts';
import { verifyLineSignature } from './signature.ts';
import type { LineWebhookEvent } from './types.ts';

const DEFAULT_BODY_LIMIT = 1 * 1024 * 1024;

interface LineWebhookHandlerOptions<E extends Env> {
	channelSecret: string;
	bodyLimit?: number;
	webhook(input: LineWebhookHandlerInput<E>): LineWebhookHandlerResult;
}

export function createLineWebhookHandler<E extends Env>(
	options: LineWebhookHandlerOptions<E>,
): Handler<E> {
	const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
	if (!Number.isSafeInteger(bodyLimit) || bodyLimit <= 0) {
		throw new TypeError('LINE webhook bodyLimit must be a positive integer.');
	}
	const channelSecret = options.channelSecret;

	return async (c) => {
		const request = c.req.raw;
		const contentLength = request.headers.get('content-length');
		if (contentLength !== null) {
			if (!/^\d+$/.test(contentLength)) return new Response(null, { status: 400 });
			if (Number(contentLength) > bodyLimit) return new Response(null, { status: 413 });
		}

		const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
		if (mediaType !== 'application/json') {
			return new Response(null, { status: 415 });
		}

		let body: Uint8Array | undefined;
		try {
			body = await readBody(request, bodyLimit);
		} catch {
			return new Response(null, { status: 400 });
		}
		if (!body) return new Response(null, { status: 413 });

		const signatureHeader = request.headers.get('x-line-signature');
		if (!(await verifyLineSignature(channelSecret, body, signatureHeader))) {
			return new Response(null, { status: 401 });
		}

		const payload = parsePayload(body);
		if (!isRecord(payload)) return new Response(null, { status: 400 });

		const destination = payload.destination;
		const events = payload.events;
		if (typeof destination !== 'string' || !Array.isArray(events)) {
			return new Response(null, { status: 400 });
		}

		try {
			for (const rawEvent of events) {
				if (!isRecord(rawEvent) || typeof rawEvent.type !== 'string') continue;
				const event = rawEvent as unknown as LineWebhookEvent;
				const result = await options.webhook({ c, destination, event });
				if (isResponse(result)) return result;
			}
		} catch {
			return new Response(null, { status: 500 });
		}

		return new Response(null, { status: 200 });
	};
}

async function readBody(request: Request, bodyLimit: number): Promise<Uint8Array | undefined> {
	if (!request.body) return new Uint8Array();
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > bodyLimit) {
				void reader.cancel();
				return undefined;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

function parsePayload(body: Uint8Array): unknown {
	try {
		const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResponse(value: unknown): value is Response {
	return Object.prototype.toString.call(value) === '[object Response]';
}
