# `@kpab/flue-line`

[Flue](https://flueframework.com) アプリケーション向けの、検証済み LINE
Messaging API webhook 取り込みチャンネルと、reply/push 送信ツール。

本パッケージは非公式のコミュニティ製チャンネルです。執筆時点で Flue
Ecosystem には公式の `@flue/line` パッケージが存在しないため、
[`@flue/github`](https://flueframework.com/docs/ecosystem/channels/github/)
や [`@flue/slack`](https://github.com/withastro/flue/tree/main/packages/slack)
と同じ設計思想を踏襲し、その空白領域を埋めるものです。

[English README is here](./README.md)

## Quickstart

```sh
npm install @kpab/flue-line
```

`@flue/runtime` は peerDependencies です。未導入なら追加してください
（通常 Flue アプリには既に入っています）。

```sh
npm install @flue/runtime
```

## Overview

`createLineChannel()` は、受信した各配信の `X-Line-Signature` を検証対象の
生バイト列に対して検証してから `webhook` コールバックを呼び出します。また
`event.type` によってイベントを型で絞り込みます。

```ts
import { createLineChannel } from '@kpab/flue-line';

export const channel = createLineChannel({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,

  // Path: /channels/line/webhook
  async webhook({ event, destination }) {
    // `event.type` が `event` の残りのフィールドを判別する
    if (event.type === 'message' && event.message.type === 'text') {
      console.log(event.message.text);
    }
  },
});
```

LINE は GitHub の「1配信=1イベント」とは異なり、1回のHTTP配信に複数の
イベントをまとめて送ってきます。そのため `webhook()` はリクエストごとでは
なく、配信内のイベント1件ごとに呼び出されます。いずれかの呼び出しで
`Response` を返すと、その配信内の残りのイベント処理を打ち切ってそのまま
返却します。すべてのイベントで何も返さなければ、処理完了後に空の `200`
を返します。本パッケージはステートレスであり、LINE の配信には重複排除用
の ID が含まれないため、ハンドラは冪等に実装してください。

対応イベント種別（`event.type`）: `message`（`message.type` でさらに
`text` | `image` | `video` | `audio` | `file` | `location` | `sticker` に
絞り込み）、`unsend`, `follow`, `unfollow`, `join`, `leave`,
`memberJoined`, `memberLeft`, `postback`, `videoPlayComplete`, `beacon`,
`accountLink`, `membership`。これらは
[公式の webhook イベントスキーマ](https://github.com/line/line-openapi/blob/main/webhook.yml)
に基づいています。LINE Things（IoTデバイスの連携・解除・シナリオ実行）
など一部のニッチなイベントはスコープ外です。

## Configure

[LINE Developers コンソール](https://developers.line.biz/console/)で
Messaging API チャネルを作成し、以下を設定します。

```sh
LINE_CHANNEL_SECRET=...        # 基本設定タブ — 受信webhookの検証に使用
LINE_CHANNEL_ACCESS_TOKEN=...  # Messaging APIタブ — reply/push用のBearerトークン
```

LINE公式アカウントマネージャーで、応答メッセージ・あいさつメッセージの
自動応答をオフにし、エージェントだけが返信するようにしてください。

## Channel module

このエクスポートを `src/channels/line.ts` に配置します。Flue が自動検出し、
`flue()` のマウント先を基準に `POST /channels/line/webhook` を提供します。

```ts
import { dispatch } from '@flue/runtime';
import { createLineChannel } from '@kpab/flue-line';
import assistant from '../agents/assistant.ts';

export const channel = createLineChannel({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,

  async webhook({ event }) {
    if (event.type !== 'message' || event.message.type !== 'text') return;
    if (event.source?.type !== 'user') return;

    await dispatch(assistant, {
      // LINEユーザー1人につき1セッション
      id: channel.conversationKey({ type: 'user', userId: event.source.userId }),
      input: {
        type: 'line.message',
        eventId: event.webhookEventId,
        text: event.message.text,
      },
    });
  },
});
```

`channel.conversationKey()` は、1対1ユーザー・グループチャット・複数人
ルームを表す、正規化された名前空間付き識別子をシリアライズします
（認可capabilityではありません）。`channel.parseConversationKey()` は
`conversationKey()` が生成したキーのみを解析し、push ツールの `to` に
そのまま渡せる `{ type: 'user' | 'group' | 'room', ... }` 形式の参照に
往復変換します。

## Bind the tool

送信系（reply/push）の呼び出しは、チャンネル本体とは別モジュール
`@kpab/flue-line/tools` に分離されています。チャンネル自体はそれらに
一切依存しません — チャンネルの責務は検証済みの取り込みであり、いつ・
どう返信するかはアプリケーション側が決めます。

`defineAgent()` の初期化関数はセッションごとに一度だけ実行され、受け取る
のは `{ id, env }`（`@flue/runtime` の `AgentInitializerContext`）のみで、
`dispatch()` に渡したイベントごとの `input` は含まれません。そのため
ツールはイベント単位ではなく `context.id`（会話キー）から束縛します。
セッションを通じて安定している **push** ツールはここで束縛するのが
自然です。会話キーから LINE の宛先を復元します。

```ts
import { defineAgent } from '@flue/runtime';
import { createPushMessageTool } from '@kpab/flue-line/tools';
import { channel } from '../channels/line.ts';

export default defineAgent((context) => {
  const ref = channel.parseConversationKey(context.id);
  const to = ref.type === 'user' ? ref.userId : ref.type === 'group' ? ref.groupId : ref.roomId;

  return {
    model: 'anthropic/claude-sonnet-4-6',
    instructions: 'LINEメッセージに丁寧かつ簡潔に返信してください。',
    tools: [createPushMessageTool({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!, to })],
  };
});
```

LINE のリプライトークンは一度しか使えず webhook 発火から短時間で失効する
ため、セッションの生存期間全体で1回だけ束縛されるツールには馴染みません。
即時の応答確認には代わりに `createReplyMessageTool({ channelAccessToken,
replyToken })` を使い、`dispatch()` の前に `webhook()` の中でモデルを
介さず直接呼び出します。

```ts
await createReplyMessageTool({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  replyToken: event.replyToken,
}).run({ input: { text: '考え中です…' }, signal: undefined });
```

いずれの場合もモデルが選択できるのはメッセージの `text` のみです。
`replyToken` と push の宛先 `to` は信頼できるコードが束縛するものであり、
モデルが選択可能な入力としては一切公開しません。

チャンネルと両方のツールを組み合わせた完全に動作するアプリの例は
[`examples/minimal-agent`](./examples/minimal-agent) を参照してください。

## Testing

```sh
npm test             # Node.js (vitest)
npm run test:workerd  # Cloudflare Workers (Miniflare, nodejs_compat)
```

署名検証は Web Crypto の `SubtleCrypto` のみを使用しているため、同じ実装が
両方のランタイムでそのまま動作します。

## License

Apache-2.0（[Flue](https://github.com/withastro/flue) 本体に合わせています）。
[LICENSE](./LICENSE) を参照してください。
