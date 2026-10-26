# Operators: questions an application names

A query body says which rows it wants with a small, fixed vocabulary: `eq`,
`contains`, `in`, comparisons, `and`, `or`, `not`. An **operator** is a word an
application adds to that vocabulary: a rule it asks in many places
(`published`), a test the kernel does not have (a prefix match, a distance), or
a value a write computes (a joined label). It is declared once, as data, and
then every place a body runs means the same thing by it: the server's SQL, the
client's judgement of the rows it holds, a guard's rule, an invariant, a form.

What this enables, in short:

- **A rule named once.** Write "published" as an operator and use it in a
  public query, a visitor's Read rule and an invariant, with nothing to keep in
  step.
- **Search and order the kernel lacks.** `Text.startsWith` for a code typed from
  its start; an application's own `distance` to order the nearest rows first,
  paged by keyset like any column.
- **Writes that compute.** A field set from the row and the input where the
  write commits, shown on the client before the answer comes.
- **One meaning, checked.** Laws an operator keeps, tested for each
  implementation; the in-memory and SQL implementations run against each other;
  a description a server can publish.

## Who owns what

| Part | Package | Owns | Does not |
| --- | --- | --- | --- |
| The declaration | `foldkit-entity` (`Expr.operator`) | the operator's name, version, argument and result schemas, null and collation rules, laws | any behaviour: it is a value |
| A defined operator's meaning | `foldkit-entity` (`definedAs`) | what a call means, as an expression of the kernel | an implementation: every interpreter runs the expression |
| The in-memory implementation | `foldkit-entity` (`Operators`) | how a primitive operator runs over values, for the reference interpreter, Remote's client, guards, invariants and forms | SQL |
| The SQL implementation | `foldkit-remote-drizzle` (`DrizzleOperators`) | the Drizzle `SQL` a primitive operator compiles to | the in-memory answer it must agree with |
| Evidence | each table (`withEvidence`) | which laws were tested for *that* implementation | the declaration: a law declared is a claim until tested |

Nothing registers globally. A table is a value handed to whatever runs a body:
`evaluate`, `Remote.make`, `bind`, a policy. Two tables can differ (a client
that lacks an operator the server has), and what one lacks is refused by name,
never skipped.

A defined operator and a primitive one are the two kinds. Reach for
**defined** whenever the kernel can say it: there is nothing to implement,
nothing to test against itself, and the SQL is the SQL of the expression
written out. Reach for **primitive** only for what the kernel cannot say.

## The mental model

```text
                Expr.operator(id, { input, output, … })
                    │                         │
        definedAs: an expression         no definedAs: primitive
                    │                         │
     every interpreter runs it        a table per interpreter
     (nothing to implement)           ├─ Operators.memory      (client, guards, invariants, forms)
                    │                 └─ DrizzleOperators.make (the server's SQL)
                    │                         │
                    └──────────┬──────────────┘
                               ▼
          bodies call it: where, order, a write's `compute`
                               │
             laws ── tested per implementation ──▶ evidence
                               │
                Operators.describe ──▶ what a server publishes
```

The equation that holds it together:

```text
a body's meaning = the kernel's meaning + each operator's meaning
```

and an operator's meaning is either an expression (defined) or the agreement of
its implementations (primitive), which `Conformance` checks.

## A sixty-second path: a rule named once

A catalog lists a product once it has a publication date. That rule is asked in
the public list, in a visitor's Read rule and in reports. Name it:

```ts
import { Schema } from 'effect'
import { Collation, Entity, Expr, Query } from 'foldkit-entity'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    upc: Schema.String,
    label: Schema.String,
    cents: Schema.Int,
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Entity.annotateMembers({ upc: Collation.of(Collation.binary) }))
const { fields } = Product

const listed = Expr.operator('acme.listed', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
  definedAs: publishedAt => Expr.isNotNull(publishedAt),
})

const Listed = Query.from(Product).pipe(Query.where(listed(fields.publishedAt)))
Query.show(Listed)
// FROM Product
// WHERE acme.listed(Product.publishedAt)
Query.operators(Listed) // ['acme.listed']
```

### What the calls mean

- **`Expr.operator` declares; it does nothing.** No SQL, no evaluator, no
  registration. The id is namespaced (`acme.`; `foldkit.` is reserved) and has a
  `version`, 1 by default, which changes when what it means does.
- **`definedAs` builds an expression from the call's arguments**, once per call.
  Every interpreter runs that expression, so `Listed` compiles to the same SQL
  as `Expr.isNotNull(fields.publishedAt)` written out, and the client judges it
  the same way. A boolean `output` makes a call a predicate, usable in `and`,
  `or`, `not`, a guard or an invariant.
- **It reads only its arguments.** A `definedAs` that closed over a field
  instead of taking it is refused when called, since nothing asking what a
  body reads would see the field.
- **What it adds is a name.** `Query.show` prints the call, and
  `Query.operators` lists what a body calls, so a reviewer, a log or a
  description says "listed" where it would have said "publishedAt is not null".

`foldkit-cms` ships one: `Cms.published(entity)`, over its `published` role.

## Build outward

### Searching text: the kernel's primitive operator

Some questions the kernel cannot say. A UPC is typed from its start, so a
search should match from its start, not anywhere. `Text.startsWith` is the
kernel's one primitive operator:

```ts
import { Text } from 'foldkit-entity'

const search = Expr.input('search', Schema.String)
const ByCode = Query.from(Product).pipe(Query.where(Text.startsWith(fields.upc, search)))

// `label` declares no collation, so a call over it names one.
const ByLabel = Query.from(Product).pipe(
  Query.where(Text.startsWith(fields.label, search, { collation: Collation.asciiFold })),
)
```

It compares under the text's collation: `binary` exactly, `asciiFold` folding
ASCII letters on both sides. Text with no collation is refused where the call
is written, because what such text compares as is each database's own choice,
and the client could not agree with all of them. A null on either side is
unknown, and the empty prefix holds for every row. `%` and `_` are characters,
never wildcards. The registry demo's product search uses it.

### An operator of your own

A primitive operator states what it means and leaves the computing to each
interpreter. Declare it, then implement it for each one that runs it:

```ts
import { sql } from 'drizzle-orm'
import { Operators, Order } from 'foldkit-entity'
import { DrizzleOperators } from 'foldkit-remote-drizzle'

/** How far a price lies from a target, in cents. */
const distance = Expr.operator('acme.distance', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  description: 'How far the first number lies from the second.',
})

const memory = Operators.merge(
  Operators.kernel,
  Operators.memory(Operators.implement(distance, (cents, target) => Math.abs(cents - target))),
)
const sqlOperators = DrizzleOperators.merge(
  DrizzleOperators.kernel,
  DrizzleOperators.make(
    DrizzleOperators.implement(distance, ({ args: [cents, target] }) => sql`abs(${cents} - ${target})`),
  ),
)
```

- **The server** takes both tables where the domain is bound:
  `bind(entities, storage, { operators: { memory, sql: sqlOperators } })`. Every
  query, invariant and write over the domain runs the operator by them, and one
  that calls an operator either table lacks is refused where it is registered,
  not on the first request that uses it. A guard's Read rules take the SQL
  table where they are compiled (`GuardDrizzle.visible(Policy, entities, {
  operators })`).
- **The client** takes the memory table as `Remote.make({ …, operators:
  memory })`, so it judges and orders the rows it holds by the same meaning.
- **Null is strict by default:** a null argument gives null, and the
  implementation never sees one. `nulls: 'handled'` operators, implemented with
  `Operators.implementHandlingNulls`, answer for null themselves.
- **Text results keep a collation** when the operator says
  `collation: 'operands'`: a join of two `binary` texts is `binary` text, and
  compares and orders so.

### Ordering by a computed value

A call orders when its result does: a number, or text with a collation.
"Nearest price to what I can spend" is one term:

```ts
const budget = Expr.input('budget', Schema.Int)
const Nearest = Query.from(Product).pipe(Query.orderBy(Order.asc(distance(fields.cents, budget))))
```

The server compiles the call as an expression and pages by its value, keyset
cursors included, the same in SQLite and Postgres; ties break by id. The client
orders by the memory implementation, so an edited row is placed where the server
would put it rather than refetched. Index the expression if the list must be
fast.

### Writing a computed value

A declared write can set a field from the row before the write and the input,
through an operator. The computation travels as data, by operator name, so
the server compiles it into the same `update` that checks the write, and the
client predicts it:

```ts
import { Write } from 'foldkit-entity'

const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})

const Retitle = Entity.input(
  Product,
  Schema.Struct({ id: Schema.String, suffix: Schema.String }),
  { suffix: Entity.unmapped },
)
const retitle = Write.update(Retitle, {
  id: 'id',
  compute: { label: ({ row, input }) => joined(row.label, input.suffix) },
})
```

- `Write.apply(row, bound, { operators })` is the row the write leaves, the
  one function the writer explains a miss by, a guard judges and Remote shows
  while the write is pending. A live update to the row meanwhile is computed
  from, not hidden.
- A retry must not apply a computation twice. Without `expect` (a revision the
  row must still hold), a computed assignment lands only through a writer with
  a ledger, and only as `op(field, amount)` whose operator was *tested*
  commutative and associative for each implementation, so two concurrent
  writes give the same row in either order.

### The client agrees with the server

Because the client runs the same body by the same meaning, it can answer
questions about the rows it already holds without asking:

```text
Remote.matching(store, Query, input) ──▶ { matched, skipped }
```

`matched` is in the body's order; `skipped` is what it could not judge: a row
missing a field the body reads, or holding text no interpreter answers for (a
NUL). Each row is judged alone, so one such row never blanks the rest.
`Data.filtered(model, list, Query, input)` filters a loaded list with it and
says whether the answer is `complete`. An operator the client's table lacks
cannot be judged there: a filter answers nothing and says it is incomplete, and
a live row it cannot judge is the server's to place.

### Holding implementations to each other

A primitive operator has as many meanings as implementations unless something
checks them. An operator may declare the equations it keeps, and `Conformance`
tests each implementation:

```ts
import { Law } from 'foldkit-entity'
import { Conformance } from 'foldkit-entity/conformance'

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
  laws: [Law.associative, Law.identity(''), Law.preservesCollation],
})
const concatMemory = Operators.memory(
  Operators.implement(concat, (left, right) => `${left}${right}`),
)

const verdict = Conformance.laws(concat, concatMemory)
const recorded =
  verdict._tag === 'Holds' ? Operators.withEvidence(concatMemory, verdict.evidence) : concatMemory

const report = await Conformance.operator(concat, {
  implementations: { memory: Conformance.memory(concatMemory) },
})
```

- **A law describes; nothing rewrites a body by one.** It is checked where it
  is declared (a witness the argument cannot store is refused), and tested by
  seeded sampling: the empty string, mixed case, non-ASCII and astral text,
  zero, negatives, fractions. Declaring `concat` commutative fails with
  `"a"` and `"A"`.
- **Evidence belongs to an implementation.** `withEvidence` takes only what
  was tested on this table's own implementation: a record of another, or of a
  memory implementation handed to an SQL table, is refused, and a table that
  overrides the implementation drops it. The commuting writes above require it
  in both the memory and the SQL table, for laws tested over every value.
- **`Conformance.operator`** runs one set of generated calls through every
  implementation given (null where admitted, NUL text, each collation) and
  reports where they disagree, a refusal included. Give it an SQL runner
  beside the memory one to hold the database to the same answers.

### Publishing what a server runs

`Operators.describe(op)` is an operator's signature as JSON: its name and
version, its description, each argument and its result as a JSON Schema of the
stored side as JSON carries it, its null and collation rules, its laws, and
whether it is defined.
It never includes a defined operator's body. `OperatorDescription` is the
Schema that checks one, so a description another server publishes can be
decoded, and `Operators.describeTable(table)` lists a table's operators with
their evidence.

The version is part of the name. A table holding `acme.slug` does not answer a
body calling `acme.slug@2`, and the refusal names both
(`acme.slug@2 (this table has acme.slug)`), so a client and a server on
different deploys see which side is behind.

## Failure and recovery

Every failure is a refusal by name, at the earliest moment that can see it:

| What | Refused | Why there |
| --- | --- | --- |
| a `definedAs` that reads a field it did not take | when the operator is called | nothing could see what the call reads |
| an argument of the wrong stored kind | where the call is written | SQL would coerce it silently (SQLite binds a number as a real) |
| text with no collation where one is required | where the call or order term is written | each database compares such text its own way |
| an operator a server's table lacks | where the query, invariant, write or rule is registered | not on the first request that needs it |
| an operator the client's table lacks | not judged on the client: an incomplete filter, a live row the server places | a client can be behind its server |
| text holding a NUL | that row, or the run when the input holds it | Postgres text cannot hold one; SQLite's `like` stops at it |
| a law an implementation breaks | `Conformance.laws` answers `Counterexample` with both sides | a declared law is a claim until tested |

A refusal never becomes an empty answer. A body the client cannot judge is
"I could not tell" (`skipped`, `complete: false`, `unknown`), never "no rows".

Strict null means an operator needs no null cases in its laws or its
implementation: a null argument makes the call null (unknown, for a predicate)
before any implementation runs.

## Limits

- **An operator is a function of its arguments.** It reads no other row, no
  other Entity, no clock and no principal. A guard decides who may ask; an
  operator only says what is asked.
- **Locale collations are the database's.** An order or comparison may name
  `Collation.locale(name)` for the server, but the client cannot run it, and an
  operator's text never carries one.
- **A computed write sets one row** from that row and the input. Anything
  wider is a handler.
- **Ordering by a call is as fast as its index.** Nothing creates the
  expression index for you.
- **Laws are tested by sampling,** not proved. `Evidence.Proven` records a
  proof made elsewhere; it is not checked here.

The full API is in the [Entity guide](../packages/entity/README.md); the
server's half is in [`foldkit-remote-drizzle`](../packages/remote-drizzle/README.md),
and the client's in [`foldkit-remote`](../packages/remote/README.md).
