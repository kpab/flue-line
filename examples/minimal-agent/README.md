# `flue-line` minimal agent example

A minimal Flue app: a LINE Official Account receives a text message, and a
Flue agent replies to it using `@p4ni/flue-line`.

```
src/
├── agents/
│   └── line-assistant.ts   # replies using createReplyMessageTool()
└── channels/
    └── line.ts              # verified webhook ingress, dispatches to the agent
flue.config.ts
.env.example
```

## 1. Install

```sh
npm install
```

`@p4ni/flue-line` is linked from the repo root (`file:../..`) so you're
testing against the local package build, not a published version.

## 2. Configure

Create a LINE Official Account and a Messaging API channel in the
[LINE Developers console](https://developers.line.biz/console/), then copy
`.env.example` to `.env` and fill in:

- `ANTHROPIC_API_KEY` — used by the agent's model.
- `LINE_CHANNEL_SECRET` — "Channel secret" on the channel's Basic settings tab.
  Verifies inbound webhook requests.
- `LINE_CHANNEL_ACCESS_TOKEN` — issue a long-lived channel access token on the
  Messaging API tab. Used to call the Reply Message API.

In the LINE Official Account Manager, turn the account's own auto-reply and
greeting messages **off** so only this agent replies.

## 3. Run

```sh
npx flue dev
```

`flue dev` serves `src/channels/line.ts` at `/channels/line/webhook`. Expose
that locally-running server to the internet (for example with
`cloudflared tunnel --url http://localhost:<port>` or `ngrok http <port>`),
then in the LINE Developers console set the channel's webhook URL to:

```
https://<your-tunnel-host>/channels/line/webhook
```

and enable "Use webhook".

## 4. Try it

Add the LINE Official Account as a friend with its QR code (Messaging API
tab) and send it a text message. The webhook handler in
`src/channels/line.ts` verifies the request, dispatches a
`line.message` input to the `line-assistant` agent for a session keyed by
the sender's user id, and the agent replies with `reply_line_message` bound
to that event's one-time-use `replyToken`.

## Notes

- This example only handles 1-on-1 text messages; extend
  `src/channels/line.ts` to branch on `event.type` / `event.message.type`
  for group chats, stickers, images, postbacks, etc. — see the type
  definitions exported from `@p4ni/flue-line` for the full set of events.
- The reply tool is created inside the agent's `defineAgent()` initializer
  (from `context.input.replyToken`), not inside the channel handler, since
  the tool must be available when the agent's session actually runs.
