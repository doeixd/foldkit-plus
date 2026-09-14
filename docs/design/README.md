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
| [async-semantics-DESIGN.md](./async-semantics-DESIGN.md) | Proposal for applying Solid 2 async lessons without weakening Foldkit's Model/Message/update architecture or duplicating Effect; covers AsyncData, Projection metadata, state-based completion, refresh, optimism, determinism, and phased adoption. |
| [MIRROR.md](./MIRROR.md) | Why mirroring is observation rather than ownership, plus the store/kernel design. |
| [mixins-DESIGN.md](./mixins-DESIGN.md) | `foldkit-mixins` substrate probes and the implementation decisions they forced. |
| [agent-DESIGN.md](./agent-DESIGN.md) | `foldkit-agent` contract, authority boundaries, completion, and adapter rationale. |
| [remote-drizzle-DESIGN.md](./remote-drizzle-DESIGN.md) | Design decisions and remaining constraints for `foldkit-remote-drizzle`. |
| [surface-BACKBONE.md](./surface-BACKBONE.md) | Why Surface is a shared semantic seam for packages that need observation/capability metadata. |

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
