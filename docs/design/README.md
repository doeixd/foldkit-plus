# Design docs

These are rationale, plans, substrate probes, and brainstorms — **not API
references and not the recommended place to learn the project**. If you are
trying to use Foldkit Plus, start with the [documentation map](../README.md), a
[worked example](../../examples/README.md), or the relevant package README.

Come here when you are changing an abstraction, reviewing a trade-off, or need
to know why the public API has the shape it does.

## Current decision documents

| Doc | What it covers |
| --- | --- |
| [REVISION_PLAN.md](./REVISION_PLAN.md) | Authoritative plan and handoff for the Surface/Remote revision; phase status and decisions. Where it conflicts with older Surface notes, this wins. |
| [MIRROR.md](./MIRROR.md) | Why mirroring is observation rather than ownership, plus the store/kernel design. |
| [mixins-DESIGN.md](./mixins-DESIGN.md) | `foldkit-mixins` substrate probes and the implementation decisions they forced. |
| [agent-DESIGN.md](./agent-DESIGN.md) | `foldkit-agent` contract, authority boundaries, completion, and adapter rationale. |
| [remote-drizzle-DESIGN.md](./remote-drizzle-DESIGN.md) | Design decisions and remaining constraints for `foldkit-remote-drizzle`. |
| [surface-BACKBONE.md](./surface-BACKBONE.md) | Why Surface is a shared semantic seam for packages that need observation/capability metadata. |
| [react-DESIGN.md](./react-DESIGN.md) | React interop plan: a runtime bridge (React islands in Foldkit via a custom-element host, Foldkit in React via `Runtime.embed` and Ports), implemented as `foldkit-react`, and view-to-TSX codegen, implemented as `foldkit-react-codegen`. |
| [bundle-DESIGN.md](./bundle-DESIGN.md) | `foldkit-bundle`: a Submodel packaged once and placed through a Link, compiled to Foldkit's own lifts; wiring checks, collections, Module ownership, and what is deferred. [bundle-spike.md](./bundle-spike.md) records the Foldkit APIs verified first. |
| [wiring-DESIGN.md](./wiring-DESIGN.md) | Proposal: one checked list per application for Remote, Mirror, Sync, Agent, and bundle placements, generalising `foldkit-bundle`'s assembly so a missed wiring step is an error instead of a silent no-op. |
| [bundle-DX-PLAN.md](./bundle-DX-PLAN.md) | The `foldkit-bundle` DX plan, built through W7; its Outcome section records where the build departed. It covers `make(name, spec)`, a parent scope that infers from Schema values, assembly sugar, args as a Schema, pipeable bundles and links, typed collection keys. |
| [entity-DESIGN.md](./entity-DESIGN.md) | Entity / form / admin architecture: a domain declaration (`foldkit-entity`, on `foldkit-metadata`) that Remote, Drizzle, forms, and admin interpret. PRs 1–2 are built; §52 records where the build departed, including why relations are declared in one `Entity.relate` step. |
| [async-semantics-DESIGN.md](./async-semantics-DESIGN.md) | What Foldkit should learn from Solid 2's async model: keep semantic async state in Model, keep Effect as the execution substrate, make Projection metadata more extensible, add state-based completion where it has a concrete owner, and show the before/after capabilities this enables across Agent, Remote, Sync, AsyncData, Module, and third-party interpreters. |

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