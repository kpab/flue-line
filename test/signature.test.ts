import { describe, expect, it } from 'vitest';
import { verifyLineSignature } from '../src/signature.ts';

const encoder = new TextEncoder();

async function sign(secret: string, body: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const digest = await crypto.subtle.sign('HMAC', key, body.slice().buffer as ArrayBuffer);
	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('verifyLineSignature', () => {
	const channelSecret = 'test-channel-secret';
	const body = encoder.encode('{"destination":"Uxxxx","events":[]}');

	it('accepts a correctly signed body', async () => {
		const signature = await sign(channelSecret, body);
		await expect(verifyLineSignature(channelSecret, body, signature)).resolves.toBe(true);
	});

	it('rejects a signature computed with the wrong secret', async () => {
		const signature = await sign('another-secret', body);
		await expect(verifyLineSignature(channelSecret, body, signature)).resolves.toBe(false);
	});

	it('rejects a signature for a different body', async () => {
		const signature = await sign(channelSecret, body);
		const tamperedBody = encoder.encode('{"destination":"Uxxxx","events":[{"type":"evil"}]}');
		await expect(verifyLineSignature(channelSecret, tamperedBody, signature)).resolves.toBe(false);
	});

	it('rejects a missing signature header', async () => {
		await expect(verifyLineSignature(channelSecret, body, null)).resolves.toBe(false);
	});

	it('rejects an empty signature header', async () => {
		await expect(verifyLineSignature(channelSecret, body, '')).resolves.toBe(false);
	});

	it('rejects a malformed (non-base64) signature header', async () => {
		await expect(verifyLineSignature(channelSecret, body, 'not-valid-base64!!')).resolves.toBe(
			false,
		);
	});

	it('rejects a base64 value that is not a valid HMAC-SHA256 digest length', async () => {
		await expect(verifyLineSignature(channelSecret, body, btoa('too-short'))).resolves.toBe(
			false,
		);
	});
});
