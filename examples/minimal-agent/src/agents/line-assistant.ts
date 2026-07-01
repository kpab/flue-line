import { defineAgent } from '@flue/runtime';
import { createPushMessageTool } from '@p4ni/flue-line/tools';
import { channel } from '../channels/line.ts';

function resolveDestination(id: string): string {
	const ref = channel.parseConversationKey(id);
	if (ref.type === 'user') return ref.userId;
	if (ref.type === 'group') return ref.groupId;
	return ref.roomId;
}

/**
 * Default-exported from `src/agents/line-assistant.ts`, so Flue discovers it
 * as the agent named `line-assistant`. `defineAgent()`'s initializer runs
 * once per session and only receives `{ id, env }` — not the per-message
 * `input` passed to `dispatch()` — so tools here are bound from `context.id`
 * (the conversation key), not from a single event.
 *
 * That's also why this agent uses the *push* tool instead of *reply*: a
 * LINE reply token is single-use and expires shortly after its webhook
 * fires, so it doesn't fit a tool that's wired once for a session's whole
 * lifetime. `src/channels/line.ts` sends the immediate reply-token
 * acknowledgement itself, directly, outside of the model's tool loop.
 */
export default defineAgent((context) => ({
	model: 'anthropic/claude-sonnet-4-6',
	instructions:
		'You are a friendly assistant replying to LINE chat messages. Keep replies to a ' +
		'sentence or two, reply in the same language the user wrote in, and always use the ' +
		'push_line_message tool to send your answer back.',
	tools: [
		createPushMessageTool({
			channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
			to: resolveDestination(context.id),
		}),
	],
}));
