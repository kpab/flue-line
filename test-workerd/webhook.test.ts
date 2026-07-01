import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createLineChannel } from '../src/index.ts';

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

/**
 * Smoke-tests that signature verification and event dispatch run correctly
 * under the Cloudflare Workers runtime (Miniflare + `nodejs_compat`), since
 * `src/signature.ts` relies only on Web Crypto `SubtleCrypto`.
 */
describe('createLineChannel on workerd', () => {
	it('verifies a signed request and narrows the event by type', async () => {
		const received: string[] = [];
		const channel = createLineChannel({
			channelSecret: CHANNEL_SECRET,
			webhook: async ({ event }) => {
				received.push(event.type);
			},
		});
		const app = new Hono();
		for (const route of channel.routes) app.on(route.method, route.path, route.handler);

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
					message: { id: 'msg-1', type: 'text', text: 'hello from workerd' },
				},
			],
		});

		const res = await app.request('/webhook', {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json', 'x-line-signature': await sign(body) },
		});

		expect(res.status).toBe(200);
		expect(received).toEqual(['message']);
	});

	it('rejects an invalid signature with 401', async () => {
		const channel = createLineChannel({ channelSecret: CHANNEL_SECRET, webhook: async () => {} });
		const app = new Hono();
		for (const route of channel.routes) app.on(route.method, route.path, route.handler);

		const body = JSON.stringify({ destination: 'Ubot0000000000000000000000000', events: [] });
		const res = await app.request('/webhook', {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json', 'x-line-signature': 'invalid' },
		});

		expect(res.status).toBe(401);
	});
});
