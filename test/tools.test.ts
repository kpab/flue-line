import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPushMessageTool, createReplyMessageTool } from '../src/tools.ts';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createReplyMessageTool', () => {
	it('throws when channelAccessToken is missing', () => {
		expect(() => createReplyMessageTool({ channelAccessToken: '', replyToken: 'rt' })).toThrow(
			'createReplyMessageTool() requires a non-empty channelAccessToken.',
		);
	});

	it('throws when replyToken is missing', () => {
		expect(() =>
			createReplyMessageTool({ channelAccessToken: 'token', replyToken: '' }),
		).toThrow('createReplyMessageTool() requires a non-empty replyToken.');
	});

	it('rejects empty text through its input schema', () => {
		const tool = createReplyMessageTool({ channelAccessToken: 'token', replyToken: 'rt' });
		expect(() => v.parse(tool.input as v.GenericSchema, { text: '' })).toThrow();
		expect(v.parse(tool.input as v.GenericSchema, { text: 'hi' })).toEqual({ text: 'hi' });
	});

	it('calls the reply endpoint with the bound replyToken and Bearer auth', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const tool = createReplyMessageTool({ channelAccessToken: 'secret-token', replyToken: 'rt-1' });
		const result = await tool.run({ input: { text: 'hello' }, signal: undefined });

		expect(result).toEqual({ sent: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.line.me/v2/bot/message/reply');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-token');
		expect(JSON.parse(init.body as string)).toEqual({
			replyToken: 'rt-1',
			messages: [{ type: 'text', text: 'hello' }],
		});
	});

	it('throws LineApiError when the API responds with a non-2xx status', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Invalid reply token' }, { status: 400 })),
		);
		const tool = createReplyMessageTool({ channelAccessToken: 'secret-token', replyToken: 'rt-1' });

		await expect(tool.run({ input: { text: 'hello' }, signal: undefined })).rejects.toMatchObject({
			name: 'LineApiError',
			status: 400,
		});
	});
});

describe('createPushMessageTool', () => {
	it('throws when to is missing', () => {
		expect(() => createPushMessageTool({ channelAccessToken: 'token', to: '' })).toThrow(
			'createPushMessageTool() requires a non-empty to.',
		);
	});

	it('calls the push endpoint with the bound destination', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const tool = createPushMessageTool({ channelAccessToken: 'secret-token', to: 'Uabc123' });
		await tool.run({ input: { text: 'proactive ping' }, signal: undefined });

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.line.me/v2/bot/message/push');
		expect(JSON.parse(init.body as string)).toEqual({
			to: 'Uabc123',
			messages: [{ type: 'text', text: 'proactive ping' }],
		});
	});
});
