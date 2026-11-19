# Laws: where does a rule go

A **law** is a rule about state, written down as data and held by whoever owns
that state, where the state changes. "A published product does not go back to
draft", "no more reserved than is in stock", "only the owner may rename it":
each is a law, and each belongs in exactly one place. This guide is the map
from the question a rule answers to the declaration that holds it, and the
order to reach for them in.

It is not a package. The declarations live in `foldkit-entity` (the shape of a
row, what every row and change holds, when a write applies, the states a row
passes through), `foldkit-guard` (who may) and `foldkit-sync` (what a shared
document holds). Their interpreters (the server's writer, the journal, the
client's pre-send check, a form, the database's constraints) read the same
declaration, so a rule is written once. Two tools answer whether the
declarations are enough: `Laws.check` judges every write against every rule,
and the graph asks which rules nothing has shown kept.

## Where does a rule go

Ask what the rule has to read to be decided. The answer picks the kind, the
declaration, and the refusal a caller sees.

| The rule reads | Kind | Declared with | Refused as | Decided by |
| --- | --- | --- | --- | --- |
| One value | Shape | the field's Schema | a decode failure | whoever decodes it |
| The case a row is | Shape | `Entity.defineVariants` | a decode failure, or `Invalid` | the Entity |
| Other rows, counted or looked up | Derived fact | `Derived.count`, `Derived.exists` | nothing: it is computed, never stored | the reader |
| The row after a write | Invariant (state) | `Entity.invariant` | `Invalid` | the server's writer, where it commits |
| The row before and after | Invariant (transition) | `Entity.invariant`, reading `before` | `Invalid` | the server's writer, where it commits |
| The row before, and the input | Precondition | `Write.update(…, { when })` | `Unmet` | the server's writer, where it commits |
| The state a row is in, and the one a write leaves | Precondition and postcondition | `Entity.refine`, then `{ from, becomes }` | `Unmet`, or `Invalid` for a `becomes` only the writer can judge | the server's writer, where it commits |
| The principal and the row | Authorization | `Guards.attach` | `Forbidden` | `foldkit-guard`'s server, before the writer |
| The shared snapshot a durable Message leaves | Invariant (document) | `laws` on `forApplication(…).make` | `Invalid`, with the law's id | the journal, where it commits |

`Data.can` is in no row: it declares nothing. It reads the rows above over what
the client holds and says whether the server would refuse (see [Asking before
sending](#asking-before-sending-datacan)).

A write lands only when all of these hold:

```text
authorization AND precondition AND invariants (state and transition)
```

A shared document's operation lands when `authorize` AND its laws hold: the
same shape, one level up.

Authorization keeps its alternatives inside its own kind: `Update:
[isOwner, isManager]` says who may. Invariants and preconditions are never
alternatives of anything. An administrator cannot skip one, and a valid row
grants no one anything. Authority and validity are different questions, and
the refusals tell them apart: `Forbidden` says you may not, `Unmet` says not
from this state, `Invalid` says the result would break a rule.

## The mental model

Every row has one owner that decides, and a rule is a fact that owner can
check without asking anyone else:

```text
declaration (data) -> every reader of it -> the owner decides where the state changes
                      client hint, form, CHECK, writer
```

The server's writer is the owner of a stored row. The client, a form and Crud
only read the same declaration to say something early. Each rule below is
written in `Expr`, the language [Expressions](./expressions.md) teaches, and
[One domain declaration](./entity.md) shows the kinds together in one domain. What they say is a
hint over what is held; a hint that cannot decide (a field it has not read)
refuses nothing, and the server judges.

## A sixty-second path: one invariant

A product never holds more reserved stock than it has. The declaration is a
value; `Entity.judge` is pure and runs the rule over a row you give it.

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
)

const Product = ProductFields.pipe(
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

Entity.judge(Product, {
  after: { id: 'p1', status: 'draft', stock: 3, reserved: 5 },
})
// { _tag: 'Invalid', failures: [{ id: 'reservedWithinStock', … }] }
```

### What the calls mean

- **`Entity.define`** declares the row's fields. A Schema already judges each
  field alone; it cannot judge one field against another.
- **`Entity.invariant`** declares, and does not run anything. `after` stands
  for the row a write leaves, so the rule reads that row and nothing else.
  Reading `before` too is what makes it a transition invariant.
- **`Entity.judge`** is the reference interpreter: pure, over stored values,
  `Valid`, `Invalid` or `Undecided`. It performs no I/O and changes nothing.
  The server's writer, the client's pre-send check, a form and a `CHECK`
  constraint are other interpreters of the same declaration.
- **`message` and `path`** are what a refusal says and where a form shows it.

## Build outward: the authoring order

Reach for the cheapest kind that can state the rule. Each step below is
decided by more than the one before, so a rule that fits an earlier step
should stay there.

### 1. A Schema, for a value

If one field alone decides it, it is the field's Schema: a literal set, an
integer, a length. Every reader already decodes it, and nothing else is
declared. The `status` field above is `Schema.Literals([...])`, which is why
no rule says "status is one of three".

### 2. A variant, for rows of several shapes

When which fields a row holds depends on its case, declare the cases rather
than a rule about null fields:

```ts
const DomainName = { id: Schema.String, name: Schema.String }
const Domain = Entity.defineVariants('Domain', {
  Available: { ...DomainName, price: Schema.Finite, years: Schema.Int },
  Unconfirmed: DomainName,
})
```

Each case with fields of its own gets an invariant (an Available holds `price`
and `years`, an Unconfirmed holds neither), so a row that mixes cases is
refused as any invariant breach is, and the Drizzle compiler writes each as a
`CHECK`. You declared the shape; you wrote no rule.

### 3. A derived fact, for a value other rows decide

A count of related rows, or whether the viewer has a row pointing here, is not
a rule to keep in step: do not store it. Declare it, and the reader computes
it, so it cannot disagree with its sources.

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

### 4. An invariant, for what every row and change holds

When the rule relates fields to each other, or the row before to the row
after, and must hold whoever writes, it is an invariant (the first example
above). A transition invariant says which changes are valid:

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

An invariant is judged over the row a write leaves, strictly: a null fails
it, and a write on a row that already breaks it lands only if the row it
leaves holds. A transition invariant judges every update and no create or
delete, since a create has no row before and a delete none after. A rule about
what a new row holds is a state invariant.

### 5. A precondition, for whether this write applies now

When the rule is about the state this one write starts from, not about every
row, it is the write's `when`:

```ts
import { Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

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

Publishing is for a draft. The writer checks it in the statement that writes,
over the row as it then is, and refuses it as `Unmet`. The difference from an
invariant is the question it answers: an invariant asks whether the result
is valid for any writer, a precondition asks whether this write makes sense
from where the row is. Another write over the same row is not bound by this
write's `when`.

### 6. A state, for where a write starts and where it leaves the row

A `when` that says "the row is a draft" is a state, and a state a product
passes through is named in many places: a query, a write's start, a write's
end. Name it once, on the Entity, as a value:

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

`from: Draft` joins the state's predicate to the write's `when`, so a row in
another state is refused as `Unmet`: the same refusal, with no second way to
write it. `becomes: Published` is a claim that every row the write can start
from is published once it lands. Where the write is declared, the claim is
checked by enumerating those rows: one the patch cannot keep throws there,
naming a row it breaks. A claim over numbers cannot be enumerated (a sale
`becomes` in stock), so it becomes the write's own postcondition: the writer
judges it where the write commits and refuses it as `Invalid`.

A state is a value, not another descriptor of `Product`. Every reader of an
Entity (the store, the Drizzle compiler, a guard, a form) would have to tell a
descriptor of a state apart from the Entity, and one that did not would treat
`Draft` as `Product` and say nothing. `Query.from(Draft)` asks for the rows in
the state, and `Draft.is(row)` is a type guard over a row you hold; a
Selection is never narrowed by state, since a held row is updated in place
and goes on being read after it left.

A state reads its own row alone to be a write's `from` or `becomes`, because a
writer judges the row it writes, in the statement that writes it. A state that
reaches another row (`Expr.exists`, `Expr.path`) is a query's and a guard
rule's, not a write's.

### 7. A guard, for who may

Authority is decided over the principal and the row, on the server, and is
never an invariant:

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

A caller the rules refuse gets `Forbidden`, and the guard speaks first so a
refusal discloses nothing about the row's state: someone who may not write a
row never learns it is not a draft.

### 8. A document's law, for what every shared snapshot holds

A shared document is state with an owner too: the server's journal. A rule
about what the document holds after a durable Message, whoever sent it and
whichever Message it was, is a `laws` entry on the document's contract:

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

The journal calls `holds` with the snapshot before and the one the operation
leaves, after `reduce` and before the append is written. A refusal is
`Invalid` with the law's id as `rule`, as an Entity's is, and a second durable
Message that grows the list is refused at 100 with no rule of its own. The
replica judges its optimistic snapshot first and fails with `LawBrokenError`
before the outbox is written; that is a hint, and the server judges again.

`holds` reads the shared fields alone, and sees no principal and no Message:
who may is `authorize`, and a law is never one of its alternatives. This is
the rule about the data one transition writes, at the document's level: what
the Message did to the snapshot is judged, whichever Message it was.

## Check them all: `Laws.check`

Declaring rules does not show the writes keep them. `Laws.check` judges each
declared write against each invariant of its Entity, and reports the arrows
the writes make between the Entity's states. It is pure, reads declarations
only, and needs no database:

```ts
import { Option } from 'effect'
import { Laws } from 'foldkit-entity'

const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)

const report = Laws.check({ writes: [Publish, Release, Restock] })
Laws.show(report)
```

```text
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

Nothing bounds the quantity, so a restock of -1 from an empty shelf breaks
the rule: the line under the refusal is that row, the input and the row it
leaves. The last line is what the report stands on.

The report has two halves, and neither is a failure. The pairs (a write
against an invariant) say whether the write can break the rule; the findings
say what the writes do to the states. A write an invariant can refuse is
legitimate, and the check reports it rather than fails on it. What fails a
test is the [graph's `law-unwitnessed`](#who-shows-a-law-is-kept-evidence).
Each pair and finding has one repair:

| The check says | It means | Repair |
| --- | --- | --- |
| `kept` | The write cannot break the rule: it writes no member the invariant reads, every row it can start from was enumerated, the rule holds whatever the members it cannot enumerate hold (`vacuous`), or the numbers' declared bounds decide it for every row and input within them (`bounds`) | None. It issues an `Enumerated` record, or `Bounded` for `bounds`. |
| `refused` (a pair) | The witness under it is a row the rules allow and an input that leave a row breaking the invariant | If the writer should refuse it, nothing: that is the law working, and a line of `Evidence.runtimeOnly` says so. If the write should never break it, bound its input (`Schema.isGreaterThanOrEqualTo(0)`), or narrow its `when` or `from`, so that row cannot start it. A `hint` says the witness starts in a state no write reaches: an invariant ruling that state out settles the pair. |
| `undecided` | The rule reads text or a link, rests on a `when` comparing two unknowns (`amount <= balance`), or computes through an operator with no `Law.monotonic` for each argument | Show it kept another way: a walk through the real writer, a scenario, or a `runtimeOnly` line with the reason. Its `obligation` is what a solver would have to prove. |
| `unmeetable` | No row the invariants allow, and no input, meets the write's `from` and `when` | Fix the condition, or the write can never land. |
| `holds` | A declared `becomes`, proved where the write is declared | None. |
| `enforced` | A `becomes` enumeration could not decide, kept by the write's postcondition where it commits | None. The client's `Data.can` judges it too. |
| `undeclared` | A write with no `becomes` takes a row from one state to another | If it is meant to, declare `from` and `becomes` (as `Release` does). If not, narrow the write. |
| `refused` (an arrow) | Every row the arrow leaves breaks an invariant, so the writer refuses it | If the invariant forbids the move (a published product stays published), it is the rule at work. If not, the write or the rule is wrong. |
| `unreached` | No write leaves a row in the state | Declare the write that enters it, or the state is dead. Rows that only arrive by import or raw SQL are reported unreached, truthfully: the check knows declared writes alone. |
| `terminal` | No write starts from the state | Nothing, if it is final. Otherwise declare the write that leaves it. |

A transition that is no declared write (an import, another package's
command) is an entry with a `Footprint`: what its author says it writes, or
`Footprint.unknown`, which writes every member and is `undecided` against
every invariant. `npx foldkit-plus laws src/laws.ts#report` prints the same report
for a module that exports it, and an example keeps it as text in a checked-in
file, so a write added later changes a file a reviewer sees
([`examples/writes/LAWS.md`](https://github.com/doeixd/foldkit-plus/blob/main/examples/writes/LAWS.md)).

## Who shows a law is kept: evidence

A write that writes what a rule reads could break it. The graph does not guess
whether it does; it asks what showed it did not. Evidence is a typed record
issued by whatever produced it, and each kind says how much it proves:

| Kind | Issued by | What it shows |
| --- | --- | --- |
| `Enumerated` | `Laws.check`, for each pair it decided `kept` by reading the declarations | Read off the declarations: the write touches nothing the rule reads, or every row it can start from was judged. A proof, not a sample. |
| `Bounded` | `Laws.check`, for each pair the numbers' declared bounds decided `kept` | Every row and input within the bounds (Schemas, the write's `from` and `when`, the invariants held before) keeps the rule. A proof over those bounds, not a sample. |
| `Walked` | `Walk.run` (`foldkit-remote/testing`), when no walk failed | Seeded sequences of Messages, through the real writer, never broke the law. Says which seeds passed, not that none can. |
| `Scenario` | `Scenario.run` (`foldkit-remote/testing`), per runner with no mismatch | One written case ran on each backend and agreed. |
| `RuntimeOnly` | `Evidence.runtimeOnly`, by hand, with a `why` | Only the writer or the journal refuses it in production, and nothing earlier covers it. A reasoned admission, not a test. |

A record typed by hand, or a copy of one, was issued by no producer and the
graph refuses it (`evidence-unmatched`), so evidence cannot be forged by
writing the object. `Graph.validate` (`foldkit-surface`) asks the one question
over a Module of contracts, and each finding names a pair and what is missing:

```ts
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

const enumerated = report.pairs.flatMap(pair => Option.toArray(pair.evidence))

Graph.validate(ShopModule, { evidence: enumerated }).map(finding => finding.message)
// ['write:Restock writes Product.stock, which Product.reservedWithinStock reads, and no evidence shows it keeps Product.reservedWithinStock']

const restocked = Evidence.runtimeOnly({
  transition: 'write:Restock',
  law: 'Product.reservedWithinStock',
  why: 'the writer judges the row a restock leaves, and refuses one that leaves reserved over stock',
})
Graph.validate(ShopModule, { evidence: [...enumerated, restocked] }) // []
```

To clear a `law-unwitnessed` finding, give the pair evidence, from the
strongest that can be had: a proof when `Laws.check` can enumerate it, a walk
or a scenario through the real writer when it cannot, and a `runtimeOnly` line
when the writer's refusal is the whole story. The finding names the
transition and the law, in the ids the graph uses (`write:Restock`,
`Product.reservedWithinStock`; `durable:CreatedTodo`,
`sync:capped-board.atMost100Todos`).

A document's law is asked of every durable Message, because each writes the
whole shared slice and a law is a function that may read all of it:

```ts
const BoardModule = Module.make(BoardApp, [Board])

Graph.validate(BoardModule).map(finding => finding.message)
// ['durable:CreatedTodo writes todos, which sync:capped-board.atMost100Todos reads, and no evidence shows it keeps sync:capped-board.atMost100Todos',
//  'durable:DuplicatedTodo writes todos, which sync:capped-board.atMost100Todos reads, and no evidence shows it keeps sync:capped-board.atMost100Todos']
```

That is the point: a durable Message added to the document later is reported
until a walk or a scenario draws it, or a line says the journal's judge is its
evidence. A local Message has no `writes` edge yet (`modifyFields` names its
fields only at run time), so a law over the local Model has no
`law-unwitnessed`; a walk over it still runs. `Graph.toMarkdown` writes the
same table (each law, each transition that can break it, its evidence) to set
in a document.

## Asking before sending: `Data.can`

`Data.can` is not a rule. It reads the rules above over the rows the client
holds and answers, with no I/O, whether the server would refuse a declared
write, in the server's own order: a held `may` (`Forbidden`), the `when` and
`from` (`Unmet`), then the invariants of the row the write leaves (`Invalid`):

```ts
const Data = Remote.make({
  model: ShopApp.model.remote,
  entities: [Product],
  mutations: [Publish, Release, Restock],
})

Data.can({ remote: Remote.initial }, Release, { id: 'p1', status: 'published' })
// Can.Undecided: Product p1 is not held
```

The answer is `Can.Yes`, `Can.No({ refusal })` or `Can.Undecided({ reasons })`,
and `Undecided` is the common case for a row not read yet or a field a rule
needs. It is a hint to grey a control. `Data.mutate` does not consult it and
still sends the write, because a write whose `when` is false over the held row
is not always `Unmet` on the server (publishing a published product is
answered as written, as a retry would be), and a held row may be stale. The
full section, with the three answers, is in [Declared
writes](./declared-writes.md#asking-before-sending-datacan);
`Data.capability` and `Data.available` give an agent capability the same answer
([Agents](./agents.md#a-capability-over-a-declared-write)).

## Who owns the decision

| Owner | Decides | Only hints |
| --- | --- | --- |
| The server's writer (`foldkit-remote-drizzle`, with `foldkit-guard`'s server) | every refusal above, over the row version it writes | |
| The journal (`foldkit-durable`, served by `foldkit-sync`) | a document's laws, over the snapshot before and the one an operation leaves | the replica's `LawBrokenError`, judged over its optimistic snapshot |
| The database | a state invariant as a `CHECK`, against raw SQL too | a transition invariant, which a `CHECK` cannot see |
| The client (`Data.mutate`, `Data.can`) | | `Forbidden` and `Invalid` it can already tell from the rows it holds, and with `Data.can`, `Unmet`; it refuses nothing it cannot decide |
| A form and Crud | | an invariant over an input that sets every field it reads, shown beside its path |

A write the client cannot judge is sent, and the server's answer is the truth.
A refusal the client showed early was a display, and a prediction is dropped
when the answer arrives.

## Failure and recovery

- **A rule the stored data already breaks.** An invariant judges a write, not
  the table. A row that breaks it stays until it is written, and that write
  lands only if the row it leaves holds, so an update that fixes the row is
  accepted and one that leaves it broken is refused.
- **An undecided rule.** A row missing a field a rule reads is `Undecided`,
  never `Valid`. The client refuses nothing; the server reads the whole row.
- **A rule changed after rows exist.** Declaring a new invariant refuses
  nothing already stored. Write it so rows that held before still hold, or
  repair them first; the next write of each broken row is refused until it
  leaves a valid one.
- **A document law added to live documents.** A law judges the snapshot an
  operation leaves, strictly, whatever the one before held: a document that
  already breaks it refuses every operation that leaves it broken, including
  one that only partly repairs it. That is the Entity's rule, so "the law
  holds" has one meaning. To let live documents shrink toward a new cap, write
  the law in its monotone form, over `before` too:

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

  An operation may now leave a long board no longer than it found it, so
  removals land while growth stops at the cap. Before the deploy, find the
  stored snapshots the strict form would refuse: `Board.judge(snapshot,
  snapshot)` answers `Option.some(law)` for each. Judging a law only when the
  operation changes what it reads is not offered: a law is a function, and
  what it reads is not known.
- **A lost answer.** A write that lands and whose answer is lost is retried
  with the same operation id. Which guarantee a retry gets depends on the
  write, not on its rules: see
  [Declared writes](./declared-writes.md#retries-three-different-guarantees).

## When a state depends on the past, store the fact

A refinement's `build` is given `row` and nothing else, an invariant `before`
and `after`, and a document law the snapshot before and after: no rule can
read older than the row before it. "Was ever published" is not
expressible as a predicate, and it is not a gap to work around with history.
The fact is a field, written by the write that makes it true, and the rule
reads the field:

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

The state `WasPublished` now reads one row, so a write may start from it
(`from: WasPublished`), a query may ask for it, and `Laws.check` can enumerate
it. The same holds for a document: store the count or the flag in the shared
slice and write the law over it, rather than asking the law what happened
earlier. A rule over several rows (a total over a list) is not a declaration
at all but a handler's concern; see [Declared
writes](./declared-writes.md#who-owns-what).

## Limits

- Invariants read stored rows only: not another Entity, not an input, not a
  principal. Who may is a guard's; whether this write applies now is its `when`.
- A rule reads the row or snapshot before and after, nothing older: [store the
  fact](#when-a-state-depends-on-the-past-store-the-fact) the rule needs.
- A rule across several rows (a total over a list) is a handler's
  concern, not a declaration's; see
  [Declared writes](./declared-writes.md#who-owns-what).
- A state that reaches another row is a query's and a guard rule's, and no
  write's `from` or `becomes`.
- `Laws.check` enumerates finite fields (literals, unions of them, booleans)
  and bounds numbers by intervals, one member at a time: a text rule, or a
  number rule resting on a relation between two unknowns, is `undecided`
  until a walk, a scenario or a `runtimeOnly` line covers it.
- A local Message has no `writes` edge in the graph yet, so a law over the
  local Model has no `law-unwitnessed`.

## Reference

- [Declared writes](./declared-writes.md): preconditions, invariants, guards
  and retries on one server row, end to end.
- [`foldkit-entity`](../packages/entity/README.md#what-every-row-and-change-must-hold-invariants):
  invariants, variants, derived members.
- [`foldkit-guard`](../packages/guard/README.md): rules, and serving writes.
- [`foldkit-sync`](../packages/sync/README.md#laws-what-every-snapshot-keeps):
  a document's laws.
- [`foldkit-surface`](../packages/surface/README.md#laws-in-the-graph): the
  graph, `Graph.validate` and its rules.
- [`foldkit-metadata`](../packages/metadata/README.md#evidence): evidence
  records and their producers.
- [`foldkit-remote`](../packages/remote/README.md#scenarios-a-write-as-data-run-against-the-real-thing):
  `Scenario`; `Walk` is in the [skill's Remote
  reference](https://github.com/doeixd/foldkit-plus/blob/main/skills/foldkit-plus/references/remote.md).
