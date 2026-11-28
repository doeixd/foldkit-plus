# Where this project is going

**Status:** Direction set by the maintainer on 2026-11-28, written up from his statement and from a check of the repository and the two upstream projects on the same day. This page says what we are building, in what order, and why. It decides nothing about how; the plans it links do that.

## The short version

Foldkit, the framework this repository extended, has been turned into Effect UI. The maintainer does not want to build on that implementation, so the project takes its own route, in three stages:

1. **MetaKit.** A framework for building small typed languages and correct software in TypeScript and Effect. A rule or a state change is written once, as data, and read by many consumers: evaluation, SQL, a prover, a form, a native target.
2. **A successor to Foldkit and Effect UI**, built on MetaKit and Effect. Its aims: correct software, with transitions that are checked rather than hoped; performance that is the best in its class; pages that resume instead of hydrating; views kept up to date incrementally; sync; and TypeScript that infers well.
3. **Foldkit Plus rebuilt on the successor.** Every package in this repository that depends on upstream Foldkit moves onto the successor.

Each stage is the foundation of the next, and each must be sound before the next is built on it.

If you are an agent starting work here: find which stage your task belongs to, read that stage's plan, and do not build stage 2 or 3 machinery while a stage 1 gate is open unless the task says so.

## Why: what happened upstream

- **Upstream Foldkit has stopped.** Its last commit, on 2026-11-19, is "announce Foldkit joining Effect". This repository pins `foldkit` 0.170.0, which will not change again.
- **Effect UI is its continuation.** The repository `Effect-TS/ui` was created on 2026-11-15 and is under heavy development (commits on the day of this check, pull request numbers past 500). It ships `@effect/ui` with HTML, native, terminal and devtools packages.
- **What Effect UI is**, from its own documentation: "a frontend framework whose apps are composed with Layers. You describe a component with Schemas for its props, Model, messages and events, and with pure `init`, `update` and `view` functions." Updates are TypeScript handlers that return the next Model (`$.evolve({ … })`). The server renders HTML and the browser hydrates it.

It is a serious framework with real strengths, several of which we should keep learning from: Schema-described components, Layers for composition, typed Commands, a `Scene` and `Story` test style, headless components, three hosts.

## Why a different direction

The successor differs from Effect UI in one decision, from which the rest follows: **what a program is made of.**

In Effect UI an update is a function. A function can only be run. In the successor a transition is data: a guard, writes and emitted records, built from MetaKit expressions. Data can be run, and also read.

| Because a transition is data | Effect UI today, as its documentation and source describe it | The successor's aim |
|---|---|---|
| It can be checked | A handler is trusted. A Model of two booleans admits a combination that should not exist, and nothing says so | A prover shows every transition keeps an invariant, or gives the input that breaks it. States are named, so an impossible one cannot be written ([plan §5.2](./design/metakit-PLAN.md)) |
| Its reads and writes are known before it runs | A changed component runs its view and the result is compared with the previous one. `h.lazy` skips a subtree whose inputs are identical | A change is routed to the bindings that read what was written. Nothing else runs |
| The page can be continued without re-running it | The browser hydrates. The documentation notes that what a user typed into a server-rendered field before hydration is lost, and that a lazily loaded component replaces the server's nodes with a fallback | The server sends only the state that reachable transitions can read, and the page resumes at the first interaction |
| A derived value can be maintained, not recomputed | Derived values are computed in `view` or cached by identity | A sum, a filter or a join is updated from the change that affected it |
| It can leave the process | A handler runs where it was bundled | One definition runs in the browser, on the server, in a database constraint, or as native code, and gives the same answer or refuses |
| It has a content identity | A build has an id | An unchanged definition is never re-proved or recompiled; a resumed page knows whether its code is still the code it was rendered with |

This is a bet, not a result. The honest state of the evidence is below.

## Stage 1: MetaKit

**What it is.** `packages/metakit`: pure, inspectable expressions and single-step transitions over Effect Schema, with a reference evaluator and readers that must agree with it or refuse. Around it, a toolkit for defining small typed languages.

**Where it stands.** Merged to `main` on 2026-11-28 after eight days of work: 31,000 lines, 29 entry points, used by 16 packages here. Two independent reviews for the plan found defects of the kind a foundation cannot have: a reader that answers where the evaluator refuses, a guarantee dropped by composition, two definitions sharing a fingerprint.

**The plan.** [`docs/design/metakit-PLAN.md`](./design/metakit-PLAN.md) is the whole of it: goals, history, rules, a ledger of defects, ten workstreams and a final audit. [`docs/design/598-612-metakit-reffect-adapter-PLAN.md`](./design/598-612-metakit-reffect-adapter-PLAN.md) is the step-level detail for its portable contract and native target.

**When stage 1 is done enough to build on.** Not when every workstream is finished, but when these hold:

- The kernel and toolkit defects are fixed and every sentence of the semantics document has a test (workstreams W1, W2).
- The public surface is inventoried and simplified, and two small languages have been built with it without casts or private imports (W3, W5).
- Definitions have content identities and a conformance corpus exists (W4).
- The final audit finds nothing High or Medium (W10).

The successor needs four things from MetaKit that are not finished: named phases (plan §5.2), a write that replaces a struct, content-addressed definitions (§5.1), and incremental maintenance of derived values with stated laws. The first three are in the plan. The fourth exists for Remote (`packages/remote/src/maintained/`) and must be generalised.

## Stage 2: the successor

**The design on record** is issue `#612`, "Foldkit successor and Foldkit Plus rebase on MetaKit with fine-grained rendering and resumability". Its frame stands: a **Block** is what an author writes, a **Machine** executes, a **Surface** presents, a **Layer** provides services, and a **commit** is the one atomic change observers see.

**One thing in that issue is now superseded.** Its comments of 2026-11-26, written after upstream declined a second rendering model, made Effect UI the first integration target and said "do not require a second renderer for v1" (issue `#644` is the spike for that). The direction on this page reverses it: the successor has its own runtime and renderer. Effect UI becomes the baseline to measure against (`#643`) and a source of ideas, not the host. `#644` should be closed or narrowed to an optional interoperability adapter.

**What each aim means, and what exists.**

| Aim | Concretely | In the repository today | Evidence so far |
|---|---|---|---|
| Correct transitions | Every state change is a declared transition; invariants are proved; states are named; a refusal says why | `metakit/machine`, `Prove.machine`; `packages/successor` (1,537 lines: `block`, `surface`, `dom`, an event-sourced machine with a journal) proves and replays a composed Todo | A proof over arbitrary keyed rows passes (`#626`). Phases are designed, not built |
| Best-in-class performance | Fine-grained rendering, end to end: a write reaches only the derived values and the DOM targets that read it. No root view call, no diff, no scan of bindings | The fine-grained contract of `#612` §4.1; a path-indexed graph in `metakit/graph`; observed write deltas from a step (`#614`) | **Nothing measured against Effect UI yet.** The repository's own earlier measurements say where the time goes; see "Performance" below |
| Resumability | The first interaction runs without re-rendering the page or shipping the whole Model | `packages/ssr`: a binder, a live set, static pruning, a manifest, script cut by message | Built, opt-in, and **short of its own gates**: 54.6 kB of script before the first press against a 20 kB bar, and 1.4 to 1.5 s of blocking against 200 ms |
| Incremental view maintenance | A derived value is updated from a change, under a stated law, with a fallback to recomputing | `packages/remote/src/maintained/` for Remote; aggregates with deltas in `metakit/aggregates` | Works for Remote placement (17 comparisons where there were 100,000). Not general, not on the client view path |
| Sync | Optimistic and offline writes that reconcile, with typed outcomes | `packages/sync`, `packages/durable`, stores with declared capabilities | In use in examples; conflict policies per operation are designed in `#612` §8 |
| Routing, data and the server | Reads declared, planned and batched; mutations that return the fresh data in the same round trip; predictions derived from the write; streaming; branches and rollback | `packages/remote` and its server, `site`, `mirror`, `ssr`, `guard`, `sync` | Most is built and measured. Server reads are not yet parallel, streaming and branching are not built. See "Routing, data and the server" |
| Several renderers | One view on the web, the server, a terminal, native and a headless test, with a missing ability a compile error | UI capability tokens in `mixins`; a Surface whose renderer requirements are in its type (`packages/successor`); a conformance suite across three drawers | One DOM renderer exists. The vocabulary and lowering design (`#637`) is unbuilt. See "Rendering on more than one target" |
| Great TypeScript | Call sites infer with no annotations; a mistake is an error on its own line; things are referred to by typed reference, never by a magic string | The rules in the plan (§4, rule 22) | Existing API breaks the reference rule in several places (plan ledger, T17) |

### Performance: fine-grained, end to end

The successor is faster because it does not redraw. `#612` §4.1 makes this a core requirement, and the idea is the maintainer's own (`#608`): "If the data flow is properly declarative and static, you don't have to run things to discover dependencies. You don't need components or component boundaries. If you can track which bits of the view relate to which bits of the model you can get fine-grained updates."

An update in Effect UI runs the changed component's view and compares the result with the last one; `h.lazy` skips a subtree whose arguments are identical. That is work proportional to the size of what might have changed. Fine-grained rendering is work proportional to what did change: one text node, one attribute, one keyed range.

This repository has already measured the question once, on upstream Foldkit, and the result shapes what "fine-grained" has to mean here.

| When | What was tried | What was found |
|---|---|---|
| 2026-10-31, `#384` | Memoising Remote reads and derivations by the Model paths they read | A repeated read became about 8 times cheaper (556 reads: 1.80 to 0.23 ms). A filter toggle on `domains-plus` redrew 0 rows where it had redrawn 48 |
| 2026-11-10, `#433` | Would compiling views to templates and fine-grained patches fix the slow frames? Two frames were over 16 ms at 4 times CPU slowdown; their drawing was removed to see what was left | The frames kept 59 to 72% and 87 to 101% of their cost. Drawing and diffing were **under half**. What remained was "derivation, the patch the frame still needs, and the runtime's fixed cost". The client half was closed as not planned |
| 2026-11-10, `#376` | A fine-grained runtime under Foldkit's existing contract | Parked: "what remained of a domains-plus frame was a derivation over Remote reads, which a fine-grained renderer would recompute too" |
| 2026-11-12, `#432` | Skipping static regions at hydration | Not kept: boot moved by −7 and +96 ms across two runs. The maintainer then asked for full resumability instead (2026-11-20) |
| 2026-11-26, `#643` | Upstream's own numbers for Effect UI, 1,000 keyed rows | 0.7 to 1.1 ms per update with `h.lazy` or a component per row; 3.6 to 3.8 ms plain. Reported by upstream, not reproduced here |

Three lessons, and they point the same way:

1. **Fine-grained drawing alone is not enough.** On our own production-shaped page, most of a slow frame was computing derived values, not drawing them. A renderer that patches one text node but recomputes a filter over 556 rows to learn its value has saved the small part.
2. **So the grain has to run the whole way.** A write produces a delta; the delta selects the derived values that read it; each is updated incrementally where a law allows, or recomputed once; only those whose value changed reach their bindings. This is the commit-to-patch algorithm of `#612` §4.1, and it is why incremental view maintenance is in the same sentence as performance in the direction. It is also only possible because transitions and derivations are data: their reads are known without running them.
3. **The runtime's fixed cost is ours to set.** Those measurements were taken under a runtime we did not own. A successor with its own runtime can remove what an adapter could not.

The decisions of 2026-11-10 (park `#376`, close `#433`'s client half) are reopened by this direction. They were sound for their question, which was whether to replace the renderer underneath Foldkit's contract, where a view is a function. The successor changes the premise. Their method stands: `#376`'s last comment says "measure a production-shaped slice rather than assume speedups".

**What a fair claim needs** (`#643` sets the protocol):

- The same behaviour built idiomatically in Effect UI, with `h.lazy` and keyed children, not a weakened version.
- Sizes where the difference shows: 1,000 rows is already under a millisecond upstream, so also 10,000 and 100,000 rows (the data grid), on a slowed CPU.
- Derived values that cost something: a filter, a sort, an aggregate over the list. Report derivation and drawing separately.
- Counts as well as times: view calls, projection evaluations and DOM mutations per update. `#612` §10 gives the test: change one row's quantity among 1,000 and require one text patch, the changed totals, zero sibling evaluations and zero root view calls.
- The fixed cost on a small page, where an index may cost more than a redraw.
- Cold start and resume, measured separately from updates.

`#587` is a fix available today on the current runtime: a Surface's renderer runs on every render although its projection already declares the paths it reads.

### Rendering on more than one target

The aim (maintainer, 2026-11-28): a foundation for several renderers that is more strongly typed and more flexible than Effect UI's. The comparison below is from Effect UI's source at commit `82a1750` (2026-11-28) and from our own designs and code.

**How Effect UI does it.** It is real and shipped: a browser host, a terminal host (OpenTUI) and a native host (React Native's Fabric, without React).

- A view is a tree of nodes. An element is `{ tag: string, attrs, props: Record<string, unknown>, handlers, children }`; "a host decides what a property means".
- A **vocabulary** is one target's set of typed element builders: `Html`, `OpenTui`, `Native`. Each has its own tags, its own style type and its own event payloads. There is no portable element set.
- A component is bound to one vocabulary where it is defined (`Html.component`, `OpenTui.component`). Only a component written with the untyped `h.el(tag)` is host-neutral.
- A target implements one public `Host<Node>` interface (`createElement`, `setProp`, `insertBefore`, `setEvents`, …) under a shared renderer, so "switching target is a Layer swap". Events reach components as plain data, never a host event object.
- Mounting a root on the wrong host is a type error. A nested child of the wrong vocabulary fails when it mounts, at run time, and shows its fallback.
- In practice a second target means a second view. Its own two snake examples each define their own Model, messages and Commands and share only the domain modules. The component kit is typed against HTML; the native package has a separate kit.
- There is no notion of a capability: nothing lets a component say "I need something focusable that takes text" and a host say "I provide that". Each host exposes its own imperative service (`focus`, `measure`, `scrollTo`, …) and the three differ in shape.
- Server rendering and hydration exist for HTML only.

Its strengths are worth keeping: one small public host contract, plain-data events, a type-level check at the root, and pure `Story` and `Scene` tests that need no host.

**What we have.** One design that goes further, and pieces of it built.

| Piece | State |
|---|---|
| A **capability** as a typed token a slot provides and a behavior requires (`packages/mixins/src/capability.ts`: `Base`, `Interactive`, `Focusable`, `TextInput`, …), checked in the types and when a behavior is defined, with named diagnostics | Built. Identity is a name string in a process-wide map; a requirement names one capability; a raw string is accepted where a token is meant (`#634` §2 to §6 open) |
| **Platform requirements** on a slot (`keyboard`, `pointer`, `clipboard`) | Declared, and checked by nothing |
| A **Surface whose renderer requirements are in its type**: `packages/successor/src/surface.ts` gives each kind of slot its own service (`Text`, `Checkbox`, `Action`, `TextInput`, `KeyedList`), and running a Surface without one is a compile error (`todoSurface.test-d.ts`) | Built, for the DOM only, in a private 1,500-line package |
| A **conformance suite** holding three drawers (the runtime, the headless Scene, the server string renderer) to the same markup, Messages and mount lifecycle | Built, 12 cases |
| A host-independent core split from its DOM host, in rich text | Built |
| **Capability-defined vocabularies and lowerings** (`#637`) | Designed only |
| `Platform.define`, a renderer and host as services, native targets (`#148`, `#149`, `#376`) | Designed; parked on 2026-11-10 until a second platform has a user |

**The design on record is `#637`.** A view is written against a vocabulary of semantic terms, and reaches a host through pure translations:

```text
Block / Machine / commit            unchanged by the rendering target
Surface                             slots, semantic intents, bindings
View vocabulary                     typed terms, each requiring capabilities
zero or more lowerings              pure: Semantic → Primitive → HTML, or Semantic → Terminal
target plan                         identities, binding targets, event routes
scoped host interpreter             mount, patch, input, dispose
```

- A **capability** carries properties, events and laws: `Activatable` extends `Disableable`, has an `activate` event, and the law that a disabled control does not activate.
- A **tag** (`Action`, `Field`, `Choice`) names the capabilities it has and its typed properties and children. A **vocabulary** is a set of tags and can be extended.
- A **lowering** is a pure function from one vocabulary to another. A `Field` becomes a label, an input and an error message on the web, and one prompt in a terminal. A design system is a lowering, not a component library.
- A **renderer** is the effectful host. Requirements flow up from what a view uses; implementations flow down from where it is mounted.

**Where this can be better than Effect UI, and why each is a consequence of the design rather than a hope.**

1. **One view, several targets.** A view written in a semantic vocabulary renders wherever a lowering reaches. In Effect UI a second target is a second view.
2. **A missing ability is a compile error, at the narrowest place.** A behavior cannot attach to a tag without the capability it needs, and a host that lacks one fails the build for that host. In Effect UI the check is one coarse fact (which vocabulary) at the root, and a nested mismatch is found at run time.
3. **One kit.** Headless components are written against capabilities, so the same listbox serves the web and a terminal. Effect UI's kit is HTML's.
4. **Fine-grained on every host.** A lowering carries each binding through, with its source identity, so one changed field patches one target after two translations (`#637` step 4). Effect UI shares a virtual-DOM renderer across hosts.
5. **Overrides from outside.** A parent replaces how a child's `Field` is drawn for a subtree, without the child knowing, and the override survives lazy and keyed mounts.
6. **Hosts held to the same behaviour.** Conformance compares Messages and Model traces across hosts, with laws per capability, not bytes of HTML.
7. **Four questions kept apart**: is the term in the language, does the element have the capability, does the host provide the service, is this user allowed. A visible button is never authority to act.

**What is against us, plainly.**

- Effect UI has three working hosts. We have one DOM renderer and a design.
- A portable vocabulary can become the least every target can do. `#637` answers this on paper: the portable profile is opt-in, a target's own elements stay first-class, and using one adds an explicit requirement. It has to be shown in code.
- "Capability" means four unrelated things in this repository today: a UI token (`mixins`), a code-carrying declaration for tree shaking (`#378`), a child update helper (`#495`), and an agent-exposed Message. They need four names before anything is built on the word.
- Ten pairs of overlapping concepts are unreconciled, among them: the built UI token against `#637`'s richer capability; slot platform requirements against `Platform.define`; a process-wide capability map against scoped registries; one service per slot kind (built) against one service per vocabulary (designed); and three different designs for a host escape hatch.
- The built token accepts a raw string for a capability and is found by name in a global map. Both break the rule that a defined thing is referred to by typed reference, and a global registry is something MetaKit's rules forbid.

**Order for this part of stage 2** (it is `#637`'s six steps, with the reversal noted): a descriptor and builder for four tags with negative type tests; `Semantic → Primitive → HTML` plus a headless interpreter and a terminal text plan, with one unchanged Block scripted identically on each; an outside-in override; the binding plan through two lowerings; host isolation and tree shaking measured; and only then a second interactive host. `#637`'s comment of 2026-11-26 made Effect UI's vocabulary the first lowering target; under this direction the first target is the successor's own DOM host.

### Routing, data and the server

The aim (maintainer, 2026-11-28): a better story than Effect UI for routing, data fetching, server data, mutations and server rendering, because of MetaKit and what Foldkit Plus already has: parallel data fetching, single-flight mutations, asynchronous streaming server rendering, optimistic updates, branching and rollback.

Most of this is not a plan. It is built, measured and in use here, on top of a runtime we did not own. The table is from Effect UI's source at commit `82a1750` and from this repository's code and records. "Built" names what exists today; it does not say the successor has it yet.

| | Effect UI | Foldkit Plus today | What MetaKit and an own runtime add |
|---|---|---|---|
| **Saying what data a screen needs** | Each component lists its queries; a query's fetcher is a function you write | A Surface declares a selection of fields and relations. The read is planned from it: diffed against a normalised store, and only what is missing is fetched | The reads of a whole route are known without rendering it |
| **Route loaders** | None. `Router.prefetch` warms a page's queries on link intent and navigation; nothing runs on the server, on Back, or on first load | None, by decision ("a route that fetches would make the Site an async runtime with its own cache beside Remote's"). One declaration feeds the client wiring, the preload, the server's read and the resume plan | The same, with no second cache |
| **Parallel fetching** | A query starts when its component mounts, so a child drawn only after its parent's data arrives fetches later. No batching: one request per query | One plan is one batched request: 556 rows in one POST, 2,500 in three. Identical in-flight reads are joined. A relation being read rides the same request | On the server, `Data.satisfy` still reads a page's queries one after another, and a read that depends on another's answer costs another pass, up to eight. `metakit/graph`'s readiness check knows which reads are independent and what each dependent read waits for, so independent reads can run at once and a dependent one the moment its input arrives (`#606`, designed) |
| **Single-flight mutations** | A Command names what it invalidates by hand (a query, an entry, a tag). It can store its own result into named entries; everything else refetches after | Built: a write's request says what the screen shows, and its response carries those fields re-read, plus the first page of up to eight lists the write moves. Measured: posting went from 2 requests to 1, archiving from 3 to 1. There are no hand-written invalidation keys: what a write affects is computed | Today that is computed from the changes seen in the answer. The stronger form exists and is unused: `reaches(write, query)` decides from a write's declared footprint and a query's declared dependencies. With it the server knows before it writes exactly which reads to carry back, with no cap of eight |
| **Optimistic updates** | A hand-written patch function per query, held while the Command runs and dropped on failure | Derived: the prediction comes from the declared write. Pending writes are layers over the server's data, recomputed rather than undone, so they rebase for free. A rejected write is a dropped layer. Held to eight temporal laws over 42 cases | The same transition is the prediction and the real change, so the two cannot drift apart |
| **Live data and derived results** | Stream queries and refetch intervals | Live streams with cursors; a count, sum, filter or sorted list maintained from a change instead of refetched (placement in 100,000 rows: 17 comparisons) | The laws that say when a derived value may be updated in place are MetaKit's |
| **Offline and sync** | Cached reads survive a reload. No offline write queue | A durable outbox; replicated documents with a journal; typed refusals; old operations upcast across versions | Whether two edits commute is decided from their declarations; an undecided pair is owed a test |
| **Rollback, replay, branching** | History restore on Back and Forward; a devtools slider over the message log. No undo, no branches | Rollback is dropping a layer. Recorded Messages replay. `packages/successor` has an event-sourced machine with journals (memory and SQLite), replay, and atomic commits across streams, tested under a competing write and a lost acknowledgement. **Not built:** forking state, speculative branches, copy-on-write, general undo | Designed in `#636` and `#612` §6: a branch refers to an immutable checkpoint, runs transitions with commands suppressed, and is promoted by submitting its intents to the current authority |
| **Server rendering** | One render with a time budget (500 ms by default); a fetch that misses it is left for the browser. State is a JSON script. No streaming | Server reads run in-process as the principal; a page is refused rather than half-restored; a rendered page is cached only when provably the same for every visitor; forms and links work before or without script. Three renders and a re-parse per request, forced by upstream | A runtime of our own renders once and never re-parses its own output |
| **Streaming** | None | **Not built, and once declined.** A probe on 2026-11-10 moved first paint by 6 ms against a 50 ms bar, and out-of-order streaming was rejected because a page without script would arrive incomplete (`#427`) | See below |
| **Hand-off to the browser** | Hydration: every instance adopts its Model and re-runs. A lazily loaded page is replaced by its fallback and then drawn again. Clicks and submits before hydration are lost | Resume: typing before boot is kept with its caret; presses are answered from markers before the runtime loads; script is cut by Message. Built, opt-in, and short of its gates | Covered under "Performance" and "Resumability" above |
| **Who may see and do what** | No primitive. Guards are code in the root's `update`; a server Layer's services are shared by every request unless you write your own handler | Reads and writes are checked on the server; a row rule becomes SQL; a hidden field is withheld without revealing why; the client's own check is "a UI shortcut, not enforcement" | A rule is one expression read by the database, the server and the form |
| **Routing** | A flat union of typed routes with Schemas for parameters and search, one parser and printer that agree, and navigation as Commands. No nested routes or layouts | Upstream Foldkit's router, now frozen; a Site tree as data with nested layouts; URL state kept in step with the Model; code split per route | The successor needs its own router. Effect UI's Schema-typed route union is the part to learn from; ours adds the tree, layouts and declared data |

**Why MetaKit is the reason and not a slogan.** Each row's right-hand column follows from one fact: a read, a write and a rule are data, so their footprints are known before anything runs.

- A write's footprint against a read's dependencies gives the affected set. That is what makes a mutation single-flight without hand-written keys.
- A read's inputs give the dependency order. That is what makes fetching parallel without a waterfall and without loaders.
- A transition applied to a copy gives a prediction, a speculative branch, or a replay, with the same answer each time.
- A fold's laws say whether a derived value can be updated from a change.
- The same rule is the SQL check, the server's refusal and the disabled button.

**Streaming, honestly.** The earlier decision was made under three constraints that a runtime of our own does not have: upstream's renderer returns one string, the page is re-parsed whole, and hydration needs a whole root. With bindings anchored in the HTML and a page that resumes instead of hydrating, a slow region is a binding target that is filled when its data arrives, in any order, with no re-render. That is the case for reopening it. Two things from the old decision stand: a page that declares a no-script fallback must still arrive complete and in order, and nothing is built on the claim until a page with a slow read below its first screen has been measured (the probe planned as "C4" was never run).

**What is weaker than the claim, today.**

- Server reads for one page are not yet parallel: queries in a pass are awaited one by one, and dependent reads take a pass each.
- The single-flight answer is bounded (eight lists, first page only), runs after the commit rather than inside the transaction, and falls back to a refetch if the re-read fails.
- Affected reads are computed from observed changes, not yet from declared footprints. A write settled in another tab invalidates every connection.
- A Remote projection declares no dependencies (`#588`), so regions over Remote data are re-read on every render.
- Forking, branches and undo are designs.
- Streaming does not exist.
- All of it sits on upstream Foldkit. None of it is in the successor yet.

**What is not yet known, and decides whether the bet pays.**



- How much faster end-to-end fine-grained updates are than an idiomatic Effect UI page on a production-shaped fixture. The mechanism is sound and the earlier numbers say where to aim; nothing has been measured against Effect UI.
- Whether resumption can meet its bars at all on a real page, given how far the first attempt missed.
- How much of an application can be declared. `domains-plus` reached 31 of 39 messages. The rest stay ordinary TypeScript, and the successor must make that an easy, honest fallback (a callback with a conservative footprint), not a cliff.
- The authoring cost. The smallest MetaKit language takes five imports and nine statements today. A framework people choose must be as easy to start as the one it replaces.

**The first step of stage 2 is a plan**, written to the standard of the MetaKit plan: `#612`, `#635`, `#637`, `#643` and `#607` read whole; Effect UI's source read at a pinned commit, with every claim on this page about it checked against that source; the existing `packages/successor`, `packages/ssr` and `packages/surface` read as the starting material; one production-shaped vertical slice chosen (the keyed cart of `#612`); and measurable gates set before any code. It is workstream W7 of the MetaKit plan.

## Stage 3: Foldkit Plus on the successor

**The size of it**, measured on 2026-11-28:

- 50 packages, about 291,000 lines of source.
- 28 packages import upstream `foldkit`, in 366 files. Those packages hold about 194,000 lines.
- What they import most: `foldkit/html` (211 files), `foldkit/message` (107), `foldkit/update` (92), `foldkit/mount` (85), `foldkit/command` (51), `foldkit/subscription` (42).
- 22 packages import nothing from it and need no rebase: among them `entity`, `guard`, `remote-server`, `remote-drizzle`, `remote-domain`, `durable`, `media`, `richtext`, `metakit`.
- The weight is in the view layer: `mixins-ui` (148 files, 60,000 lines), `primitives` (90 files, 16,000 lines), then `mixins`, `richtext-dom`, `remote`, `bundle`, `ssr` and the data grid.

**The order** follows the dependency graph and `#612` §9: the packages with no dependency on upstream first (nothing to do but confirm); then the data plane (`remote`, `sync`, `surface`, `ssr`, `bundle`); then the view layer (`primitives`, `mixins`, `mixins-ui`, the recipes), which is the bulk and comes last because it depends on the successor's Surface being settled.

**Rules for it**, from `#612` §9: both runtimes can coexist behind a routing boundary, one owning a given subtree; a screen moves without converting unrelated services; an old handler can stay an ordinary callback inside a compatibility Block; each package is classified compatible, bridged, versioned or retired from an inventory of its real consumers before it is touched.

**Why not sooner.** Until the successor's Surface and commit protocol are proved on one application, rebasing 194,000 lines onto them would be rebasing onto a moving target. Until then, upstream Foldkit at 0.170.0 keeps working: it is frozen, not broken.

## The order, and what gates each stage

| Stage | Starts when | Is done when |
|---|---|---|
| 1. MetaKit | Now | The four conditions under "Stage 1" hold |
| 2. Successor: plan and one vertical slice | The kernel workstream (W1) is done. The plan can be written at once | The slice runs, is measured against the Effect UI baseline, and the gates set in its plan are met or the misses are recorded with what was decided |
| 2. Successor: the rest (`#612` phases P2 to P5) | The slice passes | Two representative applications run on it |
| 3. Plus rebase | Two applications run on the successor | Every supported route has an owner, telemetry and a recovery path (`#612` P6) |

Work on a later stage before its gate is allowed where it is research, a design note or a probe. It is not allowed where it adds public surface that the earlier stage would have to carry.

## What this changes in other documents

- **`docs/design/metakit-PLAN.md`**: its successor workstream (W7) and its recorded decision on `#612` now follow this page.
- **Issue `#612`**: its 2026-11-26 comments are superseded as described above. Nothing has been posted there; that is the maintainer's to do or to ask for.
- **Issue `#644`**: no longer the path.
- **`AGENTS.md`** points here.

## Decisions and open questions

Decisions for this direction are made the way the MetaKit plan records (its §9.1): the question is written down, researched and decided, with the evidence. Open now:

1. The successor's name and its package names. `foldkit-successor` is a placeholder in `packages/successor`.
2. Whether an Effect UI interoperability adapter is worth keeping at all, for users who want MetaKit transitions inside an Effect UI app.
3. What "best in class" is measured against, and on which fixtures, before any number is claimed.
4. Whether the first application is the keyed cart of `#612` or `domains-plus`, where measurements already exist.
5. Which Effect UI ideas to adopt outright: the `Scene` and `Story` test style, headless parts, `Query` services.

## What this page rests on

- The maintainer's statement of direction, 2026-11-28.
- Upstream state from the GitHub API that day: `foldkit/foldkit`'s last commits; `Effect-TS/ui`'s creation date, packages and recent commits; and Effect UI's `LLMS.md`, read in part (its opening, "Changing the Model", "Code splitting", and its lines on hydration). Its source was **not** read. The comparison table's Effect UI column also draws on the source reading recorded in `#643` at commit `193d2fb`, which was not repeated here.
- Effect UI's source at commit `82a1750` (2026-11-28), read by two research agents for the multi-renderer and the routing and data sections: `View.ts`, `Renderer.ts`, `Component.ts`, `Route.ts`, `Router.ts`, `Query.ts`, `Command.ts`, the HTML server and hydration modules, and the terminal and native packages, each in part, with line references. One claim is an inference from its code and not stated by its documentation: that a child's query starts after its parent's when the parent draws the child only once its own data has arrived.
- This repository's capabilities, renderer-independence, routing, server-rendering and data designs and code, read by three more agents: the design notes for `#212`, `#227`, `#232`, `#244`, `#245`, `#260`, `#261`, `#264`, `#270`, `#378`, `#384`, `#427`, `#472`, `#480`, `#481`, `#495`, the sync and upcasting notes, `docs/remote.md`, `docs/declared-writes.md`, `docs/mirror.md`, and issues `#148`, `#149`, `#580`, `#606`, `#629`, `#634`, `#636`, `#637`. Two findings rest on reading code rather than on a document: that server queries within one pass are awaited in sequence, and that no fork or branch API exists.
- The rendering history: issues `#376`, `#384`, `#432`, `#433`, `#436`, `#587` and `#608` read whole, body and comments. `#581` (application-wide semantic propagation) and the design note `docs/design/376-433-148-149-renderer-DESIGN.md` were not read beyond the note's status line; the successor plan must read both.
- The repository: package counts and import counts by `grep`; `packages/successor` by its file list and headers; the gates and measurements from `docs/design/metakit-unification-LEDGER.md`.
- Nothing was run or benchmarked for this page.
