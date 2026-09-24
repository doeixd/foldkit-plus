# Upstream plan: what `foldkit-ssr` asks of Foldkit

**Status:** proposals 1 and 2 filed on 2026-09-24 as
[foldkit#1447](https://github.com/foldkit/foldkit/issues/1447) and
[foldkit#1448](https://github.com/foldkit/foldkit/issues/1448); proposal 3
held, as its route says. Checked against Foldkit `main` at `95fed7fdaf`
(2026-09-23) and the published 0.163.0.

`foldkit-ssr` works on Foldkit 0.163 with no upstream change: every phase of
[its plan](./design/ssr-PLAN.md) is built on public API plus behaviour Foldkit
already tests. This document is the short list of changes that would remove a
workaround or close an integration gap, ordered by how likely each is to be
merged, with the evidence each one needs and the drafts to send.

## What Foldkit will expect

These come from Foldkit's `CONTRIBUTING.md` and `AGENTS.md`. A proposal that
misses one gets review comments about it before anyone reads the idea.

- **A concrete framework-level use case.** Foldkit's `AGENTS.md` says to
  weigh the external consumer base but "not invoke hypothetical consumers to
  justify speculative complexity". Each proposal below names the code in this
  repository that needs it today, and the Foldkit users who would hit the
  same gap.
- **Elm Architecture first.** Maintainers push back on anything that weakens
  unidirectional data flow, Messages as facts, the Model as single source of
  truth, or side effects confined to Commands. Nothing below adds state
  outside the Model or a second way to dispatch.
- **An issue before a pull request** for anything that shapes API. The recent
  outside contribution #1433 closed an issue, #1432, that stated the need
  first. Proposal 1 is small enough to go straight to a pull request; 2 and 3
  start as issues.
- **The change is whole.** A public export carries TSDoc. The docs page,
  `packages/website/src/page/core/serverRendering.md`, changes in the same
  pull request, with any example as a snippet under
  `packages/website/src/snippet/`, never a fence in the page. A changeset
  ships with it: `minor` for a new export or option, since Foldkit is pre-1.0;
  renamed to describe the change; written as release notes with each
  paragraph on one line.
- **Their style, not ours.** `Readonly<{...}>` for inline object types,
  Schema types, `Option` for absence, no bracket indexing, no `switch`, no
  comments except TSDoc and a sparing `// NOTE:`. No em dashes anywhere,
  including the changeset and the pull request.
- **Their commits.** Conventional Commits scoped by package directory:
  `feat(foldkit): ...`, with a subject that names the mechanism and a body
  that says what was wrong before what changed. Prose wraps at 80 columns.
  No AI co-author trailer and no mention of an assistant: the commit-msg hook
  rejects one, and `CONTRIBUTING.md` forbids the other. This repository's
  `Claude-Session` line must not reach an upstream commit.
- **Their checks.** `pnpm pre-push` runs what CI runs: build, typecheck,
  every test, lint, `check:dead-code` (no unused exports), the changeset
  checks, and a Chromium pass over the website. A pull request goes up only
  after it passes locally.

## Proposal 1: export the build attribute

**Ask.** Export `FOLDKIT_BUILD_ATTRIBUTE`, the `data-foldkit-build` stamp,
from `foldkit/experimental/server`, beside `FOLDKIT_APP_ATTRIBUTE` and
`FOLDKIT_FLAGS_ATTRIBUTE`.

**Why Foldkit would want it.** The build id is the first thing any hydration
handoff checks, and Foldkit's own docs tell users to rely on the attribute: "a
browser test can wait for `[data-foldkit-build]` to disappear". Today that
test has to spell the string, while the other two stamps are importable. The
constant already exists internally as `HYDRATION_BUILD_ATTRIBUTE` in
`src/buildToken.ts`; the change is one export under the public naming.

**Why we need it.** `foldkit-ssr` compares the stamp with its own build id
before it reads its envelope, in the order Foldkit checks a page. It hard-codes
`'data-foldkit-build'` in `packages/ssr/src/index.ts` and keeps a test that
pins the string to what Foldkit stamps.

**The change.**

- `src/hydrationMarker.ts`: add `FOLDKIT_BUILD_ATTRIBUTE` with TSDoc in the
  style of its neighbours: what the stamp holds, who writes it, who reads and
  removes it, and that a refused handoff keeps it. Have `buildToken.ts` use
  it, so there is one definition.
- `src/experimental/server/public.ts` and its `index.ts`: export it beside the
  other two.
- A test that a hydratable `renderToString` stamps the root under the
  exported name, and that `Runtime.hydrate` removes it on adoption. The
  second may already exist under the literal; switch it to the constant.
- Docs: in "The hydration handoff", name the constant where the attribute is
  described, and use it in the snippet that waits for adoption if there is
  one.
- Changeset `export-build-attribute.md`, `'foldkit': minor`:

  > `foldkit/experimental/server` now exports `FOLDKIT_BUILD_ATTRIBUTE`, the `data-foldkit-build` attribute a hydratable render stamps on the application root. It sits beside `FOLDKIT_APP_ATTRIBUTE` and `FOLDKIT_FLAGS_ATTRIBUTE`, so code that reads the hydration handoff, such as a browser test waiting for the client to take the page over, no longer spells the attribute by hand.
  >
  > The attribute and its behaviour have not changed. The client still removes it when it adopts the root, and a refused handoff still keeps it.

- Commit: `feat(foldkit): export FOLDKIT_BUILD_ATTRIBUTE from the server
  module`, with a body saying the other two stamps were importable and this
  one had to be spelled.

**Route.** Straight to a pull request. It is one export of an existing
constant under an existing naming scheme, and the docs already describe the
attribute as something to rely on.

**Afterwards, here.** Replace the local constant with the import and delete
the pinning test.

## Proposal 2: let a `Rendered` result carry the entry's own JSON payloads

**Ask.** A way for a server entry to put its own `<script
type="application/json">` payloads beside the root while still returning
`Rendered`, so `toResponse`, `handleRequest` and the built-in `prerender`
place them with the same safety they give the Flags payload.

**The gap.** A `Rendered` result holds a `RenderedApplication` plus status and
headers. `injectIntoTemplate` accepts, beside the root, only Foldkit's own
Flags script, and it verifies the page parses back to exactly that. So an
entry with any other per-request data has one option: build the page itself
and answer `Responded`. That costs three things:

- **Static generation.** Foldkit's built-in `prerender` refuses a `Responded`
  result, by design, since a `Responded` body could need headers a file
  cannot keep. So an entry that must answer `Responded` cannot use Foldkit's
  own static generation. `foldkit-ssr` has to ship its own `SSR.generate` for
  that reason alone.
- **The template.** The entry takes the template as its own argument and
  injects into it, duplicating what `handleRequest` already owns.
- **The checks.** The entry's payload does not get the parser-stability
  checks `injectIntoTemplate` gives the root and the Flags script.

**Who has such data.** Anything the browser needs that is not `init`'s input.
In this repository: `foldkit-ssr`'s resume envelope, and `foldkit-remote`'s
snapshot text form for a server-rendered cache (`dehydrate` and `hydrate`).
Outside it: any query-cache or store library that serializes its state for the
first paint.

**Why not Flags.** Flags are `init`'s input, decoded through the application's
Flags Schema at boot. Putting a library's state there couples every
application's Flags Schema to that library's wire format, and makes `init`
decode and discard data it does not use. The Flags docs also frame Flags as
what both sides feed `init`; this data is not that.

**API sketch, for the issue.**

```ts
Server.Rendered(application, {
  payloads: [Server.Payload({ attribute: 'data-foldkit-plus-resume', json: envelope })],
})
```

- `Payload` is `Readonly<{ attribute: string; json: unknown }>`. `json` is
  serialized with the escaping Foldkit already applies to Flags, so a value
  cannot close its script element.
- The attribute must be a `data-*` name outside Foldkit's reserved
  `data-foldkit-*` namespace, and each attribute appears at most once.
  `Rendered` refuses otherwise with a typed error, as the server module
  refuses other malformed input.
- `injectIntoTemplate` places the payloads after the root and after the Flags
  script, and its parser-stability check covers them.
- `prerender` accepts a `Rendered` with payloads and writes them into the
  file, since they are part of the page, not response metadata.
- The client does nothing with them. Reading its own payload is the
  library's job, the way `foldkit-ssr` reads its envelope today.

**Questions to leave open in the issue.** Whether the option belongs on
`Rendered` or on `RenderedApplication`. Whether Foldkit wants to take a Schema
and encode, rather than taking JSON. Whether the payloads go before `</body>`
instead, if a maintainer prefers them away from the root. The issue should
ask rather than decide these.

**Route.** An issue first, titled for the gap: "A server entry cannot add its
own JSON payload without leaving `Rendered`, which `prerender` refuses". Lead
with the `prerender` consequence, which is Foldkit's own feature. Include the
sketch and the three questions. Build the pull request only once a maintainer
agrees on a shape. The pull request then carries tests for placement, escaping,
the reserved namespace, duplicates, the parser check with scripting on and
off, and `prerender` writing a file with payloads. It also adds a docs
subsection under "The result contract" and a changeset,
`rendered-entry-payloads.md`.

**Afterwards, here.** `SSR.entry` returns `Rendered`, its `template` option
goes, and a resumable page generates through Foldkit's `prerender`. Whether
`SSR.generate` then stays or becomes a thin wrapper is our decision.

## Proposal 3: hydrate from a Model the server hands over

**Ask, as a question.** Would Foldkit accept a hydrating boot that starts from
a Model the page carries, decoded through the application's `Model` Schema,
instead of rerunning `init` from Flags?

**What we do today, and what it costs.** `SSR.hydrate` calls `Runtime.hydrate`
with a copy of the config whose `init` returns the resumed Model and the
plan's boot Commands. It works, and a test pins that the Flags half of the
workaround stays safe. The costs:

- The copied config must drop its `Flags` key entirely, since
  `Runtime.hydrate` requires a Flags payload whenever the config declares
  Flags. Setting it to `undefined` is not enough, and
  `packages/ssr/test/flagsTrap.test.ts` exists to pin exactly that.
- The substituted `init` hides from DevTools and any tooling that reads the
  config that this boot did not run the application's `init`.
- Validating the handed-over Model is ours to do. Foldkit already decodes a
  preserved Model through the `Model` Schema's JSON codec on the model
  preservation path, and would do it the same way here.

**Why it might fit.** The runtime already has this path internally. A Model
restored after a development reload is decoded through the `Model` Schema and
skips `init` (`runtime.ts`, the `preservedModel` branch). What it does not do
is adopt the server's DOM: a restored Model "skips adoption and gets a fresh
patch against the stamped root" (`hydrationHandoff.ts`). The ask is that
combination: a decoded Model, no `init`, adoption as `hydrate` does it, and
the Commands the application names for that boot.

**Why it might not.** Foldkit's server rendering is built on "the same `init`
on both sides", with Flags as the bridge, and the docs present that as the
model. A second handoff kind is a real addition to explain. Only one library
needs it today, and ours works without it.

**Route.** An issue in the form of a question, and only after proposal 1 has
merged and `foldkit-ssr` is published with users of its own. Until then it is
the kind of ask Foldkit's `AGENTS.md` tells maintainers to decline. The issue
shows the workaround, the three costs, and the existing preserved-Model path,
and asks whether a design along those lines would be welcome. No pull request
unless the answer is yes.

## What we are not asking for

These were on this repository's list and are dropped or held after this
check:

- **A guarantee that `hydrate` commits synchronously.** Deferred boot relies
  on the first render, listeners included, landing inside the event that
  boots the page. Foldkit already offers `Render.afterCommit`, which "waits
  for that patch and nothing else". `foldkit-ssr` can yield it in its replay
  Subscription entry, and re-dispatch an unanswered event there, instead of
  asking Foldkit to promise the timing. That is our change to make.
- **Pinning the other two hydration behaviours** we rely on. Foldkit already
  tests both: `hydrate.test.ts` has "removes stale server attributes,
  classes, and styles the client view drops" and "re-asserts controlled input
  values over user edits". Nothing to send.
- **Subscriptions that start while the view waits**, which would replace the
  deferrable declarations. It needs a runtime that boots without its first
  render, a large change with no user outside `foldkit-ssr`.
- **Externally owned children and a renderer per subtree**, which opaque
  boundaries and Surface-level hydration would need. Both are large renderer
  changes, and no application here needs either yet.
- **A Vite hook to drop static-region code from the client bundle.** Worth
  asking only once static regions are in real use and the bytes are measured.

## Order

1. Our side first: move deferred boot onto `Render.afterCommit`, so nothing
   we do depends on commit timing. This belongs in the SSR plan's Phase G.
2. Proposal 1 as a pull request.
3. Proposal 2 as an issue, then a pull request on the agreed shape.
4. Proposal 3 as a question, after `foldkit-ssr` is published and in use.

Each upstream change is followed here by removing the workaround it replaces,
with the SSR plan and README updated in the same commit.
