# Prior art and design lineage

Foldkit Plus is a synthesis project. Most of the ideas in it have recognizable
ancestors; the goal is not to replace those ideas with new names, but to make
them compose around one Foldkit application without introducing parallel places
to keep state or parallel ways to describe application behavior.

This document records the projects that most directly influenced that design,
what Foldkit Plus takes from them, and where it deliberately differs.

> **Scope.** "Prior art" here means architectural and implementation lineage. It
> is not an exhaustive patent-prior-art search, a legal opinion, or a claim that
> every similar idea originated in the projects below. It is also intentionally
> about direct influences on Foldkit Plus rather than every influence on those
> projects in turn.

The short version is:

```text
Elm
 Model / Message / update / Cmd / Sub
                 │
                 ▼
Foldkit ──────────────────────────────┐
 Schema Model / Messages / update     │
 Commands / Subscriptions / Submodels │
                 │                    │
                 │            Effect │
                 │     Schema / Optics│
                 │ Services / Layers  │
                 │ Streams / scopes   │
                 └──────────┬─────────┘
                            ▼
                     Foldkit Plus
                            │
            declare application semantics once
                            │
       ┌────────────┬───────┼────────┬─────────┐
       ▼            ▼       ▼        ▼         ▼
    Remote        Sync    Agent    Mirror    Mixins
```

The package-specific influences then sit around that foundation:

| Influence | Main idea that carried forward | Foldkit Plus descendant |
| --- | --- | --- |
| [Elm](https://guide.elm-lang.org/architecture/) | one Model, Messages, pure transitions, effects outside the transition | the underlying application model |
| [Foldkit](https://github.com/foldkit/foldkit) | Schema Model, fact-named Messages, exhaustive `update`, Commands, Subscriptions, Submodels | the authority every Plus package extends |
| [Effect](https://effect.website/) | Schema, Optics, typed service requirements, Layers, Streams, scopes | the structural/effect vocabulary throughout the repo |
| [`doeixd/gpui-ts`](https://github.com/doeixd/gpui-ts) | centralized model ownership, focused models, composable lenses, views bound to explicit model slices | `foldkit-surface`, especially `ModelRef` / Projection |
| [fate](https://fate.technology/) | declarative data requirements, view composition, normalized caching, strict selection, Drizzle compilation | `foldkit-remote`, `foldkit-remote-server`, `foldkit-remote-drizzle` |
| [Logux](https://logux.org/) | optimistic local action log, offline persistence, replay, reconciliation against later server history | `foldkit-sync` + `foldkit-durable` |
| [nuqs](https://nuqs.dev/) | typed URL state, parsers/serializers, defaults, push/replace history semantics | `foldkit-mirror` |
| [Remix mixins](https://guides.remix.run/rendering-ui/) | host-element composition of styling/attributes/behavior without replacing the host element | `foldkit-mixins` |
| [StyleX](https://stylexjs.com/) | styles as type-checked composable data with predictable merge semantics | `foldkit-mixins` Style |
| [`doeixd/effect-atom-jsx`](https://github.com/doeixd/effect-atom-jsx) | inside-out UI, typed slots, externally attached Style and Behavior, Effect-native composition | the direct internal precursor to the Mixins family |
| [Agent Native](https://github.com/BuilderIO/agent-native) | one capability model shared by agents, UI, and protocol surfaces | `foldkit-agent` + protocol adapters |

## Foundations: Elm, Foldkit, and Effect

### Elm: one transition loop

The deepest ancestor is [The Elm Architecture](https://guide.elm-lang.org/architecture/):
a Model represents application state, user/external events become Messages,
`update` transforms the Model, and Commands/Subscriptions move effects outside
the pure transition itself.

Foldkit Plus inherits this indirectly because it does not define a new
application runtime. An extension is successful when it can still be described
as:

```text
external thing
    │
    ▼
Message ──► update ──► Model
    │
    └──────── effect / subscription outside the transition
```

That constraint is why an agent capability is a Message instead of a second
"action" implementation, why Remote responses arrive as Messages instead of
mutating a hidden cache, and why Sync replays Messages through `update` rather
than maintaining a second reducer.

### Foldkit: the application remains the center

[Foldkit](https://github.com/foldkit/foldkit) is not merely an inspiration; it is
the substrate. Foldkit already gives the application a Schema-defined Model as
the single source of truth, a Message union, an exhaustive `update`, explicit
Commands, Subscriptions, Submodels, routing, and runtime-managed lifecycles.

Foldkit Plus starts from the assumption that those semantics should stay
central:

```text
                    Foldkit application

               Model + Message + update
                         │
                  ┌──────┴──────┐
                  │             │
             observation     capability
                  │             │
                  └──── Surface ┘
                         │
            interpreted by other packages
```

The project is therefore intentionally different from a collection of
independent libraries that each bring their own store, event vocabulary, or
lifecycle. Plus packages should enrich or interpret the existing application,
not compete with it.

### Effect: lawful structural and effect primitives

[Effect](https://effect.website/) supplies the other foundational vocabulary:
Effect Schema for runtime/type contracts, Optics for structural focus, Services
and Layers for explicit dependencies, Streams for long-lived inputs, and scoped
resources for lifecycle.

A recurring design rule in Foldkit Plus is:

> When Effect already has a lawful structural primitive, add Foldkit semantics
> around it rather than replacing it.

`ModelRef`, for example, is not a new lens system. It enriches an Effect Optic
with the Schema, dependency metadata, and application identity needed by
Surface. Remote clients, Durable journals, transports, database access, and
protocol servers likewise expose Effect requirements rather than inventing a
second dependency-injection model.

## Focused application state: GPUI-TS and Effect Optics

[`doeixd/gpui-ts`](https://github.com/doeixd/gpui-ts) is the direct internal
precursor to the state-focusing side of `foldkit-surface`. GPUI-TS already
centered **model ownership** and let consumers operate on a focused part of that
owned state instead of creating another store beside it. Its lens and focused
model APIs made that relationship explicit:

```text
central model owner
      │
      ├── lens / lensAt
      │       │
      │       ▼
      │   focused value
      │
      └── focus(lens)
              │
              ▼
         focused model
```

That design also showed up in views: a view could bind to a particular model,
and derived/focused access was a first-class thing rather than an ad-hoc selector
convention.

Surface keeps that instinct but moves it into the Foldkit + Effect vocabulary.
[Effect Optics](https://github.com/Effect-TS/effect/blob/main/packages/effect/OPTIC.md)
provide the lawful structural focus, including reusable/composable focus into
nested data. `ModelRef` enriches an Optic with the pieces Foldkit Plus needs:
Schema, dependency metadata, application identity, and convenient `get` / `set`
operations.

```text
GPUI-TS
central model + lenses + focused models
                 │
                 │ design lineage
                 ▼
Effect Optic ──► ModelRef
                  │
                  ▼
              Projection
                  │
                  ▼
               Surface
```

The other half of Surface comes from Foldkit itself. A consumer does not only
observe state; it may also be permitted to cause some existing application
Messages. Surface therefore combines:

```text
structural focus / observation
      GPUI-TS + Effect Optics
                │
                ├──────┐
                │      │
                ▼      ▼
             Surface = observation + capability
                           ▲
                           │
                   Foldkit Messages
```

Fate is a later influence on **Projection requirement metadata**, especially for
Remote: a Projection can carry declarative requirements that an interpreter can
plan. It is not the primary ancestor of Surface's focused-state design.

## Server-derived state: fate

[fate](https://fate.technology/guide/core-concepts) is the clearest direct
ancestor of the Remote family. fate asks components to declare the data they
need through composable Views, combines those requirements, fetches only what
is required, and stores results in a normalized object cache rather than a
request cache. Its Drizzle integration compiles semantic selections into the
queries that answer them.

The lineage is visible:

```text
fate

View / selected fields
        │
        ▼
composed requirements
        │
        ▼
request
        │
        ▼
normalized object cache


Foldkit Plus

Surface Projection / Selection
        │
        ▼
requirements
        │
        ▼
Remote planner / RemoteClient
        │
        ▼
Remote Message
        │
        ▼
Data.reduce
        │
        ▼
Remote.Model (normalized cache inside Model)
```

The important change is **where the cache and lifecycle live**. `Data.get(...)`
is a pure Projection; it does not fetch. Active Surface requirements are
interpreted by Subscriptions, I/O is performed through `RemoteClient`, and the
facts that come back are reduced into the application's Model as Messages.
Remote therefore borrows the requirements/normalization model without creating
an application state system beside Foldkit.

Fate also influenced several more specific choices:

- selections describe the semantic fields a consumer needs rather than a
  pre-baked endpoint;
- nested requirements can be composed and followed across normalized entities;
- cache presence is field-sensitive rather than merely entity-sensitive;
- query/connection state is normalized separately from entity state;
- server-side selection can compile into Drizzle queries;
- live results update the same normalized representation rather than a separate
  live-data store.

### Direct implementation adaptation from fate

Fate is also the one influence in this document where Foldkit Plus currently
contains **adapted implementation code**, not only conceptual inspiration.
`foldkit-remote-drizzle` adapts parts of fate's MIT-licensed Drizzle
implementation for lexicographic keyset predicates, required-column projection,
page boundaries, pagination windows, and connection page metadata.

The exact source files, adapted files, copyright notice, and MIT license are
recorded in
[`packages/remote-drizzle/THIRD_PARTY_NOTICES.md`](../packages/remote-drizzle/THIRD_PARTY_NOTICES.md).
That notice is authoritative for code attribution; this document only explains
the architectural lineage.

## Replication: Logux

[Logux](https://logux.org/) is an important ancestor of the Sync mental model.
Its client applies actions locally, keeps unsynchronized actions while offline,
sends them later, and can roll back/replay recent actions when server history
arrives in a different order. That makes optimistic local state a replay result
rather than a special mutable overlay.

Foldkit Sync follows the same broad tradition:

```text
committed server history
          +
pending local operations
          =
optimistic visible state
```

and reconciliation means changing the committed base and replaying whatever
local operations are still pending on top.

The Foldkit-specific move is that Sync does **not** introduce a generic action
vocabulary or a second reducer. A durable operation is a selected existing
application Message, and replay is the application's existing `update`:

```text
Foldkit Message
     │
     ├── normal local transition
     │
     └── selected as durable
              │
              ▼
          Sync outbox
              │
              ▼
      authoritative ordering
              │
              ▼
        replay through update
```

`foldkit-durable` supplies the authoritative server journal: operation identity,
ordering, snapshot/cursor advancement, idempotent retry, compaction, and the
external-effect recovery ledger. This is deliberately not a peer-to-peer CRDT
system. The server order is authoritative, and durable Messages must be pure,
state-only transitions of the declared shared projection.

The main Logux ideas carried forward are therefore **offline-first optimistic
application, replay, acknowledgement/rejection, and rebase**, while the unit of
replication is Foldkit's pre-existing transition algebra.

## Mirrored state: nuqs

[nuqs](https://nuqs.dev/) is the clearest influence on `foldkit-mirror`: typed
parsers and serializers for URL query state, declared defaults, per-key history
behavior (`push` versus `replace`), and careful treatment of browser URL update
rates.

Mirror adopts that ergonomics but makes a different ownership decision:

```text
nuqs-shaped intuition
URL search parameter ≈ application state

Foldkit Mirror
Model field = application state
URL         = representation of that field
```

The Foldkit Model remains authoritative. The URL or key-value document can be
lost and reconstructed from Model state; reading a representation back produces
a normal application transition. There is no replicated log and no attempt to
make two writers converge.

Because Mirror is built from `App.fields`, it can also derive more than a generic
URL helper can: the field Schema supplies the value contract, the initial Model
supplies defaults, and field identity supplies the default key. The same mirror
kernel can therefore target a URL or an Effect `KeyValueStore` while preserving
the same ownership rule.

## Inside-out UI: Remix mixins, StyleX, and effect-atom-jsx

The Mixins family has three especially direct influences that contribute
different pieces of the design.

### Remix mixins: attach to the host instead of wrapping it

Current [Remix UI mixins](https://guides.remix.run/rendering-ui/) let an
application render the native host element and attach reusable styling/behavior
through `mix`. The native control retains its semantics and state; the mixin is
an extension of the element rather than a replacement component with another
ownership boundary.

That "inside-out" direction strongly matches Foldkit Mixins:

```text
view publishes extension points
          │
          ▼
Style / Behavior attach from outside
          │
          ▼
resolved attributes at the original element
```

Foldkit Mixins adds a more explicit contract around that idea. A view publishes
**named typed Slots**, each Slot declares structural capabilities, and the
resolver applies merge/ownership rules. A Style can add appearance; a Behavior
can add element-level interaction or mount work; neither becomes another owner
of application state.

### StyleX: style as typed composable data

[StyleX](https://stylexjs.com/) is an influence on the Style half of that model:
styles are values that can be type-checked, composed, conditionally applied, and
merged predictably instead of being arbitrary string concatenation.

Foldkit Mixins does not attempt to reproduce StyleX's compiler or atomic-CSS
architecture. The borrowed design instinct is narrower: **appearance should be
structured composable data with explicit merge semantics**. That makes Style a
thing that can be attached to a Slot contract, inspected, composed, validated,
and resolved without transferring ownership of the underlying element or
application state.

### effect-atom-jsx: the internal precursor

[`doeixd/effect-atom-jsx`](https://github.com/doeixd/effect-atom-jsx) is the
most direct internal ancestor of the Mixins API. Its AF-UI work already explored
an Effect-native "inside-out" component model with:

- typed slot contracts;
- abstract element capabilities;
- Styles attached from outside the component;
- Behaviors attached from outside and scoped to lifecycle;
- compile-time rejection of unknown slots/capabilities;
- composition through Effect and pipeable values.

Foldkit Plus re-homes the useful part of that experiment inside Foldkit's
architecture instead of carrying its separate atom/component state model
forward:

```text
effect-atom-jsx

component + reactive state
       │
       ├── Slots
       ├── Style
       └── Behavior

             │ ideas retained
             ▼

Foldkit Plus

Foldkit Model / Messages own application state
       │
       ├── Surface describes consumer boundary
       └── Mixins
            ├── Slots
            ├── Style
            └── Behavior
```

This is why Mixins is intentionally strict about Behavior not becoming an
application-state mechanism. Foldkit already has a state machine; the extension
system should customize a view without quietly creating another one.

## Agent-native applications: Agent Native

[Agent Native](https://github.com/BuilderIO/agent-native) helped motivate the
agent side of Foldkit Plus. Its central architectural idea is that a capability
is defined once as an action and then reused by both the agent and the UI, with
that same action also exposable through HTTP, MCP, A2A, and other surfaces.
Agents work through application capabilities rather than clicking through the
UI.

Foldkit Plus agrees with the **shared capability surface** and makes a different
choice about what the capability is:

```text
Agent Native

defineAction(...)
      │
      ├── UI
      ├── agent
      ├── HTTP
      ├── MCP
      └── A2A


Foldkit Plus

existing Foldkit Message
      │
      ▼
Agent contract
      │
      ├── WebMCP
      ├── MCP
      ├── A2A
      └── Agent Native
```

A Foldkit application already has a vocabulary for things that may happen:
Messages. `foldkit-agent` therefore treats an agent capability as permission to
cause one of those existing Messages, optionally with a different input mapping,
availability rule, authorization rule, and completion contract. The adapter
packages translate that protocol-neutral contract; they do not add application
authority.

That distinction is central to the project's larger rule: **do not encode the
same application behavior once for humans and again for agents.**

## Surface as the common intermediate boundary

The GPUI-TS / Effect Optics lineage explains Surface's focused-state side, but
Surface adds a Foldkit-specific consumer contract around it.

A Surface says two things together:

```text
information boundary
what this consumer may observe

        +

capability boundary
which application Messages it may cause
```

That gives several otherwise unrelated interpreters a common application-facing
contract. A view can render the Projection. Remote can plan its server-data
requirements. Agent can expose selected capabilities. Module can inspect who
observes or owns what. A Surface can also cut across Submodels because it is a
consumer boundary, not a state-machine ownership boundary.

This common intermediate representation is an important part of how Foldkit Plus
turns the inspirations above into one architecture instead of a bundle of
integrations.

## What Foldkit Plus adds to the lineage

None of the packages should be read as a claim that normalized caches, optimistic
logs, URL state, composable styling, or agent tools were invented here. The
project-specific contribution is the way those ideas are constrained and made
to compose.

### 1. Declare application semantics once

The application already has:

```text
Model
Message union
update
```

Extensions should interpret those semantics instead of restating them as query
stores, agent actions, replicated reducers, view-local state machines, and URL
stores.

This is the idea behind the project's shorthand:

> **Declare your application once. Interpret it everywhere.**

### 2. One owner per datum

Different systems can represent the same information, but authority should be
explicit:

| Kind of state | Authority |
| --- | --- |
| local/transient application state | Foldkit Model / `update` |
| server-owned refetchable facts | server; Remote is the Model-resident cache |
| client-authored state that must survive offline and converge | Sync/Durable log |
| linkable or remembered local state | Foldkit Model; Mirror is a representation |
| agent permissions | application contract; protocol adapters only expose it |
| view appearance/element behavior | the view/slot contract; Mixins owns no application state |

That rule is what prevents the same logical value from becoming independently
mutable in several subsystems.

### 3. Interpreters instead of parallel frameworks

Remote, Sync, Agent, Mirror, and Mixins do very different jobs, but each is
structured as an interpreter or extension around the same application:

```text
                    application
              Model / Messages / update
                         │
                       Surface
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    observation       capability      structure
        │                │                │
     Remote           Agent/Sync         Mixins
                         │
                      Mirror
                 represents Model
```

The exact dependencies are not literally this tree—some packages are useful
without Surface—but the architectural direction is the same: outward systems
should depend on application semantics, not become competing authorities.

### 4. Existing Messages cross subsystem boundaries

Two particularly important consequences are:

- **Agent:** a capability ultimately constructs and dispatches an existing
  Message.
- **Sync:** a durable operation is an existing Message replayed through the
  existing `update`.

Those two packages therefore share an unusual property: very different external
actors—an LLM and another replica—participate in the application through the
same transition vocabulary as the UI.

### 5. The architecture remains inspectable

Because observation, capability, replication, remote requirements, and mirroring
are declarations rather than hidden runtime conventions, `Module` can validate
relationships and emit manifests/documentation. This is another reason to prefer
explicit contracts over framework-specific implicit state.

## Conceptual influence versus copied implementation

This distinction matters for both accuracy and licensing.

| Project | Conceptual/API influence | Adapted implementation in Foldkit Plus |
| --- | --- | --- |
| Elm | yes | no |
| Foldkit | substrate/dependency | no copied implementation in this repo |
| Effect | substrate/dependency; Optics are used directly by Surface | no copied implementation in this repo |
| gpui-ts | yes; internal precursor to Surface's focused-state design | ideas/API lineage, not copied third-party code |
| fate | yes | **yes: selected Drizzle logic, under MIT; see notice** |
| Logux | yes | no |
| nuqs | yes | no |
| Remix mixins | yes | no |
| StyleX | yes | no |
| effect-atom-jsx | yes; internal precursor | ideas/API lineage, not copied third-party code |
| Agent Native | yes; plus adapter compatibility | no copied implementation |

For code-level third-party notices, always prefer the package-local notice over
this architectural document. Today the relevant notice is
[`packages/remote-drizzle/THIRD_PARTY_NOTICES.md`](../packages/remote-drizzle/THIRD_PARTY_NOTICES.md).

## Further reading

- [Elm architecture](https://guide.elm-lang.org/architecture/)
- [Elm Commands and Subscriptions](https://guide.elm-lang.org/effects/)
- [Foldkit](https://github.com/foldkit/foldkit)
- [Effect](https://effect.website/)
- [Effect Schema](https://effect.website/docs/v4/schema/introduction)
- [Effect Services and Layers](https://effect.website/docs/v4/requirements-management/services)
- [Effect Optics](https://github.com/Effect-TS/effect/blob/main/packages/effect/OPTIC.md)
- [`doeixd/gpui-ts`](https://github.com/doeixd/gpui-ts)
- [fate core concepts](https://fate.technology/guide/core-concepts)
- [fate 1.0](https://fate.technology/posts/fate-1.0)
- [Logux concepts](https://logux.org/guide/concepts/action/)
- [nuqs](https://nuqs.dev/)
- [nuqs parsers](https://nuqs.dev/docs/parsers/built-in)
- [nuqs options/history](https://nuqs.dev/docs/options)
- [Remix UI mixins](https://guides.remix.run/rendering-ui/)
- [StyleX](https://stylexjs.com/)
- [`doeixd/effect-atom-jsx`](https://github.com/doeixd/effect-atom-jsx)
- [Agent Native](https://github.com/BuilderIO/agent-native)