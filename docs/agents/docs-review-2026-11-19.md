# Documentation review, 2026-11-19

What is wrong with Foldkit Plus's documentation, why, and what to do about it.
Written for the maintainer and for the agents who will do the rewrites. The
rules that come out of it are in [`writing-docs.md`](./writing-docs.md).

## Summary

The documentation is accurate. Its snippets compile, its claims were checked
against the source, and several pages state ownership and failure semantics
better than most libraries do. It is still hard to read, for six reasons that
recur in almost every document.

1. **Pages open with what the package is, in our words, instead of the
   problem it solves.** `foldkit-entity` begins "A domain declared once as
   typed values, which other packages interpret"; `foldkit-mixins-ui` begins
   "**Adapters** take a component `@foldkit/ui` already owns, name its
   attribute bundles as typed `foldkit-mixins` Slots, and run the Mixins
   resolver over them". A stranger cannot tell from either what they would use
   it for. *Fix:* the first 150 words name a problem the reader has and show
   the "before", then the plain idea, then our name for it.

2. **Our vocabulary is used before it is explained.** The root README's first
   60 lines use about 25 of our terms (state machine, Schema-typed Model,
   Message union, Commands, replicas, slice, Surface, Bundle, journal, read
   model, Mirror, owner…) and explain three. The glossary defines terms with
   other terms: "**Reach**: What a body reads in other rows: a path through
   `one` relations or an exists." *Fix:* a mechanical term check (every term in
   order of first use, with the sentence that introduces it) on every draft.

3. **One file is five documents.** A package README is landing page,
   tutorial, task guide, reference, design rationale and changelog at once:
   `foldkit-remote`'s is 4,553 lines, `foldkit-mixins-ui`'s 3,400. The site's
   home page for a package is everything before its first example, so
   `/remote` opens on 567 source lines and its sidebar lists about 110 pages.
   Reference detail lands in tables whose cells run to 2,002 characters.
   *Fix:* one job per page: the README is a landing page of about 200 lines,
   and guides and reference move to files of their own.

4. **Examples prove that the code compiles, not that it does anything.** The
   root README's first example is 163 lines with 7 import lines and runs
   nothing. Remote's opening snippet uses `App`, `Data`, `ProjectSummary` and
   `ProjectSkeleton`, which are defined in hidden HTML comments the reader never
   sees; its "Watch it arrive" step is an ASCII diagram. Bundle's first example
   ends "These declarations do not mount anything." In the survey, 4 of 19
   first examples in one batch and about 7 of 19 in another show a result.
   *Fix:* the first example is at most 25 lines after at most 5 imports, defines
   what it uses, and is followed by what happened.

5. **The voice is clipped, negative and inward.** "None of these calls
   performs I/O." "It reads no database." "Observation does not transfer
   ownership." "That is the whole architecture." Evidence and caveats sit in
   parentheses ("(a source with no `authorize`, `filter` or `visible` is
   answered as it is, with no read; if the read fails, none of that entity's
   patches is sent…)"). Version history and issue numbers sit in present-tense
   prose ("Through 0.11.0 the draft kept the failure's own message…").
   *Fix:* speak to the reader, say what happens rather than what does not,
   state evidence plainly with its source, keep history in the changelog.

6. **The old standard rewarded the wrong things.** `readme-standard.md`
   ordered every README as thesis, ownership, mental model, install, example,
   so agents put ownership tables and ASCII diagrams on the first screen and
   satisfied it to the letter. It has no checks an author cannot answer "yes"
   to, nothing on voice, terms, length, results or splitting files, and it puts
   "advanced and reference material" in the same file "after" the story.
   *Fix:* replaced by `writing-docs.md`, whose rules each come with a check,
   plus a cold reader who knows nothing before a document is called done.

## How this was read

Read in full or nearly: the root `README.md`, the `foldkit-primitives`,
`foldkit-metadata`, `foldkit-richtext-code-shiki`, `foldkit-mirror` and
`foldkit-media` READMEs, `docs/state-model.md`, `skills/foldkit-plus/SKILL.md`,
and the first 300 to 560 lines plus every heading and two middle sections of
`foldkit-remote`, `foldkit-mixins-ui`, `foldkit-mixins`, `foldkit-entity`,
`foldkit-surface`, `foldkit-bundle`, `foldkit-sync`, `docs/entity.md` and
`docs/remote.md`. Every other package README, guide and skill reference was read
for its first 120 lines (80 for skill references), its headings and two middle
sections, by me or by three helper agents briefed with the same three readers
and the same failure list; their quotes were spot-checked against the files.
Mechanical counts (lines, first code block, longest table cell, generic
headings) were taken by script over all 48 READMEs and 47 `docs/*.md`. The
live site was read at `/remote`. Not read closely: the middle 80 to 90 percent
of the six longest READMEs, the subpath READMEs under `packages/primitives/`,
the example READMEs, and the bodies of the internal notes in `docs/`.

## What the maintainer has already shown he wants

The 0.41 release post was rewritten after the same complaint, and the two
versions are the clearest evidence in the repository.

The first draft (`git show a32b4476e:docs/release-0.41.0.md`) opens: "Foldkit
Plus is a set of packages around Foldkit, a TypeScript framework in which an
application is one state machine: a typed Model, a union of Messages, and one
`update` function." Its first section is a taxonomy ("A widget is made of four
kinds of fact"), its first example 30 lines of imports and recipes, and it says
"None of these calls performs I/O."

The published version opens: "A popular way to ship UI components today is to
copy them. You run a command, it writes `table.tsx` into your repository, and
from then on the table is yours. That is a fast start. A year later it is a
file you maintain." It explains Foldkit in one plain clause, shows a picture of
the result before any code, names each term in the sentence before the example
that uses it ("the package calls such a look a *recipe*"), keeps the first
example to the reader's own data plus two lines, says what the markup is, and
states its numbers with the test that holds each. Every rule in
`writing-docs.md` can be read off the difference.

## Systemic findings

### 1. Definition first, problem never

Count, from the openings read: of 48 package READMEs, about 12 open on a
problem a stranger has (`foldkit-mixins`, `foldkit-mirror`, `foldkit-guard`,
`foldkit-sync`, `foldkit-react`, `foldkit-react-codegen`, `foldkit-richtext-dom`,
`foldkit-form-recipes`, `foldkit-durable`, `foldkit-composition`, `foldkit-crud`
at line 52, `foldkit-primitives`). The rest open on a definition. Examples:

- `foldkit-ssr`: "Server rendering for a Foldkit application that hands the
  browser **the Model the server reached**, not the inputs to rebuild it."
- `foldkit-site`: "The deployed route topology of a Foldkit application: which
  locations exist, how they nest, what each is called, and what it activates".
- `foldkit-cms`: "What a CMS adds to a domain that is already declared."
- `foldkit-media`: "An image is a URL to write: given an image's facts, a
  provider that knows a host's URL scheme, and how wide the image is drawn…
  It performs no I/O." The package's most useful path, `import hero from
  './hero.jpg?image'`, is at line 143.
- Four `foldkit-mixins-*` READMEs open with the same sentence shape: "Draws a X
  … with every element published as a `foldkit-mixins` Slot."
- Four agent adapters open with the same preamble: "The application's
  `AssistantAgent` is the protocol-neutral contract. `AgentBuilder.bind(...)`
  binds it to an `AgentRuntime`…"

Where a good problem statement exists it is often buried: `foldkit-crud`'s
"An edit screen looks like a form plus a request. By hand it is more…" is at
line 52, after a code block and two tables; `docs/remote.md`'s "The problem"
(six concrete failures) is at line 24, after a list of four packages.

### 2. Terms before explanations

The root README, first two screens, terms of ours in order of first
appearance: Foldkit, state machine, Schema-typed **Model**, **Message** union,
**`update`**, Commands, (cache in a) hook, sync layer, reducer, replicas, slice,
mirror, explicit application boundaries, Bundle, Primitives, Remote, Sync,
Durable, client-authored operations, authoritative journal order, journal, read
model, Mirror, Agent, Surface, Mixins, Projection, Command. Model, Message and
`update` get a clause each; nothing else is explained before use.

The pattern repeats everywhere. `foldkit-cms`'s first screen: Entity, form,
`foldkit-crud`, audience, slug, Entry, Draft, Revision. `foldkit-richtext`'s:
semantic documents, text transactions, stable node IDs, ChangeSet, invalidation
summary, EditorState, positionMap. `foldkit-remote-domain`'s: Alchemy Domain,
Aggregate, decide, Events, Views, RemoteClient, receipt, floor, revision.

Our terms are also defined in four places with four wordings: the root README,
`docs/README.md` (lines 40-54), `docs/glossary.md` (lines 11-21) and
`SKILL.md` (lines 12-19).

### 3. One file, every job

| README | Lines | Jobs in it |
| --- | --- | --- |
| `foldkit-remote` | 4,553 | landing, comparison, tutorial, 14 task areas, troubleshooting, testing tools, kernel reference |
| `foldkit-mixins-ui` | 3,400 | landing, taxonomy, adapter tutorial, 90-widget reference, design rationale |
| `foldkit-remote-drizzle` | 2,129 | landing, reference, SQL semantics, D1 deployment |
| `foldkit-ssr` | 2,012 | four features: handover, static regions, resumable pages, forms without scripts |
| `foldkit-entity` | 1,965 | reference for six concepts, each with its own guide elsewhere |
| `foldkit-mixins` | 1,897 | slots, a whole design system (themes, palette, layout), accessibility checks |
| `foldkit-remote-server` | 1,892 | landing, four transports (about 620 lines), hardening, testing |

The site makes this worse. `examples/site/src/content/guides.ts` cuts each file
at its `##` headings, makes a README's first page everything up to a heading
named like "Sixty seconds", "Example" or "The first run", and joins sections
under 700 characters to the page before. `/remote` therefore opens on 567
source lines (TanStack comparison, a task table, an ownership table, the
mental model, install, six tutorial steps), and its sidebar lists 21 pages of
the Remote README, then 16, 18 and 10 pages of three other READMEs, then 27
pages of three guides, then 19 API pages. The heading regex also pushes every
README towards the same formula heading ("Sixty seconds: …").

Reference lands in tables. 26 documents have a table cell over 200 characters.
The widget catalog's `Listbox` row is 1,964 characters, its `CodeBlock` row
2,398 (the longest single cell the script found is 2,002 characters after
splitting); a `Button` row reads "Adapter over `@foldkit/ui`'s Button.
`Button.view({ label, style, type?, disabled?, invalid?, busy?, pressed?, icon?,
trailing?, description?, mark?, href?, external?, words?, onClick?, attributes?,
mixins? }, h)`; `Button.toView` for your own `draw`. …". `SKILL.md`'s widget row
is about 900 characters, and its line 22 is one 1,300-character line with 11
links.

Maintainer material sits among user material: about 9,000 lines of internal
notes are at the top of `docs/` beside the guides (`rfc.md` 3,067 lines, a
raw chat transcript in `extensible-DESIGN.md`, two agent memory files with
`node_type: memory` front matter, `foldkit-0.158-to-0.163.md`, which reads like
an upgrade guide but records an internal upgrade, a superseded proposal,
`native-cross-platform.md` listed in `docs/README.md`'s "Guides by problem").
User pages carry this repository's scripts (`pnpm writes:check` in
`docs/state-model.md`, `pnpm --filter … smoke` in `foldkit-mixins-richtext`,
"In this repository" in `foldkit-plus`), test names as evidence
(`event-sourced-domains.md`: "`loop.test.ts` steps 6 and 7"), and status
notes ("Status caveat: … the framework halves are proved and waiting",
`docs/site.md`).

### 4. Examples that compile but do not run

Counts from the script: the median package README's first TypeScript block is
at line 64; 8 of 48 have none in their first 100 lines (`foldkit-remote` at
152, `foldkit-mixins-ui` at 102, `foldkit-remote-domain` at 129,
`foldkit-auth` at 138, `foldkit-cms-drizzle` at 280). Line counts flatter them,
because many first blocks are fragments:

- **Hidden fixtures make visible code into pseudo-code.** `docs-check` lets a
  document hide setup in HTML comments. GitHub and the site do not show them.
  `foldkit-crud` (line 36), `foldkit-mixins-crud` (98), `foldkit-mixins-form`
  (97), `foldkit-builder` (69) and `foldkit-mixins-builder` (88) show 7 to 15
  lines that depend on 25 to 55 hidden ones. `foldkit-site` hides 55 lines
  before its first visible snippet. `docs/wiring.md` says "(`App`, `Model`,
  `Message`, `initialModel`, `own`, and `view` are the todo-app declarations.)"
- **No result.** Bundle: "These declarations do not mount anything." Sync's
  example connects to `wss://example.com/sync`. Remote's six-step first run ends
  with an ASCII diagram and "Your route update must activate…". `foldkit-form`'s
  first run ends in a comment, "model.saved contains the decoded input", and
  no form is ever drawn. Nothing in the 48 READMEs is a screenshot, although
  eight demos are deployed.
- **The wrong first example.** `foldkit-mixins-ui`'s "Sixty seconds" styles an
  `@foldkit/ui` Button through the adapter path with `Style.class('btn
  btn-primary')`, which is the least common way to use the package; its own
  `Button.view` appears 250 lines later. `foldkit-media`'s hand-builds an
  `ImageAsset` instead of importing an image.
- **Too much at once.** The root README's example composes Surface, Mixins,
  Sync, Agent, Mirror and Module in 163 lines. `docs/errors.md`'s first block
  is 62 lines with 7 imports; `progressive-enhancement.md`'s "sixty seconds" is
  64 lines.

The good ones exist and should be copied: `foldkit-react-codegen` shows input,
command and generated output; `foldkit-richtext-markdown` shows
`markdown // 'hello\n'`; `foldkit-surface` shows `Surface.read`'s result;
`docs/expressions.md` and `docs/entity.md` print what their calls return;
`foldkit-guard`'s first example runs as shown and ends `// true`.

### 5. Voice

The register is that of a changelog or a design review: exact, compressed and
negative. The three most inward sentences in the root README:

- "Each package answers one question, and they compose because they meet at
  explicit application boundaries."
- "A Surface can observe several owners. Observing a field does not grant a
  second package permission to change it outside its owning transition."
- "The important part is what is **missing**: no agent reducer, sync reducer,
  URL store, persistence state machine, server copy of the shared schema, or
  forked component just to restyle it."

Others, across the tree: "A capability **is** a Message" (`foldkit-agent`);
"`toView` performs no I/O and holds nothing: it is a pure function from the
component's bundles to your markup" (`foldkit-mixins-ui`); "The adapter owns no
row, decides nothing and holds nothing a reload must keep" (`foldkit-remote-domain`);
"Parsing uses `micromark` and `mdast`, the parser stack the design asks for"
(`foldkit-richtext-markdown`); "The lift is recorded on the Command, so a Story
resolves `Prefs.restore`…" (`foldkit-mirror`). "What each call does, and does
not do:" is a formula heading in six READMEs and several guides, and the
"does not" half usually dominates.

Paragraph density is a related problem. `foldkit-surface`'s `Projection.derive`
paragraph is twelve sentences; `foldkit-form`'s Validation section is nine
bullets of 15 to 30 lines; `foldkit-richtext`'s "Current semantics" is 120 lines
of bullets.

### 6. Missing entirely

- **A way to see it running from the package page.** The demos are listed in
  the root README only. `foldkit-mirror` never links the todo demo whose
  filter lives in the URL; `foldkit-data-grid` does not open with the
  100,000-row demo.
- **"When not to use this."** Present in some (Sync, Surface, Durable, Mirror,
  react-codegen), missing in most.
- **Troubleshooting by symptom.** Only `foldkit-remote` ("Why is it still
  `Initial`?") and parts of `foldkit-sync` and `site-remote-ssr` have it. It is
  the best section in the Remote README.
- **A path from one package to the next.** Pages end on "See also" lists or
  on limits. `foldkit-host` ends on a planning note: "a one-call preset over
  these parts is deferred until several applications share the same glue."
- **One tutorial.** There is no "build your first Foldkit Plus app" page; the
  closest are `examples/todo-app` and the root README's composition block.

### What is good and must be kept

- **Correctness.** Snippets compile (`scripts/docs-check.mjs`), claims were
  checked against source, and negative claims were verified. No rewrite may
  lose this.
- **Ownership statements.** Every page says who owns the state. They belong
  after the first example, not before it, but they are right and useful.
- **Failure semantics.** Durable's crash-gap section, Remote's symptom
  section, A2A's "rejected versus failed" table, Sync's three milestones
  (visible, saved, committed), the cookie section's "A cookie is the visitor's
  to edit".
- **Comparisons with what readers know.** Remote's TanStack Query table,
  Primitives' "The Solid line this replaces", `docs/site-and-router.md`'s
  before and after.
- **Stories of bugs behind rules.** `docs/state-model.md`'s "Typing 'Dowel'
  faster than the editor opened left 'l'" is the best explanatory writing in
  the repository.
- **Task tables.** Remote's "Find what you need", Primitives' "Find one by the
  job", `foldkit-mixins-ui`'s "Finding a widget".

## Standards worth holding ours to

- **Stripe's API documentation** puts the task first, a working request beside
  it, and the actual response under it. Every example shows output. *Fits:*
  show what happened after every example; for us that is the HTML, the URL, the
  Model, or a screenshot.
- **Tailwind's documentation** gives each feature a page: one sentence of what
  it does, a rendered example with its code, then variations under task
  headings ("Hover, focus, and other states"), then a short reference table.
  *Fits:* exactly the shape for a widget or a primitive. Our site's component
  pages already do half of it; the README should send readers there instead of
  carrying a 2,000-line catalog.
- **The Svelte tutorial** teaches one concept per step, and each step shows the
  result live. *Fits in part:* the one-idea-per-step rule and the result at each
  step. An interactive tutorial is a larger project; the site's live examples
  are a start.
- **The Rust Book** builds real programs, introduces each term at the moment
  it is needed ("we'll discuss X in detail in Chapter 8"), and shows compiler
  errors as the reader will meet them. *Fits:* term at point of need, and
  failure documented as the reader sees it (the error text, the symptom).
- **Django** separates its tutorial (the polls app, in parts, each ending in
  something working), topic guides, how-to guides and reference. *Fits:* one
  tutorial per family, task guides as their own pages, reference kept dry and
  complete.
- **Diátaxis** names the four kinds (tutorial, how-to, explanation, reference)
  and says mixing them is the main failure. *Fits:* this is our failure 3. Our
  reference is partly generated from types (the site's API pages), so written
  reference should cover only what types cannot say: meaning, defaults,
  failure, interactions.

What none of them does, and we should not either: open a page with an
ownership table, explain an idea by naming what it is not, or put the design
history in the user's path.

## Per-document table

Verdicts: *keep* (small edits), *restructure* (content right, order and split
wrong), *rewrite* (opening and first example must be redone), *merge*,
*move* (out of the user documents), *delete*. "Serves" is the reader the page
serves today: A the stranger, B the adopter, C the user with a question.

### Root and package READMEs

| Document | Lines | Serves | Worst three problems | Verdict |
| --- | --- | --- | --- | --- |
| `README.md` | 651 | C (map) | definition opening; ~25 terms in 60 lines; 163-line first example | rewrite |
| remote | 4,553 | C | 567-line site home; opening snippet uses hidden names; first run shows no screen | restructure, split |
| mixins-ui | 3,400 | C | taxonomy before example; adapter path as first example; 2,000-character cells | rewrite, split |
| remote-drizzle | 2,129 | B, C | "Provisional" first word; Mutations is 553 lines; first example in five blocks | restructure, split |
| ssr | 2,012 | C | four products in one file; first example a sketch; workaround notes in limits | restructure, split |
| entity | 1,965 | C | definition opening; first example assigns a value and shows nothing; owner list first | restructure |
| mixins | 1,897 | A, B | five-concept table before code; a design system inside a slots README | restructure, split |
| remote-server | 1,892 | B, C | ASCII pipeline before the problem; 85 lines to one read; transports inline | restructure, split |
| sync | 1,587 | A, B | example needs a real server; advanced sections long | keep |
| bundle | 1,370 | B | five-place problem told, not shown; example mounts nothing; switches to primitives | restructure |
| composition | 1,245 | A, B | no "before"; Drawing a page is 560 lines; status box is a feature list | keep, split |
| richtext | 1,191 | C | benchmark tables in README; 120-line bullet wall; no editor in sight | restructure, split |
| guard | 1,177 | A, B | 15-20 line bullets; no refused request shown; seam order only | keep, split |
| crud | 1,087 | B | best paragraph at line 52; silent failure buried; one 283-line section | restructure |
| mirror | 1,006 | A | three seams before the example; example runs only at line 199 | restructure |
| media | 954 | C | definition opening; Vite path at line 143; icons after 600 lines of server | rewrite, split |
| surface | 877 | A, B | dense derivation paragraphs; deprecated alias in main flow | restructure |
| site | 853 | B, C | dense definition; 55 hidden lines; "Core concepts" one paragraph | restructure |
| form | 826 | C | no form ever drawn; validation edge cases first; Entity vocabulary up front | restructure |
| data-grid | 804 | B, C | geometry before grid; status notes; no picture of the 100k demo | restructure |
| agent | 769 | B, C | "two boundaries" definition; API table before demo; generic headings | restructure |
| mixins-richtext | 766 | B, C | 54 hidden lines; contributor checks; widget sections cramped | restructure |
| remote-domain | 739 | C | opens on a beta pin; a sentence repeated; no code in 120 lines | restructure |
| richtext-dom | 701 | B, C | long configuration bullets; no picture | keep |
| durable | 694 | A, B | WASM detour before example; example needs Sync | keep |
| auth | 679 | C | JSON overrides first code; CSRF essay before use; status in limits | restructure |
| mixins-form | 668 | B, C | Slot opening; never shows its HTML; 350-line section | restructure |
| mixins-builder | 561 | B | best content (the editor's inventory) after four paragraphs; no screenshot | merge with builder |
| builder | 508 | B, C | 13-row ownership table first; no editor shown | merge into mixins-builder |
| cms | 458 | B | opening lists neighbours; example needs four definitions; no result | rewrite opening |
| mixins-crud | 414 | B | depends on another README's setup | keep |
| mixins-data-grid | 392 | B | 53-line setup; no screenshot | keep |
| plus | 377 | B, C | npm cache detail before running anything; testing tools bolted on | restructure |
| cms-drizzle | 369 | B, C | example is labelled pseudocode; upgrade notes inside behaviour | restructure |
| form-recipes | 344 | A, B | owner table before example; DST cases before the simple case | keep |
| agent-webmcp | 318 | B, C | WebMCP undefined; shared preamble; compat note mid-example | restructure |
| react | 315 | A, B | counter instead of the real reason (a library widget) | keep |
| primitives | 309 | A, B | four terms on first screen; 20-line Bundle setup for a media query | keep |
| agent-mcp | 291 | C | stub example; preamble copied to four adapters | restructure |
| agent-native | 280 | B, C | compatibility proof and schema bridge are contributor notes | restructure |
| host | 240 | C | ownership list first; ends on a planning note | keep |
| richtext-markdown | 240 | B, C | escape rules before parsing; "the design asks for" | keep |
| react-codegen | 237 | A, B, C | diagnostics cells are paragraphs; fizzles at "Not yet" | keep (a model) |
| mixins-surface | 206 | B | 68-line example for a 3-line idea; never shows the type error it prevents | restructure |
| agent-a2a | 192 | B, C | A2A and Agent Card undefined | keep |
| metadata | 149 | its reader (package authors) | Evidence section is a second topic | keep |
| bundle-surface | 143 | B | `[]` result proves nothing; show the overlap it catches | restructure (light) |
| richtext-code | 93 | B, C | no output shown; a page for one function | keep, or merge into richtext-dom |
| richtext-code-shiki | 82 | B, C | one inward opening sentence | keep |

Package verdicts: 17 keep, 26 restructure (11 of them also split into
several files), 3 rewrite (mixins-ui, media, cms), 2 merge (builder and
mixins-builder into one), 0 delete. The root README: rewrite.

### Guides in `docs/`

| Document | Lines | Serves | Worst three problems | Verdict |
| --- | --- | --- | --- | --- |
| entity.md | 554 | A, B | ASCII diagram; owner table with API names before the example | keep (prose for the diagram) |
| state-model.md | 209 | C | repository script in a user guide; matrix before the stories | restructure: lead with "Messages carry intent" |
| remote.md | 402 | C | package list before "The problem"; dense kernel mapping; duplicates the README | merge into the Remote landing page and one explanation |
| expressions.md | 587 | A, B, C | middle examples rely on hidden code | keep (a model) |
| bundle-vs-submodel.md | 314 | A, B | repeats itself; late new terms | keep (a model) |
| mirror.md | 176 | A, B, C | broken first sentence; a sketch with `…`; no result shown | keep, fix |
| site-and-router.md | 301 | B, C | history framing; implementation in the story | keep |
| auth-and-guard.md | 201 | B, C | no "before" | keep |
| upgrading-0.41.md | 193 | C | belongs on an "Upgrading" shelf, not in Learn | keep |
| mixins.md | 396 | A, B | upstream fork history; no rendered result | keep, trim |
| site-remote-ssr.md | 576 | B | 25 hidden import lines; owner table first | keep |
| progressive-enhancement.md | 396 | B | 64-line first example; owner table first | keep |
| errors.md | 618 | C | 12-row table first; tag reference mid-guide | keep, move the tag table |
| event-sourced-domains.md | 420 | B | outside definition first; test names as evidence | keep, reorder |
| surface-vs-bundles.md | 201 | C | assumes both packages are known | keep as a comparison |
| replication.md | 723 | A, B | first example carries three ideas; migrations mid-story | restructure, split |
| laws.md | 667 | B, C | 9-row table before the example | restructure (light) |
| operators.md | 376 | B | feature list opening; conformance for authors in a user guide | restructure, split |
| declared-writes.md | 771 | B, C | feature list opening; seven concepts; `Sell` undefined where used | restructure, split |
| agents.md | 819 | A, B | naming and ASCII before example; nine sketches | restructure |
| wiring.md | 283 | B | interface first; the real problem at line 76 | restructure |
| site.md | 673 | B | definition opening; maintainer status; TanStack comparison mid-guide | restructure |
| authoring-components.md | 1,025 | B | 134 lines of rules and taxonomy before the build | restructure |
| editing-server-data.md | 259 | — | four-clause opening sentence; sketches with `…` | rewrite opening |
| events-folds-and-gates.md | 305 | C | "event-sourced in two places and state-sourced in a third" | rewrite around its `ClearedShown` story |
| declared-data-to-ui.md | 193 | — | hedges; closed issues linked; no output | rewrite |
| ui-architecture.md | 161 | maintainers | a status log; a ten-noun rule | move to `docs/design/` |
| glossary.md | 121 | C, barely | terms defined by terms; gaps (Guard, principal, Site) | rewrite each entry in plain words |
| README.md (docs map) | 168 | — | a second map that disagrees with the site's; missing guides | rewrite, or replace with a pointer to the site |

Guide verdicts: 13 keep, 10 restructure (one of them a merge), 5 rewrite
(the glossary and the documentation map among them), 1 move.

### Internal notes at the top of `docs/`

Move to `docs/design/` (or delete where noted), so the user guides stand
alone: `rfc.md`, `improvements.md`, `extensible-DESIGN.md` (a raw chat log),
`effect-v4-api-scope.md` and `effect-ecosystem.md` (agent memory files: move or
delete), `effect-schema.md`, `effect-adjacent-projects.md`,
`dependency-update-2026-10-22.md`, `foldkit-0.158-to-0.163.md`,
`upstream-foldkit-ssr.md`, `upstream-combobox-keyboard.md`, `sync-dx.md`
(superseded), `native-cross-platform.md` (a vision, not a guide). Rewrite as
user guides: `theme-knobs.md` (the only theming page, written as a design) and
`sync-runtime-binding.md`. Keep as reference: `releases.md`, `benchmarks.md`,
`prior-art.md` (optional reading, labelled so).

### The skill

| Document | Lines | Problem | Verdict |
| --- | --- | --- | --- |
| SKILL.md | 151 | 29-row table with cells up to 900 characters; one 1,300-character line; its one example runs nothing | restructure: one-clause cells, links |
| references/remote.md | 1,644 | 880 lines of tasks; six states in one parenthetical | split by task |
| references/mixins.md | 1,167 | a 580-line widget catalog | split catalog from core |
| references/entity.md | 874 | `Expr` alone is 300 lines | split |
| references/richtext.md | 529 | one heading; a 105-line prose block in changelog voice | rewrite |
| references/authoring.md | 285 | duplicates `docs/authoring-components.md` | merge, one source |
| references/laws.md | 164 | copies `docs/laws.md`'s table | merge |
| the other 22 | 85-634 | status notes and inward asides in the first lines | keep, trim |

## The plan

Ranked by how many readers meet the page and how badly it fails them.

1. **The root README.** Every visitor from GitHub, npm and the site's Learn
   section starts here. Redo: open on the problem (an application's state ends
   up in several places that disagree, and Foldkit Plus keeps it in one), one
   plain sentence on Foldkit, the demos as the second thing on the page, the
   "you want to… use…" table with one-clause cells, one small example of one
   package with its result, install, next steps. Move the seven-package
   composition and the ownership graph to an explanation page under Learn.
2. **`foldkit-mixins-ui`.** The components pages bring the most visitors, and
   its README is the worst landing page by the gap between the package (90
   widgets) and the first screen (adapters and resolvers). Redo: a landing
   page that opens with "styled, accessible widgets you configure instead of
   copying", a picture, `Table.view` or `Button.view` as the first example,
   and a link to the component pages; the 90-widget catalog becomes reference
   files per group under `docs/mixins-ui/`, cells turned into prose.
3. **`foldkit-remote`.** The core data package. Keep its comparison table, its
   task table and its symptom section; cut the landing page to the problem,
   the comparison, install and a first run that ends with a screen (finish the
   route and the runtime, show the three states). Move each task area,
   troubleshooting, testing and the kernel into `docs/remote/`. Merge
   `docs/remote.md` into it.
4. **`foldkit-media`.** Proposal written: `docs/agents/proposals/media-README.md`.
   Split the server, uploads and icons into their own pages.
5. **`foldkit-mixins`.** The styling home. Keep the problem opening; show the
   rendered HTML of the quick start; move themes, palette, layout and the
   accessibility checks to their own pages.
6. **`foldkit-entity`, `foldkit-guard`, `foldkit-form`, `foldkit-crud`.** The
   "describe your data once" story. Entity's landing page should be
   `docs/entity.md`'s opening (a shop's products written four times), not a
   reference index. Form must draw a form with an error on its first screen.
7. **`foldkit-sync`, `foldkit-bundle`, `foldkit-surface`, `foldkit-mirror`.**
   Mostly order: example earlier, ownership later, example that runs.
8. **`foldkit-ssr`, `foldkit-site`, the agent family.** Split SSR's four
   features; one shared page for the agent adapters' common setup, each
   adapter leading with what a client of that protocol can now do.

**Mechanical fixes across every document**, each a job for a cheap agent
with the rule from `writing-docs.md`:

- Move history, issue numbers, status notes and this repository's scripts out
  of user prose into the changelog, upgrade guides or Limits (rule 13's grep).
- Rename generic headings ("Overview", "Core concepts", "Mental model",
  "Usage", "Example", "API" outside reference) to the task or question.
- Turn every table cell over 100 characters into prose under a heading (26
  files have cells over 200).
- Move the internal notes out of `docs/` (the list above).
- Write one shared page for the agent adapters' common setup and the
  `foldkit-mixins-*` "published as Slots" idea, and link it instead of
  repeating it.
- Add a "See it running" link to every package whose example or demo exists
  (`examples/site/src/demos.ts` already lists them).
- Audit hidden `docs-check` fixtures: any name a visible snippet teaches must
  be visible.
- Run the term check on every first screen.

**What the site would need to change** (not done here): render a package
README as one page rather than cutting it at `##`; group the sidebar by
document type instead of one group per source file; and add catalog entries
for `docs/<family>/*.md`, with `scripts/docs-check.mjs` widened to compile that
folder. Until then, shorter READMEs already give one-page homes, because a
landing page of about 200 lines has few `##` headings to cut at.
