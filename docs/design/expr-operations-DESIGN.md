# Operators in the expression kernel

**Status:** Proposed, 2026-10-26, for
[#185](https://github.com/doeixd/foldkit-plus/issues/185). Revised the same day
with what gen2 offered (§13), completed as a plan, then checked against Remote,
Guard, the server packages, Sync, CMS, Crud, Form and the example interpreters
(§17 records what that check found). Phase 0's probes ran the same day (§17).
Phases 1 to 7 built 2026-10-26 (their **Built** notes in §12); §15's
questions 10 and 11 closed the same day (§15, §17).
**Packages:** `foldkit-entity` (descriptors, nodes, the reference interpreter,
writes, invariants, laws, conformance), `foldkit-remote-drizzle` (SQL, cursor,
writer), `foldkit-remote-server` (registration and write checks),
`foldkit-guard` (rules in memory and SQL), `foldkit-remote` (matching,
placement, predictions), `foldkit-cms` (the first defined operator).
**Companions:** [data-query-DESIGN.md](./data-query-DESIGN.md) §6 (the kernel
and its rule for adding an operator), [query-logic-DESIGN.md](./query-logic-DESIGN.md)
(connectives, comparisons, collations),
[entity-invariant-DESIGN.md](./entity-invariant-DESIGN.md),
[write-increment-DESIGN.md](./write-increment-DESIGN.md) and
[write-improvement-PLAN.md](./write-improvement-PLAN.md) (the writes this plan
extends), [contract-layer-PLAN.md](./contract-layer-PLAN.md) (the graph and
catalog that read operator descriptions).

#185 asks for operators an application declares, with behaviour supplied
separately for each interpreter, so queries, Guard, invariants and declared
writes can say more without each growing a language. This plan checks that
request against the code and settles what it leaves open.

API names are proposals. Snippets are sketches, not compiled code.

## 0. Summary

| # | Question | Decision |
| --- | --- | --- |
| 1 | How it fits data-query §6.0 | The rule stands for every operator the kernel ships. An application's operator is held to it by a conformance helper. §3. |
| 2 | Callers | `Cms.published(entity)`, built from the role `foldkit-cms` already declares, is the first defined operator; it replaces five hand-written spellings. The registry's UPC search is the first primitive one (`startsWith`). Ordering by a call, laws, null-handling operators and computed assignments are built without a caller, by choice. §4. |
| 3 | Defined versus primitive | An operator is either defined by an expression over existing ones (no implementation anywhere) or primitive (an implementation per interpreter). §5.1, §5.3. |
| 4 | Effect evaluation versus Layers | Evaluation is a pure synchronous function taking a table of implementations, and every server here is built by plain functions, so tables are options. No Layer is added until something that reads one is built inside an Effect. §5.5. |
| 5 | Completeness | Checked per use site, against every interpreter the use runs in; the server needs a memory table as well as SQL for almost every use. A server that starts can answer every use. §5.6. |
| 6 | Null and case | Strict by default: a null operand gives null, a predicate over one is unknown. An operator may declare it handles null instead. Text compares only under a declared collation. §6. |
| 7 | Computed text | An operator may declare its result keeps its operands' collation; the rule becomes "text needs a collation", not "a field". §7. |
| 8 | Ordering | A call may be an order term when its result orders. Every interpreter orders by fields only today, so this rewrites the compiler's order terms and cursor, the evaluator's ordering and Remote's placement. §8. |
| 9 | Writes | A declared write may assign a field from an expression. One kernel function computes the row a write leaves, replacing three that disagree today. An assignment `field := op(field, amount)` may skip `expect` under a ledger only if `op` has tested laws saying order cannot matter; increments become that, so a real column's increment keeps its `expect`. §9. |
| 10 | Laws | Typed, with witnesses and a domain; evidence is per implementation; the one consumer that acts on them (§9.2) reads evidence, never a claim. §10. |
| 11 | Description | Every operator describes itself as JSON for the contract graph and catalog; ids are namespaced and versioned. §5.7. |

## 1. What exists

Every claim below was checked against the code on 2026-10-26.

**The kernel.**

- **Fixed nodes.** A scalar is `Literal`, `Field`, `Input` or `Next`
  (`packages/entity/src/expr.ts:64`); a predicate is `Eq`, `Null`,
  `Contains`, `In`, `And`, `Or`, `Not` or `Compare`. No node computes a scalar
  from others.
- **Operations are names.** `Operation` is a string union, and
  `Dependencies.operations` lists the ones a body uses (`expr.ts:333, 363`).
  `Query.unsupported(body, supported)` takes a whole query and a list of names.
- **Walkers are not all exhaustive.** `evaluate`'s `valueOf` is a `switch`
  returning `unknown`, so a missing case compiles and reads as null; the
  TanStack example's `predicate` returns `undefined` for an unknown node, and the
  condition is dropped. The Drizzle compiler's `undecided` (`compile.ts:305`)
  and LiveStore's interpreter fail loudly (a type error, a throw).

**Who evaluates bodies, and where.**

- **Bodies are shared code, built on both sides and never sent.**
  `Query.define` runs the body function wherever the module is imported, the
  client included (`packages/remote/src/query.ts:212-221`). A connection's
  identity is its name and encoded input (`query.ts:180`); nothing serialises a
  body; devtools print `Query.show(body)` (`remote/src/index.ts:3464`).
- **The server settles field-free predicates in memory.** The compiler's
  `decide` calls the entity's `decided` (`remote-drizzle/src/compile.ts:166-181`),
  so a query body on the server runs through the reference interpreter as well
  as SQL.
- **Remote's client** evaluates bodies in `matching`, synchronously, from
  `update` paths (`remote/src/index.ts:2756, 3561`). A row lacking a needed
  field, or holding a stale one, is `unknown` (`matching.ts:153-156, 224-240`).
  A `QueryEvaluateError` is handled per caller: `belongsEncoded` answers
  `unknown`; `filtered` answers `{ items: [], complete: false }`
  (`index.ts:3560-3566`); a live insert whose membership is `unknown` falls back
  to the query's declared live policy (`index.ts:2746-2763`); impact turns
  `unknown` into a refetch (`impact.ts:181-185`). `evaluate` judges all candidate
  rows in one call (`matching.ts:168`), so one refusal voids the whole answer.
- **`Remote.make`** takes `{ model, entities, queries, mutations,
  verifyPlacement }` (`index.ts:2101-2117`); nothing carries an operator table.

**Ordering.**

- `Order.asc` takes any operand and `OrderTerm.expr` is `AnyExpr`, but every
  interpreter refuses or skips a term that is not a field: the compiler
  (`compile.ts:479-483`), the evaluator (`checkOrder`, `byTerms`,
  `compareRows`, `evaluate.ts:274-341`), `Query.placement`'s `unplaceable`
  (`expr.ts:950-975`), and Remote's `placement.ts:48`.
- The Drizzle cursor's `OrderTerm` is `{ column: AnyColumn }`
  (`remote-drizzle/src/cursor.ts:34-41`), read by `cursorEquality`,
  `cursorCompare`, `orderByTerms` and `cursorSelection`, and public through
  `query({ orderBy })`. Order terms are compiled per request, not at
  registration (`index.ts:757`), whatever `compile.ts:428`'s comment says.

**Guard.**

- **Read row rules run in SQL** through `GuardDrizzle.visible`
  (`guard/src/drizzle.ts:307-311, 391-392`), which checks `Query.unsupported`
  at startup for Read rules only (`drizzle.ts:349-354`).
- **Every rule runs in memory** through `evaluate`: `Policy.decide`
  (`guard/src/index.ts:444-445`) and `Condition.holds` (`condition.ts:69`),
  which `GuardServer.filter`, `memory`, the writer's `require`, `mutation`,
  `mayOf` and `GuardSync.admit` all call (`server.ts:169, 221, 336, 621-622,
  842, 851, 1099-1136`; `sync.ts:235-252`). Rules on Update, Create, Delete,
  interactions, members and relations run only in memory, and nothing checks
  them at startup. `packages/agent*` never import Entity or Guard; Guard's
  `agent.ts` reads the `may` answers the server computed.
- **Guard inspects rules through `Query.dependencies` only**:
  `readsPrincipal`, `Condition.members`, `unsetting`, `membersRead` (for
  `guardFields` and placement's `ReadFilter`), and the hidden-member checks in
  `GuardServer.validate` and the writer's `discloses` (`condition.ts:89-127`,
  `attach.ts:404-512`, `server.ts:479-507, 941-982`). Each fails open if
  dependencies miss a field.
- **`GuardServer.validate` never asks `Query.unsupported`.**
- **Guard is built by plain functions** at module level: `G.implement(bodies)`
  (`index.ts:414`), `GuardServer.*`, `GuardDrizzle.visible`.

**Writes.**

- A `Write` holds `sets`, `increments`, `expect` and `when`
  (`entity/src/write.ts:46-71`); `BoundWrite` and the `EntityWriter.update`
  protocol carry `increments: Record<string, number>` (`write.ts:171`,
  `remote-server/src/index.ts:233-252`).
- **An increment without `expect` needs a ledger**, refused at registration
  (`remote-server/src/index.ts:1546`), per request without an operation id
  (`:1691`), and in the Drizzle writer (`remote-drizzle/src/index.ts:1362`).
  `GuardServer.writer` refuses an increment with neither `expect` nor a revision
  (`guard/src/server.ts:546-558`) and pins whenever there is a revision, so under
  Guard the ledger shortcut is never taken.
- **The row a write leaves is computed three ways:** Guard's writer as
  `Number(before[field]) + amount` (`guard/src/server.ts:607-617`); the Drizzle
  writer's `proposedOf`, which leaves a non-number unchanged
  (`remote-drizzle/src/index.ts:1086-1097`); SQL's `col + amount`
  (`index.ts:1186`), which is null for a null column. A nullable field cannot be
  incremented (write-increment §5), so they agree on every row the schema admits,
  but nothing makes them.
- **Retry detection assumes a write repeats without effect**, except increments
  (`holdsWritten`, `retried`, `index.ts:1193, 1434-1457`).
- **Remote predicts an increment at read time**: the patch stores plain
  `adds` (`remote/src/mutation.ts:31-33`, `model.ts:326`), and
  `resolvedPatches` adds them to the value the store holds as it is read
  (`optimistic.ts:203-230`).

**Invariants.**

- **The Drizzle writer judges them in SQL**, inside the update's `where`
  (`holdingInvariants`, `remote-drizzle/src/index.ts:1058-1083, 1339`), and emits
  them as CHECK constraints with parameters inlined (`invariantChecks`,
  `index.ts:900-919`). Memory judges only an insert and the explanation of a
  missed update (`index.ts:1106-1113, 1460, 1475`). `GuardServer.writer` passes
  them through to its writer (`guard/src/server.ts:629-630`).
- **Forms judge with `Entity.judgeInput`** (`form/src/index.ts:1179`), and
  `Undecided` passes. `Undecided` means a field is absent and holds `fields`
  (`invariant.ts:83`); a throw from `truthOver` is not caught. `Invariant.check`
  (a synchronous `Schema.makeFilter`) is used only in tests.

**Elsewhere.**

- **`foldkit-cms` declares "published" as a role**:
  `Cms.roles({ published })`, "present means a visitor may see the row"
  (`cms/src/index.ts:47-51, 335-355`). `cms-drizzle` checks the Read rule reads
  that field and uses its column (`cms-drizzle/src/index.ts:269-277, 362-364`).
  The example spells the predicate by hand five times: `RecentPosts`,
  `PublishedPages` (`examples/cms/src/content/domain.ts:122`, `pageDomain.ts:72`)
  and three Guard rules (`examples/cms/src/server/server.ts:63-65`).
- **Sync, Durable, Crud and Form build no Expr.** Sync reaches Guard's rules only
  through `GuardSync.admit`.
- **`foldkit-composition` has its own condition IR** (`composition/src/condition.ts`),
  which operators do not reach.
- **Every server piece is built by plain functions**: `RemoteServer.make`,
  `RemoteServer.memory` (`remote-server/src/index.ts:1093, 1801`),
  `bind`, `query`, `writer`, `source` (`remote-drizzle/src/bind.ts:240`,
  `index.ts:376, 671, 1033`). Startup checks run there, outside any Effect.

## 2. Invariants

What every phase keeps. Each is tested where its phase says.

1. **A descriptor holds no behaviour.** It is identity, schemas and declared
   semantics. A defined operator's `definedAs` builds an expression and never
   computes a value.
2. **Expressions are static data.** Every node, descriptor and expansion is
   frozen when made.
3. **A call reads only its arguments.** An implementation receives its
   arguments and nothing else; a defined operator's expansion reads only what
   its arguments read. So a call's dependencies are its arguments', and every
   check built on `Query.dependencies` (Guard's hidden-member and principal
   checks, Remote's matching and impact) sees through calls.
4. **Every interpreter agrees or refuses.** An interpreter that answers gives
   the reference interpreter's answer for the same rows and input, failures
   included. One that cannot refuses by the operator's id. No interpreter drops
   a node it does not know, skips a condition, or post-filters.
5. **Null is strict unless declared.** Under the default, a null argument gives
   null (unknown for a predicate) and the implementation is never called with
   one. An operator declaring `nulls: 'handled'` receives nulls.
6. **Values are encoded.** Arguments and results are the stored form.
7. **Text compares and orders only under a declared collation**, `binary` or
   `asciiFold`, from a field or a call that keeps its operands'.
8. **Evaluation is pure and synchronous.** No Effect per evaluation, no lookup
   per node, no I/O, clock or randomness in any implementation.
9. **Tables are values.** One per interpreter, immutable, passed explicitly,
   with no global registry; a second implementation of one operator is refused
   unless replaced explicitly.
10. **A server that starts can answer every use.** Completeness is checked where
    each use is assembled, against every interpreter that use runs in, memory
    included.
11. **A law is a claim until tested for an implementation**, and nothing that
    decides what is written or who may read acts on a claim.
12. **Existing meaning is kept.** Every existing constructor, node and
    interpreter answers as it does today; `contains` keeps its ASCII folding.
13. **Work is bounded.** A call and its expansion count toward `maxQueryNodes`,
    each argument on each path.
14. **Identity is the descriptor.** Ids are namespaced, `foldkit.` is reserved,
    and an id with a version names one operator in any table.
15. **The row a write leaves is computed once.** Guard, the writer and Remote's
    prediction compute it with the same kernel function and memory table, and
    SQL is tested against it.

## 3. Reconciling with data-query §6.0 and query-logic

Data-query §6.0 says an operator is portable only once its semantics are stated
in terms an interpreter is held to, and §6.0.2 adds one in four steps: state its
semantics, name the real query that needs it, build the reference interpreter
first, add differential cases for the disagreements the backends would have.

- **An operator the kernel ships** follows §6.0.2, except that building without
  a caller is allowed where this plan says so (§4). Its semantics go into
  data-query §6.0.1's table and its cases into `foldkit-entity/conformance`.
- **An operator an application declares** states its semantics in its
  descriptor, and the conformance helper (§10.4) runs its cases through every
  implementation the application supplies, comparing results and failures. The
  README says an operator without those cases is unchecked.
- **A defined operator** has no semantics of its own: its meaning is its body's.

From query-logic, kept: no rewriting; three-valued predicates, which an operator
returning a boolean joins; per-request settling of what reads no field, now
including calls, through the memory table on the server; text compared only
under a declared collation, generalised in §7.

What changes in data-query: §6's kernel gains one scalar node and one predicate
node; §6.0.1 gains a row per shipped operator; §6.3's dependencies gain an
`operators` list beside `operations`; §7's `Rule` is built, as a defined
operator.

## 4. Callers

- **Defined operator: `Cms.published(entity)`.** `foldkit-cms` already declares
  which field means published (`Cms.roles({ published })`), and the example
  re-spells the predicate in two queries and three Guard rules. `Cms.published`
  applies a `cms.published` operator, `definedAs: at => Expr.isNotNull(at)`, to
  the role's field, so the meaning lives in the package that owns the role.
  `cms-drizzle`'s check that the Read rule reads the role's field keeps working,
  because dependencies see through the call.
- **Primitive operator: `startsWith`.** The registry's search
  (`examples/registry/src/operations.ts`) matches a UPC with `contains`, so a
  search for `012` finds every code holding `012` anywhere. A UPC is typed from
  its start:

  ```ts
  Expr.or(
    Expr.contains(fields.description, input.search),
    Text.startsWith(fields.upc, input.search),
  )
  ```

  It is declared, implemented and compiled through the public APIs, so the kernel
  names nothing of its own.
- **Built without a caller:** ordering by a call (§8), `nulls: 'handled'`
  (§6.1), laws and evidence (§10), computed and commuting assignments (§9), the
  catalog (§5.7). Each is specified enough to test, and each phase says what
  proves it.
- **`concat`** is the README's example of an application operator, with laws;
  §6.3 states its semantics. It is not shipped by the kernel.

## 5. The design

### 5.1 An operator is a descriptor

```ts
const startsWith = Expr.operator('text.startsWith', {
  version: 1,
  input: [Schema.String, Schema.String],
  output: Schema.Boolean,
  description: 'Whether the first text begins with the second, under its collation.',
})
```

| Member | Meaning |
| --- | --- |
| `id` | Namespaced (`text.startsWith`, `acme.slugOf`), checked by a pattern; `foldkit.` is reserved. |
| `version` | A positive integer, default 1. A change of meaning is a new version, and so a new operator. |
| `input` | One Schema per argument, read as the stored form (§6.1). |
| `output` | A Schema. `Schema.Boolean` makes a predicate (§5.2). |
| `nulls` | `'strict'` (default) or `'handled'` (§6.1). |
| `collation` | `'none'` (default) or `'operands'`, for a text output (§7). |
| `laws` | Typed law descriptors (§10). |
| `definedAs` | A function of the arguments returning an expression: a defined operator (§5.3). Absent for a primitive one. |
| `description` | One sentence, for the catalog and errors. |

- **Identity is the descriptor object.** Two descriptors with one `id@version`
  in one table are refused as ambiguous. A descriptor is frozen.
- **Arguments are checked by their stored form, at compile time and at run
  time.** The type takes a field whose schema's encoded side is the input's
  stored type (`ArgumentOf`), and a call reads each argument's encoded AST as
  `Expr.lt` does. Built so because a role's field is an `Option` in code and
  `string | null` stored: checking `Type` would refuse the field the operator
  is for.
- **Untyped callers are checked.** `Expr.operator` throws for a bad id, a
  non-Schema member, `collation: 'operands'` on a non-text output, or a law
  whose witnesses do not fit (§10.1); a call throws for a wrong arity or an
  operand of the wrong stored kind.
- **Descriptors ship to the client.** Bodies are built on both sides (§1), so
  every descriptor a body uses is in the client bundle, and a defined operator's
  `definedAs` runs there. A descriptor imports only `effect` and
  `foldkit-entity`.

### 5.2 Nodes

```text
Call  (scalar):    { _tag: 'Call', operator, args, expansion, collation }
Test  (predicate): { _tag: 'Test', operator, args, expansion }
```

Two tags, so `isPredicate` and every exhaustive match tell them apart without
reading a field. `expansion` is `Option.some(body)` for a defined operator and
`Option.none()` for a primitive one.

**Every walker becomes an exhaustive match first** (Phase 1), then gains both
cases: `fieldsIn`, `childrenOf`, `walk`, `showExpr`, ownership, the budget,
`sideKind`, `readsAField`/`decided`, `valueOf`/`holds`, `checkOrder`,
`byTerms`, `compareRows`, `unplaceable`, `orderFor`'s `endsOnId`; the
compiler's `operand`, `undecided` and `compileOrderBy`; Remote's
`placement.ts` `keysOf`; and the TanStack and LiveStore interpreters.

- **Dependencies walk the arguments** (invariant 3).
- **Ownership walks them too**: `ReadsOf` of a call is the union of its
  arguments'.
- **`Dependencies` gains `operators`**, each `{ id, version }` a body uses,
  primitive or defined, beside `operations`, which keeps its kernel names.
  Remote's `ExplainedDependencies` copies it.
- **`Query.show` prints the call**, never an expansion.

### 5.3 Defined operators

gen2 lets an operation's implementation be an expression over other operations
and makes a named boolean expression, its `Rule`, first-class. Data-query §7
expected the same `Rule` and never built it.

```ts
const published = Expr.operator('cms.published', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
  definedAs: publishedAt => Expr.isNotNull(publishedAt),
})
```

- **The body is built per call from the real operands** and stored as the
  node's expansion, so every construction check runs against the real fields.
- **It reads only its arguments**: a body that closes over a field or input is
  refused at call time, by comparing the expansion's fields and inputs with its
  arguments'.
- **Interpreters walk the expansion**: every case for a defined `Call` or `Test`
  delegates to it, so a defined operator is supported wherever its body is, with
  no table entry. `Query.unsupported` reads through it.
- **An interpreter may supply its own implementation**; the expansion is then the
  reference it is tested against (§10.4), and the table's entry wins there.
- **Its output schema is checked against the body's** at call time.
- **It may take inputs**: a "published" that also means "not in the future"
  takes the time, `published(at, input.now)`. The kernel has no clock.

### 5.4 Implementations

```ts
// foldkit-entity: in memory
const memory = Operators.memory(
  Operators.implement(startsWith, (text, prefix) => text.startsWith(prefix)),
)

// foldkit-remote-drizzle: SQL
const sql = DrizzleOperators.make(
  DrizzleOperators.implement(startsWith, ({ args: [text, prefix], collate, dialect }) =>
    /* the prefix comparison of §6.2, for this dialect */,
  ),
)
```

- **A table is an immutable value** keyed by descriptor. `Operators.memory(…)`
  refuses two implementations of one operator; `Operators.merge(a, b)` refuses an
  overlap; `Operators.override(table, …)` is the explicit replacement.
- **`Operators.kernel` and `DrizzleOperators.kernel`** hold the kernel's
  primitive operators and are every interpreter's default; an application extends
  them with `merge`.
- **A memory implementation is a pure synchronous function** over stored values;
  under `nulls: 'strict'` it never sees null; it may not return an Effect.
- **A SQL implementation builds Drizzle `SQL`** from its compiled arguments, with
  the dialect and a `collate` helper (§7), and adds no parameter of its own: a
  value it needs is an argument or a SQL literal. That is all a CHECK constraint
  needs, because `invariantChecks` already inlines every parameter of the
  compiled condition and refuses the constraint if any is left
  (`remote-drizzle/src/index.ts:900-919`); Phase 0 found both dialects take an
  inlined call and refuse a parameter (§17). No "inlinable" flag is needed.
- **The compiler builds scalar SQL.** Today `operand` returns a column or a value
  and `comparison` assumes a column on its left (`compile.ts:84-102, 251-282`).
  Phase 3 adds a scalar compiler: a field is its column, a call its
  implementation's SQL, and a literal or input a parameter. **On Postgres, a
  parameter whose stored kind is not text is cast to its SQL type**
  (`cast($1 as integer)`, `double precision`, `boolean`): Postgres resolves an
  untyped parameter as text, so `$1 || $2` works but `$1 + $2` is refused as
  "operator is not unique" (§17). Text parameters need no cast. SQLite takes no
  cast, since its `cast(? as integer)` would truncate `0.5` to `0` silently.
  Comparisons, `contains`, `in` and order terms take any scalar.
- **Nothing translates a JavaScript function into SQL.**

### 5.5 Where tables are passed

#185 sketches `Expr.evaluate(expression)` as an Effect needing an interpreter
service. Every caller of the evaluator is synchronous (Remote's matching from
`update`, Guard's `Condition.holds`, a form's `judgeInput`), and every server
piece is built by plain functions at module level (§1). So a table is an
argument, and each constructor that builds an interpreter takes one:

| Where | Option | Holds |
| --- | --- | --- |
| `evaluate(body, input, rows, { operators })`, `decided`, `truthOver`, `Entity.judge`, `Entity.judgeInput`, `Invariant.check` | `operators` | memory |
| `Condition.holds(condition, row, input, inherited, operators)` | a new parameter (breaking) | memory |
| `G.implement(bodies, { operators })` | `operators` | memory; every Guard memory site already holds the policy |
| `bind(Domain, storage, { operators })` (`foldkit-remote-drizzle`) | `operators: { memory, sql }` | both, kept on the binding as `invariants` are; read by `query`, `writer`, `source`, `GuardDrizzle.visible` |
| `RemoteServer.memory({ …, operators })` | `operators` | memory |
| `Remote.make({ …, operators })` | `operators` | memory; passed to `matching`, `belongsEncoded`, `placeIn`, `impactOn`, `placeableReadContract`, `resolvedPatches`, `visibleStore` |
| `Form` built from an Entity | `operators` | memory, for `judgeInput` |

Each defaults to the kernel's table. **No Layer is added.** Nothing here reads a
service where a table is needed, and a Layer that only wraps an option would be
a second way to pass the same value. If a server piece is later built inside an
Effect (contract-layer Phase 1 may move some), a Layer that provides the table
is added there, reading the same value.

### 5.6 Completeness per use site

gen2 checks an expression by where it runs; here, by where it is used.

| Use | Interpreters | Checked | Missing means |
| --- | --- | --- | --- |
| A query body a server serves | SQL and memory on the server (memory settles field-free predicates); memory in Remote's client | registration (`checkFields`), both tables | the server does not start |
| … on the client | memory | `Remote.make`, which can name each query a client table cannot judge | `filtered` answers incomplete, a live insert takes the declared policy, impact refetches (§1) |
| A Guard Read row rule | SQL (`visible`) and memory (`decide`, `holds`) | `GuardDrizzle.visible` (SQL), `GuardServer.validate` (memory) | the server does not start |
| Any other Guard rule (Update, Create, Delete, interactions, members, relations) | memory only | `GuardServer.validate`, newly asking for every attached rule | the server does not start |
| A rule over Sync edits | memory (`GuardSync.admit`) | `GuardServer.validate`, through the policy | the server does not start |
| A declared write's `when` | SQL (the statement) and memory (the explanation of a miss) | `RemoteServer.write` registration, both tables | the server does not start |
| A computed assignment (§9) | SQL (`set`, and `holdingInvariants`' `next`) and memory (the row a write leaves) on the server; memory on the client | registration, both tables; `Remote.make` for the client | the server does not start; the client shows no prediction for that field |
| An invariant | SQL (the update's `where`, CHECK constraints, inlined) and memory (inserts, explanations, forms) | `bind` (where invariants compile today), both tables | the server does not start; in a form, `Undecided` |
| An order term (§8) | SQL and memory on the server; memory for client placement | registration, over every `Order.chosen` alternative (new: today only per request) | the server does not start; the client does not place by it |

- **`Expr.unsupported(node, table)`** takes any predicate, scalar, order term or
  write and names every kernel operation and primitive operator the table lacks,
  reading through expansions. `Query.unsupported` keeps its signature and calls it.
- **The message names** the operator with its version, the query, rule, write or
  invariant, and the interpreter.
- **A form is the one place a gap is not an error.** `judgeAgainst` catches the
  missing-operator error and answers `Undecided` with a new member:
  `{ _tag: 'Undecided', fields, operators }`, so a form passes it as it passes an
  absent field, and the Drizzle insert, which reads `Undecided` as "a field the
  insert does not set" (`remote-drizzle/src/index.ts:1481-1484`), refuses one
  with `operators` instead. A server's table is complete by the checks above, so
  that refusal is a bug, not a policy.
- **The type does not carry requirements** (§11).

### 5.7 Description and versions

```text
Operators.describe(operator) ->
  { id, version, description, input: [JSON Schema], output: JSON Schema,
    nulls, collation, laws: [{ kind, witnesses, domain }], defined: boolean }
Operators.describeTable(table) -> the operators it implements, by id@version, with evidence
Query.operators(body) -> each operator a body uses, by id@version
```

- JSON Schemas come from `Schema.toJsonSchemaDocument` of each encoded side.
- A defined operator is described by its signature, not its body (§15
  question 5).
- `version` is part of identity. A table built for `text.startsWith@1` does not
  answer a body using `@2`; the refusal names both.
- **Version skew.** A client and a server on different deploys build bodies from
  different code. A client whose table lacks the server's version refetches
  rather than matches, which is safe; a client with an older body than the
  server's is the same skew every shared body has today, and not new here.

## 6. Semantics

### 6.1 Rules every operator keeps

- **Null.** `nulls: 'strict'`: any null argument gives null, or unknown for a
  predicate, checked by the kernel before calling the memory implementation; SQL's
  operators and functions already give null, and the helper checks they do.
  `nulls: 'handled'`: the implementation receives nulls, its input schemas must
  admit them, and a predicate may return `null` for unknown; the SQL
  implementation must agree, tested with a null in each position.
- **Missing is not null, and is not the operator's.** Callers check before
  evaluating (§1); dependencies reach fields under calls.
- **Encoded in, encoded out.** A memory result is checked against the output's
  encoded schema by the helper and under `Operators.memory(…, { checked: true })`,
  meant for tests.
- **NUL is refused** before any implementation runs, as every kernel operation
  refuses it (`holdsNul`).
- **Total over the input schema.** An implementation that throws is reported as a
  `QueryEvaluateError` naming the operator. A partial operator narrows its input
  schema instead (§11).

### 6.2 `startsWith(text, prefix)`

| Case | Answer |
| --- | --- |
| either is null | unknown |
| prefix is `''` | true |
| otherwise | whether `text` begins with `prefix` under the call's collation |

- **It compares under a collation, like `Expr.lt`**: one passed, or the text
  operand's. `binary` compares exactly, `asciiFold` folds ASCII letters on both
  sides. No collation, or a `Locale`, is refused where written.
- **`contains` keeps folding always** (invariant 12).
- **Characters, not bytes or code units.** In memory, `text.startsWith(prefix)`,
  after folding when folded. In SQL, the first `length(prefix)` characters equal
  `prefix` under the collation: `substr(text, 1, length(prefix))` on SQLite,
  `left(text, length(prefix))` on Postgres, each side collated by §7's rule.
- **Not `like 'p%'`**, which needs `%` and `_` escaped and folds case on SQLite
  whatever the collation. Index use is §15 question 1.

### 6.3 `concat(a, b)`, the README's application operator

| Case | Answer |
| --- | --- |
| either is null | null |
| otherwise | `a` followed by `b` |

SQL's `||`, not Postgres's `concat()`, which reads null as `''`. Text only,
`collation: 'operands'`, associative with `''` as both identities, not
commutative, not idempotent.

## 7. Collation of computed text

`Expr.lt` over text needs a field on one side (`collationFor`, `expr.ts`), and an
order term takes its collation only from a field, so a call's text is refused.

- **The rule becomes "text needs a collation."** A text operand has one when it
  is a field or `Next` that declares one, or a call whose operator keeps its
  operands'.
- **`collation: 'operands'`** gives the call the collation its collated operands
  share. Literals and inputs do not vote; operands that disagree are refused; with
  none collated the call has none.
- **It is a law**, `Law.preservesCollation` (§10.1), tested with mixed-case cases.
- **A defined operator's text** has its expansion's collation.
- **Compiling a collated call.** `collatedColumn` reads a column's `columnType`
  on Postgres (`cursor.ts:58-90`); a call has none. The `collate` helper applies
  the rule by collation alone: under `binary`, `collate binary` on SQLite and
  `collate "C"` on Postgres; under `asciiFold`, `collate nocase` on SQLite and
  `lower(x collate "C")` on Postgres.

## 8. Ordering by a call

- **A call orders when its result does**: a number, or text with a collation.
  Otherwise the term is refused where written.
- **The evaluator** orders by evaluating the call per row: `checkOrder`,
  `byTerms` and `compareRows` take the memory table and any scalar term.
- **The compiler and cursor.** The cursor's `OrderTerm` changes from
  `{ column }` to `{ key: SQL, alias }`, selected under the alias so the cursor can
  read the value back; `cursorEquality`, `cursorCompare`, `orderByTerms`,
  `cursorSelection` and their callers read the key. Values read back for a call
  have no column codec; they decode with the call's output schema. The public
  `query({ orderBy })` changes with it (breaking).
- **Checked at registration**, over every `Order.chosen` alternative, against
  both tables (new: today order terms compile per request).
- **Placement.** `Query.placement(body, input, { operators })` and Remote's
  `keysOf` collect a call term's dependency fields instead of `term.expr.key`;
  a term is placeable when the client's table implements every primitive operator
  in it and its collation is `binary` or `asciiFold`, and otherwise not, with a
  reason naming the operator (today's reason, "lacks a field the order reads", is
  wrong for a call). `impactOn` already treats a change to any field the order
  reads as possibly reordering (`impact.ts:169`), so it needs no change.
- **`verifyPlacement`** (`Remote.make`, for development and tests) fetches each
  list the client placed in and records any disagreement with the server's first
  page in `placementMismatches`, which also catches a call whose two
  implementations order differently.
- **No index is promised**; the README says to index the expression.

## 9. Writes: computed and commuting assignments

#182 asked for computed assignments; write-improvement §3 deferred them "until a
use case". They are specified here, built without a caller.

### 9.1 One function for the row a write leaves

Three computations of the row after an increment exist today (§1). Before any
assignment is added:

- **`Write.apply(row, bound, { operators })`** in `foldkit-entity` computes the
  row a bound write leaves, with strict null, from the memory table. Guard's
  writer (`guard/src/server.ts:607-617`), the Drizzle writer's `proposedOf`
  (`remote-drizzle/src/index.ts:1086-1097`) and Remote's `resolvedPatches` use
  it. This lands in Phase 6's first commit, with no behaviour change on any row
  the schemas admit, and a test with a null column that pins the strict answer.

### 9.2 Computed assignments

```ts
Write.update(PostInput, {
  id: 'id',
  compute: { label: post => Text.concat(post.title, ' draft') },
})
```

- **An assignment reads the row before the write and the input**, as `when`
  does; it may not read `Next`, so assignments never depend on each other.
- **The protocol carries assignments.** `BoundWrite` and `EntityWriter.update`
  gain `assignments`, each a field, its operator call and its encoded arguments,
  beside `increments` until §9.3 folds those in (breaking).
- **SQL**: the compiled call in the `set` clause, and in `holdingInvariants`'
  `next` map, where an increment already becomes `col + amount`.
- **Memory**: `Write.apply`, so Guard's rules after the write judge what is
  written; Guard's `fieldsOf` adds the fields assignments read.
- **Answer**: computed fields join `answeredFields`, and are read back through
  the writer's `read` where the binding has `visible`.
- **Disclosure**: `discloses` and `writeProblems` read `Write.reads`, which gains
  assignments' fields, so an assignment over a hidden member is refused at
  startup as a `when` over one is.
- **Retry**: a computed assignment does not repeat without effect, so
  `holdsWritten` and `retried` treat it as they treat an increment.
- **Remote predicts at read time.** The pending patch stores the assignment as
  plain data (the operator's `id@version` and encoded arguments), never a
  descriptor, since it travels in a Message; `resolvedPatches` resolves it against
  the client's table over the row as it is read, as `adds` re-bases now. Without
  the operator, or a field the expression reads, it shows no prediction for that
  field.

### 9.3 Commuting assignments

An increment is `field := field + amount`, and a ledgered writer without a
revision pin lets it skip `expect`, because concurrent increments are meant to
land in any order with one result. That is a law, held for integers and not for
reals: `(x + a) + b` and `(x + b) + a` can differ by rounding.

- **An assignment `field := op(field, amount)`**, where `amount` reads only the
  input, may skip `expect` under a ledger only if `op` has `Law.commutative` and
  `Law.associative` **tested** (§10.3) for both the memory and the SQL
  implementation in use, over the field's stored domain.
- **Checked where the ledger is known**: at `RemoteServer.write` registration
  (`remote-server/src/index.ts:1546`), per request (`:1691`) and in the Drizzle
  writer (`remote-drizzle/src/index.ts:1362`), the three places today's rule
  lives. `Write.update` cannot check it, since it does not know the writer.
- **Increments become this.** `increment: { stock: 'quantity' }` stays as sugar
  for `number.addInteger` (an integer field) or `number.addReal` (a real one).
  The first ships with both laws tested over safe integers (§15 question 9); the
  second with commutativity tested and associativity not declared, so a real
  column's increment keeps its `expect` (breaking; changelog and write-increment
  §5 say so).
- **An integer field's amount must be an integer.** `number.addInteger`'s input
  is `Schema.Int`, so an increment of an integer field by an amount the schema
  lets be fractional is refused where declared. Today it is accepted
  (`incrementOf` checks only that both are stored as numbers, `write.ts:274-306`),
  and the two dialects split on it: Postgres refuses `2 + 0.5` into an `integer`
  column, SQLite stores `2.5` in it, a value the field's `Int` schema does not
  admit (§17). Fixed on its own, ahead of this plan (§17).
- **Under `GuardServer.writer` nothing changes**: it pins whenever there is a
  revision and refuses an unpinned increment without `expect`
  (`guard/src/server.ts:546-558`), because its rules judge a sum over the row it
  read. The law matters for ledgered writers without Guard.
- **Remote's prediction** applies pending assignments in their order through
  `Write.apply`, re-based on the stored value as `adds` is now.

## 10. Laws and evidence

### 10.1 Law descriptors

| Law | Witnesses | Holds when |
| --- | --- | --- |
| `Law.associative` | none | `op(op(a, b), c) = op(a, op(b, c))` |
| `Law.commutative` | none | `op(a, b) = op(b, a)` |
| `Law.idempotent` | none | `op(a, a) = a` |
| `Law.identity(value, side)` | the identity, `'left' \| 'right' \| 'both'` | `op(e, a) = a` and/or `op(a, e) = a` |
| `Law.absorbing(value, side)` | the absorbing value | `op(z, a) = z` and/or `op(a, z) = z` |
| `Law.inverse(other, identity)` | the inverse operator and the identity | `op(a, other(a)) = identity` |
| `Law.distributes(over)` | the other operator | `op(a, over(b, c)) = over(op(a, b), op(a, c))` |
| `Law.monotonic(direction, position)` | `'increasing' \| 'decreasing'`, the argument | `a ≤ b` implies `op(…a…) ≤ op(…b…)` |
| `Law.preservesCollation` | none | folding the result equals folding the arguments (§7) |

- **Each law states its domain**: by default the non-null values of the input
  schemas, under the call's collation, compared by equality of encoded values; a
  law may narrow it with a Schema and name another equivalence.
- **Witnesses are checked at declaration.**
- **Under strict null** both sides of every law are null when any argument is, so
  no law needs a null case.
- **Laws describe; they do not change answers.** Nothing rewrites by one.

### 10.2 What not to declare

Floating-point addition is not associative though real addition is; a
bounded-text type is not closed under `concat`; idempotence of an operator is not
retry safety of a write, which is the ledger's.

### 10.3 Evidence

```text
claimed   the descriptor says so
tested    an implementation passed the helper's cases: { law, operator, implementation, cases, seed }
proven    a reference to a proof artifact with its assumptions; recorded, never verified here
```

Evidence belongs to an implementation, recorded in its table
(`Operators.withEvidence(table, results)`) and described by `describeTable`.
`proven` is never read as verified; §9.3 requires `tested`.

### 10.4 The conformance helper

`foldkit-entity/conformance` gains:

- **`Conformance.operator(op, { implementations, cases })`**: each case through
  every implementation given (memory, and SQL over a real database), comparing
  results and failures. For a defined operator the expansion is one of them.
- **Generated cases** for strict null, NUL, the empty string, mixed case under
  each collation, non-ASCII and astral text, a CHECK constraint built from the
  call, a null key under keyset paging, and each law's equation over its domain.
- **`Conformance.laws(op, implementation)`** returns evidence records or the
  counterexample.
- The kernel's operators run it in `foldkit-entity`'s and
  `foldkit-remote-drizzle`'s suites on SQLite and, where it runs, Postgres.

## 11. Non-goals

- **Partial operators**: their SQL would have to fail on exactly the values the
  memory implementation refuses, which no implementation here can promise.
  Narrow the input schema instead.
- **Effectful operators**, or any reading a clock, randomness, a service or the
  network.
- **Sending bodies**: bodies are shared code (§1); descriptors are described
  (§5.7), not shipped as data.
- **Type-level completeness.** A body's operators would become a parameter of
  `Query`, `Write` and every interpreter, and an Effect requirement would not
  prove per-operator coverage; the startup checks are the guarantee.
- **Rewriting by laws.**
- **Moving existing nodes onto descriptors**, unless it deletes code.
- **`foldkit-composition`'s condition IR**, which stays its own.
- **Plain-code checks of the same fact** (the CMS site's `publishedAt` tests in
  `siteApp.ts:169`, `prerender.ts:189`): an operator reaches expressions, not
  JavaScript.

## 12. Phases

Each phase is one change in its owning package, with tests shown to fail by a
mutation spec, the docs and skill references in step, and the changelog.

0. **Probes.** **Done, 2026-10-26** (§17). Postgres with untyped parameters on
   each side of `||`, the prefix comparison and an ordering by an expression;
   keyset paging over an expression with ties and null keys on both dialects;
   CHECK constraints built from calls; where tables can be read. One probe is
   left for Phase 3: the same cases on a Postgres database created in a locale
   (§15 question 11, run 2026-10-26: §17).
1. **Exhaustive walkers, nodes and defined operators** (`foldkit-entity`,
   `foldkit-remote-drizzle`, `foldkit-remote`, the two examples, `foldkit-cms`).
   First, each walker §5.2 lists becomes an exhaustive match, with no behaviour
   change. Then `Expr.operator` with `definedAs`, `Call` and `Test` with their
   expansion and every case, ownership, the budget, `ReadsOf`,
   `Dependencies.operators`, `Query.show`, run-time validation, the capture check.
   `Cms.published` replaces the five spellings. *Done when* those five compile to
   the SQL they did before (asserted); `cms-drizzle`'s Read-rule check passes
   through the call; type tests refuse a call over another Entity's field, a wrong
   operand and a wrong arity; a `Test` needs no cast in `Expr.and`; dependencies
   list a field under a call under an `or`, and Guard's hidden-member check refuses
   a `when` reading a hidden member through a call; a capturing body is refused;
   the TanStack example refuses, not drops, a node it does not know.

   **Built**, 2026-10-26 (`d456c64a` for the walkers, then the operator commit).
   Where it departed from the sketch:
   - **Interpreters inline rather than walk.** The compiler and both examples
     call `Expr.expanded` at their entry, so `isColumn`, the comparisons and
     LiveStore's `Eq`-only check see exactly the nodes they see today;
     `evaluate` steps into the expansion in place, with no rebuild on the
     per-row path. A call left after expansion (a primitive operator, Phase 2)
     is refused by name in each.
   - **`walk` reads the expansion, or the arguments when there is none**, since
     the capture check makes the arguments' reads redundant beside it; ownership
     (`fieldsIn`) reads the arguments, the stricter rule, matching `ReadsOf`.
   - **`Dependencies.operators` holds descriptors**; Remote's
     `ExplainedDependencies` holds `{ id, version }`, since it must serialise.
   - **`definedAs` is required.** A primitive operator, and the `collation` a
     call carries (§7), come with Phase 2, where something reads them.
   - **The SQL is asserted through the mechanism**: a defined operator compiles to
     the SQL of its body written out (`remote-drizzle/test/compile.test.ts`), and
     `Cms.published(X)` expands to `isNotNull` of the role's field
     (`cms/test/cms.test.ts`). `Cms.published` reads the role, not a field the
     caller names (§1's finding). The CMS example's suites, `cms-drizzle`'s
     Read-rule check included, pass unchanged.
   - **The conformance suite gained operator cases**, so the reference
     evaluator, Drizzle on SQLite and Postgres, the in-memory server, TanStack
     and LiveStore each run them. LiveStore picks its cases by compiling them, so
     its expansion has a test of its own rather than a mutation.
2. **Memory tables, `startsWith`, collations and null** (`foldkit-entity`,
   `foldkit-form`, `foldkit-guard`). `Operators`, every memory site of §5.5's
   table, strict and handled null, NUL, the collation rule and
   `collation: 'operands'`, `Expr.unsupported`, the new `Undecided` member,
   `startsWith` and its row in data-query §6.0.1. *Done when* §10.4's cases pass in
   memory for `startsWith` and a test-only handled-null operator; a duplicate
   implementation and an unknown version are refused; a form with an invariant
   whose operator its table lacks answers `Undecided`; `GuardServer.validate`
   refuses a server whose Update rule needs an operator the policy's table lacks.

   **Built**, 2026-10-26 (`5d52bcfe` for the kernel, then the memory sites).
   Where it departed from the sketch:
   - **A third collation rule, `required`.** §7 had `none` and `operands`, and
     §6.2 made `startsWith` compare under its text's collation as a special case.
     `required` is that case as a rule: the call carries its operands'
     collation, and text with none, or a locale, is refused where written.
   - **"One passed" is a trailing `{ collation }`.** A call of an operator whose
     rule is `operands` or `required` may take one argument past its inputs,
     told apart by count, as `Expr.lt(…, { collation })` and `Order.asc` take
     theirs; a defined operator, or one with rule `none`, refuses it.
   - **Two implementing functions.** `Operators.implement` types its arguments
     non-null and takes only a strict operator; `implementHandlingNulls` takes
     only a `handled` one. The types then say what the kernel does.
   - **`Text` is exported from the package's main entry**, beside `Operators`,
     not a subpath (§15 question 3 stays open for when there are several).
   - **`Collation.foldAscii`** is public, so an application implementing an
     `asciiFold` operator folds exactly as the kernel does.
   - **`OperatorMissingError`** (a `QueryEvaluateError`) is how a judge tells a
     missing operator, which it reads as `Undecided`, from any other refusal,
     which still fails.
   - **The conformance cases for `startsWith` are their own export**
     (`primitiveCases`, `primitiveRefusals`), so an interpreter runs them once
     it implements the operator: the reference interpreter and Remote's client
     now, Drizzle in Phase 3. The handled-null rule is tested in
     `primitive.test.ts`, not as a conformance case, since no kernel operator
     handles null.
   - **`Remote.make({ operators })` was built here**, with the other memory
     sites; `bind`'s table is Phase 3's.
   - **An order term takes no collation from a call yet.** Nothing reads one
     until Phase 4, so that line waits for it.
   - **Not yet tested, though passed through:** a nested form inheriting its
     parent's table. A mutation dropping it would survive. (The live insert's
     membership and change impact were reached by Phase 3's client tests.)
3. **SQL and completeness** (`foldkit-remote-drizzle`, `foldkit-remote-server`,
   `foldkit-guard`, `foldkit-remote`). `DrizzleOperators`, the scalar compiler,
   inlining, the casts Phase 0 found, `bind`'s and `Remote.make`'s tables, every
   check in §5.6. *Done when* the conformance suite passes on SQLite (and Postgres
   where it runs); a server whose query, Read rule, `when` or invariant needs a
   missing operator does not start and names it; the registry's search uses
   `startsWith`, `012` no longer finds a code holding it mid-way, and editing a UPC
   moves its row into and out of the list on the client.

   **Built**, 2026-10-26 (`90539534` for the compiler, `749a85f0` for the
   checks, `cbf78979` for the registry, then the tests and the update's fix).
   Where it departed from the sketch:
   - **`requireOperators` checks both tables.** A query, an invariant or a
     `when` the SQL table runs can still need the memory table (a predicate over
     the input alone, a miss explained, an insert judged), so each is refused
     where it is registered by whichever table lacks it, SQL first.
     `operatorProblems` is the same check as sentences, for `EntityWriter.refuses`.
   - **`GuardDrizzle.visible` takes `{ operators }`**, the SQL table alone,
     because it is built before `bind` and cannot read the binding's.
   - **A call is a column to the compiler.** A comparison whose side is a call
     compiles it, under the collation the call carries, as a column under its
     own; a call over literals and inputs alone is decided in memory, as any
     predicate over the input is.
   - **Casts by stored kind, on Postgres only.** A literal or input argument is
     cast by the operator's input schema (`integer` where it holds integers,
     `SchemaShape.holdsIntegers`; `double precision`; `boolean`); text takes
     none, and SQLite none at all, since its cast would drop a fraction.
   - **The update's invariant target carried no operators.** It was built by
     hand beside the binding, so a value set leaving a call over literals was
     decided by the kernel and refused. Found by the writer test the mutation
     spec asked for; the target now carries `binding.operators`.
   - **The registry edits no UPC** (`editedColumns` is description, price, line
     and status), so "editing a UPC moves its row" cannot be shown there. The
     client half is shown in `packages/remote/test/operators.test.ts`: a write's
     answer, a pending edit, a live insert and a changed row each judged by
     `Remote.make`'s table, and handed to the server without it.
   - **Left open:** §15 question 10 (judging candidates per row) and question 11
     (the locale Postgres probe) were proposed for this phase and not done.
4. **Ordering by a call.** §8 whole. *Done when* a list ordered by a call pages
   identically in memory and SQL across a page boundary with ties; an order term
   needing a missing operator stops registration; placement is refused with a
   reason naming the operator; a text call without a collation is refused as a
   term; `verifyPlacement` passes over a call-ordered list.

   **Built**, 2026-10-26 (`9aaeef50` for memory and placement, `378dc125` for
   SQL). Where it departed from the sketch:
   - **A call term is checked where it is written.** `Order.asc`, `Order.desc`
     and each `Order.chosen` alternative refuse a call that is neither a number
     nor text under `binary` or `asciiFold`; the term takes the call's
     collation unless it gives its own. A boolean result was never a candidate:
     it makes the call a predicate, refused as one.
   - **The cursor's term is `{ key }`, not `{ key, alias }`.** Aliases are
     positional, given by `cursorSelection` (`key0`, `key1`, …) and read back by
     `keysOf`, so no term carries one. A column's collation is still applied by
     the cursor; an expression's is in its own SQL, which the compiler writes
     with `collate` (so under `asciiFold` on Postgres the cursor holds the
     lowered text, and compares it with the lowered key).
   - **Values read back for a call are not decoded.** A cursor carries them as
     JSON and binds them back as parameters, which Postgres types by the
     expression they are compared with (Phase 0, probe 12); the output schema
     is never consulted, and no test needed it.
   - **Registration needed nothing new.** Phase 3's check walks every ordering
     term and `Order.chosen` alternative; a test shows both refused.
   - **`Query.placement` takes `{ operators }`, none by default.** `expr.ts`
     cannot import the kernel (`operators.ts` reaches it through `text.ts`), and
     the kernel holds no orderable operator, so none and the kernel agree;
     Remote resolves its table to the kernel once and always passes it.
   - **Expansion missed a primitive call's arguments.** A defined operator
     inside one stayed unexpanded, which the SQL compiler would refuse by name;
     `Expr.expanded` now expands them, and takes a scalar.
   - **`verifyPlacement` is tested in Remote**, the server's page made by the
     reference interpreter with the server's table: agreeing records nothing,
     and a server implementing the call otherwise is recorded. That SQL pages
     equal the reference is the remote-drizzle suite's to show, on both
     dialects.
5. **Laws, evidence and the helper.** §10 whole. *Done when* declaring `concat`
   commutative yields a counterexample; a witness that does not decode is refused;
   evidence round-trips through `describeTable`.

   **Built**, 2026-10-26. Where it departed from the sketch:
   - **Laws are values**, `Law.associative` rather than `Law.associative()`, with
     one way to narrow a domain, `Law.within(law, schema)`. No law names another
     equivalence: sides are compared as stored values, which no law here needed
     otherwise.
   - **A witness is checked as a stored value** (`Schema.is` of the encoded
     side), since it stands in for an argument as stored; for every schema
     without a transformation that is decoding.
   - **Cases are sampled, not generated by a property library.** Each kind has
     a fixed sample (the empty string, mixed case, `'B'` against `'a'`,
     non-ASCII and astral text; zero, negatives, a fraction, a large number;
     both booleans), kept where the schemas and the domain take them, and a
     seeded shuffle chooses which when there are more than `cases`. No
     dependency is added, and a run is repeatable from its seed.
   - **`Conformance.laws` tests a memory table.** An SQL implementation is held
     to the memory one by `Conformance.operator` instead, whose agreement
     carries the laws over. `foldkit-remote-drizzle`'s `compileCall` compiles a
     call of literals for an SQL runner, never deciding it in memory.
   - **Generated calls hold no CHECK constraint and no keyset page.** Those
     need a table and rows; Phase 4's paging tests cover the keyset, and
     Phase 6's writes are where CHECK constraints come from.
   - **`Operators.describeTable` is built here**, with each operator's laws and
     evidence; the rest of §5.7 (`Operators.describe` with JSON Schemas and
     description, `Query.operators`) is Phase 7's.
   - **The helper found a disagreement on its first run.** Memory answered null
     for a call given null beside text holding NUL, where SQL refuses the NUL
     where it compiles. Memory now refuses NUL first.
6. **Writes.** First `Write.apply` (§9.1), then computed assignments (§9.2), then
   commuting ones (§9.3). *Done when* the row Guard judges equals the row the
   database writes, for a set, an increment and a computed assignment (a test that
   makes them differ fails); an assignment over a hidden member is refused at
   startup; a retried computed assignment is not written twice; two concurrent
   ledgered integer increments both land without `expect`; a real-column increment
   without `expect` is refused at registration; Remote predicts a computed
   assignment over a live change and shows none when the client lacks its operator.

   **Built**, 2026-10-26. Where it departed from the sketch:
   - **Increments stay their own form.** They were to become sugar for
     assignments of kernel `number.addInteger` and `number.addReal`; instead
     the rule those laws stand for is stated directly: an increment of an
     integer lands without `expect` under a ledger, one of a real number does
     not (`RemoteServer.write` refuses it). The protocol carries `increments`
     and `assignments` side by side, and no `number.*` operator ships. Folding
     them would change every writer and the prediction for no difference in
     what lands.
   - **A writer that pins needs no law.** `EntityWriter.pins`, set by a
     guarded writer with a `revision`, lands an update only over the row it
     read, so concurrent writes cannot interleave: a real increment or any
     computed assignment needs no `expect` there. `commutes` is asked only of
     a writer that does not pin.
   - **Evidence for SQL** is recorded on the `DrizzleOperators` table
     (`withEvidence`), produced by `Conformance.lawsBy`, which runs the same
     law plans as `laws` through any runner (`compileCall` selected from the
     database). `commutes` requires `Tested` commutativity and associativity
     in both tables; a law's narrowed domain is not compared with the field's.
   - **An assignment holds no predicate.** A computation is data, and a
     predicate's three-valued truth is not a stored value; one is refused
     where it is declared.
   - **The client's table reaches every read of the store.** `BoundRemote`
     carries `operators`, which `Remote.make` sets and `Remote.at` takes, and
     the visible store is memoized by it as well as by the layers and the store.
   - **Guard's sum over a null was the amount.** `Number(null) + amount`; it
     now judges `Write.apply`'s null, the row the database writes. A declared
     increment of a nullable field is refused, so only a stored null meets it,
     and the test is at `Write.apply`.
   - **Guard's request-time checks of an assignment** (unpinned, disclosing)
     are reached only by calling its writer outside `RemoteServer`, whose
     registration refuses both first; they are kept for that caller and not
     tested.
7. **Description and docs.** §5.7; the Entity README's operator section with
   `concat` declared by an application, implemented in memory and SQL, checked by
   the helper; the skill's Entity, Remote and Guard references; data-query and
   write-increment updated. *Done when* the README's snippets compile in a
   `*.test-d.ts` and every kernel operator's description validates against its
   JSON Schema.

   **Built**, 2026-10-26. Where it departed from the sketch:
   - **A description's contract is a Schema.** `OperatorDescription` is what
     a description must decode by (every kernel operator's does, through
     JSON); its own JSON Schema is `Schema.toJsonSchemaDocument` of it, so no
     second copy is kept by hand. Effect's document describes a schema's
     stored side already, which is what a description gives.
   - **`describeTable` describes each operator in full**, with `name` where
     it said `operator`: one shape for an operator, described alone or in a
     table.
   - **A version refusal names what the table holds** through
     `OperatorTable.versions` and `missingName`, at every check and run in
     memory and at registration in SQL; the SQL compiler's own per-request
     refusal, after registration has checked, is unchanged.
   - **The Remote and Guard references needed nothing new here**: their
     operator tables were documented by the phases that gave them one; the
     Entity reference carries the description and the version rule.
   - **write-increment-DESIGN** was brought up to date by Phase 6 (§5's
     real-number rule and the null under an amount).

## 13. What gen2 gave this design

gen2 (`C:\Users\Patrick\gen2`: `src/types/operation.ts`,
`src/expression/checks.ts`, `src/dialects/core/type-operation.ts`,
`docs/revision/revised_phases.md`) is the prior art #185 cites.

**Taken:** operators defined by an expression and named rules (§5.3); checking by
where an expression runs (§5.6); laws as typed descriptors with witnesses,
monotonic and order-preserving among them (§10.1); `claim | tested | proven` kept
apart from the law (§10.3); refusing rather than falling back; duplicate
implementations as an error (§5.4).

**Not taken:** the capability, effect and operation-kind vocabularies (purity is
an invariant here, types are Schemas, where an operator runs is a table's
presence); effectful operations and representations below the Schema; operation
traits beyond laws (`patchable`, `incrementalizable`, `retry_safe`), which
describe writes and sync, where §9.3 reads laws instead; and its checks' blind
spot, inspecting only literal operands because its nodes carry no type.

## 14. Success criteria

| # | Criterion | Phase |
| --- | --- | --- |
| 1 | An application declares an operator, defined or primitive, without changing the kernel; the kernel's own operators use only the public API. | 1, 2 |
| 2 | Descriptors and expressions hold no evaluator or SQL; pending patches hold no descriptor. | 1, 6 |
| 3 | Calls nest as scalars and predicates, in `and`/`or`/`not`, Guard rules, invariants, `when`, order terms and assignments, with no cast. | 1, 4, 6 |
| 4 | Inference and ownership survive calls; another Entity's field under a call is refused. | 1 |
| 5 | Dependencies include every field and input under a call or expansion, and every check built on them (Guard's hidden-member and principal checks, Remote's matching and impact) sees them. | 1 |
| 6 | No interpreter drops a node it does not know. | 1 |
| 7 | Evaluation is synchronous; SQL uses separately supplied implementations; tables are passed explicitly, with no global state. | 2, 3 |
| 8 | Duplicate, overlapping and ambiguous implementations are refused unless replaced explicitly. | 2 |
| 9 | A server whose uses need a missing operator, in SQL or in memory, does not start, and says which; SQL never drops a condition. | 2, 3 |
| 10 | Untyped callers and widened expressions are checked at run time. | 1, 2 |
| 11 | Null, missing values, stored form, NUL and totality have §6's semantics in every interpreter. | 2, 3 |
| 12 | Text compares and orders only under a declared collation, computed text included. | 2, 4 |
| 13 | The row a write leaves is computed once, and SQL writes what Guard judged. | 6 |
| 14 | Laws carry domains, witnesses and related operators; evidence is per implementation; a failing law yields a counterexample. | 5 |
| 15 | Only tested evidence lets an assignment skip `expect`; no rewrite reads a law. | 5, 6 |
| 16 | Every existing query, guard, invariant and write answers as before (the existing suites, unchanged). | every phase |
| 17 | The docs show declaration, composition, passing tables, SQL support, and an application operator with laws, compiled. | 7 |
| 18 | The CMS and the registry use operators in their real queries and rules. | 1, 3 |

## 15. Questions, with proposals

1. **Index use for prefix search.** Measure on the registry's seed first. If it
   matters, a `binary` prefix can compile to a range on the column (from the prefix
   to the prefix with its last character incremented), which both databases index;
   its edges become conformance cases.
2. **A collation-following `contains`.** Not until a `binary` field needs a
   case-sensitive search.
3. **Where kernel operators live.** `foldkit-entity/text` and
   `foldkit-entity/number`, so the kernel module stays the IR.
4. **Overriding a kernel implementation.** Allowed through `Operators.override`;
   the startup message names an overridden kernel operator.
5. **A defined operator described with its body.** If the contract graph needs the
   body, a defined operator may declare example operands for describing; decide
   with the graph's first reader.
6. **Equivalence for real-valued laws.** Real operators state a domain without
   `NaN` (`Schema.Finite`), so equality of encoded values suffices.
7. **Should `Remote.make` refuse a query its table cannot judge?** Proposal: no;
   it lists them in `Data.inspect`, beside `placementMismatches`, since
   refetching is correct, only slower.
8. **Computed assignments that read relations.** Out: an assignment reads the row
   it writes.
9. **Integers past the safe range.** `number.addInteger`'s domain is safe
   integers, and an increment's field and amount schemas must be bounded to it for
   the law to count; otherwise the increment keeps its `expect`. A 64-bit column is
   a `bigint` field and a separate operator.
10. **Judging candidates per row.** `matching` evaluates every candidate at once,
    so one refusal voids a list. A missing operator voids every row alike, but a
    NUL in one stored row would void the rest. Proposal: judge per row, a row that
    refuses being `unknown`, in Phase 3.

    **Closed** 2026-10-26. `evaluateEach` in `foldkit-entity` judges each row
    alone, setting a refusing row aside in `refused`; `matching` puts those keys
    in `skipped`, so `filtered` answers the other rows and says it is incomplete,
    and `belongs` (which judges one row) is unchanged. What no row causes still
    refuses the run: an operator the table lacks, a locale order, keys of
    different kinds across rows, and an input the body reads holding a NUL. A
    refusal is laid to the input only when a read input holds a NUL, since every
    row would refuse alike and none is the cause; with no rows held there is
    nothing to refuse, as with `evaluate`.
11. **A Postgres database in a locale.** PGlite creates its database with
    collation `C` (§17), so Phase 0 could not show what an expression without an
    explicit collation does under a locale. The plan collates every text
    comparison and order explicitly, and equality under a deterministic collation
    is byte equality, so nothing is expected to change. Proposal: Phase 3's suite
    runs the prefix and ordering cases once on a Postgres created with
    `LC_COLLATE=en_US.UTF-8` (Docker is available here), to prove the explicit
    collation is what decides.

    **Closed** 2026-10-26: it is (§17). The run is kept: `conformance.test.ts`
    and `orderCall.test.ts` in `foldkit-remote-drizzle` run on such a database
    when `FOLDKIT_LOCALE_PG` names one, and `localeCollation.mutations.ts`
    drops each collation the compiler writes. CI runs neither (it has no
    Postgres), so a change to how Postgres collates is checked by hand.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| An application ships an operator whose SQL and memory implementations differ | The helper; Guard, invariants and assignments use both tables on the server, and §9.1's test compares them |
| A walker misses the new nodes | Phase 1 makes every listed walker exhaustive before adding nodes; the TanStack drop is fixed there |
| A check on dependencies fails open | Invariant 3; Phase 1's hidden-member test through a call |
| The cursor rewrite breaks paging | Phase 4 runs the existing cursor suites unchanged before adding call terms |
| Breaking changes (`Condition.holds`, `query({ orderBy })`, the writer protocol, real-column increments) | 0.x; each refused where met with a message saying what to do; changelog |
| Ordering by expressions is slow | §8 promises no index; the README says to index the expression |
| Laws give false confidence | Only `tested` evidence is acted on, by one consumer |

## 17. Findings

**2026-10-26, review against the packages** (three reviewers, each claim checked
in the code before it changed this plan). What it changed:

- Bodies are built on the client too; descriptors ship in the client bundle (§1,
  §5.1). The earlier "bodies stay on the server" was wrong.
- The server settles field-free predicates in memory, so query bodies need both
  tables there (§5.6).
- Guard runs every rule in memory and only Read rules in SQL; non-Read rules were
  unchecked at startup. Agents were wrongly listed as evaluating rules (§1, §5.6).
- Invariants are judged in SQL by the Drizzle writer and emitted as CHECK
  constraints, so they need SQL implementations that can be inlined; the guarded
  writer does not judge them (§1, §5.4, §5.6).
- The row after a write is computed three ways that only agree on admitted rows
  (§9.1, invariant 15).
- The increment rule lives at registration, per request and in the writer, not at
  declaration; Guard's writer always pins (§9.3).
- Ordering is fields-only in every interpreter, and the cursor holds columns
  (§8).
- `Undecided` cannot yet say "missing operator" (§5.6).
- `foldkit-cms` already has a `published` role, which the defined operator is
  built from (§4).
- The TanStack interpreter silently drops an unknown node (§1, Phase 1).
- **Phase 0's assembly question is answered:** every server piece is built by
  plain functions, so tables are options and no Layer is added (§5.5).

**2026-10-26, Phase 0 probes.** Run against PostgreSQL 18.6 (PGlite 0.5.11, the
`remote-drizzle` test dependency; database encoding UTF8, collation `C`) and
SQLite 3.49.1 (`node:sqlite`, Node 26.5), through parameterised queries, so
Postgres infers each parameter's type as it does for `pg` and Drizzle. The
scripts are kept outside the repository; each case below is to become a
conformance case in the phase named.

| # | Probe | Postgres | SQLite | Consequence |
| --- | --- | --- | --- | --- |
| 1 | `$1 \|\| $2`, `col \|\| $1`, `$1 \|\| col` | text, no cast needed | works | Text parameters need no cast (§5.4) |
| 2 | `null \|\| x`; Postgres `concat(null, x)` | null; `concat` gives `x` | null | `concat` compiles to `\|\|` (§6.3) |
| 3 | `$1 \|\| $2` with a number bound | `1b` | `1.0b` (a JS number binds as a real) | Arguments must be checked by stored kind before SQL sees them (§5.1) |
| 4 | `$1 + $2` untyped | refused: "operator is not unique: unknown + unknown" | works | Postgres casts non-text parameters (§5.4) |
| 5 | `int_col + $1` with `0.5` | refused: invalid input for integer | stores `2.5` in the integer column | Integer amounts are `Schema.Int`; a gap in shipped increments (below) |
| 6 | `$1 < $2` with 9 and 10 | `false` (compared as text) | — | Confirms query-logic's rule: field-free predicates are settled in memory |
| 7 | `left(col, length($1)) = $1` / `substr(col, 1, length(?)) = ?`, ASCII, `binary` | rows 1, 2, 4, 6, 9 | the same | Untyped `length($1)` resolves; no cast |
| 8 | the same under `asciiFold` (`lower(… collate "C")` / `collate nocase`) | adds row 3 (`A/`) | the same | Both fold ASCII only: `É` is left as it is in both |
| 9 | prefixes `é`, `😀`, `''` | row 5; row 8; all 9 rows | the same | Character counting agrees on non-ASCII and astral text; the empty prefix holds for every non-null row |
| 10 | a prefix over a call, `left(dir \|\| name, …)` | rows 1, 6, 9 | — | A call as the text operand compiles as a column does |
| 11 | `starts_with(col, $1)` | exists, same rows | no such function | The `left`/`substr` form is kept for parity |
| 12 | `order by (dir \|\| name) collate "C"`, ties, keyset pages of 2 and 3, untyped and cast cursor values | paged order equals the full order | the same with `collate binary` | Keyset paging over an expression works with the cursor's comparison shape (§8) |
| 13 | the same with null keys, `nulls last`, the cursor's `or … is null` clause | equal to the full order | equal | The cursor's null handling carries over to an expression key |
| 14 | the order against JavaScript, with U+FB00 against an astral emoji | equals code-point order | equals code-point order | Matches the evaluator, which compares `binary` text by code point (`evaluate.ts:244`); a plain JavaScript `<` (UTF-16 units) would not |
| 15 | ordering under `asciiFold` | `lower(x collate "C")` | `collate nocase` | the same order, ties by id |
| 16 | CHECK built from a call, values inlined (`left`, `\|\|`, `lower … collate "C"`) | enforced | enforced (`substr`, `\|\|`, `collate nocase`) | Calls work in constraints with no flag (§5.4) |
| 17 | CHECK with a parameter | refused (a DDL statement binds none) | "parameters prohibited in CHECK constraints" | Why `invariantChecks` inlines and refuses leftovers |
| 18 | CHECK over a null column | passes | passes | A constraint passes on unknown; `invariantChecks` wraps `(…) is true` for this, and calls need it too |
| 19 | the database's default collation | `C` (`datlocprovider` `c`) | — | Not proven under a locale: §15 question 11, run below |

**A gap in shipped code, found by probe 5.** `Write.update`'s `incrementOf`
(`packages/entity/src/write.ts:274-306`) accepts an integer field incremented
by an amount whose schema is any number. A fractional amount then fails the
statement on Postgres and, on SQLite, writes a fraction into an integer column
that the field's `Int` schema does not admit. Fixed 2026-10-26, with none of this
plan: `incrementOf` refuses, where the write is declared, an amount whose encoded
schema does not carry the integer check of the field it increments
(write-increment §5). The same day the Drizzle writer closed the rest: a field
declared `Schema.Number` over an `integer` column, refused through a new
`EntityWriter.refuses` where the write is registered. §9.3 builds on both, and
`refuses` is where the commuting-assignment rule (§9.3) can live for writers
other than Drizzle's.

**2026-10-26, §15 question 11: a Postgres database in a locale.** PostgreSQL 18.6
in Docker (`postgres:18`, initdb `--locale=en_US.UTF-8`; `datcollate` and
`datctype` `en_US.UTF-8`, provider libc), reached through `drizzle-orm/node-postgres`,
so the compiler's own SQL ran, not a hand-written copy.

- **The locale is live.** An order naming no collation puts `intro to sql`
  among the capitals (`d a b c e`); the same order `collate "C"` puts it after
  them (`d a c b e`). The run asserts both, so it cannot pass on a `C` database
  by accident.
- **Every case agrees.** All the conformance suite's cases and primitive cases,
  paged two at a time where they order, and its refusals (155 tests), and every
  call order in `orderCall.test.ts` at page sizes 1 to 3, answer as the
  reference interpreter does.
- **The explicit collation is what decides, shown by removing it.** Each of
  the four collations the compiler writes for Postgres (`collate "C"` on a
  field's order and cursor, on a call's text; `lower(… collate "C")` for both
  under `asciiFold`) was dropped in turn. On PGlite three of the four removals
  pass every test, since its database collates by `C` anyway (the fourth is
  caught only by a test of the SQL text). On the locale database all four fail.
- **The suite's rows could not tell `C` from `en_US` for folded text.**
  Lowered, its labels sort alike under both, so dropping the fold's `collate
  "C"` passed even there. `orderCall.test.ts` gained rows that the two orders
  disagree on: `a-c` against `ab` (a locale passes over the hyphen) and `é`
  against `f` (a locale puts `é` beside `e`). Its expected orders are the
  reference interpreter's, so no expectation was written by hand.
- **Equality and prefixes need no collation to agree.** Dropping `collate "C"`
  from a call's text changed no prefix or equality answer: under a
  deterministic collation equality is byte equality, as the question expected.
  Only an order over the call showed it.
