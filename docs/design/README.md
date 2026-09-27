# Design docs

These are rationale, plans, substrate probes, and brainstorms — **not API
references and not the recommended place to learn the project**. If you are
trying to use Foldkit Plus, start with the [documentation map](../README.md), a
[worked example](../../examples/README.md), or the relevant package README.

Come here when you are changing an abstraction, reviewing a trade-off, or need
to know why the public API has the shape it does.

## How to read a design note

Start with the package README to learn the shipped vocabulary. In the design
note, check its status and date, then read the decision and rejected alternatives.
Before copying a signature, follow it into the package source or a typechecked
example: a design can retain sketches after an implementation ships.

For example, the CMS design opens as an unbuilt proposal, but the
[CMS guide](../../packages/cms/README.md) and
[server adapter](../../packages/cms-drizzle/README.md) document what shipped.
A historical status line is not a statement about today's package availability;
the table below says where each design stands.

## Where each design stands

Checked against the code on 2026-09-27. A design's own status line records
what was true when it was written, and several lag the code; where they
disagree, this table and the package source win. Package versions are the ones
in each `package.json` on that date.

### Built: the design explains shipped code

Read these for why the API has its shape. Before copying a signature, check the
package README or source: a built design can still hold sketches that shipped
differently.

| Doc | What it covers | Built as | Still open |
| --- | --- | --- | --- |
| [REVISION_PLAN.md](./REVISION_PLAN.md) | Authoritative plan for the Surface/Remote revision: Surface, Remote and Remote-Server, Agent and Sync rebuilt on Surface, Drizzle, tooling. Where it conflicts with older Surface notes, this wins. | `foldkit-surface`, `foldkit-remote`, `foldkit-remote-server`, `foldkit-remote-drizzle`; Phases 0–13 and 15 | Phase 14's live-Postgres acceptance: remote-drizzle is tested against SQLite and the Pg SQL compiler only. §1.1–1.2 still list old versions and private packages. |
| [MIRROR.md](./MIRROR.md) | Why mirroring the URL or a store is observation, not ownership; the store/kernel design. | `foldkit-mirror` 0.3.0 | Nothing tracked. Its opening line ("Nothing here is implemented") predates the package. |
| [agent-DESIGN.md](./agent-DESIGN.md) | `foldkit-agent` contract, authority boundaries, completion, and adapters. | `foldkit-agent` and the WebMCP, MCP, A2A and Agent Native adapters, 0.4.0 | Its package table still calls `foldkit-surface` proposed (it ships at 0.5.0) and lists `context`, removed in Revision Phase 13. |
| [mixins-DESIGN.md](./mixins-DESIGN.md) | `foldkit-mixins` substrate probes and the decisions they forced. | `foldkit-mixins` 0.4.0, with `-ui`, `-surface`, `-form`, `-crud`, `-richtext` | Phase 10 (the Surface adapter) and 12–13 are started, not complete. `@foldkit/ui`'s Menu, Listbox, ComboBox and DatePicker build their markup internally, so `mixins-ui` has no seam to adapt them. The doc's "private `0.0.0`" line is stale. |
| [styleImprovements-DESIGN.md](./styleImprovements-DESIGN.md) | A design system inside `foldkit-mixins`: layers, OKLCH theme, layout, element defaults, prose, recipes. | `foldkit-mixins` subpaths `layers`, `theme`, `layout`, `defaults`, `prose`; all eight phases | Deviations are recorded in its §11. |
| [behaviors-DESIGN.md](./behaviors-DESIGN.md) | A catalog of ready-made Behaviors: stateless ones in `foldkit-mixins`, stateful ones in `foldkit-primitives/interaction`, kit adapters in `mixins-ui`. | Phases A–I: `foldkit-mixins` `behaviors/`, `foldkit-primitives` `interaction/`, `mixins-ui` patterns and recipes | Nothing tracked. Its progress line still says A–D. |
| [bundle-DESIGN.md](./bundle-DESIGN.md) | `foldkit-bundle`: a Submodel packaged once and placed through a Link, compiled to Foldkit's own lifts. [bundle-spike.md](./bundle-spike.md) records the Foldkit APIs verified first, against 0.158.2. | `foldkit-bundle` 0.3.0, `foldkit-bundle-surface` 0.2.0, both published | Its Deferred list, e.g. per-key keep-alive in collections. Its "0.1.0, not yet published" line is stale. |
| [bundle-DX-PLAN.md](./bundle-DX-PLAN.md) | Bundle DX workstreams W1–W7. | Built through W7 | What its Outcome table records as not built: `withResources`, `Link.key`, HashMap storage. |
| [wiring-DESIGN.md](./wiring-DESIGN.md) | One checked list per application for Remote, Mirror, Sync, Agent and bundle placements, so a missed wiring step is an error. | Steps 1–7: the `Wiring` type, `assemble`, `Mirror.wiring`, Remote, Sync and Agent wirings, [docs/wiring.md](../wiring.md) | Removing a wiring from `assemble` still compiles; its open questions. The status line says step 7 remains; it is done. |
| [entity-DESIGN.md](./entity-DESIGN.md) | Entity / Form / admin: a domain declaration that Remote, Drizzle, forms and admin interpret. §52–58 record where each PR's build departed. | `foldkit-entity`, `foldkit-metadata`, `foldkit-form`, `foldkit-crud`, `mixins-form`, `mixins-crud` (PRs 1–8) | §54's Remote integration is a first slice. §50–51's "CMS not started" is superseded by `foldkit-cms`. |
| [entity-DX-PLAN.md](./entity-DX-PLAN.md) | Friction found building Entity, Form and Crud, each with its fix. | Items 1–9 and 11 | Items 10 (operand orientation error), 12 (owner parameter on `FieldExpr`), 13 (a compile-time check in place of remote-drizzle's runtime throw). |
| [cms-DESIGN.md](./cms-DESIGN.md) | `foldkit-cms`: audience, time and address over an Entity. A draft is an unsent form kept beside the row; lifecycle is derived. | `foldkit-cms`, `foldkit-cms-drizzle`, [examples/cms](../../examples/cms); all eight build steps (§13) | §14's Later items: media, slug history, localization. The opening "nothing built" line predates the build; use the [CMS guide](../../packages/cms/README.md) for the shipped API. |
| [data-query-DESIGN.md](./data-query-DESIGN.md) | A query's meaning as a value: the `Expr`/`Query` IR, `Query.define` bodies a server compiles, capability checking, a conformance suite. §0 records what building it changed. | IR and `evaluate` in `foldkit-entity`, `foldkit-entity/conformance`, the Drizzle compiler; run by remote-drizzle, remote-server, [examples/tanstack](../../examples/tanstack) and [examples/livestore](../../examples/livestore) | Phase 13 (joins and aggregates); Phase 11 was declined. The status line still lists 9–13 as deferred. |
| [local-execution-DESIGN.md](./local-execution-DESIGN.md) | Which TanStack DB and LiveStore capabilities the project already has, and a phased plan for the gap. | Phases 0–7 (§13): `evaluate`, `belongsEncoded`, `Surface.when` | Phase 4's position placement; M, measured and deliberately not built. |
| [async-semantics-DESIGN.md](./async-semantics-DESIGN.md) | What to take from Solid 2's async model: semantic async state in the Model, extensible Projection metadata, state-based completion. | Its "Implementation status" section: `foldkit-metadata`, Remote `refresh`/`confirmed` and `RemoteData.render`, Agent `when`, Sync `mounted.committed` | Nothing further. The head banner still says "proposal". |
| [remote-drizzle-DESIGN.md](./remote-drizzle-DESIGN.md) | Four decisions for `foldkit-remote-drizzle`: relation cursors, window refetch, relation authorization, computed fields. | `foldkit-remote-drizzle` 0.8.0; D1–D4 resolved (counts are the only computed field) | Its "SQL window optimization — deferred" section is stale: nested pages already rank every parent's children in one `row_number()` statement. |
| [react-DESIGN.md](./react-DESIGN.md) | React interop: a runtime bridge and view-to-TSX codegen. | `foldkit-react` and `foldkit-react-codegen` (view mode, §21–24 and 26) | §20's `Resource`/`useResource` (`readAsyncData` covers Suspense over Model `AsyncData`); §25's wrapper mode was declined. The banner's "codegen not started" contradicts the rest of it. |
| [evo-DESIGN.md](./evo-DESIGN.md) | The semantic-vs-structural write rule (`Message → update → modifyFields` against `ModelRef.set`) across every package. Written when the helper was called `evo`. | [docs/state-model.md](../state-model.md), `ModelRef.modify`, the state-seam tests | Item 12, a lint rule: the repository has no linter; Foldkit's Oxlint plugin is where it would live. |

### Partly built

| Doc | What it covers | Built | Still open |
| --- | --- | --- | --- |
| [ssr-PLAN.md](./ssr-PLAN.md) | The build plan for `foldkit-ssr`, checked against Foldkit and this repository. | `foldkit-ssr` 0.1.0: Phases 0–6, U, R, A–F | Phase G (G1–G5): naming closure handlers, the equivalence test, the manifest bench, `afterCommit`. |
| [SSR-DESIGN.txt](./SSR-DESIGN.txt) | The original eight-phase `foldkit-ssr` design: a versioned resume plan, hydration without rerunning `init`, static regions, binding-level resumability. [ssr-PLAN.md](./ssr-PLAN.md) superseded it as the working plan. | The resume plan, hydration and static regions, as `foldkit-ssr` | Its Phases 4–6 (opaque boundaries, static code out of the client bundle, surfaces as the hydration unit) wait on upstream Foldkit. Its "not started" note predates the package. |
| [resumable-DESIGN.md](./resumable-DESIGN.md) | Qwik-style resumability: Messages as serializable handlers, a Message with a hole for input events, a delegated root listener before a deferred boot. | `foldkit-ssr`'s `resumable` and `listen` modules, scheduled as ssr-PLAN's Phases A–F | Rule 1 (naming closure handlers) and rule 6's equivalence test, both ssr-PLAN Phase G. |
| [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) | A stored page as a Document of Blocks, edited by a Builder that is one Form key's control, saved and published by the CMS, served through `foldkit-ssr`. | `foldkit-composition`, `foldkit-builder`, `foldkit-mixins-builder` (private, 0.0.0): Phases 0–10 except 7c-2 | 7c-2, rich text edited on the canvas; publishing the packages. Its head still says "Proposed" and "Phases 0 to 6". |
| [richtext-DESIGN.md](./richtext-DESIGN.md) | A Lexical-class editor whose document model, operations, collaboration and CMS integration fit Model/Message/update. Prior art from Lexical, Peritext, Loro and Yjs. | `foldkit-richtext`, `-dom`, `-markdown`, `-code`, `-code-shiki`, `mixins-richtext` (0.1.0): §124 milestones 1–8 (6 without its keymap layer), 9 begun | Real-browser hardening, collaboration (`richtext-loro`, `richtext-sync`), presence, agents. |

### Not built

Each carries a status note at its head saying what it waits for.

| Doc | What it covers | Waiting on |
| --- | --- | --- |
| [platform-DESIGN.md](./platform-DESIGN.md) | Portable Style and Behavior: a target type on every piece, conditions and theme derivations as data, accessibility intents and element handles, a host per platform, React Native through codegen first. | Nothing built; no dependency blocks it. |
| [reactivity-DESIGN.md](./reactivity-DESIGN.md) | Fine-grained propagation without mutable signals, with the Plus packages as interpreters of three core primitives. | The three primitives in `foldkit/foldkit`; it cannot start here. |
| [effect-reuse-sync-durable-DESIGN.md](./effect-reuse-sync-durable-DESIGN.md) | Why Sync and Durable keep their own protocols while reusing Effect's persistence, SQL, RPC and socket layers, plus four upstream Effect PRs. | The decision holds, and `foldkit-durable` uses Effect SQL. Its prototypes are unbuilt, and the four PRs are proposals that were never submitted. |

### Research and review

| Doc | What it is |
| --- | --- |
| [richtext-REVIEW.md](./richtext-REVIEW.md) | Review findings R1–R21 against the rich-text packages (2026-09-23 and -24). Its Disposition section records every finding fixed, and the code matches; the commit it cites is not in the current history. |
| [effect-atom-jsx-LESSONS.md](./effect-atom-jsx-LESSONS.md) | Lessons from effect-atom-jsx's UI layer (2026-09-23): slot contracts, Behaviors, Styles, accessibility. Its first two gaps landed as behaviors-DESIGN Phases D and F. |

### History and earlier exploration

Useful provenance, not the current API contract. Each idea below was later
built in a different shape.

| Doc | What it is |
| --- | --- |
| [surface-BACKBONE.md](./surface-BACKBONE.md) | Why Surface should be the shared semantic seam in place of Agent's and Sync's own projections. Superseded by REVISION_PLAN and built as `foldkit-surface`. |
| [surface-DESIGN_BRAINSTORM.md](./surface-DESIGN_BRAINSTORM.md) | Early Surface exploration around Effect Optic and Schema. |
| [surface-REMOTE.md](./surface-REMOTE.md) | Earlier Remote architecture on Surface and Effect v4. Its "Design plan" status is superseded by `foldkit-remote`. |
| [surface-DRIZZLE.md](./surface-DRIZZLE.md) | Drizzle as a semantic Remote source through `effect-postgres`. The shipped adapter does not import that driver, which does not load under the pinned Effect; it takes the database from a Context tag. |
| [SLOT_MIXIN_STYLE_BRAINSTORM.md](./SLOT_MIXIN_STYLE_BRAINSTORM.md) | Product exploration that led to the Style/Behavior slot model; where it disagrees with mixins-DESIGN, mixins-DESIGN wins. |
| [DX_PROTOTYPES.md](./DX_PROTOTYPES.md) | Remote DX experiments; Phases B–D shipped, and its type fixture is live as `packages/remote/test/dx.test-d.ts`. |

## Documentation rule

A design document may explain rejected options and implementation constraints.
The public package README should explain the API that actually exists, and the
conceptual guide under `docs/` should explain when a user wants it. If those
three disagree, treat the package source and tests as the implementation truth
and fix the user-facing docs rather than teaching from a brainstorm.