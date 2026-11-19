# Laws: where does a rule go

When a business rule lives in two places—once in a database check and again in a form or click handler—one copy inevitably drifts. "A published product stays published", "reserved stock never exceeds stock on hand", and "only the owner may rename a product" each belong in a single declarative **law** owned by whoever controls that state.

In Foldkit Plus, those declarations sit in `foldkit-entity` (field shapes, invariants, preconditions, and states), `foldkit-guard` (authorization rules), and `foldkit-sync` (shared document laws). The server writer, database `CHECK` constraints, client pre-checks, and forms all read the same declaration. Before running a database, `Laws.check` analyzes every declared write against every invariant and reports which rules hold and which still need enforcement.

## A first check with `Laws.check`

Suppose a `Product` entity forbids reserving more stock than is on hand, and a `Restock` write increments `stock` by an integer `quantity`:

```ts
import { Schema } from 'effect'
import { Entity, Expr, Laws, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
).pipe(
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)

const report = Laws.check({ writes: [Restock] })
Laws.show(report)
```

Running `Laws.show(report)` prints:

```output
Product
  Draft? (no states declared)

Restock   x reservedWithinStock   refused: Reserved stock cannot exceed the stock
    before   reserved: 0, stock: 0
    input    quantity: -1
    after    reserved: 0, stock: -1

1 entity, 0 states, 1 write, 1 rule: 1 pair, 0 kept, 1 refused, 0 undecided
```

Because `quantity` allows negative integers, `Laws.check` finds a concrete counterexample (`stock: 0`, `quantity: -1`, leaving `stock: -1`) without touching a database. You can either narrow `quantity` with `Schema.isGreaterThanOrEqualTo(0)` so `Restock` is proved `kept`, or rely on the server writer to refuse negative stock at commit time.

## Where does a rule go

Pick the rule kind by what data it needs to read:

| Rule reads | Kind | Declared with | Refused as |
| --- | --- | --- | --- |
| One field's value | Field schema | `Schema` on the field | Decode failure |
| Variant-dependent fields | Case shape | `Entity.defineVariants` | Decode failure or `Invalid` |
| Counts or lookups on other rows | Derived member | `Derived.count`, `Derived.exists` | Computed, never stored |
| Row left by a write | State invariant | `Entity.invariant` (`after`) | `Invalid` |
| Row before and after a write | Transition invariant | `Entity.invariant` (`before`, `after`) | `Invalid` |
| Row before write and input | Precondition | `Write.update(..., { when })` | `Unmet` |
| Named start and end states | Lifecycle states | `Entity.refine` + `{ from, becomes }` | `Unmet` or `Invalid` |
| Principal and target row | Authorization | `Guards.attach` | `Forbidden` |
| Shared Sync snapshot | Document law | `laws` on `forApplication(...).make` | `Invalid` |

A write lands only when **authorization**, **preconditions**, and **invariants** (both state and transition) all hold. The same pattern applies to a Sync document: `authorize` and all document `laws` must pass together.

Authorization rules group alternatives within their own kind (for example, `Update: [isOwner, isManager]`). Invariants and preconditions apply to every caller unconditionally: an admin cannot bypass an invariant, and passing an invariant grants no authority. Their refusals reflect the difference: `Forbidden` means you lack permission, `Unmet` means the row is in the wrong state, and `Invalid` means the resulting row breaks a rule.

## How one declaration reaches every checker

Each state has one authoritative writer that decides rules where state changes—the server writer for SQL rows, or the Sync journal for shared documents. Client `Data.can`, forms, and database `CHECK` constraints read the same `Expr` declarations to give early feedback or add defense in depth. When a client lacks a field a rule needs, it reports `Undecided` and defers to the server instead of guessing.

Every rule below uses the `Expr` language from [Expressions](./expressions.md); see [One domain declaration](./entity.md) to view all kinds together.

## Choosing the right rule in authoring order

Reach for the simplest declaration that can express the constraint, because earlier steps require less machinery and catch mistakes earlier:

### 1. A Schema for a single value

When a single field determines validity (an enum, an integer, a minimum length), express it directly in the field's `Schema`. Every decoder enforces it automatically.

### 2. Variants for case-specific fields

When the fields a row carries depend on its state, model the cases with `Entity.defineVariants` instead of writing nullability invariants:

```ts
const DomainName = { id: Schema.String, name: Schema.String }
const Domain = Entity.defineVariants('Domain', {
  Available: { ...DomainName, price: Schema.Finite, years: Schema.Int },
  Unconfirmed: DomainName,
})
```

Each variant automatically generates invariants and SQL `CHECK` constraints ensuring `Available` rows carry `price` and `years` while `Unconfirmed` rows omit them.

### 3. Derived facts for cross-row summaries

Counts and existence flags calculated from other rows stay accurate when declared as derived members rather than stored columns:

```ts
import { Derived, Relation } from 'foldkit-entity'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String }))

const Blog = Entity.relate(
  { Author, Post, Comment },
  { Comment: { post: Relation.one(Post), author: Relation.one(Author) } },
)

const CountedPost = Blog.Post.pipe(
  Entity.derived({ commentCount: Derived.count(Blog.Comment.relations.post) }),
)
```

### 4. Invariants for what every row and transition holds

Use `Entity.invariant` when a rule connects multiple fields on a row (like `reservedWithinStock` above) or compares `before` and `after` on an update:

```ts
const OrderFields = Entity.define(
  'Order',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['placed', 'shipped']) }),
)
const Order = OrderFields.pipe(
  Entity.invariant(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
)
```

`Entity.judge(Order, { before, after })` evaluates invariants purely in memory and returns `Valid`, `Invalid`, or `Undecided`. State invariants (`after` only) judge inserts, updates, and deletes; transition invariants (`before` and `after`) judge updates only. A `null` operand fails an invariant, and an update on an already-broken row lands only if the row it leaves satisfies the rule.

### 5. Preconditions for a single write

When a rule restricts when *one specific operation* may run rather than every write on the Entity, attach `when` to `Write.update`:

```ts
const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, status: Schema.Literal('published') }),
    ),
    { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
  ),
)
```

The writer checks `when` in the same SQL statement that applies the update and returns `Unmet` if it fails. Other writes on `Product` remain free of `Publish`'s precondition.

### 6. Named states for lifecycles (`from` and `becomes`)

When multiple queries and writes share a condition such as "the product is a draft", name it once with `Entity.refine`:

```ts
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })

const Release = Mutation.write(
  'Release',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, status: Schema.Literal('published') }),
    ),
    { id: 'id', from: Draft, becomes: Published },
  ),
)
```

- **`from: Draft`** appends the state predicate to the write's `when`, refusing rows in other states as `Unmet`.
- **`becomes: Published`** checks at declaration time (over finite states) or at commit time (via a postcondition over numeric fields, refusing as `Invalid`) that every successful write leaves the row in `Published`.
- **`Query.from(Draft)` and `Draft.is(row)`** reuse the exact same state predicate in queries and type guards.

Note that `from` and `becomes` predicates must read only their own row so the writer can enforce them inside one statement; cross-row conditions (`Expr.exists`, `Expr.path`) belong in queries and guards.

### 7. Guards for who may act

Authority belongs in `foldkit-guard` so `Forbidden` runs before state checks and reveals nothing about hidden rows:

```ts
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({ id: Schema.String })
const OwnedFields = Entity.define(
  'Owned',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, name: Schema.String }),
)
const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(OwnedFields, user => Expr.eq(OwnedFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Owned = OwnedFields.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
)
```

### 8. Document laws for shared Sync state

For a `foldkit-sync` document, declare `laws` on `forApplication(...).make` to enforce constraints across the shared snapshot after every durable Message:

```ts
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Evidence, Graph, MessageSet, Module, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'

const BoardModel = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
})
type BoardModel = typeof BoardModel.Type
const BoardMessage = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  DuplicatedTodo: { id: Schema.String, copyId: Schema.String },
})
type BoardMessage = typeof BoardMessage.Type
type Return = Update.Return<BoardModel, BoardMessage>

const update = (model: BoardModel, message: BoardMessage): Return =>
  BoardMessage.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: modifyFields(model, { todos: () => [...model.todos, { id, title }] }),
    }),
    DuplicatedTodo: ({ id, copyId }) => ({
      model: modifyFields(model, {
        todos: () =>
          model.todos.flatMap(todo => (todo.id === id ? [todo, { ...todo, id: copyId }] : [todo])),
      }),
    }),
  })

const BoardApp = Surface.application({
  Model: BoardModel,
  Message: BoardMessage,
  initial: { todos: [] },
  update,
})

const Board = forApplication(BoardApp).make({
  documentId: DocumentId.make('capped-board'),
  shared: Projection.pick(BoardApp.model.todos),
  durable: MessageSet.make(BoardApp, [BoardMessage.CreatedTodo, BoardMessage.DuplicatedTodo]),
  laws: {
    atMost100Todos: {
      holds: ({ after }) => after.todos.length <= 100,
      message: 'A board holds 100 todos',
      path: ['todos'],
    },
  },
})
```

The server journal evaluates `holds` after folding the operation and rejects violations as `Invalid` with the law ID. Replicas evaluate the same rule optimistically (`LawBrokenError`), while `authorize` controls who may append each Message.

## Reading `Laws.check` findings and repairs

Running `Laws.check` across `[Publish, Release, Restock]` checks every `(write, invariant)` pair and every state transition:

```ts
const multiReport = Laws.check({ writes: [Publish, Release, Restock] })
Laws.show(multiReport)
```

```output
Product
  Draft -> Published   Publish   undeclared
  Draft -> Published   Release   holds
  Draft                          unreached
  Published                      terminal

Publish   x reservedWithinStock   kept: writes no member it reads
Release   x reservedWithinStock   kept: writes no member it reads
Restock   x reservedWithinStock   refused: Reserved stock cannot exceed the stock
    before   reserved: 0, stock: 0
    input    quantity: -1
    after    reserved: 0, stock: -1

1 entity, 2 states, 3 writes, 1 rule: 3 pairs, 2 kept, 1 refused, 0 undecided
```

Each status in the report tells you whether a pair or state transition is settled or needs a fix:

| Result | Meaning | Next step |
| --- | --- | --- |
| `kept` | Proved safe by footprint, bounds, or cases | None; emits `Enumerated` or `Bounded` |
| `refused` (pair) | Found valid state + input breaking rule | Bound input, narrow `from`, or mark `runtimeOnly` |
| `undecided` | Uses text, links, or unknown-vs-unknown | Cover with `Walk`, `Scenario`, or `runtimeOnly` |
| `unmeetable` | No valid row matches `from` + `when` | Fix contradictory precondition |
| `holds` | `becomes` proved at declaration time | None |
| `enforced` | `becomes` enforced by commit postcondition | None (`Data.can` checks it too) |
| `undeclared` | Write moves state without `becomes` | Add `from`/`becomes` or narrow write |
| `refused` (arrow) | Transition always breaks an invariant | Expected if forbidden; else fix rule/write |
| `unreached` | No declared write enters this state | Add creating write, or note SQL seed |
| `terminal` | No declared write leaves this state | Expected if final; else add transition |

- **Non-declared writes:** Operations outside `Write` (imports or commands) declare a `Footprint` (or `Footprint.unknown`, which marks all invariants `undecided`).
- **Checked-in reports:** `npx foldkit-plus laws src/laws.ts#report` prints the report so teams can check diffs into [`examples/writes/LAWS.md`](https://github.com/doeixd/foldkit-plus/blob/main/examples/writes/LAWS.md).

## Proving laws are kept with `Graph.validate`

Whenever a transition writes a field read by a law, `Graph.validate` (`foldkit-surface`) asks for **evidence** proving the law holds. Only real checkers issue evidence values (`Evidence.runtimeOnly` is the explicit fallback for runtime-enforced checks):

| Evidence | Producer | Proves |
| --- | --- | --- |
| `Enumerated` | `Laws.check` (`kept`) | All finite cases or disjoint fields checked |
| `Bounded` | `Laws.check` (`bounds`) | Numeric interval arithmetic proved safe |
| `Walked` | `Walk.run` (`foldkit-remote/testing`) | Seeded message walks never broke the law |
| `Scenario` | `Scenario.run` (`foldkit-remote/testing`) | Cross-backend case agreed on all runners |
| `RuntimeOnly` | `Evidence.runtimeOnly` with `why` | Server writer or journal rejects violations |

Passing `Laws.check` evidence alongside `Evidence.runtimeOnly` clears `law-unwitnessed` findings in `Graph.validate`:

```ts
import { Option } from 'effect'
import { Evidence, Graph, Module, Surface } from 'foldkit-surface'
import { Remote } from 'foldkit-remote'

const ShopApp = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model }),
  Message: Remote.Message,
})
const ShopModule = Module.make(ShopApp, [
  Remote.make({
    model: ShopApp.model.remote,
    entities: [Product],
    mutations: [Publish, Release, Restock],
  }),
])

const enumerated = multiReport.pairs.flatMap(pair => Option.toArray(pair.evidence))

Graph.validate(ShopModule, { evidence: enumerated }).map(finding => finding.message)
// ['write:Restock writes Product.stock, which Product.reservedWithinStock reads, and no evidence shows it keeps Product.reservedWithinStock']

const restocked = Evidence.runtimeOnly({
  transition: 'write:Restock',
  law: 'Product.reservedWithinStock',
  why: 'the writer judges the row a restock leaves, and refuses one that leaves reserved over stock',
})
Graph.validate(ShopModule, { evidence: [...enumerated, restocked] }) // []
```

Document laws work the same way: every durable Message writes to the shared slice, so `Graph.validate` expects walk, scenario, or `runtimeOnly` evidence for each durable Message against each document law:

```ts
const BoardModule = Module.make(BoardApp, [Board])

Graph.validate(BoardModule).map(finding => finding.message)
// ['durable:CreatedTodo writes todos, which sync:capped-board.atMost100Todos reads, ...',
//  'durable:DuplicatedTodo writes todos, which sync:capped-board.atMost100Todos reads, ...']
```

Use `Graph.toMarkdown` to export the full transition-to-law evidence table.

## Asking before sending: `Data.can`

`Data.can` reads the same rules over rows already held in your `Model` and predicts—purely in memory—whether a declared write would succeed:

```ts
const Data = Remote.make({
  model: ShopApp.model.remote,
  entities: [Product],
  mutations: [Publish, Release, Restock],
})

Data.can({ remote: Remote.initial }, Release, { id: 'p1', status: 'published' })
// Can.Undecided: Product p1 is not held
```

`Data.can` returns `Can.Yes`, `Can.No({ refusal })`, or `Can.Undecided({ reasons })`. Use it as a UI hint (for example, to disable a button). `Data.mutate` still sends writes when invoked because local rows can be stale or missing fields. See [Asking before sending](./declared-writes.md#asking-before-sending-datacan) and [Agent capabilities over declared writes](./agents.md#a-capability-over-a-declared-write).

## Who owns the final decision

| Component | Authoritative decision | Early hint only |
| --- | --- | --- |
| Server writer (`foldkit-remote-drizzle`) | Every Entity refusal on commit | — |
| Sync journal (`foldkit-durable`) | Document laws on commit | Replica's `LawBrokenError` |
| SQL database | State invariants via `CHECK` | Transition invariants (omitted from DDL) |
| Remote client (`Data.mutate`, `Data.can`) | — | Held `Forbidden`, `Invalid`, and `Unmet` |
| Forms and CRUD | — | Input-complete invariants by `path` |

## Failure and recovery

- **Pre-existing broken rows:** Invariants check writes, not existing tables. An update on a broken row succeeds only if the resulting row satisfies every invariant.
- **Missing fields on the client:** Missing fields produce `Undecided` rather than `Valid`; the client sends the write and lets the server decide.
- **Adding a strict document law to live data:** Because laws evaluate strictly on the resulting snapshot, you can ease live documents toward a cap using a monotone law:

  ```ts
  const Shrinking = forApplication(BoardApp).make({
    documentId: DocumentId.make('shrinking-board'),
    shared: Projection.pick(BoardApp.model.todos),
    durable: MessageSet.make(BoardApp, [BoardMessage.CreatedTodo]),
    laws: {
      atMost100Todos: {
        holds: ({ before, after }) =>
          after.todos.length <= Math.max(100, before.todos.length),
        message: 'A board holds 100 todos',
        path: ['todos'],
      },
    },
  })
  ```

  Before deploying a strict law, scan existing snapshots with `Board.judge(snapshot, snapshot)`.
- **Lost mutation response:** Retries carry the same operation ID; see [Declared writes](./declared-writes.md#retries-three-different-guarantees) for retry guarantees.

## When a rule depends on the past, store the fact

Refinements read one `row`, invariants read `before` and `after`, and document laws read the previous and next snapshot. Instead of querying historical logs for "was ever published", store a boolean field and keep it monotone with a transition invariant:

```ts
const ListingFields = Entity.define(
  'Listing',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    everPublished: Schema.Boolean,
  }),
)
const Listing = ListingFields.pipe(
  Entity.invariant(
    'everPublishedStays',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.everPublished, true)), Expr.eq(after.everPublished, true)),
    { message: 'A listing once published stays marked', path: ['everPublished'] },
  ),
)
const WasPublished = Entity.refine(Listing, 'WasPublished', { everPublished: true })
```

For cross-row rules such as aggregate totals across a list, enforce them in your server handler; see [Declared writes](./declared-writes.md#who-owns-what).

## Limits

- Invariants read a single row (`before`/`after`), excluding external Entities, inputs, and principals.
- Rules read at most one step back (`before` and `after`); store historical facts as fields.
- Cross-row aggregates belong in server handlers; see [Declared writes](./declared-writes.md#who-owns-what).
- States reaching across relations (`Expr.exists`, `Expr.path`) apply to queries and guards, not `from` or `becomes`.
- `Laws.check` decides finite enums, booleans, and single-variable numeric intervals; text rules or multi-variable comparisons report `undecided` until covered by walks, scenarios, or `runtimeOnly`.
- Local `modifyFields` updates emit no graph `writes` edges yet, though `Walk` tests still cover them.

## Next

- See preconditions, invariants, guards, and retries end to end in [Declared writes](./declared-writes.md).
- Learn the `Expr` predicate language in [Expressions](./expressions.md).
- Read the package APIs in [`foldkit-entity`](../packages/entity/README.md#what-every-row-and-change-must-hold-invariants), [`foldkit-guard`](../packages/guard/README.md), [`foldkit-sync`](../packages/sync/README.md#laws-what-every-snapshot-keeps), [`foldkit-surface`](../packages/surface/README.md#laws-in-the-graph), [`foldkit-metadata`](../packages/metadata/README.md#evidence), and [`foldkit-remote`](../packages/remote/README.md#scenarios-a-write-as-data-run-against-the-real-thing).
