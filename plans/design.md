# `@p4ni/flue-line` 設計方針

Flue（https://flueframework.com、GitHub: withastro/flue）向けの LINE Messaging API
チャンネルパッケージの設計方針。npm に `@flue/line` あるいは同等のパッケージが
存在しない空白領域を埋める、コミュニティ実装（サードパーティ・スコープ
`@p4ni/`）として実装する。

## 1. 事前調査で確認した事実

### 1.1 Flue の第一級チャンネルの設計パターン

`@flue/github`（`packages/github`）と `@flue/slack`（`packages/slack`）の実ソース
（`src/index.ts`, `src/webhook.ts`, `src/errors.ts`, `package.json`,
`tsdown.config.ts`, `vitest.config.ts`, `vitest.workerd.config.ts`,
`tsconfig.json`）を GitHub から直接取得して読んだ。共通パターンは以下の通り。

- **ファクトリ関数**: `createXChannel(options): XChannel` という命名。
  `options` はプロバイダの検証シークレット（`webhookSecret` /
  `signingSecret`）と、検証済みペイロードを受け取る非同期コールバックを持つ。
- **返り値の `XChannel`**:
  - `routes: readonly ChannelRoute<E>[]` — `{ method, path, handler }` の配列。
    `path` はプロバイダ固有の固定サフィックス（GitHub は単一の `/webhook`、
    Slack は `/events` `/interactions` `/commands` の複数）。Flue の
    ファイルベースルーティングが `channels/line.ts` のエクスポートを
    `/channels/line/<path>` にマウントする。
  - `conversationKey(ref): string` / `parseConversationKey(id): ref` —
    会話の相手（Issue、スレッドなど）を一意に表す**識別子**であり、
    認可capabilityではない。フォーマットは
    `<provider>:v1:<field>:<urlencoded value>:...` で、往復（生成→解析→再生成が
    元の文字列と一致すること）を検証してから返す。
  - `routes` は Hono の `Handler<E>` を使う。`Env` 型パラメータで
    ユーザーのアプリ環境変数型に対応する。
- **Webhook 検証は「チャンネルパッケージが完全に所有」**（ガイドページより）。
  アプリケーション側は検証済みペイロードだけを受け取る。生バイト列に対して
  署名検証してから JSON パースする（タイミング攻撃・パース差異攻撃を避ける）。
- **ハンドラの戻り値**: `undefined | JsonValue | Response`。`undefined` は
  空の `200`、JSON 互換値は `Response.json(...)`、`Response`/Hono レスポンス
  はそのまま透過。
- **エラー型**: `InvalidXConversationKeyError extends Error`,
  `InvalidXInputError extends TypeError`（`field` プロパティ付き）。
- **ステートレス**: 配信 ID の重複排除はアプリ側の責務。
- **ツールは同梱しない**（`@flue/github` は「does not include an outbound
  GitHub client or model tools」と明記し、`flue add channel` で
  アプリ所有のコードとして生成させる）。ただし本パッケージでは要件により、
  LINE の reply/push 送信を **チャンネル本体とは別モジュール
  （`src/tools.ts`、サブパスエクスポート `@p4ni/flue-line/tools`）** として
  同梱する。理由は 2.5 節を参照。
- **`defineTool()`**（`@flue/runtime`）: `{ name, description, input?,
  output?, run({ input, signal }) }` を受け取り凍結したオブジェクトを返す。
  `input`/`output` は Valibot スキーマ（トップレベル `object` スキーマが必須）。
  `run` の戻り値は JSON シリアライズ可能でなければならない。
- **`dispatch()`**（`@flue/runtime`）: `dispatch(agent, { id, input })` の形で
  検証済みイベントをエージェントセッションに渡す。`id` は
  `channel.conversationKey(...)` の値を使う。

### 1.2 ビルド／テスト／配布の型

- ESM 専用、`tsdown` でビルド（`entry: ['src/index.ts'], format: ['esm'],
  dts: true, clean: true`）。
- `package.json` の `exports` は `types` / `import` の2フィールドのみ、
  `main`/`types` フィールドも併記。`files: ["dist"]`。`engines.node
  >=22.19.0`。
- テストは `vitest`（Node 環境、`test/**/*.test.ts`）と
  `@cloudflare/vitest-pool-workers`（`test-workerd/**/*.test.ts`、
  `nodejs_compat` 有効な Miniflare）の2系統。署名検証を Web Crypto
  （`crypto.subtle`）だけで実装しているのは、この2環境（Node と
  Cloudflare Workers）両方で同じコードが動くようにするため。
- ライセンスは **Apache-2.0**（Flue 本体のライセンスを確認した結果。
  当初案の MIT ではなく、ユーザーとの確認の上で Apache-2.0 を採用）。

### 1.3 LINE Messaging API の仕様（公式ドキュメント・OpenAPI 定義より）

- **署名検証**: リクエストヘッダ `X-Line-Signature` に、チャネルシークレット
  を鍵とした HMAC-SHA256 のダイジェストを Base64 エンコードした値が入る。
  検証対象は**受信した生のリクエストボディバイト列**（JSON パース前）。
- **Webhook リクエスト本体**（`line/line-openapi` の `webhook.yml` を直接
  取得して確認）:
  - `destination`: string（Bot の User ID, `^U[0-9a-f]{32}$`）
  - `events`: `Event[]` — **1リクエストに複数イベントが含まれ得る**
    （GitHub の 1配信=1イベントとは異なる）。
  - 共通 `Event` フィールド: `type`（discriminator）, `timestamp`
    （int64, ms epoch）, `mode`（`active` | `standby`）, `webhookEventId`
    （ULID）, `deliveryContext.isRedelivery`（bool）, `source?`。
  - `source` は `type` で判別: `user`（`userId`）/ `group`（`groupId`,
    `userId?`）/ `room`（`roomId`, `userId?`）。
  - 実装対象イベント種別（`type` の discriminator 値）: `message`,
    `unsend`, `follow`, `unfollow`, `join`, `leave`, `memberJoined`,
    `memberLeft`, `postback`, `videoPlayComplete`, `beacon`,
    `accountLink`, `membership`。各イベントは `replyToken`（一部必須・
    一部任意・一部なし）を持つ。
  - `message` イベントの `message` は `type` で判別する
    `MessageContent` の discriminated union: `text`, `image`, `video`,
    `audio`, `file`, `location`, `sticker`（各フィールドは OpenAPI
    定義から正確に転記、`src/types.ts` 参照）。
  - **スコープ外**: LINE Things（IoT）関連の `deviceLink` /
    `deviceUnlink` / `things`（scenario execution）、`module`,
    `activated`/`deactivated`, `botSuspended`/`botResumed`,
    `pnpDeliveryCompletion` は niche/廃止予定寄りの機能のため実装せず、
    型定義に `LineUnknownWebhookEvent`（`type: string` を保持する
    フォールバック型）を用意して将来拡張できるようにする。
- **返信 (`reply`) API**: `POST https://api.line.me/v2/bot/message/reply`。
  認証は `Authorization: Bearer <channel access token>`。ボディは
  `{ replyToken, messages: Message[] (1..5), notificationDisabled? }`。
  **`replyToken` は一度しか使えず、短時間で失効する**（公式ドキュメントに
  正確な秒数の明記はないため、コード上で秒数を仮定しない。使用は
  「webhook 受信直後に一度だけ」という制約をコメント／README に明記する）。
- **プッシュ (`push`) API**: `POST https://api.line.me/v2/bot/message/push`。
  認証は reply と同じ Bearer。ボディは `{ to, messages: Message[]
  (1..5), notificationDisabled?, customAggregationUnits? }`。
  冪等性のため任意で `X-Line-Retry-Key`（UUID）ヘッダを送信できる。
- 送信系のレスポンスは 200 / 400 / 401 / 403 / 429 など。429 (レート
  リミット) はツールの `run()` からそのままエラーとして投げ、モデルに
  リトライ判断を委ねる（Flue の「validation fails, the model receives a
  tool error and can retry」という設計思想に合わせる）。

## 2. `@p4ni/flue-line` の設計

### 2.1 ディレクトリ構成（`@flue/github` を踏襲）

```
flue-line/
├── src/
│   ├── index.ts       # createLineChannel, 型の再export, LineChannel
│   ├── webhook.ts      # 署名検証 + POST /webhook ハンドラ
│   ├── types.ts        # LINE webhookイベントの discriminated union
│   ├── errors.ts        # InvalidLineConversationKeyError 等
│   ├── tools.ts         # createLineMessagingTools（reply/push, defineTool）
│   └── signature.ts     # Web Crypto ベースの HMAC-SHA256 検証ユーティリティ
├── test/
│   ├── webhook.test.ts
│   ├── signature.test.ts
│   ├── types.test.ts
│   └── tools.test.ts
├── test-workerd/
│   └── webhook.test.ts  # Cloudflare Workers (nodejs_compat) 環境での検証
├── examples/
│   └── minimal-agent/   # LINE→Flue Agent 最小サンプル
├── plans/
│   ├── design.md         # 本ファイル
│   └── ecosystem-discussion-draft.md
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── vitest.workerd.config.ts
├── README.md
├── README.ja.md
└── LICENSE
```

### 2.2 `createLineChannel()` のシグネチャ

```ts
export interface LineChannelOptions<E extends Env = Env> {
  /** LINE Developers コンソールで発行されるチャネルシークレット。署名検証に使用。 */
  channelSecret: string;
  /** リクエストボディの最大バイト数。既定は 1 MiB。 */
  bodyLimit?: number;
  /** 検証済みの LINE webhook イベントを1件ずつ受け取る。 */
  webhook(input: LineWebhookHandlerInput<E>): LineWebhookHandlerResult;
}

export interface LineWebhookHandlerInput<E extends Env = Env> {
  c: Context<E>;
  event: LineWebhookEvent;         // discriminated union（type で判別）
  destination: string;              // Bot User ID
}

export interface LineChannel<E extends Env = Env> {
  readonly routes: readonly ChannelRoute<E>[];   // [{method:'POST', path:'/webhook', handler}]
  conversationKey(ref: LineConversationRef): string;
  parseConversationKey(id: string): LineConversationRef;
}

export type LineConversationRef =
  | { type: 'user'; userId: string }
  | { type: 'group'; groupId: string }
  | { type: 'room'; roomId: string };
```

- `conversationKey` フォーマット: `line:v1:user:<id>` /
  `line:v1:group:<id>` / `line:v1:room:<id>`。これは LINE の push API
  の `to` フィールド（userId/groupId/roomId）とそのまま対応するため、
  `parseConversationKey(id).{userId|groupId|roomId}` を push ツールの
  宛先解決にそのまま使える。
- GitHub 同様「単一の固定 Webhook」（LINE Developers コンソールで
  1 Bot につき 1 Webhook URL のみ設定する運用に合わせる）なので
  `routes` は `POST /webhook` の 1 本のみ。
- **1 リクエスト = 複数イベント**という LINE 特有の構造を吸収するため、
  `webhook()` はイベント単位で複数回呼ばれる（`{ event }` 単数形、
  ユーザー要件の `webhook: async ({ event }) => {...}` に一致）。
  レスポンスの扱いは GitHub/Slack の規約を踏襲しつつ多重呼び出しに
  対応させる:
  - 返り値が `Response` の場合は即座にそれを返し、以降のイベント処理を
    打ち切る（早期リターン）。
  - それ以外（`undefined`/JSON値）は無視して次のイベントへ進む。
  - すべて処理し終えたら空の `200` を返す。
  - いずれかのイベント処理で例外が投げられた場合は `500` を返す
    （LINE は失敗した配信をリトライするため、部分的失敗は
    「配信全体の失敗」として扱い、アプリ側の冪等な設計に委ねる）。
    この挙動は README に明記する。

### 2.3 署名検証（`src/signature.ts`）

`@flue/github` の `webhook.ts` と同じ形（生バイト列を読み切ってから
`crypto.subtle.importKey('raw', ..., {name:'HMAC', hash:'SHA-256'},
false, ['verify'])` → `crypto.subtle.verify(...)`）を採用するが、LINE は
ダイジェストを **Base64** で送ってくる点が GitHub（hex）と異なるため、
Base64 デコード関数を自前で実装する（Node/Workers 両対応、
`atob`/`Uint8Array.fromBase64` 等のランタイム差異を吸収）。

### 2.4 イベント型（`src/types.ts`）

`line/line-openapi` の `webhook.yml` を典拠に、discriminated union で
実装する。共通の `LineEventBase` に `mode`, `timestamp`, `webhookEventId`,
`deliveryContext`, `source?` を持たせ、各イベント型がそれを拡張する。
`LineMessageContent` も同様に `type` で判別する union
（`text`|`image`|`video`|`audio`|`file`|`location`|`sticker`）とする。

### 2.5 reply/push ツール（`src/tools.ts`）— 責務分離の設計

Flue の一般ガイドは「送信 API 呼び出しはツールの責務、認証情報の束縛は
アプリケーションの責務」としている。`@flue/github` はツール自体を
同梱せず `flue add channel` で生成させる方針だが、本要件は明示的に
「reply/push をチャンネル本体とは責務分離した defineTool として提供」
することを求めている。そのため:

- `src/tools.ts` はチャンネルの `src/index.ts`/`webhook.ts` から
  **依存されない**独立モジュールとし、`@p4ni/flue-line/tools` という
  サブパスエクスポートを `package.json#exports` に追加する
  （チャンネル本体だけを使いたい利用者がツールのコードごと
  バンドルされないようにするため）。
- `createLineMessagingTools({ channelAccessToken })` がファクトリで、
  `replyMessageTool` と `pushMessageTool` の2つの `defineTool()` 結果を
  返す。
  - `replyMessageTool`: 入力は `{ replyToken, text }`
    （モデルに渡すのは本文のみ。`replyToken` はモデルの入力候補には
    含めず、**信頼コード側（webhook ハンドラ）から `defineTool` の
    クロージャに束縛する**設計にする。これはガイドの
    「モデルが選択可能な値はメッセージ内容に限定し、宛先・認証情報は
    アプリケーションが制御する」という原則に合わせるため。
    そのため実際のツール生成 API は
    `createReplyMessageTool({ channelAccessToken, replyToken })` /
    `createPushMessageTool({ channelAccessToken, to })` のように
    **イベントごとに束縛して生成する**関数にする。
  - `run()` 内で `fetch('https://api.line.me/v2/bot/message/reply', ...)`
    を呼び、非 2xx は `Error` を投げてモデルにリトライ判断を渡す。
- `channelAccessToken` はコンストラクタ引数として渡すのみで、モデルへの
  露出やログ出力はしない。

### 2.6 examples/

`examples/minimal-agent/` に、LINE から届いた `message`（text）イベントに
対して Flue Agent が応答し `createReplyMessageTool` で返信する最小構成を
置く。`channels/line.ts`, `agents/assistant.ts`, `.env.example`,
`README.md` の4点構成とする。

## 3. 未確定・要確認事項

- LINE 公式ドキュメントの reply token の正確な有効期限秒数は
  非公開のため、コードでは秒数を仮定しない。
- `@flue/runtime` の `dispatch()`/`defineTool()` の型は
  ドキュメント調査ベースであり、`peerDependencies` の
  `@flue/runtime` バージョンは `^1.0.0-beta.1`（`@flue/github` と
  同じ prerelease 系列）を仮定する。実際の npm 公開バージョンが
  異なる場合は利用者側で調整が必要。

## 4. 実装後の追記（`npm install` して型を確認した結果の訂正）

`npm install` で実際に `@flue/runtime` の型定義を取得し `tsc` を通した
ところ、2.5 節で書いた reply ツールのバインド方針に誤りがあることが
判明した。`AgentInitializerContext` は `{ id, env }` のみを持ち、
`dispatch()` に渡した `input` は含まれない。`defineAgent()` の
初期化関数は「ハーネスの初期化ごとに1回」（実質セッションの生存期間に
つき1回）しか呼ばれず、`AgentRuntimeConfig.tools` はそのときに固定される。
つまりイベント（メッセージ）ごとに変わる `replyToken` を初期化関数の中で
ツールに束縛することはできない。

これを受けて `examples/minimal-agent` は以下のように修正した。

- **push ツール**は `context.id`（= `conversationKey()` の値）を
  `channel.parseConversationKey()` で復元して宛先を得て、セッション
  初期化時に1回だけ束縛する（安定した宛先なので初期化関数の設計と
  相性が良い）。
- **reply ツール**はモデルのツールとして公開せず、`webhook()` ハンドラ
  内で `dispatch()` する前に直接 `.run(...)` を呼び出し、即時の
  受信確認（例:「考え中です…」）を送るためだけに使う。これは
  LINE のリプライトークンが「短時間で失効する一度きりのトークン」で
  あるという制約と、Flue のセッションが「初期化時にツールを固定する」
  という制約の両方に整合する。

README（英語・日本語）とサンプルコードはこの訂正を反映済み。
