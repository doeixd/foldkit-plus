# Declared writes

A declared write is a change to one row, written down as data: which row, what
it sets, what it adds to, and what the row must hold for the change to make
sense. Because it is data, every party reads the same declaration. The server's
writer turns it into one compare-and-set statement, the guard decides it over
the row version that statement will change, and the client shows it before the
answer comes. Nothing reads the row in one statement and writes it in another,
so nothing another request does in between is written over.

This guide covers preconditions, increments, computed assignments, invariants
over a row and over a change, a guard that holds where the write commits,
operation ids, a write ledger, durable writes, a revision the database moves,
and what the client shows and refuses before the answer. The runnable version
is [`examples/writes`](../examples/writes/README.md).

## Who owns what

| Part | Package | Owns | Does not |
| --- | --- | --- | --- |
| The declaration | `foldkit-entity` (`Write`) | what changes, `when` it makes sense, what it `increment`s or `compute`s | any I/O; it is a value |
| The invariants | `foldkit-entity` (`Entity.invariant`) | what every stored row, and every update over the row before, must hold, whoever writes it | who may write; whether this write applies now |
| The rules | `foldkit-guard` | who may write which row and member, decided over the row being written | the statement; it hands the writer what to check |
| The writer | `foldkit-remote-drizzle` (`writer`) | the one `update … where` that checks and writes; the ledger, when given one | who may write |
| The client | `foldkit-remote` (`Data.mutate`) | the operation id; what shows until the answer; refusing at once a write it can already tell is invalid or forbidden; for a durable write, the outbox that sends it | authority: a prediction or a local refusal decides nothing on the server |

The table row is the one authoritative fact. The ledger is not a second copy of
it: it records only which operations already landed, so a retry is not applied
again. The client's prediction is a display, recomputed from the store each time
it is read, and dropped when the answer arrives.

A declared write writes one row by id. A write that spans rows is a handler
(`RemoteServer.mutation`, guarded by `GuardServer.mutation`), which checks the
interaction but not what its code writes. A declared write that must survive a
reload or a lost connection can be durable (below); the server still decides
it once, and a refusal is final. Edits that must merge with other devices'
offline edits belong to Sync; see [Editing server data through a
journal](./editing-server-data.md).

## The mental model

One row version decides everything, and one statement writes it:

```text
the guard reads the row at revision r, and decides its rules over it
                    |
                    v
update … set name = ?, stock = stock + ?, revision = revision + 1
       where id = ? and revision = r and <when> and <invariants>
                    |
     a row changed -+- none changed
          |                  |
   the row as written    classified: gone, moved on (Conflict),
                         does not hold `when` (Unmet), or would break
                         an invariant (Invalid)
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
    name: Schema.String,
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
  name: text('name').notNull(),
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
  as `Unmet` as well as `Conflict`; one without has no `Unmet` arm to match. An
  insert expects no revision, so it is refused as `Taken` (its id is a row's),
  never as `Conflict`.
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
no rule saw. `GuardServer.validate` reports each write through a guarded writer
with no revision that a change can come between (`UnpinnedWrites`).

A rule that reads another row ("the viewer holds a seat on the note's team")
cannot be decided over the row alone. For an update or a delete, the guard
hands it to the writer as `requires`, and the writer adds it to the same
`where`, so it is judged against the other row as the statement runs; a row
that fails it is `Forbidden`. A write that would change what such a rule reads
of its own row is refused. See [Guard's "Rules that read another
row"](../packages/guard/README.md#rules-that-read-another-row).

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
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
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
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
```

### What it computes: a computed assignment

`compute` sets a field from the row before the write and the input, in the
same statement (`name = <expression over name and ?>`). The expression is data
over operators, so the writer compiles it to SQL and the client predicts it
with the same operators:

```ts
const suffixed = Expr.operator('acme.suffixed', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})

const Rebrand = Mutation.write(
  'Rebrand',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, suffix: Schema.String }),
      { suffix: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      compute: { name: ({ row, input }) => suffixed(row.name, input.suffix) },
    },
  ),
)
```

- It reads the row **before** the write, never another assignment's result,
  and is refused where it is declared when it reads another Entity, writes a
  field another key sets, or comes to a kind its field does not store.
- The operator needs an implementation on each side that runs it: the
  binding's SQL table and memory table on the server, and `Remote.make({
  operators })` on the client (see [An operator the application
  implements](../packages/remote-drizzle/README.md#an-operator-the-application-implements)). A binding that cannot
  run it is refused where the write is served.
- It is held to a retry as an increment is: with `expect` as here, or, with
  none, only under a ledger where the writer `commutes` the operator or a
  guard with a revision pins the row it read.

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
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    { message: 'Reserved stock cannot exceed the quantity', path: ['reserved'] },
  ),
)
```

- **Judged over the row a write leaves.** The writer compiles it into the same
  `WHERE`, with the fields the write sets read as their new values and each
  incremented field as its column moved: `… and reserved <= 3`. The row judged
  is the row written, at the version written, so a `reserved` raised by another
  request after the client's read is judged too. An insert's values are judged
  before it is written.
- **Strictly true.** A null fails it, as SQL's unknown drops a row from a
  `WHERE`. A rule that allows one says so: `Expr.or(Expr.isNull(after.reserved), …)`.
- **Not a rule.** `Update: [isOwner, isManager]` says who may; an invariant is
  never one of those alternatives, so authority does not excuse an invalid row
  and a valid row grants no one anything. The rules speak first, so `Invalid`
  reaches only someone they let write. One over a member a Read rule hides is
  enforced, but its refusal names no invariant and no path.
- **Repair is possible.** A row already invalid is judged by the row a write
  leaves, so a write that fixes it lands.
- **Refused before it is sent, where the client can tell.** `Data.mutate`
  judges the invariants over the row the write would leave, as the store holds
  it. Where one is definitely broken it shows and sends nothing, and its
  Command answers `MutationFailed` with the `Refusal.invalid` the server would
  send; where the store cannot decide (a field it has not read), it refuses
  nothing and the server judges.
- **The same declaration, everywhere it can be judged.** `Entity.judge(entity,
  { after })` is the reference; `Entity.check(entity)` is a Schema check; a form over
  an input that sets every field one reads judges it on submit and shows the
  message beside its path; `checkConstraints(binding)` (or `entityChecks` in the Drizzle table)
  gives each state invariant as a `CHECK` constraint, beside the field rules SQL holds exactly,
  which hold against handlers and raw SQL too.

### What every change holds: a transition invariant

Some rules relate two rows, each valid on its own: an order that shipped stays
shipped. An invariant that reads the row before (`before`) as well as the row
after is a transition invariant:

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

`before` is each field as the row before holds it and `after` each as the row after holds
it. Reading `before` is all that makes it a transition invariant; nothing else is
declared. The writer judges it beside the state invariants, in the same `WHERE`: the row before is
the columns themselves, and after, a field the write sets is its value, one it
increments its column moved, and any other unchanged. Every update is judged;
a create has no row before and a delete none after. It is refused as `Invalid`
with its id, and like every invariant it is never a guard rule, so no one
is excused it. A form has no row before, so it judges none; Crud shows the
server's refusal beside its path. A `CHECK` sees one row, so `checkConstraints`
leaves it out, and lists it under `serverOnly`.

All three kinds must hold for a write to land:

```text
authorization (Forbidden) AND precondition (Unmet) AND invariants (Invalid)
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
and a retry sends it again. With `Data` the application's `Remote.make({ model,
entities: [Product], mutations: [Sell] })`:

```ts
const started = Data.mutate(model, Sell, { id: 'p1', quantity: -2 })
// …the request failed: send it again as itself, same input and operation.
const again = Data.retry(failedModel, started.requestId) // none unless it failed
```

`Data.retry` is `Data.mutate` with the failed write's own request id, input and
`now`. The server treats the operation id as untrusted input: at most 128
characters of `A–Z a–z 0–9 : . _ -`, refused otherwise.

A write whose request did not go, or whose answer was no Remote answer (not
JSON, or a gateway's 502), fails with `Unreachable`: the server may or may not
have run it. Sending it again is safe exactly as far as the table below says.

### A write that outlives the page: durable

A page that reloads forgets its Model, and with it the operation ids of writes
still in flight. A durable write keeps them:
`Data.mutate(model, Sell, input, { durable: true })` stores the write in
Remote's outbox (`outbox(Data, …)`) before it is sent, sends stored writes one at a
time and in order, and sends one again after an `Unreachable` and after a
reload, with the same operation id and the same `now`. Setup and status are in
[Remote's outbox section](../packages/remote/README.md#a-write-that-outlives-the-page-outbox).

What the server must give it is the third row of the table above: a durable
write may arrive twice, so it needs a writer with a ledger (below), or a
handler that records by `operation`. A write sent long after it was made lies
past the server's `clockSkew`, so the server writes its own time instead
(reported as `ClockSkewed`). The outbox keeps each principal's queue apart, so
no write is sent as anyone but who made it.

### A write ledger

A ledger records each update and insert the writer lands under the operation
that asked for it and the row it wrote, atomically with the write (in its transaction, or on D1
in one batch with it). `ledger` is the
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
  answer text not null, at bigint not null, request text,
  primary key (scope, operation, target)
);
create index write_ledger_at on write_ledger (at);
```

- **`scope`** names whose operations they are, so no one is answered with
  another's write: an operation id is unique only per client that minted it.
- **`target`** is the row, so an operation id sent for another row is not that
  row's retry.
- **`request`** is a digest of what the operation asked (its mutation, keys
  and input), so an operation id sent again with another request is refused
  rather than answered as a retry. An older ledger table gains it with
  `alter table write_ledger add column request text`; a record without one is
  answered as a retry until its retention passes.
- **Copies sent at once.** On Postgres a copy of an operation sent while
  another is still writing waits for it (a transaction-scoped advisory lock),
  then finds its record. On D1 the row and its record are written in one
  batch; a second copy's record collides with the first's primary key, its
  batch rolls back whole, and it is answered from the first's record.
- **Retention**, a day unless given: a retry later than that is a new operation,
  and an increment would be applied again. Records are pruned as new ones are
  made; the index on `at` keeps that from scanning the table.
- **Updates and inserts are recorded.** A retried insert is answered from its
  record with the row it made. Any other insert of a taken id, and without a
  ledger a retry too, is refused as `Taken`, with one answer whatever the row
  holds, since comparing the row with the insert would tell its asker what it
  holds. A retried delete finds the row gone.

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

Two refusals are made at once, before anything is sent, because the store can
already tell: an invariant definitely broken by the row the write would leave
(`Invalid`, above), and a write a held `may` says no to (`Forbidden`, with the
rule's `explain` as `reason`; see [Guard's "What the client may
do"](../packages/guard/README.md#what-the-client-may-do)). Each spares a round
trip and decides nothing for the server, which judges every write that reaches
it.

### Checking the prediction against the server

The client and the server must agree: what a pending write shows should be
what the server then holds, and a write the client refuses should be one the
server refuses alike. `Law.check` (`foldkit-remote/testing`) runs one declared
write both ways, over a Model holding what the server sends the principal and
with the same `now`, and compares every part the client predicted: each field,
whether the row is there, each held list's order, and a refusal by its
`refusal`. Here `server` is the `RemoteServer.make` that serves `Sell` over a
real database (remote-drizzle's law suite runs SQLite and Postgres),
`principal` whom it answers as, and `model` the application's Model before the
client holds anything:

```ts
import { Law } from 'foldkit-remote/testing'

const report = Law.check(Data, {
  model,
  holds: [{ entity: Product, ids: ['p1'] }],
  mutation: Sell,
  input: { id: 'p1', quantity: -2 },
  now: 0,
}).pipe(Effect.provide(Remote.clientLayer(RemoteServer.handlers(server, principal))))
```

What the client left unknown is not compared, and a check that compared
nothing fails, since two sides that both said nothing prove nothing. In
development, `Remote.make({ verifyPredictions: true })` compares each answer
with what its pending write showed, and reports a disagreement as a
`PredictionMismatch` diagnostic.

## Failure and recovery

| Outcome | Meaning | What the client does |
| --- | --- | --- |
| Written | the row as it now is, under the caller's rules; a row the write hid from them as deleted | nothing; the answer replaces what showed |
| `Forbidden` | a hidden row, or a rule that does not hold | show it; asking again is refused again |
| `Conflict` | the input's revision is not the row's | re-read, then let the author decide |
| `Unmet` | the row does not hold the write's `when` | show why; the state changed |
| `Invalid` | the row the write would leave breaks an invariant, over a row or over the change | show its `message` beside its `path`; change the input |
| `Taken` | an insert's id is already a row's, and the ledger holds no record of this operation making it (a 409 over HTTP) | choose another id; the refusal names the Entity and the id, nothing of the row |
| "changed while it was written" | the row kept moving through three decisions | retry later |
| `Unreachable` | no answer came back; the write may or may not have landed | `Data.retry` (a durable write is sent again on its own); safe as far as the retry table says |
| "needs a database with transactions" | a ledger over a database with neither a transaction nor D1's batch | give the writer a Drizzle database |

### What each database guarantees

| | SQLite | Postgres | D1 |
| --- | --- | --- | --- |
| Revision, `when`, increment, invariant | one statement | one statement | one statement |
| `checkConstraints`, `entityChecks` | in `create table` | `alter table … add` | in `create table` |
| Ledger | a synchronous transaction | an awaited transaction; the primary key settles a race | a read, then one `batch`; the primary key settles a race |
| `revisionTrigger` | yes | yes | yes (SQLite) |

One statement is atomic on every database, so a precondition and an increment
need no transaction. D1 runs no `BEGIN`, so its ledger writes the row and the
record in one batch, the record decided in SQL (`changes() > 0`) since a batch
reads nothing between its statements. Opening a transaction is not by itself a
guarantee: the ledger relies on its primary key, not on isolation, to refuse a
second copy.

## Limits

- One row by id. Bulk predicates, nested writes and multi-row programs are
  handlers.
- An invariant reads one row. Uniqueness, foreign keys and limits across rows
  need the database to coordinate them; a predicate cannot say them.
- A computed assignment reads its own row before the write and the input,
  never another row or another assignment's result.
- A rule that reads facts outside the database (a remote permission service)
  cannot be made atomic with the write; only what the statement can read is.
- Without the trigger, the pin trusts every writer to move the revision.
- A ledger's record lasts its retention; an increment retried later is applied
  again.
