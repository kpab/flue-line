/**
 * LINE webhook event and message-content types, derived from the official
 * OpenAPI schema (https://github.com/line/line-openapi/blob/main/webhook.yml).
 *
 * LINE Things (device link/unlink, scenario execution), `module`,
 * `activated`/`deactivated`, `botSuspended`/`botResumed`, and
 * `pnpDeliveryCompletion` events are intentionally out of scope — they cover
 * discontinued or niche IoT integrations. Unrecognized `type` values are
 * still forwarded to the handler (cast, not validated), consistent with how
 * `@flue/github` trusts the provider's own event discriminator instead of
 * deep-validating payload shapes.
 */

export type LineEventMode = 'active' | 'standby';

export interface LineDeliveryContext {
	/** Whether this delivery is a LINE Platform redelivery of a previously failed webhook. */
	isRedelivery: boolean;
}

/** Canonical event origin. `userId` is absent when the bot cannot resolve it (e.g. blocked users). */
export type LineSource =
	| { type: 'user'; userId: string }
	| { type: 'group'; groupId: string; userId?: string }
	| { type: 'room'; roomId: string; userId?: string };

interface LineEventBase {
	mode: LineEventMode;
	/** Milliseconds since the epoch. */
	timestamp: number;
	/** ULID uniquely identifying this webhook event. */
	webhookEventId: string;
	deliveryContext: LineDeliveryContext;
	source?: LineSource;
}

export interface LineContentProvider {
	type: 'line' | 'external';
	originalContentUrl?: string;
	previewImageUrl?: string;
}

interface LineMessageContentBase {
	id: string;
	quoteToken?: string;
	/** Present when "Mark as read" is enabled for 1-on-1 chats. */
	markAsReadToken?: string;
}

export interface LineTextMessageContent extends LineMessageContentBase {
	type: 'text';
	text: string;
	emojis?: Array<{ index: number; length: number; productId: string; emojiId: string }>;
	mention?: { mentionees: Array<Record<string, unknown>> };
	quotedMessageId?: string;
}

export interface LineImageMessageContent extends LineMessageContentBase {
	type: 'image';
	contentProvider: LineContentProvider;
	imageSet?: { id: string; index: number; total: number };
}

export interface LineVideoMessageContent extends LineMessageContentBase {
	type: 'video';
	/** Milliseconds. */
	duration: number;
	contentProvider: LineContentProvider;
}

export interface LineAudioMessageContent extends LineMessageContentBase {
	type: 'audio';
	/** Milliseconds. */
	duration: number;
	contentProvider: LineContentProvider;
}

export interface LineFileMessageContent extends LineMessageContentBase {
	type: 'file';
	fileName: string;
	/** Bytes. */
	fileSize: number;
}

export interface LineLocationMessageContent extends LineMessageContentBase {
	type: 'location';
	title?: string;
	address?: string;
	latitude: number;
	longitude: number;
}

export type LineStickerResourceType =
	| 'STATIC'
	| 'ANIMATION'
	| 'SOUND'
	| 'ANIMATION_SOUND'
	| 'POPUP'
	| 'POPUP_SOUND'
	| 'CUSTOM'
	| 'MESSAGE';

export interface LineStickerMessageContent extends LineMessageContentBase {
	type: 'sticker';
	packageId: string;
	stickerId: string;
	stickerResourceType: LineStickerResourceType;
	keywords?: string[];
	text?: string;
	quotedMessageId?: string;
}

/** Discriminated by `type`. Narrows on `message.type` inside a `message` event. */
export type LineMessageContent =
	| LineTextMessageContent
	| LineImageMessageContent
	| LineVideoMessageContent
	| LineAudioMessageContent
	| LineFileMessageContent
	| LineLocationMessageContent
	| LineStickerMessageContent;

export interface LineMessageEvent extends LineEventBase {
	type: 'message';
	replyToken: string;
	message: LineMessageContent;
}

export interface LineUnsendEvent extends LineEventBase {
	type: 'unsend';
	unsend: { messageId: string };
}

export interface LineFollowEvent extends LineEventBase {
	type: 'follow';
	replyToken: string;
	follow: { isUnblocked?: boolean };
}

export interface LineUnfollowEvent extends LineEventBase {
	type: 'unfollow';
}

export interface LineJoinEvent extends LineEventBase {
	type: 'join';
	replyToken: string;
}

export interface LineLeaveEvent extends LineEventBase {
	type: 'leave';
}

export interface LineMemberJoinedEvent extends LineEventBase {
	type: 'memberJoined';
	replyToken: string;
	joined: { members: Array<{ type: 'user'; userId: string }> };
}

export interface LineMemberLeftEvent extends LineEventBase {
	type: 'memberLeft';
	left: { members: Array<{ type: 'user'; userId: string }> };
}

export interface LinePostbackEvent extends LineEventBase {
	type: 'postback';
	replyToken?: string;
	postback: { data: string; params?: Record<string, unknown> };
}

export interface LineVideoPlayCompleteEvent extends LineEventBase {
	type: 'videoPlayComplete';
	replyToken: string;
	videoPlayComplete: { trackingId: string };
}

export interface LineBeaconEvent extends LineEventBase {
	type: 'beacon';
	replyToken: string;
	beacon: { hwid: string; type: 'enter' | 'banner' | 'stay'; dm?: string };
}

export interface LineAccountLinkEvent extends LineEventBase {
	type: 'accountLink';
	replyToken?: string;
	link: { result: 'ok' | 'failed'; nonce: string };
}

export interface LineMembershipEvent extends LineEventBase {
	type: 'membership';
	replyToken: string;
	membership: { membershipId: number; [key: string]: unknown };
}

/**
 * A verified LINE webhook event. `type` discriminates every field below —
 * for example, narrowing on `type === 'message'` exposes `replyToken` and
 * `message`, and further narrowing on `message.type` exposes the content
 * fields for that message kind.
 */
export type LineWebhookEvent =
	| LineMessageEvent
	| LineUnsendEvent
	| LineFollowEvent
	| LineUnfollowEvent
	| LineJoinEvent
	| LineLeaveEvent
	| LineMemberJoinedEvent
	| LineMemberLeftEvent
	| LinePostbackEvent
	| LineVideoPlayCompleteEvent
	| LineBeaconEvent
	| LineAccountLinkEvent
	| LineMembershipEvent;

export type LineWebhookEventType = LineWebhookEvent['type'];
