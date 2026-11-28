# Glossary

Plain-English definitions for the words used across Foldkit and Foldkit Plus, grouped by area.

## Foldkit basics

| Term | Meaning | Guide |
| --- | --- | --- |
| **Model** | One typed value holding your entire application state. | [Quickstart](./quickstart.md) |
| **Message** | One tagged event describing what happened, such as a click or server reply. | [Quickstart](./quickstart.md) |
| **`update`** | Pure function taking the current Model and a Message to return the next Model. | [Quickstart](./quickstart.md) |
| **Command** | One-off side effect returned by `update` that reports back via a Message. | [State model](./state-model.md) |
| **Subscription** | Ongoing work (timers, sockets) that starts and stops as Model fields change. | [State model](./state-model.md) |
| **Mount** | DOM setup and cleanup tied to a single element's lifetime. | [State model](./state-model.md) |
| **Resource** | Shared dependency (like a socket or client) scoped to a Model field. | [Wiring](./wiring.md) |
| **Submodel** | A child state machine stored as a field inside a parent Model. | [Bundle](../packages/bundle/README.md) |
| **Owner** | The single authority allowed to change a datum or write to a view slot. | [State model](./state-model.md) |

## Feature boundaries (`foldkit-surface`)

| Term | Meaning | Guide |
| --- | --- | --- |
| **Application** | Your `Model`, `Message`, `initial`, and `update` registered with `Surface.application`. | [Surface](../packages/surface/README.md#applications) |
| **Field reference** | Typed pointer (`App.model.todos`) to one field in your Model (`ModelRef`). | [Field references](../packages/surface/README.md#field-references) |
| **Projection** | Pure read that extracts selected Model fields along with their dependency paths. | [Projections](../packages/surface/README.md#projections) |
| **Message subset** | Typed allowlist (`MessageSet.make`) of Messages a feature or agent may send. | [Message subsets](../packages/surface/README.md#message-subsets) |
| **Surface** | Named boundary pairing what a feature reads with the Messages it may send. | [Surfaces](../packages/surface/README.md#surfaces) |
| **Active Surface** | A Surface turned on by current Model state (`Surface.at`, `Surface.when`). | [Remote](../packages/remote/README.md) |
| **Module** | An app's Surfaces collected together so `Module.validate` catches write overlaps. | [Modules](../packages/surface/README.md#modules) |

## Reusable submodels (`foldkit-bundle`)

| Term | Meaning | Guide |
| --- | --- | --- |
| **Bundle** | A packaged child feature with its Model, Messages, `init`, `update`, and view. | [Bundle](../packages/bundle/README.md) |
| **Link** | Maps where a Bundle lives in a parent Model and which parent Message wraps it. | [Bundle](../packages/bundle/README.md) |
| **Placement** | A Bundle attached to a parent application through a Link. | [Bundle](../packages/bundle/README.md) |
| **Wiring** | An integration's Messages, Subscriptions, and startup Commands as data. | [Wiring](./wiring.md) |
| **`Page.assemble`** | Combines Placements and Wirings into one `init`, `update`, and `Module`. | [Bundle](../packages/bundle/README.md) |

## Domain rules and permissions (`foldkit-entity` & `foldkit-guard`)

| Term | Meaning | Guide |
| --- | --- | --- |
| **Entity** | A named record type with an `id`, shared by client views, forms, and the server. | [Domain](./entity.md) |
| **Domain module** | Shared module declaring Entities, relations, queries, writes, invariants, and guards. | [Domain](./entity.md) |
| **Relation** | Typed link between Entities (`Relation.one` or `Relation.many`) stored by id. | [Domain](./entity.md) |
| **Derived member** | Computed or server-supplied read value on an Entity, such as a related count. | [Entity](../packages/entity/README.md) |
| **Selection** | Typed list of fields and nested relations (`Entity.select`) a screen reads. | [Entity](../packages/entity/README.md) |
| **`Expr`** | Filter or check built as data so both SQL and client code evaluate it identically. | [Expressions](./expressions.md) |
| **Query body** | Filter and sort order (`Query.from(Entity)`) run as SQL on servers or JS on clients. | [Expressions](./expressions.md) |
| **Collation** | Explicit text comparison rule (`binary`, `asciiFold`, or `locale`). | [Expressions](./expressions.md) |
| **`Judge`** | Evaluates a Query body against held rows and returns a metakit `Verdict`: `True`, `False` or `Unknown`. | [Expressions](./expressions.md) |
| **Interpreter** | Engine that runs an `Expr` or Query (SQL compiler, in-memory runner, or `Judge`). | [Expressions](./expressions.md#three-interpreters-one-answer) |
| **Reach** | Fields in other rows that a query reads across a relation. | [Expressions](./expressions.md) |
| **Holder** | Partial set of cached rows where unread fields are missing, not null. | [Expressions](./expressions.md) |
| **Operator** | Custom comparison added to `Expr` (`Expr.operator`) and implemented per engine. | [Operators](./operators.md) |
| **Context set** | Field filled automatically on the server (such as author or timestamp), never input. | [Declared writes](./declared-writes.md) |
| **Declared write** | Single-row insert, update, or delete (`Write.update`, `insert`, `delete`) as data. | [Declared writes](./declared-writes.md) |
| **Precondition** | A write's `when` rule over the existing row; fails with `Unmet` if false. | [Declared writes](./declared-writes.md) |
| **Invariant** | Rule (`Entity.invariant`) every row must satisfy; violations fail with `Invalid`. | [Laws](./laws.md) |
| **Refinement** | Named state of a row (`Draft`, `Published`) reused in queries, guards, and writes. | [Laws](./laws.md) |
| **Increment** | Atomic numeric addition (`stock = stock + ?`) inside a declared write. | [Declared writes](./declared-writes.md) |
| **Guard** | Permission rule saying who may read or write an Entity, enforced on the server. | [Guard](../packages/guard/README.md) |
| **Principal** | The signed-in actor (user, service, or none) checked by Guards on every request. | [Auth and Guard](./auth-and-guard.md) |

## Server data (`foldkit-remote`)

| Term | Meaning | Guide |
| --- | --- | --- |
| **`Remote.Model`** | Submodel storing cached Entities, query pages, and request statuses in your Model. | [Remote](../packages/remote/README.md) |
| **`Data`** | Your domain bound to `Remote.Model` via `Remote.make`, exposing queries and writes. | [Remote](../packages/remote/README.md) |
| **Requirement** | Specific fields and Entity id a read needs, used to avoid duplicate fetches. | [Remote](../packages/remote/README.md) |
| **`RemoteData`** | Six read states: `Initial`, `Loading`, `Ready`, `Refreshing`, `Failed`, `NotFound`. | [RemoteData](../packages/remote/README.md#remotedata-what-does-the-model-know-right-now) |
| **Connection** | Paginated list of query results stored as ordered Edges. | [Remote](../packages/remote/README.md) |
| **Edge** | One entry in a Connection pairing a sort cursor with an Entity reference. | [Remote](../packages/remote/README.md) |
| **Segment** | Contiguous run of fetched Edges; gaps between segments mean unfetched rows. | [Remote](../packages/remote/README.md) |
| **Boundary** | What sits past a Segment's end: `Terminal`, `Cursor`, or `Unknown`. | [Remote](../packages/remote/README.md) |
| **Optimistic layer** | Pending mutation changes shown over cached rows until the server answers. | [State model](./state-model.md) |
| **Operation id** | Unique UUID on a mutation so retries do not apply the same write twice. | [Declared writes](./declared-writes.md) |
| **Outbox** | Durable mutations saved locally so writes survive page reloads and offline gaps. | [Outbox](../packages/remote/README.md#a-write-that-outlives-the-page-outbox) |
| **Write ledger** | Server table of landed Operation ids keeping retried updates idempotent. | [Write ledger](./declared-writes.md#a-write-ledger) |
| **Overlay** | Temporary local patches drawn over the cache with no server request behind them. | [Remote](../packages/remote/README.md) |
| **Retention** | Dropping cached rows no longer needed by any active Surface. | [Remote](../packages/remote/README.md) |

## Routing, sync, mirrors, and agents

| Term | Meaning | Guide |
| --- | --- | --- |
| **Site** | Tree of typed route nodes (`foldkit-site`) defining URLs, titles, and Surfaces. | [Site](../packages/site/README.md) |
| **Mirror** | Keeps a Model slice in sync with the URL, local storage, or a cookie. | [Mirror](../packages/mirror/README.md) |
| **Replica** | Client store in `foldkit-sync` holding local Messages and replaying pending edits. | [Sync](./replication.md) |
| **Journal** | Server log in `foldkit-durable` storing committed Sync operations in order. | [Sync](./replication.md) |
| **Epoch** | Identifies a document's server history; a mismatch makes an old Replica rebuild. | [Sync](./replication.md) |
| **Read model** | Database table updated as each Journal edit commits for fast queries. | [Editing server data](./editing-server-data.md) |
| **Revision** | Highest Journal sequence number applied to a row in a Read model. | [Editing server data](./editing-server-data.md) |
| **Absorbed** | Edit already written to the Read model so Replicas can drop it. | [Editing server data](./editing-server-data.md) |
| **Held edit** | Absorbed edit kept on the client until its cached row catches up. | [Editing server data](./editing-server-data.md) |
| **Alchemy Domain** | External `@alchemy.run/domain` event-sourcing library wired via Remote. | [Event-sourced domains](./event-sourced-domains.md) |
| **Receipt** | Stream and version token returned by a Domain command to avoid stale reads. | [Event-sourced domains](./event-sourced-domains.md) |
| **Lowering** | Turning a single-row declared write into a Domain Aggregate command. | [Event-sourced domains](./event-sourced-domains.md) |
| **Agent contract** | What an AI agent may read (Projection) and trigger (Message subset). | [Agents](./agents.md) |
| **`may`** | Server hint on a row showing which guarded actions the current Principal can run. | [Guard](../packages/guard/README.md#what-the-client-may-do) |

## Views and interaction (`foldkit-mixins` & `foldkit-primitives`)

| Term | Meaning | Guide |
| --- | --- | --- |
| **Slot** | Named extension point in a view (`root`, `label`) where styles and behaviors attach. | [Mixins](../packages/mixins/README.md#slots-the-public-contract) |
| **`SlotView`** | Pure view function rendering Slots with attached styles and behaviors merged. | [SlotView](../packages/mixins/README.md#slotview) |
| **Style** | Classes, declarations, and rules built from theme tokens and attached to a Slot. | [Style](../packages/mixins/README.md#style-appearance-as-data) |
| **Behavior** | Attributes and DOM Mounts attached to a Slot; sends Messages, owns no state. | [Behavior](../packages/mixins/README.md#behavior-reusable-element-level-interaction) |
| **Mixin** | Compiled Style or Behavior; merging refuses two owners of one attribute or event. | [Mixins](../packages/mixins/README.md) |
| **Recipe** | Widget's default themed Styles across variants (`size`, `variant`). | [Recipes](../packages/mixins-ui/README.md) |
| **Obligation** | Accessibility requirement (focus, ARIA state, keys) a Slot must satisfy. | [Obligations](../packages/mixins/README.md#obligations-who-does-what-a-pattern-asks) |
| **Supply** | Proof that an Obligation is met via markup, native HTML, or a Behavior. | [Mixins](../packages/mixins/README.md) |
| **Key route** | Named `keydown` handler mapping key chords to Messages on a Slot. | [Keys](../packages/mixins/README.md#keys-one-owner-for-a-slots-keydown) |
| **Part** | Memoized section of a `SlotView` that re-renders only when its keys change. | [Mixins](../packages/mixins/README.md) |
| **Conformance** | Real-browser tests (`foldkit-mixins/testing`) checking rendered focus and keys. | [Conformance](../packages/mixins/README.md#conformance-the-rendered-check) |
| **Primitive** | Ready-made interaction helper in `foldkit-primitives` (timer, undo, resize, etc.). | [Primitives](../packages/primitives/README.md) |

## Next

- Build a working example in five minutes: [Quickstart](./quickstart.md)
- Learn how updates avoid race conditions and lost edits: [Who changes application state, and how](./state-model.md)
- See how queries, writes, and projections work together: [From declarations to the screen](./declared-data-to-ui.md)
