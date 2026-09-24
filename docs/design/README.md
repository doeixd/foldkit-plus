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

For example, the CMS design still describes an unbuilt proposal; the current
[CMS guide](../../packages/cms/README.md) and
[server adapter](../../packages/cms-drizzle/README.md) document the implementation.
A historical status line is not a statement about today's package availability.

## Decision documents and implementation plans

| Doc | What it covers |
| --- | --- |
| [REVISION_PLAN.md](./REVISION_PLAN.md) | Authoritative plan and handoff for the Surface/Remote revision; phase status and decisions. Where it conflicts with older Surface notes, this wins. |
| [MIRROR.md](./MIRROR.md) | Why mirroring is observation rather than ownership, plus the store/kernel design. |
| [mixins-DESIGN.md](./mixins-DESIGN.md) | `foldkit-mixins` substrate probes and the implementation decisions they forced. |
| [styleImprovements-DESIGN.md](./styleImprovements-DESIGN.md) | A design system inside `foldkit-mixins` as one composable algebra over subpath exports: a `Layers` value, an OKLCH token generator and scoped theme overrides, `Layout` pieces, element defaults and prose, and shipped recipes; what is borrowed from css-tags and what is not. |
| [platform-DESIGN.md](./platform-DESIGN.md) | Portable Style and Behavior: a target type on every piece, conditions and theme derivations as data, accessibility intents and element handles instead of ARIA strings and DOM elements, and a host per platform, with React Native through codegen as the first target. |
| [agent-DESIGN.md](./agent-DESIGN.md) | `foldkit-agent` contract, authority boundaries, completion, and adapter rationale. |
| [remote-drizzle-DESIGN.md](./remote-drizzle-DESIGN.md) | Design decisions and remaining constraints for `foldkit-remote-drizzle`. |
| [surface-BACKBONE.md](./surface-BACKBONE.md) | Why Surface is a shared semantic seam for packages that need observation/capability metadata. |
| [react-DESIGN.md](./react-DESIGN.md) | React interop plan: a runtime bridge (React islands in Foldkit via a custom-element host, Foldkit in React via `Runtime.embed` and Ports), implemented as `foldkit-react`, and view-to-TSX codegen, implemented as `foldkit-react-codegen`. |
| [bundle-DESIGN.md](./bundle-DESIGN.md) | `foldkit-bundle`: a Submodel packaged once and placed through a Link, compiled to Foldkit's own lifts; wiring checks, collections, Module ownership, and what is deferred. [bundle-spike.md](./bundle-spike.md) records the Foldkit APIs verified first. |
| [wiring-DESIGN.md](./wiring-DESIGN.md) | Proposal: one checked list per application for Remote, Mirror, Sync, Agent, and bundle placements, generalising `foldkit-bundle`'s assembly so a missed wiring step is an error instead of a silent no-op. |
| [bundle-DX-PLAN.md](./bundle-DX-PLAN.md) | The `foldkit-bundle` DX plan, built through W7; its Outcome section records where the build departed. It covers `make(name, spec)`, a parent scope that infers from Schema values, assembly sugar, args as a Schema, pipeable bundles and links, typed collection keys. |
| [entity-DESIGN.md](./entity-DESIGN.md) | Entity / form / admin architecture: a domain declaration (`foldkit-entity`, on `foldkit-metadata`) that Remote, Drizzle, forms, and admin interpret. PRs 1–5, a headless `foldkit-form` (PR 7), its Mixins view, and the editor of `foldkit-crud` (PR 8) are built; §52–57 record where the build departed, including why relations are declared in one `Entity.relate` step. |
| [entity-DX-PLAN.md](./entity-DX-PLAN.md) | Friction found building and using Entity, Form, and Crud, each with what prompted it and what resolves it; items are marked as they land. |
| [cms-DESIGN.md](./cms-DESIGN.md) | `foldkit-cms`: audience, time, and address over an Entity. A draft is an unsent form kept beside the row; publishing is the application's own mutation; state is derived, not stored. Original proposal and build order; consult the CMS package READMEs for the shipped API. |
| [data-query-DESIGN.md](./data-query-DESIGN.md) | A query's meaning as a value: the `Expr`/`Query` IR `foldkit-entity` owns, `Query.define` carrying a body a server compiles, interpreter capability checking, and the conformance suite four engines are run against. §0 records what building it changed; §33.1 records the walls it does not extend past. |
| [local-execution-DESIGN.md](./local-execution-DESIGN.md) | Which TanStack DB and LiveStore capabilities this project already has, which it does not, and a phased plan for the gap. The keystone finding: the client-side query engine already exists in the server package. |
| [async-semantics-DESIGN.md](./async-semantics-DESIGN.md) | What Foldkit should learn from Solid 2's async model: keep semantic async state in Model, keep Effect as the execution substrate, make Projection metadata more extensible, add state-based completion where it has a concrete owner, and show the before/after capabilities this enables across Agent, Remote, Sync, AsyncData, Module, and third-party interpreters. |

## Proposed, not built

Each carries a status note at its head saying what it is waiting for, so a
reader can tell a gate from an oversight.

| Doc | What it covers |
| --- | --- |
| [SSR-DESIGN.txt](./SSR-DESIGN.txt) | An unbuilt `packages/ssr` in eight phases: a versioned resume plan, hydration that does not rerun `init`, static boundaries, and eventually binding-level resumability. Unusually, it is gated on nothing — it is unstarted work rather than blocked work, and its note says so. |
| [ssr-PLAN.md](./ssr-PLAN.md) | The plan to build it: what checking the design against Foldkit 0.158 and this repository found (three upstream changes missing, two traps in the `init` workaround, five outdated assumptions), the open questions decided, and seven phases that each end in a test, revised after review. |
| [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) | `foldkit-composition` and `foldkit-builder`: a typed, inspectable composition system able to power Builder.io-style visual authoring without adding a second state system, component framework or action runtime. |
| [richtext-DESIGN.md](./richtext-DESIGN.md) | `foldkit-richtext`: a Lexical-class editor whose document model, operations, collaboration and CMS integration fit Model/Message/update rather than bringing a second runtime. Prior art from Lexical, Peritext, Loro and Yjs. |
| [reactivity-DESIGN.md](./reactivity-DESIGN.md) | Fine-grained propagation without mutable signals. Mostly `foldkit/foldkit`: the Plus packages are defined as interpreters of three core primitives that do not exist yet, so this one cannot start here. |
| [effect-reuse-sync-durable-DESIGN.md](./effect-reuse-sync-durable-DESIGN.md) | Why Sync and Durable keep their own protocol semantics while reusing Effect's persistence, SQL, RPC and socket layers — plus four upstream PRs, which wait on Effect's review queue. |
| [evo-DESIGN.md](./evo-DESIGN.md) | The semantic-vs-structural write rule (`Message → update → modifyFields` against `ModelRef.set`) carried across every package. Done, bar a lint rule; Foldkit's Oxlint plugin is where it would live now. Written when the helper was still called `evo`. |

## Provenance and earlier exploration

These documents are useful history, but they are not the current API contract:

| Doc | What it is |
| --- | --- |
| [SLOT_MIXIN_STYLE_BRAINSTORM.md](./SLOT_MIXIN_STYLE_BRAINSTORM.md) | Product/design exploration that led to the current Style/Behavior slot model. |
| [surface-DESIGN_BRAINSTORM.md](./surface-DESIGN_BRAINSTORM.md) | Early Surface exploration around Effect Optic and Schema. |
| [surface-REMOTE.md](./surface-REMOTE.md) | Earlier Remote architecture work on top of Surface + Effect v4. |
| [surface-DRIZZLE.md](./surface-DRIZZLE.md) | Earlier exploration of Drizzle as a semantic Remote source. |
| [DX_PROTOTYPES.md](./DX_PROTOTYPES.md) | API/DX experiments; useful as provenance, not as usage documentation. |

## Documentation rule

A design document may explain rejected options and implementation constraints.
The public package README should explain the API that actually exists, and the
conceptual guide under `docs/` should explain when a user wants it. If those
three disagree, treat the package source and tests as the implementation truth
and fix the user-facing docs rather than teaching from a brainstorm.