const encoder = new TextEncoder();

/**
 * Verifies the `X-Line-Signature` header against the exact delivered
 * request bytes, per LINE's HMAC-SHA256 (Base64) scheme. Uses Web Crypto
 * `SubtleCrypto` only, so the same implementation runs unmodified on
 * Node.js and Cloudflare Workers (`nodejs_compat`).
 */
export async function verifyLineSignature(
	channelSecret: string,
	body: Uint8Array,
	signatureHeader: string | null,
): Promise<boolean> {
	if (!signatureHeader) return false;
	const signature = decodeBase64(signatureHeader);
	if (!signature) return false;

	const key = await crypto.subtle.importKey(
		'raw',
		toArrayBuffer(encoder.encode(channelSecret)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify'],
	);
	return crypto.subtle.verify('HMAC', key, toArrayBuffer(signature), toArrayBuffer(body));
}

function decodeBase64(value: string): Uint8Array | undefined {
	if (value.length === 0 || value.length % 4 !== 0) return undefined;
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	} catch {
		return undefined;
	}
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.slice().buffer;
}
