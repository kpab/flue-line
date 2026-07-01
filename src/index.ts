import type { Context, Env, Handler } from 'hono';
import { InvalidLineConversationKeyError, InvalidLineInputError } from './errors.ts';
import type { LineWebhookEvent } from './types.ts';
import { createLineWebhookHandler } from './webhook.ts';

export { InvalidLineConversationKeyError, InvalidLineInputError, LineApiError } from './errors.ts';
export type {
	LineAccountLinkEvent,
	LineAudioMessageContent,
	LineBeaconEvent,
	LineContentProvider,
	LineDeliveryContext,
	LineEventMode,
	LineFileMessageContent,
	LineFollowEvent,
	LineImageMessageContent,
	LineJoinEvent,
	LineLeaveEvent,
	LineLocationMessageContent,
	LineMemberJoinedEvent,
	LineMemberLeftEvent,
	LineMembershipEvent,
	LineMessageContent,
	LineMessageEvent,
	LinePostbackEvent,
	LineSource,
	LineStickerMessageContent,
	LineStickerResourceType,
	LineTextMessageContent,
	LineUnfollowEvent,
	LineUnsendEvent,
	LineVideoMessageContent,
	LineVideoPlayCompleteEvent,
	LineWebhookEvent,
	LineWebhookEventType,
} from './types.ts';

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface ChannelRoute<E extends Env = Env> {
	readonly method: string;
	readonly path: string;
	readonly handler: Handler<E>;
}

/** Ingress configuration for one fixed LINE Messaging API webhook. */
export interface LineChannelOptions<E extends Env = Env> {
	/** Channel secret issued in the LINE Developers console. Verifies inbound deliveries. */
	channelSecret: string;
	/** Maximum request-body size in bytes. Defaults to 1 MiB. */
	bodyLimit?: number;
	/** Receives one verified event at a time from the delivery's `events` array. */
	webhook(input: LineWebhookHandlerInput<E>): LineWebhookHandlerResult;
}

export interface LineWebhookHandlerInput<E extends Env = Env> {
	c: Context<E>;
	/** The receiving LINE Official Account's bot user ID. */
	destination: string;
	/** A single verified event. `event.type` discriminates the remaining fields. */
	event: LineWebhookEvent;
}

type LineWebhookHandlerValue = undefined | JsonValue | Response;

/**
 * Returning nothing (for every event in the delivery) produces an empty
 * `200`. Returning a `Response` or Hono response from any event stops
 * processing the remaining events in that delivery and sends it directly.
 * JSON-compatible values are otherwise ignored, since one delivery can
 * carry multiple independent events.
 */
export type LineWebhookHandlerResult = LineWebhookHandlerValue | Promise<LineWebhookHandlerValue>;

/** Canonical LINE push/reply destination: a 1-on-1 user, a group chat, or a multi-person room. */
export type LineConversationRef =
	| { type: 'user'; userId: string }
	| { type: 'group'; groupId: string }
	| { type: 'room'; roomId: string };

/** Verified ingress and canonical identity helpers. */
export interface LineChannel<E extends Env = Env> {
	readonly routes: readonly ChannelRoute<E>[];
	/** Serializes a canonical namespaced identifier. It is not an authorization capability. */
	conversationKey(ref: LineConversationRef): string;
	/** Parses only canonical keys produced by `conversationKey()`. */
	parseConversationKey(id: string): LineConversationRef;
}

/**
 * Creates a fixed-webhook LINE channel.
 *
 * Requests are verified against the exact delivered bytes with
 * `X-Line-Signature` before the handler runs. A delivery's `events` array is
 * iterated and the handler is invoked once per event — LINE batches
 * multiple events into a single HTTP delivery, unlike GitHub's one-event-
 * per-delivery model. The channel is stateless: LINE does not include a
 * delivery id to deduplicate on, and it retries the entire delivery when
 * the webhook does not return a `2xx` within its own retry policy, so keep
 * event handling idempotent.
 */
export function createLineChannel<E extends Env = Env>(
	options: LineChannelOptions<E>,
): LineChannel<E> {
	validateOptions(options);
	const webhookHandler = createLineWebhookHandler<E>({
		channelSecret: options.channelSecret,
		bodyLimit: options.bodyLimit,
		webhook: options.webhook,
	});

	const channel: LineChannel<E> = {
		routes: [{ method: 'POST', path: '/webhook', handler: webhookHandler }],
		conversationKey(ref) {
			assertConversationRef(ref);
			if (ref.type === 'user') return `line:v1:user:${encodeURIComponent(ref.userId)}`;
			if (ref.type === 'group') return `line:v1:group:${encodeURIComponent(ref.groupId)}`;
			return `line:v1:room:${encodeURIComponent(ref.roomId)}`;
		},
		parseConversationKey(id) {
			try {
				const match = /^line:v1:(user|group|room):([^:]+)$/.exec(id);
				const kind = match?.[1];
				const value = match?.[2];
				if (!kind || !value) throw new InvalidLineConversationKeyError();
				const decoded = decodeURIComponent(value);
				const ref: LineConversationRef =
					kind === 'user'
						? { type: 'user', userId: decoded }
						: kind === 'group'
							? { type: 'group', groupId: decoded }
							: { type: 'room', roomId: decoded };
				assertConversationRef(ref);
				if (channel.conversationKey(ref) !== id) throw new InvalidLineConversationKeyError();
				return ref;
			} catch (error) {
				if (error instanceof InvalidLineConversationKeyError) throw error;
				throw new InvalidLineConversationKeyError();
			}
		},
	};

	return channel;
}

function validateOptions<E extends Env>(options: LineChannelOptions<E>): void {
	if (!options || typeof options !== 'object') {
		throw new TypeError('createLineChannel() requires an options object.');
	}
	if (typeof options.channelSecret !== 'string' || options.channelSecret.length === 0) {
		throw new TypeError('createLineChannel() requires a non-empty channelSecret.');
	}
	if (typeof options.webhook !== 'function') {
		throw new TypeError('createLineChannel() requires a webhook handler.');
	}
}

function assertConversationRef(ref: LineConversationRef): void {
	if (!ref || typeof ref !== 'object') throw new InvalidLineInputError('ref');
	if (ref.type === 'user') return assertIdentifier(ref.userId, 'userId');
	if (ref.type === 'group') return assertIdentifier(ref.groupId, 'groupId');
	if (ref.type === 'room') return assertIdentifier(ref.roomId, 'roomId');
	throw new InvalidLineInputError('type');
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
		throw new InvalidLineInputError(field);
	}
}
