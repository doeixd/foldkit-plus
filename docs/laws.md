# Laws: where does a rule go

A **law** is a rule about state, written down as data and held by whoever owns
that state, where the state changes. "A published product does not go back to
draft", "no more reserved than is in stock", "only the owner may rename it":
each is a law, and each belongs in exactly one place. This guide is the map
from the question a rule answers to the declaration that holds it, and the
order to reach for them in.

It is not a package. The declarations live in `foldkit-entity` (the shape of a
row, what every row and change holds, when a write applies) and `foldkit-guard`
(who may). Their interpreters (the server's writer, the client's pre-send
check, a form, the database's constraints) read the same declaration, so a rule
is written once.

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
| The principal and the row | Authorization | `Guards.attach` | `Forbidden` | `foldkit-guard`'s server, before the writer |

A write lands only when all of these hold:

```text
authorization AND precondition AND invariants (state and transition)
```

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
only read the same declaration to say something early. What they say is a
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

### 6. A guard, for who may

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

## Who owns the decision

| Owner | Decides | Only hints |
| --- | --- | --- |
| The server's writer (`foldkit-remote-drizzle`, with `foldkit-guard`'s server) | every refusal above, over the row version it writes | |
| The database | a state invariant as a `CHECK`, against raw SQL too | a transition invariant, which a `CHECK` cannot see |
| The client (`Data.mutate`) | | `Forbidden` and `Invalid` it can already tell from the rows it holds; it refuses nothing it cannot decide |
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
- **A lost answer.** A write that lands and whose answer is lost is retried
  with the same operation id. Which guarantee a retry gets depends on the
  write, not on its rules: see
  [Declared writes](./declared-writes.md#retries-three-different-guarantees).

## Limits

- Invariants read stored rows only: not another Entity, not an input, not a
  principal. Who may is a guard's; whether this write applies now is its `when`.
- A rule that reads the past of a row, beyond its row before, is not
  expressible: a predicate is given the row before and after, nothing older.
  Store the fact the rule needs as a field.
- A rule across several rows (a total over a list) is a handler's
  concern, not a declaration's; see
  [Declared writes](./declared-writes.md#who-owns-what).

## Reference

- [Declared writes](./declared-writes.md): preconditions, invariants, guards
  and retries on one server row, end to end.
- [`foldkit-entity`](../packages/entity/README.md#what-every-row-and-change-must-hold-invariants):
  invariants, variants, derived members.
- [`foldkit-guard`](../packages/guard/README.md): rules, and serving writes.
