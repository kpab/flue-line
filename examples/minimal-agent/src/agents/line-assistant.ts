import { defineAgent } from '@flue/runtime';
import { createReplyMessageTool } from '@p4ni/flue-line/tools';

interface LineMessageInput {
	type: 'line.message';
	eventId: string;
	text: string;
	/**
	 * Bound here (not read by the model) so the agent's only reply tool talks
	 * back through the exact webhook delivery that triggered this session.
	 */
	replyToken: string;
}

/**
 * Default-exported from `src/agents/line-assistant.ts`, so Flue discovers it
 * as the agent named `line-assistant`. `context.input` is whatever was
 * passed as `input` to `dispatch()` in `src/channels/line.ts` — confirm the
 * exact `AgentInitializerContext` field name against the `@flue/runtime`
 * version you install, since it may change across the current beta series.
 */
export default defineAgent((context) => {
	const input = context.input as LineMessageInput;

	return {
		model: 'anthropic/claude-sonnet-4-6',
		instructions:
			'You are a friendly assistant replying to LINE chat messages. Keep replies to a ' +
			'sentence or two, reply in the same language the user wrote in, and always use the ' +
			'reply_line_message tool exactly once to send your answer back.',
		tools: [
			createReplyMessageTool({
				channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
				replyToken: input.replyToken,
			}),
		],
	};
});
