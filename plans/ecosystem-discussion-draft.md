# Draft: withastro/flue Discussions post (NOT posted — draft only)

Target: https://github.com/withastro/flue/discussions, category
**"Feature Request"** (confirmed via the GitHub API — as of this writing
that's the only discussion category the repo has; there's no separate
"Ideas"/"Ecosystem" category).

There's clear precedent for this exact kind of post in that category, e.g.:

- ["Adding Raindrop to Tooling ecosystem docs"](https://github.com/withastro/flue/discussions/345) —
  a short "here's a tool, can I add it to the docs?" post. A maintainer
  (`FredKSchott`) replied within the day: _"yup, definitely interested,
  alongside a blueprint... thanks!"_
- ["Add Jetty tooling integration to ecosystem docs"](https://github.com/withastro/flue/discussions/358) —
  same pattern, for a third-party eval/observability tool.
- ["Generic HTTP webhook ingress channel (@flue/http)"](https://github.com/withastro/flue/discussions/329) —
  a channel-shaped feature request specifically.

Skimmed the 30 most recent discussions in that category: they're all
low-key feature requests and integration proposals, mostly 0-1 comments,
no sign of maintainers pushing back harshly on reasonable, well-scoped
asks. Posting here is normal, not presumptuous.

---

**Title:** LINE Messaging API channel (`@kpab/flue-line`) — okay to add to the Ecosystem docs?

Hi! I put together `@kpab/flue-line`, a channel package for the LINE
Messaging API, since I didn't see LINE covered under `@flue/*` yet (checked
`packages/` and the Ecosystem docs).

Repo: https://github.com/kpab/flue-line

Follows the same shape as `@flue/github` / `@flue/slack`:
`createLineChannel({ channelSecret, webhook })` verifies `X-Line-Signature`
against the exact request bytes (HMAC-SHA256/Base64, Web Crypto only, so it
runs unmodified on Node and Workers), narrows events by `type` against
LINE's own OpenAPI schema, and ships `conversationKey()`/
`parseConversationKey()` plus separate reply/push tools
(`@kpab/flue-line/tools`, via `defineTool()`) so the channel itself has no
outbound dependency. Node + Workers test suites, `tsdown` build,
Apache-2.0.

Like the Raindrop/Jetty threads above — is it fine to open a PR adding an
entry to the Ecosystem → Channels docs for this (as a community/third-party
channel, not asking for an `@flue/` scope)? Happy to add a
`flue add channel line` blueprint too if that's the expected shape for a
listed channel. Let me know if there's a bar I should clear first (usage,
maintenance commitment, etc.).

Thanks for Flue!

---

## Notes for whoever posts this

- Repo URL above is real (already pushed). Publish to npm before posting
  if possible — reviewers will likely want `npm install @kpab/flue-line`
  to actually work.
- Re-check the category still exists and is still named "Feature Request"
  before posting — confirmed via `gh api graphql` on 2026-07-01, but
  category names/structure can change.
- Consider linking a passing CI run / published npm version if available by
  the time this is posted, the way the Jetty thread links a worked example.
