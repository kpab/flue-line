/**
 * LINE reply/push send tools, exported from `@p4ni/flue-line/tools` as a
 * module separate from the channel (`@p4ni/flue-line`). The channel package
 * never imports from here: verifying inbound webhooks and sending outbound
 * messages are different responsibilities, and only trusted application
 * code should decide which reply token or destination a tool call is bound
 * to. The model only ever chooses the message text.
 */
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { LineApiError } from './errors.ts';

const LINE_MESSAGING_API_BASE = 'https://api.line.me/v2/bot/message';

async function sendLineMessages(input: {
	endpoint: 'reply' | 'push';
	channelAccessToken: string;
	body: Record<string, unknown>;
	signal?: AbortSignal;
}): Promise<void> {
	const response = await fetch(`${LINE_MESSAGING_API_BASE}/${input.endpoint}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${input.channelAccessToken}`,
		},
		body: JSON.stringify(input.body),
		signal: input.signal,
	});
	if (!response.ok) {
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			body = undefined;
		}
		throw new LineApiError({ endpoint: input.endpoint, status: response.status, body });
	}
}

export interface CreateReplyMessageToolOptions {
	/** Channel access token issued for the LINE Official Account. Sent as a Bearer token. */
	channelAccessToken: string;
	/**
	 * The triggering event's `replyToken`. Bind it from trusted webhook code,
	 * never from model input — it is single-use and expires shortly after
	 * the webhook fires, so create (and use) this tool once per event.
	 */
	replyToken: string;
}

/**
 * Creates a `defineTool()` value that replies to the LINE event this
 * `replyToken` came from. Call `createReplyMessageTool()` fresh for every
 * webhook event; do not cache or reuse the returned tool across events.
 */
export function createReplyMessageTool(options: CreateReplyMessageToolOptions) {
	assertNonEmpty(options.channelAccessToken, 'channelAccessToken', 'createReplyMessageTool');
	assertNonEmpty(options.replyToken, 'replyToken', 'createReplyMessageTool');

	return defineTool({
		name: 'reply_line_message',
		description:
			"Reply to the LINE user, group, or room that triggered this event, using LINE's Reply " +
			'Message API. The reply token backing this tool is single-use and expires shortly, so ' +
			'call it at most once for this event; use the push tool for any further messages.',
		input: v.object({
			text: v.pipe(
				v.string(),
				v.minLength(1),
				v.description('The message text to send back to LINE.'),
			),
		}),
		async run({ input, signal }) {
			await sendLineMessages({
				endpoint: 'reply',
				channelAccessToken: options.channelAccessToken,
				signal,
				body: {
					replyToken: options.replyToken,
					messages: [{ type: 'text', text: input.text }],
				},
			});
			return { sent: true };
		},
	});
}

export interface CreatePushMessageToolOptions {
	/** Channel access token issued for the LINE Official Account. Sent as a Bearer token. */
	channelAccessToken: string;
	/**
	 * The push destination: a user, group, or room id. Bind it from trusted
	 * code (for example `channel.parseConversationKey(id)`), never from
	 * model input.
	 */
	to: string;
}

/**
 * Creates a `defineTool()` value that pushes a message to a fixed LINE
 * destination outside of a reply window, e.g. for proactive notifications.
 */
export function createPushMessageTool(options: CreatePushMessageToolOptions) {
	assertNonEmpty(options.channelAccessToken, 'channelAccessToken', 'createPushMessageTool');
	assertNonEmpty(options.to, 'to', 'createPushMessageTool');

	return defineTool({
		name: 'push_line_message',
		description:
			"Send a text message to a specific LINE user, group, or room using LINE's Push Message " +
			'API. Unlike the reply tool, this works at any time and is not bound to a webhook event.',
		input: v.object({
			text: v.pipe(v.string(), v.minLength(1), v.description('The message text to send.')),
		}),
		async run({ input, signal }) {
			await sendLineMessages({
				endpoint: 'push',
				channelAccessToken: options.channelAccessToken,
				signal,
				body: {
					to: options.to,
					messages: [{ type: 'text', text: input.text }],
				},
			});
			return { sent: true };
		},
	});
}

function assertNonEmpty(value: unknown, field: string, label: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`${label}() requires a non-empty ${field}.`);
	}
}
