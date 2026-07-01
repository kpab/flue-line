# Draft: withastro/flue Discussions post (NOT posted — draft only)

Target: https://github.com/withastro/flue/discussions, "Ideas" (or
whichever category is closest to ecosystem/package proposals).

---

**Title:** Community LINE Messaging API channel (`@p4ni/flue-line`) — okay to propose for the Ecosystem docs?

Hi! I put together `@p4ni/flue-line`, a community channel package for the
LINE Messaging API, since I noticed LINE isn't covered by any package under
`@flue/*` yet (looked through `packages/` and the Ecosystem docs to check).

Repo: https://github.com/p4ni/flue-line _(placeholder — update once pushed)_

It follows the same shape as `@flue/github` and `@flue/slack`:

- `createLineChannel({ channelSecret, webhook })` — verifies
  `X-Line-Signature` against the exact request bytes (HMAC-SHA256, Base64)
  before the handler runs, using Web Crypto `SubtleCrypto` only, so it works
  unmodified on both Node.js and Cloudflare Workers (`nodejs_compat`).
- Discriminated-union event types (`message`, `follow`, `postback`, etc.)
  generated against LINE's own OpenAPI schema
  (`line/line-openapi`'s `webhook.yml`).
- `conversationKey()` / `parseConversationKey()` for 1-on-1/group/room
  destinations, matching the `github`/`slack` conventions.
- Reply/push send tools shipped separately from the channel
  (`@p4ni/flue-line/tools`, via `defineTool()`), so the channel package
  itself has no outbound dependency — same "ingress vs. app-owned tools"
  split described in the Channels guide.
- Node (`vitest`) and Workers (`@cloudflare/vitest-pool-workers`) test
  suites, `tsdown` build, Apache-2.0 license to match the main repo.

Before I put more time into polishing it further: is it appropriate to open
a PR adding an entry for this to the Ecosystem docs (as a
community/third-party channel, not asking for it to move under the
`@flue/` npm scope)? And is there a preferred process — e.g. a minimum
bar around maintenance commitment, a specific "third-party" section format
in the docs, or a general policy on not listing community packages at all
yet? Happy to adjust naming, scope, or docs formatting to whatever fits
best.

Thanks for Flue — it's been a clean framework to build a channel against.

---

## Notes for whoever posts this

- Replace the placeholder repo URL once the package is actually pushed to a
  public GitHub repo and (optionally) published to npm.
- Confirm the correct Discussions category name in the actual repo before
  posting (category names can change).
- Consider linking to a passing CI run / published npm version if available
  by the time this is posted — reviewers will likely want to see it
  actually installs and works before considering an Ecosystem docs entry.
