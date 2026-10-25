# Declared writes

A declared write is a change to one row, written down as data: which row, what
it sets, what it adds to, and what the row must hold for the change to make
sense. Because it is data, every party reads the same declaration. The server's
writer turns it into one compare-and-set statement, the guard decides it over
the row version that statement will change, and the client shows it before the
answer comes. Nothing reads the row in one statement and writes it in another,
so nothing another request does in between is written over.

This guide covers preconditions, increments, invariants, transitions, a guard that holds
where the write commits, operation ids, a write ledger, a revision the database
moves, and the client's prediction of a sum. The runnable version is
[`examples/writes`](../examples/writes/README.md).

## Who owns what

| Part | Package | Owns | Does not |
| --- | --- | --- | --- |
| The declaration | `foldkit-entity` (`Write`) | what changes, `when` it makes sense, what it `increment`s | any I/O; it is a value |
| The invariants | `foldkit-entity` (`Entity.invariant`) | what every stored row must hold, whoever writes it | who may write; whether this write applies now |
| The transitions | `foldkit-entity` (`Entity.transition`) | what every update must hold over the row before and the row after | creates and deletes; who may write |
| The rules | `foldkit-guard` | who may write which row and member, decided over the row being written | the statement; it hands the writer what to check |
| The writer | `foldkit-remote-drizzle` (`writer`) | the one `update … where` that checks and writes; the ledger, when given one | who may write |
| The client | `foldkit-remote` (`Data.mutate`) | the operation id; what shows until the answer | authority: a prediction decides nothing |

The table row is the one authoritative fact. The ledger is not a second copy of
it: it records only which operations already landed, so a retry is not applied
again. The client's prediction is a display, recomputed from the store each time
it is read, and dropped when the answer arrives.

A declared write writes one row by id. A write that spans rows, or computes
anything beyond adding an amount, is a handler (`RemoteServer.mutation`, guarded
by `GuardServer.mutation`), which checks the interaction but not what its code
writes. A client-authored operation that must survive offline belongs to Sync,
not here; see [Editing server data through a journal](./editing-server-data.md).

## The mental model

One row version decides everything, and one statement writes it:

```text
the guard reads the row at revision r, and decides its rules over it
                    |
                    v
update … set name = ?, stock = stock + ?, revision = revision + 1
       where id = ? and revision = r and <when>
                    |
     a row changed -+- none changed
          |                  |
   the row as written    classified: gone, moved on (Conflict),
                         or does not hold `when` (Unmet)
```

On the client, what a pending write shows is the store plus the pending writes,
recomputed whenever it is read:

```text
shown = committed row + pending sets + pending amounts (added to what is under them)
```

## A sixty-second path: a precondition

A product is published only from a draft. The declaration says so; the writer
checks it in the statement that writes.

```ts
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    stock: Schema.Number,
    revision: Schema.Number,
  }),
)

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
  ),
)
```

On the server, the write is served with no handler:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { bind, writer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'

const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const Db = bind({ Product }, { Product: { table: products } })

const server = RemoteServer.make({
  entities: [],
  mutations: [RemoteServer.write(Publish, writer(Db.Product))],
})
```

A draft is published. An archived product is refused as `Unmet`, and nothing is
written. A published one is answered as written and does not change.

### What the calls mean

- **`Write.update(input, { id, when })`** is a declaration. It runs nothing and
  reads nothing. `when` is built once, at definition, into a query body over the
  Entity; a `when` over another Entity is refused there.
- **`Schema.Literal('published')`** is how a write sets a constant. The server
  decodes the input before anything else, so a client cannot send another value.
  There is no separate constant-assignment API, because this is one.
- **`Mutation.write`** types the refusal. A write with a `when` may be refused
  as `Unmet` as well as `Conflict`; one without has no `Unmet` arm to match.
- **`writer(Db.Product)`** is where I/O happens: one `update … where id = ? and
  <when>`, then, if no row changed, one read to say why. It checks no rules; the
  guard, below, does.

## Build outward

### Who may: a guard that holds where it commits

Reading the row to check a rule and writing it are two statements, so a change
of owner between them could let a stale decision write. Name a revision and the
guard pins the write to the revision its rules were decided over. With `Product`
carrying its guards (`Guards.attach`) and `Policy` their implementation, as in
[`examples/writes/src`](../examples/writes/src/server.ts):

```ts
const Db = bind(
  { Product },
  { Product: { table: products, visible: GuardDrizzle.visible(Policy, [Product]).Product } },
)
const guarded = GuardServer.writer(Product, Policy, writer(Db.Product), { revision: 'revision' })
```

The binding's `visible` rule is how the guard reads a row as its caller may see
it; the guarded writer refuses a binding without one.

Every update and delete then lands only at that revision. If the row moved after
the check, it is decided again over the row as it now is, up to three times, and
then fails with "changed while it was written". Nothing is written over a version
no rule saw. `GuardServer.validate` warns of a guarded writer with no revision.

The guard speaks before the writer, in this order, so a refusal discloses
nothing the caller may not read:

1. A row hidden from the caller, then a rule that does not hold: both `Forbidden`.
2. An input revision the row is not at: `Conflict`, not retried.
3. The precondition: `Unmet`, so it reaches only someone the rules let write.

A `when` or an `expect` over a member with a Read rule would answer for that
member (`Unmet` or written), so the guarded writer refuses such a write before
any rule, whether or not `validate` ran. The full rules are in
[Guard's "Serving writes"](../packages/guard/README.md#serving-writes).

### How much: an increment

`increment` adds an unmapped number from the input to a number field, in the
statement (`stock = stock + ?`), so a concurrent change to the field is never
lost:

```ts
const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Number }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { stock: 'quantity' } },
  ),
)
```

The field must be stored as a plain number. A nullable field, the id, the
revision, and a field another key sets are refused at definition. The guard
holds the row's rules over the sum the writer will store, so a rule
`stock >= 0` refuses a sale past zero.

An increment is not idempotent: applied twice, it adds twice. So it needs one of
two protections, and `RemoteServer.write` refuses one with neither:

- **`expect` a revision.** A retry of a write that landed finds the row a
  revision on and is a `Conflict`. Simple, but two increments made from one read
  conflict too, though they would commute.
- **A writer with a ledger** (below). Two increments from one read both land, and
  a retry is recognised by its operation id. Such a write expects no revision:

```ts
const Sell = Mutation.write(
  'Sell',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Number }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
```

### What every row holds: an invariant

A precondition says whether this write applies now; an invariant says what
every stored row must hold, whoever writes it. With `quantity = 10, reserved =
5`, an update setting `quantity = 3` decodes, passes every rule, and leaves a
row holding more reserved than there is. An invariant is declared once on the
Entity:

```ts
const StockFields = Entity.define(
  'Stock',
  Schema.Struct({ id: Schema.String, quantity: Schema.Number, reserved: Schema.Number }),
)
const Stock = StockFields.pipe(
  Entity.invariant('reservedWithinQuantity', f => Expr.lte(f.reserved, Expr.field(f.quantity)), {
    message: 'Reserved stock cannot exceed the quantity',
    path: ['reserved'],
  }),
)
```

- **Judged over the row a write leaves.** The writer compiles it into the same
  `WHERE`, with the fields the write sets read as their new values and each
  incremented field as its column moved: `… and reserved <= 3`. The row judged
  is the row written, at the version written, so a `reserved` raised by another
  request after the client's read is judged too. An insert's values are judged
  before it is written.
- **Strictly true.** A null fails it, as SQL's unknown drops a row from a
  `WHERE`. A rule that allows one says so: `Expr.or(Expr.isNull(f), …)`.
- **Not a rule.** `Update: [isOwner, isManager]` says who may; an invariant is
  never one of those alternatives, so authority does not excuse an invalid row
  and a valid row grants no one anything. The rules speak first, so `Invalid`
  reaches only someone they let write. One over a member a Read rule hides is
  enforced, but its refusal names no invariant and no path.
- **Repair is possible.** A row already invalid is judged by the row a write
  leaves, so a write that fixes it lands.
- **The same declaration, everywhere it can be judged.** `Entity.judge(entity,
  row)` is the reference; `Entity.check(entity)` is a Schema check; a form over
  an input that sets every field one reads judges it on submit and shows the
  message beside its path; `invariantChecks(binding)` gives each as a `CHECK`
  constraint, which holds against handlers and raw SQL too.

### What every change holds: a transition

Some rules relate two rows, each valid on its own: an order that shipped stays
shipped. A transition is a predicate over the row before an update and the row
after:

```ts
const OrderFields = Entity.define(
  'Order',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['placed', 'shipped']) }),
)
const Order = OrderFields.pipe(
  Entity.transition(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
)
```

`before` is the Entity's fields and `after` one placeholder per field. The
writer judges it beside the invariants, in the same `WHERE`: the row before is
the columns themselves, and after, a field the write sets is its value, one it
increments its column moved, and any other unchanged. Every update is judged;
a create has no row before and a delete none after. It is refused as `Invalid`
with its id, like an invariant, and like one it is never a guard rule, so no one
is excused it. A form has no row before, so it judges none; Crud shows the
server's refusal beside its path. A `CHECK` sees one row, so a transition is not
a constraint.

All four kinds must hold for a write to land:

```text
authorization (Forbidden) AND precondition (Unmet) AND transitions AND invariants (Invalid)
```

### Retries: three different guarantees

| Write | A retry after a lost answer | Two writes from one read |
| --- | --- | --- |
| Sets a value (`name = ?`) | sets it again; answered as written | the later one wins |
| `expect`s a revision | `Conflict`; the client re-reads | the second is a `Conflict` |
| Increments over a ledger | found in the ledger, not written again | both land |

The first is an idempotent assignment, which is why the Todo examples set
`done = true` rather than flipping it. The second is optimistic concurrency. The
third is replay deduplication, and it needs an identity for the operation.

### An operation id

A Remote `requestId` names a request to one client only: it is a counter in the
Model, so it restarts on reload, and two clients' first requests share it.
`Data.mutate` therefore also sends an **operation** id, minted where the request
is first sent (`crypto.randomUUID()`, or 128 random bits from
`getRandomValues` on a page served over plain HTTP). A failed request keeps it,
and a retry with the same `requestId` sends it again. With `Data` the
application's `Remote.make({ model, entities: [Product], mutations: [Sell] })`:

```ts
const started = Data.mutate(model, Sell, { id: 'p1', quantity: -2 })
// …the request failed; the same request id resends the same operation:
const retried = Data.mutate(failedModel, Sell, { id: 'p1', quantity: -2 }, {
  requestId: started.requestId,
})
```

The server treats it as untrusted input: at most 128 characters of
`A–Z a–z 0–9 : . _ -`, refused otherwise. A reloaded client has no record of the
operation, so the same request id is a new one there.

### A write ledger

A ledger records each update the writer lands under the operation that asked for
it and the row it wrote, in the same transaction as the write. `ledger` is the
Drizzle table below and `User` the principal, as in
[`examples/writes/src/server.ts`](../examples/writes/src/server.ts):

```ts
const ledgered = writer<Option.Option<User>>(Db.Product, {
  ledger: {
    table: ledger,
    scope: principal => Option.match(principal, { onNone: () => '', onSome: user => user.id }),
  },
})
```

```sql
create table write_ledger (
  scope text not null, operation text not null, target text not null,
  answer text not null, at bigint not null,
  primary key (scope, operation, target)
);
create index write_ledger_at on write_ledger (at);
```

- **`scope`** names whose operations they are, so no one is answered with
  another's write: an operation id is unique only per client that minted it.
- **`target`** is the row, so an operation id sent for another row is not that
  row's retry.
- **The primary key is load-bearing.** Under Postgres's default isolation, two
  copies of one operation sent at once can both pass the lookup; the key refuses
  the second record, which rolls its write back, and that copy fails as any
  errored request does. Its retry then finds the record.
- **Retention**, a day unless given: a retry later than that is a new operation,
  and an increment would be applied again. Records are pruned as new ones are
  made; the index on `at` keeps that from scanning the table.
- **Only updates are recorded.** A retried insert finds its id taken and answers
  the row it made; a retried delete finds the row gone.

A retry found in the ledger is not written again, and the guard does not decide
it again: it was decided when it landed, and deciding it over a row that has
moved since could refuse a write that happened. It is answered, as every write
is, with the row as it now is, read back under the caller's rules.

### A revision the database moves

The guard's pin sees only changes that move the revision. A handler or raw SQL
that changes the row without moving it is invisible to it. `revisionTrigger`
is the SQL that makes the database move it on every other update too:

```ts
sqlite.exec(revisionTrigger(Db.Product, 'revision'))
```

It moves the revision only for an update that did not set it, so the writer's
own `revision = revision + 1` is not doubled, and an update that sets it to a
value of its own is left as set. Run it with the migration that makes the table,
on SQLite or Postgres; running it again replaces it, and a Postgres table in a
`pgSchema` is named by its schema. The revision column must be `not null`: the
trigger compares with `=`, which a null never satisfies. Not for a table Sync
writes, whose `applyEdits` keeps one revision for two changes in one operation.

### What the client shows meanwhile

`Data.mutate` shows a declared update before the answer: the values it sets, and
each increment as an amount. The amount is added to the value the store holds
whenever the row is read, not fixed when the request was sent. So:

- a live update that reaches the store meanwhile is added to, not hidden;
- two pending increments add up, and a refused one leaves only the other's;
- a list sorted by the field places the row where the predicted sum puts it;
- a field the client has not read is not guessed: it shows the server's sum when
  the answer comes.

The prediction is never authority. The client cannot know who may write, and its
row may be stale; the server decides, and its answer replaces the prediction.
`Write.reads(write)` names what a write reads from its row (what `when` reads,
each incremented field, the revision), and `Write.writes(write)` what it may
change.

## Failure and recovery

| Outcome | Meaning | What the client does |
| --- | --- | --- |
| Written | the row as it now is, under the caller's rules; a row the write hid from them as deleted | nothing; the answer replaces what showed |
| `Forbidden` | a hidden row, or a rule that does not hold | show it; asking again is refused again |
| `Conflict` | the input's revision is not the row's | re-read, then let the author decide |
| `Unmet` | the row does not hold the write's `when` | show why; the state changed |
| `Invalid` | the row the write would leave breaks an invariant, or the change breaks a transition | show its `message` beside its `path`; change the input |
| "changed while it was written" | the row kept moving through three decisions | retry later |
| "needs a database with transactions" | a ledger over D1 | serve that write without a ledger |

### What each database guarantees

| | SQLite | Postgres | D1 |
| --- | --- | --- | --- |
| Revision, `when`, increment, invariant | one statement | one statement | one statement |
| `invariantChecks` | in `create table` | `alter table … add` | in `create table` |
| Ledger | a synchronous transaction | an awaited transaction; the primary key settles a race | refused: D1 runs no `BEGIN` |
| `revisionTrigger` | yes | yes | yes (SQLite) |

One statement is atomic on every database, so a precondition and an increment
need no transaction and work on D1. Opening a transaction is not by itself a
guarantee: the ledger relies on its primary key, not on isolation, to refuse a
second copy.

## Limits

- One row by id. Bulk predicates, nested writes and multi-row programs are
  handlers.
- An invariant reads one row. Uniqueness, foreign keys and limits across rows
  need the database to coordinate them; a predicate cannot say them.
- Only an increment is computed. Copying one field into another, and other
  arithmetic, wait for a use case.
- A rule that reads facts outside the database (a remote permission service)
  cannot be made atomic with the write; only what the statement can read is.
- Without the trigger, the pin trusts every writer to move the revision.
- A ledger's record lasts its retention; an increment retried later is applied
  again.
