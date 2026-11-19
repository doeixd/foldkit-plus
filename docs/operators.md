# Operators: questions an application names

Query predicates and invariants use a small built-in vocabulary: `eq`, `contains`, `in`, comparisons, and boolean connectives. When your application needs a domain rule shared across queries and guards (`listed`), a search or sort operation not built into the core (prefix matching, numeric distance), or a server-computed field write, declaring an **operator** lets you write it once as data.

Every interpreter—server SQL, client list filtering, guards, invariants, and forms—shares the exact same meaning and rejects mismatches by name. Read [Expressions](./expressions.md) first if `Expr` is new to you.

## Who owns what

| Piece | Package | Owns |
| --- | --- | --- |
| Operator declaration (`Expr.operator`) | `foldkit-entity` | Name, version, schemas, null/collation rules, laws |
| Defined operator (`definedAs`) | `foldkit-entity` | Meaning expanded to core `Expr` nodes |
| In-memory table (`Operators`) | `foldkit-entity` | JS implementation for client, guards, invariants |
| SQL table (`DrizzleOperators`) | `foldkit-remote-drizzle` | Drizzle SQL compilation matching memory |
| Law evidence (`withEvidence`) | Implementation table | Proof that tested laws hold for that table |

Operator tables are passed explicitly as values (`evaluate`, `Remote.make`, `bind`, policies) rather than registered globally. If a client lacks an operator the server uses, it refuses by name instead of guessing.

Reach for a **defined operator** (`definedAs`) whenever core `Expr` nodes can express the rule—there is nothing extra to implement or test. Reach for a **primitive operator** only when you need custom SQL and JS logic.

## Defined vs. primitive operators

Every `Expr.operator` declaration branches into one of two paths:

- **Defined (`definedAs` provided):** Expands directly into core `Expr` nodes so every interpreter runs it automatically with no implementation tables needed.
- **Primitive (no `definedAs`):** Declares the signature and laws once, then pairs an in-memory implementation (`Operators.memory`) for clients and tests with a SQL implementation (`DrizzleOperators.make`) for `foldkit-remote-drizzle`.

A body's meaning equals the core kernel's meaning plus each operator's meaning—either its `definedAs` expression or the tested equivalence of its tables checked by `Conformance`.

## A first named rule: `listed`

Suppose your catalog shows products once `publishedAt` is non-null across public queries, visitor guard rules, and reports. Declare `listed` once:

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

- **`Expr.operator`** declares a pure value with a namespaced ID (`acme.*`; `foldkit.*` is reserved) and `version` (default `1`).
- **`definedAs`** builds an expression from its arguments once per call, so `Listed` compiles identically to `Expr.isNotNull(fields.publishedAt)` everywhere. Setting `output: Schema.Boolean` lets the operator appear inside `and`, `or`, `not`, guards, and invariants.
- **Argument isolation:** A `definedAs` callback may read only its passed arguments (closing over external Entity fields throws so dependency tracking stays accurate).
- **Readable names:** `Query.show` prints `acme.listed(...)` and `Query.operators` inspects operator usage across queries. (`foldkit-cms` ships `Cms.published(entity)` the same way.)

## Searching prefixes with `Text.startsWith`

To match a UPC prefix without `LIKE` wildcard pitfalls, use the built-in primitive `Text.startsWith`:

```ts
import { Text } from 'foldkit-entity'

const search = Expr.input('search', Schema.String)
const ByCode = Query.from(Product).pipe(Query.where(Text.startsWith(fields.upc, search)))

// `label` lacks a field collation, so supply one at the call site.
const ByLabel = Query.from(Product).pipe(
  Query.where(Text.startsWith(fields.label, search, { collation: Collation.asciiFold })),
)
```

`Text.startsWith` requires an explicit collation (`binary` or `asciiFold`) so memory, SQLite, and Postgres agree, propagates `null` as unknown, matches every row for an empty prefix, and treats `%` and `_` as literal characters.

## An operator of your own

For custom operations like numeric distance, declare the operator and provide both `Operators.memory` and `DrizzleOperators.make` implementations:

```ts
import { sql } from 'drizzle-orm'
import { Operators, Order } from 'foldkit-entity'
import { DrizzleOperators } from 'foldkit-remote-drizzle'

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

- **Server wiring:** Pass `{ operators: { memory, sql: sqlOperators } }` to `bind` and `{ operators }` to `GuardDrizzle.visible`. Missing implementations fail at registration rather than on the first request.
- **Client wiring:** Pass `{ operators: memory }` to `Remote.make` so browser filtering and sorting match the server.
- **Null handling:** Arguments are strict by default (any `null` produces `null` without calling your function); pass `nulls: 'handled'` with `Operators.implementHandlingNulls` to customize null behavior.
- **Text collations:** Pass `collation: 'operands'` on string-returning operators so output inherits input collation.

## Ordering by a computed value

Any numeric or collated-text operator works directly in `Query.orderBy`:

```ts
const budget = Expr.input('budget', Schema.Int)
const Nearest = Query.from(Product).pipe(Query.orderBy(Order.asc(distance(fields.cents, budget))))
```

Both SQL (keyset pagination included) and the browser sort by `distance`, breaking ties by row ID. Add a SQL expression index if sorting large tables by a computed call.

## Writing a computed value

Declared writes can compute new column values in SQL and preview them on the client using operators in `compute`:

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

`Write.apply(row, bound, { operators })` computes the optimistic row for guards, writers, and Remote previews while concurrent live updates layer cleanly underneath. Without `expect: 'revision'`, computed writes require a ledger plus either a revision-pinned guard or a verified commutative/associative operator.

## Filtering held client rows with `matching`

Because client and server share operator tables, `matching(store, Query, input, { operators })` (`foldkit-remote`) returns `{ matched, skipped }` over cached rows. `matched` preserves server sort order, while `skipped` lists rows missing required fields or containing text with NUL characters.

`filtered(Data, model, list, Query, input)` (`foldkit-remote/filter`) applies `matching` to a loaded list and reports `complete: false` whenever an operator is missing from the client's table so uncertain filters defer to the server.

## Testing operator laws and parity

Declare algebraic laws (`Law.associative`, `Law.identity`, `Law.preservesCollation`) on primitive operators and verify them with `Conformance`:

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

- **Sampling checks:** `Conformance.laws` tests edge inputs (empty strings, mixed case, astral Unicode, zero, negatives, fractions) and returns `Counterexample` when a law fails (for instance, `concat` fails commutativity on `"a"` and `"A"`).
- **Per-table evidence:** Attach `Conformance.laws` evidence to memory tables and `Conformance.lawsBy` evidence to SQL tables; overriding an implementation clears its evidence automatically.
- **Cross-backend parity:** Pass both memory and SQL runners to `Conformance.operator` to verify matching results and refusals across every edge case.

## Publishing what a server runs

`Operators.describe(op)` and `Operators.describeTable(table)` emit JSON-Schema metadata (ID, version, input/output schemas, null and collation rules, laws, and attached evidence, omitting internal `definedAs` bodies) validated by `OperatorDescription`.

Versions form part of the operator's identity: a table providing `acme.slug` (v1) refuses a query calling `acme.slug@2` with `acme.slug@2 (this table has acme.slug)` so client/server deploy skew surfaces immediately.

## Failure and recovery

| Condition | When it fails | Reason |
| --- | --- | --- |
| `definedAs` closes over external field | When called | Keeps dependency tracking accurate |
| Wrong argument schema type | At call site | Prevents silent SQL coercion |
| Text compared without collation | At call site | Avoids backend sorting divergence |
| Server lacks operator used in body | At registration | Fails boot instead of first request |
| Client lacks operator used in body | Client marks incomplete | Safe fallback to server query |
| Text contains NUL character | Row skipped or run refused | Postgres text rejects NUL; SQLite `LIKE` stops |
| Implementation violates a law | `Conformance.laws` `Counterexample` | Law is unverified until tested |
| Every law test call refused | `Conformance.laws` `Unanswered` | Refusals prove nothing about the law |

Uncertain client checks always report incomplete (`skipped`, `complete: false`, `unknown`) rather than returning false empty lists. Strict null handling intercepts `null` inputs before implementations execute.

## Limits

- Operators inspect only their explicit arguments—no external rows, clocks, or principals.
- Locale collations (`Collation.locale(name)`) run on Postgres only and are unavailable for operators.
- Computed writes modify one row from its pre-write fields and input.
- Ordering by a computed operator uses standard database indexes you define separately.
- `Conformance` tests laws by randomized sampling; `Evidence.Proven` records external proofs without re-verifying them.

## Next

- Review the `Expr` predicate language in [Expressions](./expressions.md).
- Read the full operator API in [`foldkit-entity`](../packages/entity/README.md).
- Wire server and client operator tables in [`foldkit-remote-drizzle`](../packages/remote-drizzle/README.md) and [`foldkit-remote`](../packages/remote/README.md).
