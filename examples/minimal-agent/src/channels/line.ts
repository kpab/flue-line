import { dispatch } from '@flue/runtime';
import { createLineChannel } from '@kpab/flue-line';
import { createReplyMessageTool } from '@kpab/flue-line/tools';
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

		// Send the immediate acknowledgement ourselves, directly, using the
		// event's one-time-use replyToken — this call is not a model tool,
		// since it must happen synchronously within LINE's short reply
		// window, well before the agent below has a chance to think.
		await createReplyMessageTool({
			channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
			replyToken: event.replyToken,
		}).run({ input: { text: '考え中です…' }, signal: undefined });

		// The agent's actual answer arrives later via push_line_message,
		// bound to this session's stable LINE destination (see
		// src/agents/line-assistant.ts).
		await dispatch(assistant, {
			// One session per LINE user, so the agent keeps conversation history per user.
			id: channel.conversationKey({ type: 'user', userId: event.source.userId }),
			input: {
				type: 'line.message',
				eventId: event.webhookEventId,
				text: event.message.text,
			},
		});
	},
});
