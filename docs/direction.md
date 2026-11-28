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
| Best-in-class performance | Work proportional to what changed: no root view call, no scan of bindings | The fine-grained contract of `#612` §4.1; a path-indexed graph in `metakit/graph` | **None yet against Effect UI.** Upstream reports 0.7 to 1.1 ms per update on a 1,000-row table with `h.lazy`, so update speed alone will not be the win. Measure cold start, bytes shipped, costly derived values and memory |
| Resumability | The first interaction runs without re-rendering the page or shipping the whole Model | `packages/ssr`: a binder, a live set, static pruning, a manifest, script cut by message | Built, opt-in, and **short of its own gates**: 54.6 kB of script before the first press against a 20 kB bar, and 1.4 to 1.5 s of blocking against 200 ms |
| Incremental view maintenance | A derived value is updated from a change, under a stated law, with a fallback to recomputing | `packages/remote/src/maintained/` for Remote; aggregates with deltas in `metakit/aggregates` | Works for Remote placement (17 comparisons where there were 100,000). Not general, not on the client view path |
| Sync | Optimistic and offline writes that reconcile, with typed outcomes | `packages/sync`, `packages/durable`, stores with declared capabilities | In use in examples; conflict policies per operation are designed in `#612` §8 |
| Great TypeScript | Call sites infer with no annotations; a mistake is an error on its own line; things are referred to by typed reference, never by a magic string | The rules in the plan (§4, rule 22) | Existing API breaks the reference rule in several places (plan ledger, T17) |

**What is not yet known, and decides whether the bet pays.**

- Whether a path-indexed, binding-level renderer beats an idiomatic Effect UI page on a production-shaped fixture, on measures that matter to a user. `#643` defines the fixture and the gates. Nothing has been measured.
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
- The repository: package counts and import counts by `grep`; `packages/successor` by its file list and headers; the gates and measurements from `docs/design/metakit-unification-LEDGER.md`.
- Nothing was run or benchmarked for this page.
