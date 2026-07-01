import { dispatch } from '@flue/runtime';
import { createLineChannel } from '@p4ni/flue-line';
import assistant from '../agents/line-assistant.ts';

/**
 * Flue discovers this export and serves `POST /channels/line/webhook`
 * relative to the `flue()` mount. Register that URL as the webhook in the
 * LINE Developers console for this channel.
 */
export const channel = createLineChannel({
	channelSecret: process.env.LINE_CHANNEL_SECRET!,

	async webhook({ event }) {
		// Keep this example to plain text messages in 1-on-1 chats.
		if (event.type !== 'message' || event.message.type !== 'text') return;
		if (event.source?.type !== 'user') return;

		await dispatch(assistant, {
			// One session per LINE user, so the agent keeps conversation history per user.
			id: channel.conversationKey({ type: 'user', userId: event.source.userId }),
			input: {
				type: 'line.message',
				eventId: event.webhookEventId,
				text: event.message.text,
				replyToken: event.replyToken,
			},
		});
	},
});
