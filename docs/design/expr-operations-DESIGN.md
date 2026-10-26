# Operators in the expression kernel

**Status:** Proposed, 2026-10-26, for
[#185](https://github.com/doeixd/foldkit-plus/issues/185). Revised the same day
with what gen2 offered (§13), then completed as a plan. Nothing built.
**Packages:** `foldkit-entity` (descriptors, nodes, the reference interpreter,
laws, conformance), `foldkit-remote-drizzle` (SQL), `foldkit-guard` and
`foldkit-remote-server` (startup checks), `foldkit-remote` (client matching,
placement, predictions).
**Companions:** [data-query-DESIGN.md](./data-query-DESIGN.md) §6 (the kernel
and its rule for adding an operator), [query-logic-DESIGN.md](./query-logic-DESIGN.md)
(connectives, comparisons, collations),
[entity-invariant-DESIGN.md](./entity-invariant-DESIGN.md),
[write-increment-DESIGN.md](./write-increment-DESIGN.md) and
[write-improvement-PLAN.md](./write-improvement-PLAN.md) (writes this plan
extends), [contract-layer-PLAN.md](./contract-layer-PLAN.md) (the graph and
catalog that read operator descriptions).

#185 asks for operators an application declares, with behaviour supplied
separately for each interpreter, so queries, Guard, invariants and declared
writes can say more without each growing a language. This plan checks that
request against the kernel as built and settles what it leaves open.

API names are proposals. Snippets are sketches, not compiled code.

## 0. Summary

| # | Question | Decision |
| --- | --- | --- |
| 1 | How it fits data-query §6.0 | The rule stands for every operator the kernel ships. An application's operator is held to it by a conformance helper. §3. |
| 2 | Callers | The CMS's "published", written out five times, is the first defined operator. The registry's UPC search is the first primitive one (`startsWith`). Ordering by a call, laws, null-handling operators and computed assignments are built without a caller, by choice. §4. |
| 3 | Defined versus primitive | An operator is either defined by an expression over existing ones (no implementation anywhere) or primitive (an implementation per interpreter). §5.1, §5.3. |
| 4 | Effect evaluation versus Layers | Evaluation is a pure synchronous function taking a table of implementations. A Layer only hands a server its table, once, where it is built. §5.5. |
| 5 | Completeness | Checked per use site: what a Guard row rule needs differs from what an invariant needs. A server that starts can answer every use. §5.6. |
| 6 | Null and case | Strict by default: a null operand gives null, a predicate over one is unknown. An operator may declare it handles null instead. Text compares only under a declared collation. §6. |
| 7 | Computed text | An operator may declare its result keeps its operands' collation; the rule becomes "text needs a collation", not "a field". §7. |
| 8 | Ordering | A call may be an order term when its result orders; a client places a list by one only with the operator's in-memory implementation. §8. |
| 9 | Writes | A declared write may assign a field from an expression. An assignment of the form `field := op(field, amount)` may skip `expect` under a write ledger only if `op` has tested laws saying the order of assignments cannot matter. Increments become that, so a real column's increment keeps its `expect`. §9. |
| 10 | Laws | Typed, with witnesses and a domain; evidence is per implementation; the one consumer that acts on them (§9) reads evidence, never a claim. §10. |
| 11 | Description | Every operator describes itself as JSON for the contract graph and catalog; ids are namespaced and versioned. §5.7. |

## 1. What exists

- **Fixed nodes.** A scalar is `Literal`, `Field`, `Input` or `Next`
  (`packages/entity/src/expr.ts:64`); a predicate is `Eq`, `Null`,
  `Contains`, `In`, `And`, `Or`, `Not` or `Compare`. No node computes a
  scalar from others.
- **Operations are names.** `Operation` is a string union. Each interpreter
  lists the names it runs (`supported`), and `Query.unsupported(body,
  supported)` names what a body needs that an interpreter lacks. It is checked
  by the Drizzle compiler at registration (`checkFields`), Guard's Drizzle
  `visible` at startup, and `evaluate` on every call.
- **Three interpreters branch on the nodes:** the reference `evaluate`
  (`packages/entity/src/evaluate.ts`), the Drizzle compiler
  (`packages/remote-drizzle/src/compile.ts`), and `examples/tanstack`'s;
  `examples/livestore` runs a subset. Guard (`Policy.decide`,
  `Condition.holds`), invariants (`truthOver`), declared writes' `when` and
  Remote's client matching run through the first two.
- **Values are the stored form.** Rows, input and invariants are read encoded
  (entity-invariant §3); Remote's client matches with encoded input.
- **Missing is the caller's.** `evaluate` reads an absent key as null. Remote's
  client skips a row lacking a field `Query.dependencies` names and answers
  `unknown` (`packages/remote/src/matching.ts`); a body `evaluate` refuses
  (`QueryEvaluateError`) is `unknown` too, which refetches.
- **Order terms take any expression.** `OrderTerm.expr` is `AnyExpr`, and
  `Order.asc` takes an operand; only a field term carries a declared collation,
  and `Query.placement` decides whether a client can place a row by the order.
- **Writes set, increment and condition.** A `Write` holds `sets` (an input key
  per field), `increments` (`field + amount`), `expect` (a revision) and `when`
  (`packages/entity/src/write.ts`). A ledgered binding lets an increment skip
  `expect` (write-improvement Phase 3), and Remote predicts a pending increment
  by adding its amount to the stored value as it is read (`adds`,
  `packages/remote/src/optimistic.ts`).
- **#182–#184 shipped on these nodes** (0.33.0, #189).

## 2. Invariants

What every phase keeps. Each is tested where its phase says.

1. **A descriptor holds no behaviour.** It is identity, schemas and declared
   semantics. A defined operator's `definedAs` builds an expression and never
   computes a value.
2. **Expressions are static data.** Every node, descriptor and expansion is
   frozen when made; nothing in a body changes after `Query.where`,
   `Guards.declare` or `Entity.invariant` has checked it.
3. **A call reads only its arguments.** An implementation receives its
   arguments and nothing else, and a defined operator's expansion reads only
   what its arguments read. So a call's dependencies are its arguments'.
4. **Every interpreter agrees or refuses.** An interpreter that answers gives
   the reference interpreter's answer for the same rows and input, failures
   included. One that cannot refuses by the operator's id. Nothing drops a
   condition, post-filters in its place, or guesses.
5. **Null is strict unless declared.** Under the default, a null argument gives
   null (unknown for a predicate) and the implementation is never called with
   one. An operator declaring `nulls: 'handled'` receives nulls and is tested
   with one in each position.
6. **Values are encoded.** Arguments and results are the stored form; a brand
   or transformation is not carried through an operator unless its output
   schema says so.
7. **Text compares only under a declared collation**, `binary` or
   `asciiFold`, from a field or from a call that keeps its operands'. Never
   the backend's default, never a locale.
8. **Evaluation is pure and synchronous.** No Effect per evaluation, no service
   lookup per node, no I/O, no clock, no randomness in any implementation.
9. **Tables are values.** One per interpreter, immutable, with no global
   registry; a second implementation of one operator is refused unless
   replaced explicitly.
10. **A server that starts can answer every use.** Completeness is checked
    where each use is assembled, against every interpreter that use runs in.
11. **A law is a claim until tested for an implementation**, and nothing that
    decides what is written or who may read acts on a claim.
12. **Existing meaning is kept.** Every existing constructor, node and
    interpreter answers as it does today; `contains` keeps its ASCII folding.
13. **Work is bounded.** A call and its expansion count toward
    `maxQueryNodes`, each argument on each path, as shared operands do now.
14. **Identity is the descriptor.** Ids are namespaced, `foldkit.` is reserved,
    and an id with a version names one operator in any table.

## 3. Reconciling with data-query §6.0 and query-logic

Data-query §6.0 says an operator is portable only once its semantics are
stated in terms an interpreter is held to, and §6.0.2 adds one in four steps:
state its semantics, name the real query that needs it, build the reference
interpreter first, add differential cases for the disagreements the backends
would have. It exists because `contains` matched different rows in three places
before a mixed-case fixture caught it.

- **An operator the kernel ships** follows §6.0.2 unchanged, except that
  building without a caller is allowed where this plan says so (§4). Its
  semantics go into data-query §6.0.1's table, and its differential cases join
  `foldkit-entity/conformance`.
- **An operator an application declares** states its semantics in its
  descriptor, and the conformance helper (§10.4) runs its cases through every
  implementation the application supplies, comparing results and failures. The
  kernel cannot see that an application ran it; the README says an operator
  without those cases is unchecked.
- **A defined operator** has no semantics of its own to state: its meaning is
  its body's.

From query-logic, kept: no rewriting (flattening only; a law authorizes none);
three-valued predicates, which an operator returning a boolean joins; per-request
settling of what reads no field, now including calls over inputs and literals;
text compared only under a declared collation, generalised in §7.

What changes in data-query: §6's kernel gains one scalar node and one predicate
node; §6.0.1 gains a row per shipped operator; §6.3's dependencies list operator
ids beside operation names; §7's `Rule` is built, as a defined operator.

## 4. Callers

- **Defined operator: "published".** The CMS writes `Expr.isNotNull(
  X.fields.publishedAt)` in `RecentPosts` and `PublishedPages`
  (`examples/cms/src/content/domain.ts:122`, `pageDomain.ts:72`) and in the
  Guard rules `isPostPublished`, `isPagePublished`, `isArticlePublished`
  (`examples/cms/src/server/server.ts:63-65`). A TypeScript helper would give
  one definition; the operator also gives every printout and the contract graph
  one name for the five.
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

  It exercises the Drizzle compiler on SQLite, the client's matching, and the
  field's declared `Collation.binary`. `startsWith` is declared, implemented and
  compiled through the public APIs, so the kernel names nothing of its own:
  evidence that an operator needs no change to the core.
- **Built without a caller:** ordering by a call (§8), `nulls: 'handled'`
  (§6.1), laws and evidence (§10), computed and commuting assignments (§9), and
  the catalog (§5.7). Each is specified completely enough to test, and each
  phase says what proves it.
- **`concat`** is the README's example of an application operator, with laws;
  §6.3 states its semantics so the example is honest. It is not shipped by the
  kernel.

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
- **Arguments are checked by their stored form at run time and by their `Type`
  at compile time.** An operand is accepted when its encoded form matches the
  input's, the reading `Expr.lt` makes of a field's encoded AST; the type checks
  `ValueOf` as every constructor does. Where the two differ (a `Date` stored as
  text) the run-time check is the one that holds, and a type test covers it.
- **Untyped callers are checked.** `Expr.operator` throws where it is written for
  a bad id, a non-Schema member, a `collation: 'operands'` on a non-text output,
  or a law whose witnesses do not fit (§10.1); a call throws for a wrong arity
  or an operand of the wrong stored kind.

### 5.2 Nodes

```text
Call  (scalar):    { _tag: 'Call', operator, args, expansion, collation }
Test  (predicate): { _tag: 'Test', operator, args, expansion }
```

Two tags, so `isPredicate` and every `Match.tagsExhaustive` tell them apart
without reading a field. `expansion` is `Option.some(body)` for a defined
operator and `Option.none()` for a primitive one.

Every walker gains both: `fieldsIn`, `childrenOf`, `walk`, `showExpr`,
ownership, the node budget, `sideKind` (a call's kind is its output's encoded
kind), `readsAField`/`decided`, `valueOf`/`holds`, placement (§8), and the
compiler's operand, predicate and order cases.

- **Dependencies walk the arguments** (invariant 3), so Remote's client skips a
  row lacking a field passed to an operator and Guard's `guardFields` names it.
- **Ownership walks them too**: `ReadsOf` of a call is the union of its
  arguments', and a field of another Entity under a call is refused by the type
  and at run time.
- **`Query.show` prints the call**, `text.startsWith(Product.upc, $search)`,
  never an expansion.

### 5.3 Defined operators

gen2 lets an operation's implementation be an expression over other operations
(its `static_ast` body, later an "operation lowers to" edge) and makes a named
boolean expression, its `Rule`, a first-class thing. Data-query §7 expected the
same `Rule` and never built it.

```ts
const published = Expr.operator('cms.published', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
  definedAs: publishedAt => Expr.isNotNull(publishedAt),
})
```

- **The body is built per call from the real operands**, and stored as the
  node's expansion. Every construction check (ownership, collations,
  comparison kinds, the budget) runs against the real fields.
- **It reads only its arguments** (invariant 3). A body that closes over a field
  or an input instead of reading its argument is refused at call time, by
  comparing the expansion's fields and inputs with its arguments'.
- **Interpreters walk the expansion**: dependencies, settling, placement and
  `Query.unsupported` read through it, so a defined operator is supported
  wherever its body is, with no table entry.
- **An interpreter may supply its own implementation** (a native function, say).
  The expansion is then the reference that implementation is tested against
  (§10.4), and the table's entry wins in that interpreter.
- **Its output schema is checked against the body's**: a body whose result is
  not of the declared output's stored kind is refused at call time.
- **It may take inputs as arguments.** A "published" that also means "not in the
  future" takes the time: `published(at, input.now)`. The kernel has no clock.

### 5.4 Implementations

```ts
// foldkit-entity: in memory
const memory = Operators.memory(
  Operators.implement(startsWith, (text, prefix) => text.startsWith(prefix)),
)

// foldkit-remote-drizzle: SQL
const sql = DrizzleOperators.make(
  DrizzleOperators.implement(startsWith, ({ args: [text, prefix], collated, dialect }) =>
    /* the prefix comparison of §6.2, for this dialect */,
  ),
)
```

- **A table is an immutable value** keyed by descriptor. `Operators.memory(…)`
  refuses two implementations of one operator; `Operators.merge(a, b)` refuses
  an overlap; `Operators.override(table, …)` is the explicit replacement.
- **`Operators.kernel` and `DrizzleOperators.kernel`** hold the kernel's
  primitive operators and are the default table of every interpreter, so the
  registry wires nothing for `startsWith`. An application extends them with
  `merge`.
- **A memory implementation is a pure synchronous function** over stored values
  (invariant 8); under `nulls: 'strict'` it never sees null. It may not return an
  Effect: an operator that must look something up is not an operator, but a
  principal guard's work or a server's.
- **A SQL implementation builds Drizzle `SQL`** from its arguments, already
  compiled, with the dialect and a helper applying the call's collation as the
  cursor does (`collatedColumn`). The compiler wraps each argument that is a
  parameter in a cast to the input's stored type where Phase 0 finds Postgres
  needs one. Under `nulls: 'strict'` the implementation need not test for null:
  SQL's operators and functions already give null for one, and the conformance
  helper checks that it does.
- **Nothing translates a JavaScript function into SQL.**

### 5.5 Evaluation stays synchronous

#185 sketches `Expr.evaluate(expression)` as an Effect needing an interpreter
service. That does not fit three callers: Remote's client evaluates bodies in
its matching on every relevant change, outside any Effect environment; the
reference `evaluate` "may depend on the IR and nothing else" (its module
comment); and an invariant's Schema check (`Schema.makeFilter`) is synchronous.

So every interpreter takes its table as an argument:

```ts
evaluate(body, input, rows, { operators: memory })
Invariant.check(entity, { operators: memory })
```

**A Layer is assembly.** `Operators.layer(table)` provides a `MemoryOperators`
service, `DrizzleOperators.layer(table)` a `DrizzleOperators` one. A server built
from Layers (`RemoteServer`, `GuardServer`, a Drizzle binding) reads the service
once where it is built and passes the table down. An application that builds no
Layers passes the table. Both routes end in the same value: one way to evaluate,
one way to supply a table. Where Phase 0 finds a server is not built inside an
Effect, it takes the table as an option and gains no Layer.

### 5.6 Completeness per use site

gen2 checks an expression by where it runs (its phase checks); here, by where it
is used:

| Use | Interpreters | Checked | Missing means |
| --- | --- | --- | --- |
| A query body a server serves | SQL on the server; memory in Remote's client | registration (`checkFields`) | the server does not start; the client refetches |
| A Guard row rule | SQL (the binding's `visible`) and memory (`Policy.decide`, `Condition.holds`, agents) | Guard's `visible` and `GuardServer.validate`, against both tables | the server does not start |
| A declared write's `when` | SQL (the compare-and-set `update … where`) | where the writer is built | the server does not start |
| A computed assignment (§9) | SQL (the `set` clause) and memory (the row it would leave, for Guard's rules after and invariants; Remote's prediction) | where the writer is built; the client's table where the mutation is defined | the server does not start; the client shows no prediction for that field |
| An invariant | memory (the judge, the Schema check, a form, a writer judging the row it would leave) | where the writer is built, against the server's table | the server does not start; in a client form, `Undecided` |
| An order term (§8) | SQL; memory for client placement | registration | the server does not start; the client does not place by it |

- **`Query.unsupported(body, interpreter)`** names every kernel operation and
  every primitive operator the interpreter lacks, reading through expansions.
  `GuardServer.validate`, which does not ask it today, gains the check.
- **The message names** the operator with its version, the query, guard, write
  or invariant, and the interpreter.
- **A client form is the one place a gap is not an error.** The Schema check
  already passes an `Undecided` judgement (it fails only on `Invalid`), as it
  passes a field the form has not filled; the server's writer, whose table is
  complete, decides.
- **The type does not carry requirements.** Tracking each body's operators
  would add a parameter to `Query`, `Write` and every interpreter, and an Effect
  requirement would not prove per-operator coverage anyway. The startup checks
  are the guarantee, and the README says so.

### 5.7 Description and versions

Bodies stay on the server (query-logic: no protocol change), but what an
operator is can be described, for the contract graph and the capability catalog
([contract-layer-PLAN.md](./contract-layer-PLAN.md) Phases 3 and 4):

```text
Operators.describe(operator) ->
  { id, version, description, input: [JSON Schema], output: JSON Schema,
    nulls, collation, laws: [{ kind, witnesses, domain }],
    defined: boolean }
Operators.describeTable(table) -> the operators it implements, by id@version
Query.operators(body) -> each operator a body uses, by id@version
```

- JSON Schemas come from Effect's own `Schema.toJsonSchemaDocument` of each
  schema's encoded side.
- Evidence (§10.3) is described per table, not per operator.
- A defined operator is described by its signature, not its body: printing a
  body needs operands, and inventing placeholders would run its construction
  checks against fields that do not exist.
- `version` is part of identity. A table built for `text.startsWith@1` does not
  answer a body using `@2`; the refusal names both.

## 6. Semantics

### 6.1 Rules every operator keeps

- **Null.** `nulls: 'strict'`: any null argument gives null, or unknown for a
  predicate, checked by the kernel before calling the memory implementation.
  `nulls: 'handled'`: the implementation receives nulls, its input schemas must
  admit null where it does, and a predicate implementation may return `null`
  for unknown. The SQL implementation must give the same answers, which the
  helper checks with a null in each position.
- **Missing is not null, and is not the operator's.** Callers that can lack a
  field check before evaluating (§1); dependencies reach fields under calls.
- **Encoded in, encoded out** (invariant 6). A memory result is checked against
  the output's encoded schema by the conformance helper and under an
  `Operators.memory(…, { checked: true })` table meant for tests, not per row in
  production.
- **NUL is refused.** Text holding NUL is refused before any implementation
  runs, as every kernel operation refuses it (`holdsNul`).
- **Total over the input schema.** An implementation that throws is reported as a
  `QueryEvaluateError` naming the operator. An operator that refuses some values
  its input schema admits (a partial operator) would need its SQL implementation
  to fail on exactly those values, which none here can promise; such an operator
  narrows its input schema instead, and the call refuses out-of-domain literals
  and inputs where it can see them.

### 6.2 `startsWith(text, prefix)`

| Case | Answer |
| --- | --- |
| either is null | unknown |
| prefix is `''` | true |
| otherwise | whether `text` begins with `prefix` under the call's collation |

- **It compares under a collation, like `Expr.lt`**: one passed, or the text
  operand's (a field's, or a call's by §7). `binary` compares exactly;
  `asciiFold` folds ASCII letters on both sides. No collation, or a `Locale`, is
  refused where written, with `Expr.lt`'s messages.
- **`contains` keeps folding always.** It predates declared collations; changing
  it would change built meaning (invariant 12).
- **Characters, not bytes or code units.** In memory, `text.startsWith(prefix)`,
  after folding when folded. In SQL, the first `length(prefix)` characters of
  `text` equal `prefix` under the collation: `substr(text, 1, length(prefix))`
  on SQLite, `left(text, length(prefix))` on Postgres, each side collated as the
  cursor collates a column. Over valid strings a prefix by code points is a
  prefix by UTF-16 units, so the three agree.
- **Not `like 'p%'`**, which needs the input's `%` and `_` escaped and folds case
  on SQLite whatever the collation. Index use is §15 question 1.

### 6.3 `concat(a, b)`, the README's application operator

| Case | Answer |
| --- | --- |
| either is null | null |
| otherwise | `a` followed by `b` |

- **SQL's `||`, not Postgres's `concat()`**, which reads null as `''` and would
  disagree with SQLite and with strict null.
- **Text only**, `collation: 'operands'` (§7), and its laws: associative, with
  `''` as left and right identity; not commutative, not idempotent (§10).

## 7. Collation of computed text

Today `Expr.lt` over text needs a field on one side, because the collation is a
field's (`collationFor`, `expr.ts`), and an order term takes its collation only
from a field. A call's text has none, so `lt(concat(a, b), x)` is refused.

**The rule becomes "text needs a collation".** A text operand has one when it is
a field or `Next` that declares one, or a call whose operator keeps its
operands':

- **`collation: 'operands'`** gives the call the collation its collated operands
  share. Literals and inputs carry none and do not vote; operands that disagree
  are refused where written; with no collated operand the call has none.
- **It is a law**, "folding the result equals folding the operands", which gen2
  calls order-preserving. `concat` keeps it under `binary` and `asciiFold`;
  an operator that reorders or drops characters by case does not. Declaring it
  declares `Law.preservesCollation` (§10.1), which the helper tests with
  mixed-case cases.
- **The default is none**, so an operator that says nothing has its text refused
  in comparisons and orderings.
- **A defined operator's text** has its expansion's collation.
- **Order terms read it too**: `term` takes a call's collation as it takes a
  field's.

## 8. Ordering by a call

`Order.asc(call)` is already writable (an order term takes any operand) but no
interpreter has a case for a call. This plan gives it one.

- **A call orders when its result does**: a number, or text with a collation by
  §7. Otherwise the term is refused where it is written.
- **Nulls** are placed by the term's `nulls`, as for a field.
- **The compiler** orders by the compiled call, collated, and pages it with the
  same expression in the keyset comparison the cursor builds for a field.
- **Placement.** `Query.placement` treats a call term like a field term over the
  fields it reads: placeable when the client's table implements every primitive
  operator in it and its collation is `binary` or `asciiFold`, and not placeable
  otherwise, with the reason naming the operator. Impact analysis treats a change
  to any field under the call as one that may reorder.
- **No index is promised.** Ordering by an expression uses no index on the
  column unless the application creates one on that expression; the README says
  so.

## 9. Writes: computed and commuting assignments

#182 asked for computed assignments and they were deferred "until a use case"
(write-improvement §3). They are specified here, built without a caller.

### 9.1 Computed assignments

```ts
Write.update(PostInput, {
  id: 'id',
  compute: { label: post => Text.concat(post.title, ' draft') },
})
```

- **An assignment's expression reads the row before the write and the input**,
  as a `when` does; it may not read `Next`, so assignments never depend on each
  other's order.
- **The compiler writes it into the `set` clause**, evaluated by the database
  against the row it updates, inside the same compare-and-set statement.
- **The row it would leave is computed in memory** where something must judge it
  before writing: Guard's rules after the write and invariants (entity-invariant
  §4). So an assignment needs both tables on the server (§5.6), and the
  conformance helper is what makes the judged row the written one.
- **Remote predicts it** with the client's table, from the row it holds; without
  the operator, or without a field the expression reads, it shows no prediction
  for that field and waits for the answer.
- **`Write.reads` and `Write.writes`** gain the expression's fields and the
  assigned field, so impact and disclosure checks see them.

### 9.2 Commuting assignments

An increment today is `field := field + amount`, and a ledgered binding lets it
skip `expect`, because concurrent increments are meant to land in any order with
one result. That is a law, held for integers and not for reals: `(x + a) + b`
and `(x + b) + a` can differ by rounding, so a real column's value depends on
commit order, and Remote's `adds` prediction sums in its own order.
write-increment §5 allows real columns.

- **An assignment of the form `field := op(field, amount)`**, where `amount`
  reads only the input, may skip `expect` under a ledger only if `op` has
  `Law.commutative` and `Law.associative` **tested** (§10.3) for both the memory
  and the SQL implementation in use, over the field's stored domain. A claim is
  not enough (invariant 11).
- **Increments become this.** `increment: { stock: 'quantity' }` stays as sugar
  for an assignment with `number.addInteger` (an integer field) or
  `number.addReal` (a real one). The first ships with both laws tested over
  safe integers; the second with commutativity tested and associativity not
  declared, so a real column's increment keeps its `expect`. Values past
  `Number.MAX_SAFE_INTEGER` are outside the integer law's domain, and Remote's
  numbers cannot hold them exactly either (§15 question 9).
- **Remote's prediction** applies pending commuting assignments with the
  memory implementation in their order, re-based on the stored value as `adds`
  does now; for any other assignment it waits for the answer.
- **This changes behaviour**: a ledgered increment of a real column without
  `expect` is refused where the write is declared. Breaking is acceptable in
  0.x; the changelog and write-increment's §5 say so.

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
| `Law.monotonic(direction, position)` | `'increasing' \| 'decreasing'`, the argument | `a ≤ b` implies `op(…a…) ≤ op(…b…)` in that direction |
| `Law.preservesCollation` | none | folding the result equals folding the arguments (§7) |

- **Each law states its domain**: by default the non-null values of the input
  schemas, under the call's collation, compared by equality of encoded values.
  A law may narrow it with a Schema (`domain: Schema.Int.check(…)`) and name an
  equivalence other than equality.
- **Witnesses are checked at declaration**: an identity must decode against the
  input schema, an inverse or distributing operator must have fitting types.
- **Strict null makes null cases trivial**: under `nulls: 'strict'` both sides of
  every law are null when any argument is, so no law needs a null case.
- **Laws describe; they do not change answers.** Nothing rewrites an expression
  because of one (query-logic).

### 10.2 What not to declare

The README carries these, from gen2's warnings: floating-point addition is not
associative though real addition is; a bounded-text type is not closed under
`concat`, so `concat`'s laws do not transfer to it; idempotence of an operator
is not retry safety of a write, which is the ledger's.

### 10.3 Evidence

```text
claimed   the descriptor says so
tested    an implementation passed the helper's cases: { law, operator, implementation, cases, seed }
proven    a reference to a proof artifact with its stated assumptions; recorded, never verified here
```

- **Evidence belongs to an implementation**, recorded in its table
  (`Operators.withEvidence(table, results)`), and described by
  `describeTable` (§5.7). The same law may be tested for memory and only claimed
  for SQL.
- **`proven` is never read as verified.** Nothing here runs a verifier, so the
  one consumer (§9.2) requires `tested`.

### 10.4 The conformance helper

`foldkit-entity/conformance` gains:

- **`Conformance.operator(op, { implementations, cases })`**: runs each case
  through every implementation given (memory, and SQL over a real database) and
  compares results, failures included. For a defined operator the expansion is
  one of the implementations.
- **Generated cases** for strict null (a null in each position), NUL, the empty
  string, mixed case under each collation the operator meets, and each declared
  law's equation over values drawn from its domain.
- **`Conformance.laws(op, implementation)`** returns the evidence records §10.3
  stores, or the counterexample.
- **The kernel's own operators** run it in `foldkit-entity`'s and
  `foldkit-remote-drizzle`'s suites on SQLite and, where it runs, Postgres.

## 11. Non-goals

- **Partial operators** (§6.1): narrow the input schema instead.
- **Effectful operators**, or any operator reading a clock, randomness, a
  service or the network (invariant 8).
- **Serialised bodies and stable cross-process identities** of expressions:
  bodies stay on the server. Descriptors are described (§5.7), not shipped.
- **Type-level completeness** (§5.6).
- **Rewriting or optimising** by laws (§10.1).
- **Moving existing nodes onto descriptors.** `eq`, `contains` and the rest keep
  their compile rules (settling, `In`'s lists, `contains`'s folding); they move
  only if it deletes code, as query-logic decided for Guard.
- **Representations below the Schema**, and capability or effect vocabularies
  (§13).

## 12. Phases

Each phase is one change in its owning package, with tests shown to fail by a
mutation spec, the docs and skill references in step, and the changelog.

0. **Probes.** Postgres with untyped parameters on each side of `||`, the
   prefix comparison and an ordering by an expression: whether each needs a
   cast. Whether `RemoteServer`, `GuardServer` and the Drizzle binding are built
   where a service can be read. Whether ordering by `substr(…)` collated pages
   correctly with the cursor's keyset comparison on both dialects.
   *Done when* §17 records each answer with the probe that gave it.
1. **Descriptors, nodes and defined operators** (`foldkit-entity`).
   `Expr.operator` with `definedAs`, `Call` and `Test` with their expansion,
   every walker (each first made an exhaustive match), ownership, the budget, `ReadsOf`, `Query.show`, run-time
   validation, the capture check. The CMS adopts `cms.published`.
   *Done when* the CMS's two queries and three guards use it and compile to the
   SQL they did before (asserted); type tests refuse a call over another
   Entity's field, a wrong operand and a wrong arity; a `Test` needs no cast in
   `Expr.and`; dependencies list a field under a call under an `or`; a capturing
   body is refused.
2. **Memory tables, `startsWith`, collations and null** (`foldkit-entity`).
   `Operators` (memory, merge, override, kernel, checked), `evaluate`'s and
   `Invariant.check`'s tables, strict and handled null, NUL, the generalised
   collation rule with `collation: 'operands'`, `startsWith` and its row in
   data-query §6.0.1.
   *Done when* the conformance cases of §10.4 pass in memory for `startsWith`
   and for a test-only handled-null operator; a duplicate implementation and an
   unknown version are refused; an invariant with an operator the table lacks is
   `Undecided` in a form and refused on a server.
3. **SQL, assembly and completeness** (`foldkit-remote-drizzle`,
   `foldkit-remote-server`, `foldkit-guard`). `DrizzleOperators`, the compiler's
   call and test cases and settling of a field-free `Test`, the casts Phase 0
   found, the Layers, and every check in §5.6's table.
   *Done when* the same conformance suite passes on SQLite (and Postgres where it
   runs); a server with a guard or query needing a missing operator does not
   start and names it; the registry's search uses `startsWith`, `012` no longer
   finds a code holding it mid-way, and editing a UPC moves its row into and out
   of the list on the client.
4. **Ordering by a call** (`foldkit-entity`, `foldkit-remote-drizzle`,
   `foldkit-remote`). The order term, the compiler with keyset paging, placement.
   *Done when* a list ordered by a call pages identically in memory and SQL
   across a page boundary with ties; placement is refused with a reason naming
   the operator when the client lacks it; a text call without a collation is
   refused as an order term.
5. **Laws, evidence and the helper** (`foldkit-entity/conformance`). §10 whole.
   *Done when* a law that fails (declaring `concat` commutative) yields a
   counterexample; a witness that does not decode is refused at declaration;
   evidence records round-trip through `describeTable`.
6. **Computed and commuting assignments** (`foldkit-entity`, `foldkit-guard`,
   `foldkit-remote-drizzle`, `foldkit-remote`). §9 whole; increments as
   `number.addInteger` and `number.addReal`.
   *Done when* a computed assignment writes in the compare-and-set statement and
   the row Guard and invariants judge equals the row written (a test that makes
   them differ fails); two concurrent ledgered integer increments both land with
   one result and no `expect`; a real-column increment without `expect` is
   refused where declared; Remote predicts a computed assignment and shows none
   when the client lacks its operator.
7. **Description and docs.** `Operators.describe`, `describeTable`,
   `Query.operators`; the Entity README's operator section with `concat` declared
   by an application, implemented in memory and SQL, checked by the helper; the
   skill's Entity reference; data-query and write-increment updated.
   *Done when* the README's snippets compile in a `*.test-d.ts` and the
   description of every kernel operator validates against its JSON Schema.

## 13. What gen2 gave this design

gen2 (`C:\Users\Patrick\gen2`: `src/types/operation.ts`,
`src/expression/checks.ts`, `src/dialects/core/type-operation.ts`,
`docs/revision/revised_phases.md`) is the prior art #185 cites.

**Taken:** operators defined by an expression and named rules (§5.3); checking
by where an expression runs (§5.6); laws as typed descriptors with witnesses,
including monotonic and order-preserving (§10.1); `claim | tested | proven`
assurance kept apart from the law (§10.3); refusing rather than falling back
(its `FallbackPolicy`'s `deny`); duplicate implementations as an error (§5.4).

**Not taken:**

- **Capability, effect and operation-kind vocabularies** (some forty capability
  kinds, thirteen effects, seven kinds). Purity here is an invariant, not a flag;
  types are Schemas; where an operator runs is a table's presence.
- **Effectful operations** (`effectOp`), and representations below the Schema
  (`u8`, `fixed_string`).
- **Operation traits beyond laws** (`patchable`, `incrementalizable`,
  `retry_safe`, `offline_replay_safe`). Each describes a write or a sync
  protocol, not an expression; §9.2 is the one place an operator's laws reach a
  write, and it reads laws, not a trait.
- **Its checks' blind spot.** `checkStringOps` inspects only literal operands
  because its AST nodes carry no type; every node here is typed and checked when
  built.

## 14. Success criteria

The plan is done when each holds, with the test that shows it:

| # | Criterion | Phase |
| --- | --- | --- |
| 1 | An application declares an operator, defined or primitive, without changing the kernel; the kernel's own operators use only the public API. | 1, 2 |
| 2 | Descriptors and expressions hold no evaluator or SQL. | 1 |
| 3 | Calls nest as scalars and predicates, in `and`/`or`/`not`, Guard rules, invariants, `when`, order terms and assignments, with no cast. | 1, 4, 6 |
| 4 | Inference and ownership survive calls; another Entity's field under a call is refused. | 1 |
| 5 | Dependencies include every field and input under a call or expansion. | 1 |
| 6 | Evaluation is synchronous; SQL compilation uses separately supplied implementations; Layers assemble tables with no global state. | 2, 3 |
| 7 | Duplicate, overlapping and ambiguous implementations are refused unless replaced explicitly. | 2 |
| 8 | A server whose uses need a missing operator does not start, and says which; SQL never drops a condition. | 3 |
| 9 | Untyped callers and widened expressions are checked at run time. | 1, 2 |
| 10 | Null, missing values, stored form, NUL and totality have the semantics of §6, tested in every interpreter. | 2, 3 |
| 11 | Text compares and orders only under a declared collation, computed text included. | 2, 4 |
| 12 | Laws carry domains, witnesses and related operators; evidence is per implementation; a failing law yields a counterexample. | 5 |
| 13 | Only tested evidence lets an assignment skip `expect`; no rewrite reads a law. | 5, 6 |
| 14 | Every existing query, guard, invariant and write answers as before (the existing suites, unchanged). | every phase |
| 15 | The docs show declaration, composition, Layer provision, SQL support, and an application operator with laws, compiled. | 7 |
| 16 | The CMS and the registry use operators in their real queries and rules. | 1, 3 |

## 15. Questions, with proposals

1. **Index use for prefix search.** Measure on the registry's seed first. If it
   matters, a `binary` prefix can compile to a range on the column (from the
   prefix to the prefix with its last character incremented), which both
   databases index; the edges (an empty prefix, a last character at the top of
   the range) become conformance cases. No semantics change.
2. **A collation-following `contains`.** Not until a `binary` field needs a
   case-sensitive search.
3. **Where kernel operators live.** `foldkit-entity/text` and
   `foldkit-entity/number`, subpaths, so the kernel module stays the IR.
4. **Who may replace a kernel implementation.** `Operators.override` on
   `Operators.kernel` is allowed, and the startup message names an overridden
   kernel operator, since it changes what the reference means for that server.
5. **A defined operator described with its body.** §5.7 describes only the
   signature. If the graph needs the body, a defined operator may declare
   example operands for describing; decide with the graph's first reader.
6. **Equivalence for real-valued laws.** Equality of encoded values makes `NaN`
   unequal to itself and `0` equal to `-0`. Proposal: real operators state their
   domain without `NaN` (Effect's `Schema.Finite`), so equality suffices.
7. **Versions across a deploy.** A client built against `@1` meeting a server
   at `@2` refetches rather than matches (its table lacks `@2`), which is safe.
   Whether the catalog should flag such a pair is the contract layer's call.
8. **Computed assignments that read relations.** Out: an assignment reads the
   row it writes. A value from another row is a handler's.
9. **Integers past the safe range.** A SQLite or Postgres integer column holds
   64 bits; a JavaScript number holds 53 exactly. Proposal: `number.addInteger`'s
   domain is safe integers, and an increment's field and amount schemas must be
   bounded to it (`Schema.Int` with a range check) for the law to count;
   otherwise the increment keeps its `expect`. A column that needs the full 64
   bits is a `bigint` field and a separate operator.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| An application ships an operator whose SQL and memory implementations differ | The helper (§10.4); the README says untested operators are unchecked; Guard and assignments require both tables, so a difference shows in tests that compare them |
| The new walker cases miss a consumer | Some walkers are `switch`es that compile with a case missing (`evaluate`'s `valueOf` returns `unknown`); Phase 1 turns each into `Match.tagsExhaustive`, so a missing `Call`/`Test` case is a type error, then adds the cases |
| Ordering by expressions is slow on large tables | §8 promises no index; the README says to index the expression |
| Changing real-column increments breaks applications | 0.x; refused where declared with a message saying to add `expect`; changelog |
| Laws give false confidence | Only `tested` evidence is acted on, by one consumer; `proven` is never read as verified |

## 17. Findings

Empty until Phase 0 runs.
