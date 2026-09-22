# Glossary

Every term the packages use, in one line each, grouped by the package that owns
it. Each links to where it is explained properly. The Foldkit terms at the top
are not this repository's, but everything here is built on them; the
[docs index](./README.md#the-vocabulary-that-repeats-everywhere) says more about
each of those.

## Foldkit

| Term | What it is |
| --- | --- |
| **Model** | The application's whole state, one value typed by a Schema. |
| **Message** | A tagged value naming something that happened. The union of them is everything that can. |
| **`update`** | The one pure function from a Model and a Message to the next Model and some Commands. |
| **Command** | One-shot work caused by a transition. Runs once, then reports back as a Message. |
| **Subscription** | Ongoing work whose lifetime follows Model state. Scoped by a slice; restarts when that slice changes. |
| **Mount** | Element-scoped imperative work. Emits Messages while the element is live; cleans up on unmount. |
| **Resource / ManagedResource** | A dependency shared with Commands and Subscriptions. A `ManagedResource`'s lifetime follows a Model slice. |
| **Submodel** | A child state machine whose state is a field of the parent Model and whose Messages are a variant of the parent's. |
| **Owner** | The one authoritative source for a datum. Every package in this repository is built around there being exactly one. |

## `foldkit-surface`: boundaries

| Term | What it is |
| --- | --- |
| **Application** | `Surface.application({ Model, Message, … })`: the schemas plus a reference to every Model field. Data, not a running instance. [Applications](../packages/surface/README.md#applications) |
| **Field reference** | `App.model.todos`: a typed reference to one Model field, which reads it and says what it depends on. A `ModelRef`. [Field references](../packages/surface/README.md#field-references) |
| **Projection** | A pure, named read of the Model with a schema, built from field references. It never fetches or dispatches. [Projections](../packages/surface/README.md#projections) |
| **Message subset** | `MessageSet.make(App, [...])`: the Messages a consumer is allowed to send. [Message subsets](../packages/surface/README.md#message-subsets) |
| **Surface** | A named boundary: a Projection of what a feature reads, plus the Messages it may send. [Surfaces](../packages/surface/README.md#surfaces) |
| **Active Surface** | A Surface placed with params from the Model (`Surface.at`, `Surface.when`); active while those params exist, and always, if it takes none. What Remote fetches for. |
| **Module** | An application's contracts collected as data, so `Module.validate` can find a Model path with two owners. [Modules](../packages/surface/README.md#modules) |

## `foldkit-bundle`: placing child machines

| Term | What it is |
| --- | --- |
| **Bundle** | A child machine's parts in one value: Model, Messages, init, update, subscriptions, resources, view. [The package](../packages/bundle/README.md) |
| **Link** | Where a Bundle lives: a lens onto the child Model and the parent Message variant it travels in. |
| **Placement** | A Bundle plus a Link: the same parts, lifted into the parent. Still an ordinary Submodel. |
| **Wiring** | An integration's contribution to a page, as data: which Messages it routes, its Subscriptions, its startup Command, its contract. `Data.wiring(…)` is Remote's. [Wiring](./wiring.md) |
| **`Page.assemble`** | Joins placements and wirings into one list, from which `update`, `init`, Subscriptions and the Module are derived. |

## `foldkit-entity`: the domain

| Term | What it is |
| --- | --- |
| **Entity** | A named record type with an `id`, declared once with `Entity.define`, and read by Remote, the Drizzle binding and forms. [The package](../packages/entity/README.md) |
| **Relation** | A field that refers to another Entity (`Relation.one`, `Relation.many`), stored as a ref key such as `'User:u1'`, never a copy. |
| **Selection** | Exactly which fields of an Entity, and through which relations, a consumer needs; it decodes to that shape. `Entity.select`. |
| **Query body** | What a query means, as a value: `Query.define(name, Input, ({ input }) => …)` with `Expr` predicates and an order. Compiled to SQL on a server, run over rows by `evaluate`. |

## `foldkit-remote`: server data

| Term | What it is |
| --- | --- |
| **`Remote.Model`** | Remote's Submodel inside your Model: the normalized entity cache, connections, and what is loading or failed. [The package](../packages/remote/README.md) |
| **`Data`** | The domain bound to its place in your Model (`Remote.make`); every application-facing operation hangs off it. |
| **Requirement** | What a read needs: an entity, an id, some fields. It rides on a Projection; the planner compares it with the cache. |
| **`RemoteData`** | What the cache knows about one read right now: `Initial`, `Loading`, `Ready`, `Refreshing`, `Failed` or `NotFound`. [RemoteData](../packages/remote/README.md#remotedata-what-does-the-model-know-right-now) |
| **Connection** | An ordered list of results from one query and input, as edges. What `Data.query` reads. |
| **Edge** | One entry in a connection: a key and a reference to an entity. |
| **Segment** | A run of adjacent edges. The gap between two segments is rows nobody has fetched. |
| **Boundary** | What is known past a segment's end: `Terminal` (nothing more), `Cursor` (where to page from), or `Unknown`. |
| **Optimistic layer** | A mutation's patches shown over the cache while it is in flight, removed when it settles. |
| **Overlay** | Operations shown over the cache with no request behind them, until lifted: a preview. |
| **Retention** | Keeping only what active Surfaces reach; the rest is collected when they change. |

## Other packages

| Term | What it is |
| --- | --- |
| **Mirror** | A Model slice represented in the URL or a key-value store. The Model stays the owner. [`foldkit-mirror`](../packages/mirror/README.md) |
| **Replica** | `foldkit-sync`'s client side: your Messages as durable operations, pending ones replayed over the committed state. [Replicated state](./replication.md) |
| **Journal** | `foldkit-durable`'s server side: the authoritative order of committed operations. |
| **Agent contract** | What an agent may see (a Projection) and do (a Message subset), built from `Agent.forApplication(App)` and served by an adapter. [Agents](./agents.md) |
| **Slot** | A named extension point in a view (`root`, `label`, …) that Style and Behavior attach to. [`foldkit-mixins`](../packages/mixins/README.md) |
| **SlotView** | A pure view that renders its slots and resolves what is attached to them. |
