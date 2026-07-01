import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createLineChannel } from '../src/index.ts';
import type { LineWebhookEvent } from '../src/types.ts';

const CHANNEL_SECRET = 'test-channel-secret';
const encoder = new TextEncoder();

async function sign(body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(CHANNEL_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body).buffer as ArrayBuffer);
	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function buildApp(webhook: (input: { c: unknown; destination: string; event: LineWebhookEvent }) => unknown) {
	const channel = createLineChannel({
		channelSecret: CHANNEL_SECRET,
		webhook: webhook as never,
	});
	const app = new Hono();
	for (const route of channel.routes) {
		app.on(route.method, route.path, route.handler);
	}
	return app;
}

async function post(app: Hono, body: string, headers: Record<string, string> = {}) {
	const signature = headers['x-line-signature'] ?? (await sign(body));
	return app.request('/webhook', {
		method: 'POST',
		body,
		headers: {
			'content-type': 'application/json',
			'x-line-signature': signature,
			...headers,
		},
	});
}

const textMessagePayload = (overrides: Partial<Record<string, unknown>> = {}) =>
	JSON.stringify({
		destination: 'Ubotdestination000000000000000',
		events: [
			{
				type: 'message',
				mode: 'active',
				timestamp: 1700000000000,
				webhookEventId: '01H0000000000000000000000A',
				deliveryContext: { isRedelivery: false },
				source: { type: 'user', userId: 'Uabc0000000000000000000000000001' },
				replyToken: 'reply-token-abc',
				message: { id: 'msg-1', type: 'text', text: 'hello' },
				...overrides,
			},
		],
	});

describe('createLineChannel webhook', () => {
	it('exposes a single POST /webhook route', () => {
		const channel = createLineChannel({ channelSecret: CHANNEL_SECRET, webhook: async () => {} });
		expect(channel.routes).toEqual([
			{ method: 'POST', path: '/webhook', handler: expect.any(Function) },
		]);
	});

	it('rejects requests with an invalid signature with 401', async () => {
		const webhook = vi.fn();
		const app = buildApp(webhook);
		const res = await post(app, textMessagePayload(), { 'x-line-signature': btoa('wrong') });
		expect(res.status).toBe(401);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects requests with a missing signature header with 401', async () => {
		const webhook = vi.fn();
		const app = buildApp(webhook);
		const body = textMessagePayload();
		const res = await app.request('/webhook', {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json' },
		});
		expect(res.status).toBe(401);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects non-JSON content types with 415', async () => {
		const webhook = vi.fn();
		const app = buildApp(webhook);
		const body = textMessagePayload();
		const res = await app.request('/webhook', {
			method: 'POST',
			body,
			headers: { 'content-type': 'text/plain', 'x-line-signature': await sign(body) },
		});
		expect(res.status).toBe(415);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects bodies larger than bodyLimit with 413', async () => {
		const webhook = vi.fn();
		const channel = createLineChannel({
			channelSecret: CHANNEL_SECRET,
			bodyLimit: 16,
			webhook: webhook as never,
		});
		const app = new Hono();
		for (const route of channel.routes) app.on(route.method, route.path, route.handler);
		const body = textMessagePayload();
		const res = await app.request('/webhook', {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json', 'x-line-signature': await sign(body) },
		});
		expect(res.status).toBe(413);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('calls webhook() once per event with the narrowed event and destination', async () => {
		const received: unknown[] = [];
		const app = buildApp(({ destination, event }) => {
			received.push({ destination, event });
		});
		const body = JSON.stringify({
			destination: 'Ubotdestination000000000000000',
			events: [
				{
					type: 'message',
					mode: 'active',
					timestamp: 1700000000000,
					webhookEventId: '01H0000000000000000000000A',
					deliveryContext: { isRedelivery: false },
					source: { type: 'user', userId: 'Uuser000000000000000000000001' },
					replyToken: 'reply-token-1',
					message: { id: 'msg-1', type: 'text', text: 'first' },
				},
				{
					type: 'follow',
					mode: 'active',
					timestamp: 1700000000001,
					webhookEventId: '01H0000000000000000000000B',
					deliveryContext: { isRedelivery: false },
					source: { type: 'user', userId: 'Uuser000000000000000000000002' },
					replyToken: 'reply-token-2',
					follow: {},
				},
			],
		});
		const res = await post(app, body);
		expect(res.status).toBe(200);
		expect(received).toHaveLength(2);
		expect((received[0] as { event: LineWebhookEvent }).event.type).toBe('message');
		expect((received[1] as { event: LineWebhookEvent }).event.type).toBe('follow');
	});

	it('returns an empty 200 when the handler returns nothing for every event', async () => {
		const app = buildApp(async () => undefined);
		const res = await post(app, textMessagePayload());
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('');
	});

	it('short-circuits and returns the Response when a handler returns one', async () => {
		const app = buildApp(async () => new Response('custom', { status: 202 }));
		const res = await post(app, textMessagePayload());
		expect(res.status).toBe(202);
		expect(await res.text()).toBe('custom');
	});

	it('returns 500 when the handler throws', async () => {
		const app = buildApp(async () => {
			throw new Error('boom');
		});
		const res = await post(app, textMessagePayload());
		expect(res.status).toBe(500);
	});

	it('returns 200 without calling webhook() when events is empty (LINE "Verify" button)', async () => {
		const webhook = vi.fn();
		const app = buildApp(webhook);
		const res = await post(app, JSON.stringify({ destination: 'Ubot0000000000000000000000000', events: [] }));
		expect(res.status).toBe(200);
		expect(webhook).not.toHaveBeenCalled();
	});
});

describe('createLineChannel conversation keys', () => {
	const channel = createLineChannel({ channelSecret: CHANNEL_SECRET, webhook: async () => {} });

	it('round-trips a user conversation key', () => {
		const ref = { type: 'user' as const, userId: 'Uabc123' };
		const key = channel.conversationKey(ref);
		expect(key).toBe('line:v1:user:Uabc123');
		expect(channel.parseConversationKey(key)).toEqual(ref);
	});

	it('round-trips a group conversation key', () => {
		const ref = { type: 'group' as const, groupId: 'Cabc123' };
		const key = channel.conversationKey(ref);
		expect(key).toBe('line:v1:group:Cabc123');
		expect(channel.parseConversationKey(key)).toEqual(ref);
	});

	it('round-trips a room conversation key', () => {
		const ref = { type: 'room' as const, roomId: 'Rabc123' };
		const key = channel.conversationKey(ref);
		expect(key).toBe('line:v1:room:Rabc123');
		expect(channel.parseConversationKey(key)).toEqual(ref);
	});

	it('rejects a malformed conversation key', () => {
		expect(() => channel.parseConversationKey('not-a-line-key')).toThrow(
			'Invalid LINE conversation key.',
		);
	});

	it('rejects conversationKey() with an empty identifier', () => {
		expect(() => channel.conversationKey({ type: 'user', userId: '' })).toThrow(
			'Invalid LINE userId.',
		);
	});
});

describe('createLineChannel validation', () => {
	it('throws when channelSecret is missing', () => {
		expect(() => createLineChannel({ channelSecret: '', webhook: async () => {} })).toThrow(
			'createLineChannel() requires a non-empty channelSecret.',
		);
	});

	it('throws when webhook is not a function', () => {
		expect(() =>
			createLineChannel({ channelSecret: CHANNEL_SECRET, webhook: undefined as never }),
		).toThrow('createLineChannel() requires a webhook handler.');
	});
});
