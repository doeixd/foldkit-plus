# One domain declaration

A shop has products. Each has an owner, a stock, a state it is in, and
reviews. In most applications that knowledge is written down several times:
as tables and SQL on the server, as cache keys and optimistic updates on the
page, as the fields and validation of a form, as the checks a handler makes
before it writes. Each copy can drift from the others, and the page then shows
something the server will not do.

Foldkit Plus writes it down once, as data, in a **domain module**: the
Entities and how they relate, what every row must hold, the states a row
passes through, who may change it, the writes that exist, and the questions a
list asks. The module imports no database and no client. The server, the page,
a form and a test each read the same declaration and add only what they alone
know, so none of them can disagree with it.

If you know domain-driven design, this is its model, kept as values rather
than classes: an Entity and its invariants, a declared write for a command, a
guard for a policy, a query body for a read model, a binding for a repository.
It is state-based, not event-sourced: the stored row is the fact. For a model
whose facts are events, see [When not to use it](#when-not-to-use-it).

## Who owns what

| Fact | Owner |
| --- | --- |
| A Product has a name, an owner, a stock, many Reviews, a review count | `foldkit-entity` (`Entity.define`, `Entity.relate`, `Entity.derived`) |
| Whether a name is valid | the Effect `Schema` of that field |
| What every stored Product must hold, across fields or across a write | `foldkit-entity` (`Entity.invariant`) |
| Which state a Product is in | `foldkit-entity` (`Entity.refine`) |
| What an edit does to the row (sets, adds, must find) | a declared write (`Write`), declared by the operation |
| Which Products a list holds, in which order | a query body (`Query`, `Expr`), declared by the application |
| Who may read or write a Product | `foldkit-guard`, in the same `Expr` |
| The stored row, and whether a write lands | the server: its database, through `foldkit-remote-drizzle` |
| `owner` is the `owner_id` column; `name` is stored as `title` | `foldkit-remote-drizzle` (`bind`) |
| The page's copy of a row, a pending write, a refusal | `foldkit-remote`, in the Model |
| What the user is typing, and whether it is valid yet | `foldkit-form`, in the parent's Model |
| Which id is open, which save is in flight | `foldkit-crud`, reading Remote |

Two things the domain module does not do. It implies no operations: there is
no generated CRUD, a list exists because someone declared a query, and a
relation existing is not a licence to read a table. And it decides nothing at
run time: the server's writer decides whether a write lands, and everything a
page works out from the same declaration is a display or a hint until the
server answers.

## The mental model

```text
                          domain module
   Entity.define · relate · derived · invariant · refine · select
   Write declarations · Query bodies · guard rules
                (imports neither Remote nor Drizzle)
          |                    |                     |
          v                    v                     v
   server                   page                  no I/O at all
   bind(entities, tables)   Remote.make({ … })    Entity.judge(row)
   source · query · writer  Data.query · mutate   Laws.check({ writes })
   GuardServer.writer       Data.can              a form's controls
   checkConstraints         Form.make · Crud
          |                    |
   decides, in one        shows, predicts, hints;
   statement              replaced by the answer
```

Every rule and question in the module is written in one small language,
`Expr`, which is what lets SQL, a server in memory and the page answer it
alike. [Expressions](./expressions.md) teaches the language; this guide
teaches what is declared with it.

## Sixty seconds: one rule, three readers

```ts
import { Schema } from 'effect'
import { Entity, Expr, Laws, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, stock: Schema.Number, reserved: Schema.Number }),
).pipe(
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

const Hold = Mutation.write(
  'Hold',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, reserved: Schema.Number })), {
    id: 'id',
  }),
)

// Reader 1: the reference judge, over a row you hand it.
Entity.judge(Item, { after: { id: 'i1', stock: 3, reserved: 5 } })._tag // 'Invalid'

// Reader 2: a check of every declared write against every invariant.
Laws.show(Laws.check({ writes: [Hold] }))
// Hold   x reservedWithinStock   undecided: reserved is set to any value its input holds
```

Neither call touches a database. `Entity.invariant` declared the rule and ran
nothing; `Entity.judge` is one interpreter of it, and `Laws.check` another,
which reads the write's declaration and reports that `Hold` can break the rule
(it sets `reserved` to whatever it is given), so something must refuse it
where it commits. That something is reader 3, the server's writer, which
compiles the same invariant into the `UPDATE` that lands `Hold`. Nothing was
written twice to get all three.

## One domain, layer by layer

The rest of the guide carries one small domain from declaration to each
reader. Every block continues the one above.

<!-- docs-check standalone -->

### 1. What exists: Entities, relations, derived members

```ts
import { Schema } from 'effect'
import { Derived, Entity, Expr, Laws, Order, Query as Body, Relation, Write } from 'foldkit-entity'

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    name: Schema.String.check(Schema.isMinLength(1)),
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)
const ReviewFields = Entity.define('Review', Schema.Struct({ id: Schema.String, stars: Schema.Number }))

const Catalog = Entity.relate(
  { Product: ProductFields, Review: ReviewFields },
  { Review: { product: Relation.one(ProductFields) } },
)
```

A field's Schema is the rule for one value: a name is not empty, a status is
one of two. A relation says "a Review has one Product", not "a foreign key";
how it is stored is the binding's to say. Relations are declared in one step
over Entities that already exist, because Entities point at each other and
TypeScript cannot infer two constants each typed by the other.

### 2. What is always true: derived members, invariants, states

```ts
const Guarded = Catalog.Product.pipe(
  // Not stored, so it cannot disagree with the reviews: each reader computes it.
  Entity.derived({ reviewCount: Derived.count(Catalog.Review.relations.product) }),
  // What every stored product holds, whoever writes it.
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

// The states a product passes through, each named once.
const Draft = Entity.refine(Guarded, 'Draft', { status: 'draft' })
const Published = Entity.refine(Guarded, 'Published', { status: 'published' })
```

Reach for the cheapest declaration that can state a rule: a Schema for one
value, a derived member for a value other rows decide, an invariant for what
relates fields or a row before and after, a state for a condition named in
several places. [Laws](./laws.md) is the map from the question a rule answers
to the declaration that holds it.

### 3. Who may: a guard

```ts
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({ id: Schema.String })

const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

const Product = Guarded.pipe(Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }))
```

Authority is not validity. An owner cannot skip an invariant, and a valid row
grants no one anything, so the two are declared apart and refused apart
(`Forbidden` against `Invalid`). `Guards.attach` returns the descriptor that
carries the rules; a server binds that one. See
[Auth and Guard](./auth-and-guard.md).

### 4. What can happen: declared writes

```ts
import { Mutation, Query } from 'foldkit-remote'

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', from: Draft, becomes: Published },
  ),
)

const Reserve = Mutation.write(
  'Reserve',
  Write.update(Entity.input(Product, Schema.Struct({ id: Schema.String, reserved: Schema.Number })), {
    id: 'id',
  }),
)
```

A write is declared by its operation, not by the Entity: a product having a
`reserved` field grants no one the right to set it. The input struct says what
this operation may change, `Entity.input` says what each key means, and `from`
and `becomes` say which state the write starts in and leaves. Because the
write is data, the server needs no handler for it and the page can show its
result before the answer. [Declared writes](./declared-writes.md) covers
preconditions, increments, retries and ledgers.

### 5. What is asked: a query and a Selection

```ts
const ForSale = Query.define('ForSale', { search: Schema.String }, ({ input }) =>
  Body.from(Published).pipe(
    Body.where(Expr.contains(Product.fields.name, input.search)),
    Body.orderBy(Order.desc(Product.fields.stock)),
  ),
)

const Card = Entity.select(Product, { name: true, stock: true, reviewCount: true })
```

A query body says which rows and in which order; a Selection says which
members a reader wants. Neither fetches. `ForSale` asks for products in the
`Published` state, so the state is not spelled a second time.

The query carries its body, so any reader can take it from there. Printed, it
is the question in the language's own words:

```ts
Body.show(ForSale.body)
```

```text
FROM Product
WHERE Product.Published
  AND contains(Product.name, $search)
ORDER BY Product.stock DESC
```

That is the whole domain module: about sixty lines, no table and no fetch.

### 6. Reader: a check, with no database

```ts
Laws.show(Laws.check({ writes: [Publish, Reserve] }))
```

```text
Product
  Draft -> Published   Publish   holds
  Draft                          unreached
  Published                      terminal

Publish   x reservedWithinStock   kept: writes no member it reads
Reserve   x reservedWithinStock   undecided: reserved is set to any value its input holds
```

`Laws.check` reads only declarations. It proves `Publish` takes every draft to
published, and that `Publish` cannot break the stock rule because it writes
nothing the rule reads. It cannot decide `Reserve`, which sets `reserved` to
any number: that pair needs the writer to refuse it where it commits, and the
report says so instead of calling it kept. It also reports `Draft` as
unreached: no declared write leaves a product a draft, since nothing here
creates one. Keep the report beside the code, as
[`examples/writes/LAWS.md`](../examples/writes/LAWS.md) does, and a new write
shows up as a difference to read.

### 7. Reader: the server

The server adds the one thing the domain did not say, where each member is
stored, and gets the rest from the declarations:

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { bind, checkConstraints, query, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'

const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  reserved: integer('reserved').notNull(),
  revision: integer('revision').notNull(),
})
const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  stars: integer('stars').notNull(),
  productId: text('product_id').notNull(),
})

const Policy = Shop.implement({})

const Db = bind(
  { Product, Review: Catalog.Review },
  {
    Product: {
      table: products,
      // The domain calls it `name`; the column is `title`.
      fields: { name: products.title },
      visible: GuardDrizzle.visible(Policy, [Product]).Product,
    },
    Review: { table: reviews, relations: { product: { field: reviews.productId } } },
  },
)

// The invariant as CHECK constraints, for the table's DDL.
const checks = checkConstraints(Db.Product).constraints.map(check => check.constraint)

// Each write lands in one statement, on the revision its rules were decided over.
const guarded = GuardServer.writer(Product, Policy, writer(Db.Product), { revision: 'revision' })

const server = RemoteServer.make<Option.Option<typeof User.Type>, DrizzleDatabase>({
  entities: [source(Db.Product, { filter: GuardServer.filter(Product, Policy) })],
  queries: [query(ForSale, { entity: Db.Product })],
  mutations: [RemoteServer.write(Publish, guarded), RemoteServer.write(Reserve, guarded)],
})
```

<!-- docs-check
void [checks, server, Card]
-->

There is no handler for `Publish` and no SQL for `ForSale`. The writer turns a
declared write into one `update … where`: the id, the revision the guard read,
the state it starts from, and every invariant over the row it would leave.
`query` compiles the body, the state included, into the list's `WHERE` and
`ORDER BY`, under what the reader may see. `reviewCount` has no entry in the
binding: a `Derived.count` says what it counts, and `bind` counts it on the
pointing table. This is the only place a rule is *decided*.

### 8. Reader: the page

```ts
import { Optic } from 'effect'
import { Can, Remote } from 'foldkit-remote'
import { ModelRef } from 'foldkit-surface'

const Model = Schema.Struct({ remote: Remote.Model })

const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof Model.Type>().key('remote'), ['remote']),
  entities: [Product],
  queries: [ForSale],
  mutations: [Publish, Reserve],
})

declare const model: typeof Model.Type

// A read: a Projection of the Model, fetched because a screen shows it.
const forSale = Data.query(ForSale, { search: '' }, { select: Card })

// A hint, from what the page holds, with no I/O.
const label = Can.match(Data.can(model, Publish, { id: 'p1', status: 'published' }), {
  Yes: () => 'Publish',
  No: ({ refusal }) => `Cannot publish: ${refusal._tag}`,
  Undecided: () => 'Publish',
})
```

<!-- docs-check
void [forSale, label]
-->

Remote keeps the page's copy of each row in the application's Model and owns
nothing else: the server's row is the fact, and refetching is recovery.
Because the page read the same declarations, it can do three things without
asking:

- **Show a write before the answer.** `Data.mutate(Publish, input)` shows the
  product as published while the request is out. The shown value is the stored
  row plus the pending write, recomputed when read, and dropped when the
  answer arrives.
- **Place the row in lists.** `ForSale`'s body says a publish can bring a
  product into the list and that `stock` orders it, so the page moves the row
  where the body puts it, or, where it cannot tell (a field it does not hold),
  leaves the list for the server to answer again.
- **Hint.** `Data.can` answers `Yes`, `No` with the refusal the server would
  give, or `Undecided`. A page that holds no row for `p1` answers `Undecided`;
  it never guesses.

A form reads the same input struct the write was declared with
(`Form.make('Reserve', Entity.input(Product, …))`), so its controls, its
per-field validation and the invariant it marks under `reserved` come from the
declarations above. [From declarations to the
screen](./declared-data-to-ui.md) follows a change from here to a drawing.

## When it goes wrong

The server's answer is final, and each refusal says which declaration made it:

| What happened | The page sees | Declared by | Recovery |
| --- | --- | --- | --- |
| The caller is not the owner | `Forbidden` | the guard | none: it is not theirs to do |
| The product is not a draft | `Unmet` | the write's `from` or `when` | re-read; the row moved on |
| The write `expect`s a revision, and the row has moved on | `Conflict` | the write's `expect` | re-read, then decide again |
| The result would break a rule | `Invalid`, with the invariant's id, message and path | `Entity.invariant` | show `message` at `path`; change the input |
| The value is malformed | a decode failure | the field's Schema | the form shows it before anything is sent |

Four cases need care:

- **A prediction the server contradicts.** The page shows a `Reserve` of 4
  over the stock of 10 it holds; another session has since sold down to 3,
  and the server answers `Invalid`. The pending write is dropped, the row
  shows what the server holds, and `Data.refusal` carries the refusal. A
  prediction is never merged into the stored row, so there is nothing to
  undo.
- **A rule the page cannot judge.** `Reserve` on a product whose `stock` the
  page never read: the page sends it, and the server refuses or accepts. A
  hint that cannot decide refuses nothing.
- **A rule across fields, in a form.** `reservedWithinStock` reads two fields,
  so its failure belongs to neither field's own validation. On submit the
  form shows the message beside the key the invariant's `path` names, as a
  mark, and any edit clears the mark, since raising the stock may mend it.
- **A rule the database cannot hold.** `checkConstraints` gives a `CHECK` for
  an invariant over one row. An invariant that reads the row before the write
  has none, so only the declared writer holds it, and raw SQL does not. The
  writer reports this once as a `ServerOnlyRules` diagnostic.

How to prove the page and the server agree, instead of hoping: `Law.check`
from `foldkit-remote/testing` sends one write through a page and through the
server and compares what each said. [`examples/writes`](../examples/writes/README.md)
runs it for every write of a domain like this one.

## Five rules that keep the copies from coming back

- **Relations are declared in one step**, with `Entity.relate`, over Entities
  that already exist.
- **A Selection carries its schema and fetches nothing.** Remote compiles it
  into the requirement graph it plans from; a test can decode against it
  directly.
- **A query body, a write and an invariant mean one thing everywhere.** The
  server compiles them to SQL, and the page judges the rows it holds by the
  same declaration, so what it shows before an answer is what the server will
  say, or nothing.
- **An invariant is the Entity's, a guard its descriptor's.** Relations,
  derived members, `sets` and invariants are added to the Entity itself, so
  any name of it (the one declared, the one a pipe returned) judges every
  invariant. `Guards.attach` returns a descriptor that carries its rules; a
  server binds that one, and a guard seam given another descriptor of a
  guarded Entity throws by name.
- **An operation's input is read against the Entity, not derived from it.**
  `Entity.input` says what each key of the struct means (`authorId` is the
  `author` relation). From that reading follow a form's controls, what an edit
  screen loads (`Entity.selectFor`), and how a loaded value fills the form
  (`Entity.valuesFor`).

## Where to go next

| You want | Read | Run |
| --- | --- | --- |
| The language every rule and question is written in | [Expressions](./expressions.md) | `pnpm --filter foldkit-example-entity language` |
| To decide where a rule goes, and check every write against every rule | [Laws](./laws.md) | [`examples/writes`](../examples/writes/README.md), its `LAWS.md` |
| A write that holds where it commits: preconditions, increments, retries | [Declared writes](./declared-writes.md) | `pnpm --filter foldkit-example-writes demo` |
| Who may read and change what | [Auth and Guard](./auth-and-guard.md) | |
| To name a question once and reuse it | [Operators](./operators.md) | |
| A change followed from the declaration to the drawing | [From declarations to the screen](./declared-data-to-ui.md) | |
| Every declaration's API | the [`foldkit-entity` README](../packages/entity/README.md) | [`examples/entity`](../examples/entity/README.md): one domain read through SQLite, a form and a list |
| The interpreters | [Remote](../packages/remote/README.md#entities-declared-with-foldkit-entity), [Drizzle `bind`](../packages/remote-drizzle/README.md#binding-a-foldkit-entity-domain), [`foldkit-form`](../packages/form/README.md), [`foldkit-crud`](../packages/crud/README.md) | |

## When not to use it

- **Two entities and no forms.** Remote's own `Entity.make` and `Entity.ref`
  are less to learn and can share a domain with Entities declared here. Reach
  for `foldkit-entity` when the same domain is about to be written down a
  second time.
- **Edits that must merge offline across devices.** A declared write is
  decided once by the server. Client-authored operations that survive offline
  and replay in a server's order belong to Sync; see [Replicated
  state](./replication.md) and [Editing server data through a
  journal](./editing-server-data.md).
- **A model whose facts are events.** Here the row is the fact and a write
  changes it in place. If your server is an event-sourced model built with
  [Alchemy Domain](https://github.com/alchemy-run/alchemy) (`@alchemy.run/domain`: Commands,
  Aggregates that decide, Events, Views), the page still reads and writes it
  through Remote with the same declarations:
  [`foldkit-remote-domain`](../packages/remote-domain/README.md) is that bridge, and
  [`examples/writes-domain`](../examples/writes-domain/README.md) decides one declared
  write by SQLite, in memory and by a Domain model, and compares the three.
  It is experimental and tracks a beta of that library.
