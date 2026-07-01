# `@p4ni/flue-line`

Verified LINE Messaging API webhook ingress, plus reply/push send tools, for
[Flue](https://flueframework.com) applications.

This is an unofficial, community-maintained channel. As of this writing
there is no first-party `@flue/line` package in the
[Flue ecosystem](https://flueframework.com/docs/ecosystem/) — `@p4ni/flue-line`
fills that gap, following the same design as first-party channels like
[`@flue/github`](https://flueframework.com/docs/ecosystem/channels/github/)
and [`@flue/slack`](https://github.com/withastro/flue/tree/main/packages/slack).

[日本語版 README はこちら](./README.ja.md)

## Quickstart

```sh
npm install @p4ni/flue-line
```

`@flue/runtime` is a peer dependency — install it if you haven't already
(any Flue app already has it):

```sh
npm install @flue/runtime
```

## Overview

`createLineChannel()` verifies every inbound delivery's `X-Line-Signature`
against the exact request bytes before your `webhook` callback ever runs,
and narrows each event by its `type`:

```ts
import { createLineChannel } from '@p4ni/flue-line';

export const channel = createLineChannel({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,

  // Path: /channels/line/webhook
  async webhook({ event, destination }) {
    // `event.type` discriminates the rest of `event`'s shape.
    if (event.type === 'message' && event.message.type === 'text') {
      console.log(event.message.text);
    }
  },
});
```

LINE batches multiple events into a single HTTP delivery — unlike GitHub's
one-event-per-delivery model — so `webhook()` is called once per event in
that delivery, not once per request. Returning a `Response` from any call
stops processing the remaining events in that delivery and sends it
directly; returning nothing (for every event) yields an empty `200` once
they're all processed. The package is stateless: LINE has no delivery id to
deduplicate on, so keep your handler idempotent.

Supported event types (`event.type`): `message` (narrows `message.type` to
`text` | `image` | `video` | `audio` | `file` | `location` | `sticker`),
`unsend`, `follow`, `unfollow`, `join`, `leave`, `memberJoined`,
`memberLeft`, `postback`, `videoPlayComplete`, `beacon`, `accountLink`, and
`membership` — matching the
[official webhook event schema](https://github.com/line/line-openapi/blob/main/webhook.yml).
LINE Things (IoT device link/unlink/scenario) and a handful of other niche
event types are out of scope.

## Configure

Create a Messaging API channel in the
[LINE Developers console](https://developers.line.biz/console/) and set:

```sh
LINE_CHANNEL_SECRET=...        # Basic settings tab — verifies inbound webhooks
LINE_CHANNEL_ACCESS_TOKEN=...  # Messaging API tab — Bearer token for reply/push
```

Turn off the LINE Official Account's own auto-reply and greeting messages in
the LINE Official Account Manager so only your agent replies.

## Channel module

Place this export in `src/channels/line.ts`. Flue discovers it and serves
`POST /channels/line/webhook` relative to the `flue()` mount:

```ts
import { dispatch } from '@flue/runtime';
import { createLineChannel } from '@p4ni/flue-line';
import assistant from '../agents/assistant.ts';

export const channel = createLineChannel({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,

  async webhook({ event }) {
    if (event.type !== 'message' || event.message.type !== 'text') return;
    if (event.source?.type !== 'user') return;

    await dispatch(assistant, {
      // One session per LINE user.
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
```

`channel.conversationKey()` serializes a canonical, namespaced identifier
for a 1-on-1 user, group chat, or multi-person room — it is not an
authorization capability. `channel.parseConversationKey()` parses only keys
produced by `conversationKey()`, and round-trips them back to a
`{ type: 'user' | 'group' | 'room', ... }` ref you can pass straight to the
push tool's `to`.

## Bind the tool

Outbound send calls (reply/push) live in a separate module,
`@p4ni/flue-line/tools`, so the channel itself never depends on them — the
channel's job is verified ingress, and yours is deciding when and how to
answer:

```ts
import { defineAgent } from '@flue/runtime';
import { createReplyMessageTool } from '@p4ni/flue-line/tools';

export default defineAgent((context) => {
  const input = context.input as { text: string; replyToken: string };

  return {
    model: 'anthropic/claude-sonnet-4-6',
    instructions: 'Reply to LINE messages helpfully and concisely.',
    tools: [
      createReplyMessageTool({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
        replyToken: input.replyToken,
      }),
    ],
  };
});
```

The model only ever chooses the message `text` — the `replyToken` (or push
`to` destination) is bound by trusted code from the webhook event, never
exposed as a model-selectable input. A LINE reply token is single-use and
expires shortly after the webhook fires, so create the reply tool fresh per
event and expect to call it at most once; use `createPushMessageTool({
channelAccessToken, to })` instead for messages sent outside a reply
window (proactive notifications, delayed follow-ups, etc.).

See [`examples/minimal-agent`](./examples/minimal-agent) for a complete,
runnable app wiring the channel and both tools together.

## Testing

```sh
npm test            # Node.js (vitest)
npm run test:workerd # Cloudflare Workers (Miniflare, nodejs_compat)
```

Signature verification uses Web Crypto `SubtleCrypto` only, so the same
implementation runs unmodified on both runtimes.

## License

Apache-2.0, matching [Flue](https://github.com/withastro/flue) itself. See
[LICENSE](./LICENSE).
