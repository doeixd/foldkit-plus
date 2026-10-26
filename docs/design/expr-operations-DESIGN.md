# Operators in the expression kernel

**Status:** Proposed, 2026-10-26, for
[#185](https://github.com/doeixd/foldkit-plus/issues/185). Nothing built.
**Package:** `foldkit-entity`, with the SQL side in `foldkit-remote-drizzle`
and checks in `foldkit-guard`.
**Companions:** [data-query-DESIGN.md](./data-query-DESIGN.md) §6 (the kernel
and its rule for adding an operator), [query-logic-DESIGN.md](./query-logic-DESIGN.md)
(connectives, comparisons, collations),
[entity-invariant-DESIGN.md](./entity-invariant-DESIGN.md) (invariants read
the same predicates).

#185 asks for operations a user can declare, with behaviour supplied
separately, so Guard, queries, invariants and declared writes can say more
without each growing a language. This document checks that request against
the kernel as built and settles the five questions the issue leaves open:
how it fits the existing rule for adding an operator, which real query uses
it first, whether evaluation becomes an Effect, what `concat` and `startsWith`
mean around null and case, and how text computed by an operator compares.

API names below are proposals. Snippets are sketches, not compiled code.

## 0. Decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | How it fits data-query §6.0 | The rule stands for every operator the kernel ships. An application's operator meets the same rule through the conformance helpers it is given. §2. |
| 2 | First caller | The registry's search finds a product by the start of its UPC: `startsWith`, declared with the public API and nothing the kernel keeps for itself. `concat` has no caller and does not ship; it is the documented example of an application's operator. §3. |
| 3 | Effect evaluation versus Layers | Evaluation stays a pure synchronous function that takes a table of implementations. A Layer is only how a server built from Layers receives that table, once, at construction. §5. |
| 4 | Null and case | Every operator is strict: a null operand gives null, and a predicate over null is unknown. `startsWith` compares under its operand's collation, and is refused without one. §6. |
| 5 | Computed text's collation | An operator may declare that its text result keeps its operands' collation. The comparison rule becomes "text needs a collation" rather than "text needs a field". §7. |

## 1. What exists

- **Fixed nodes.** A scalar is `Literal`, `Field`, `Input` or `Next`
  (`packages/entity/src/expr.ts:64`); a predicate is `Eq`, `Null`,
  `Contains`, `In`, `And`, `Or`, `Not` or `Compare`. No node computes a
  scalar from others.
- **Operations are names.** `Operation` is a string union. Each interpreter
  lists the names it runs (`supported`), and `Query.unsupported(body,
  supported)` names what a body needs that an interpreter lacks. Every
  consumer checks it once: the Drizzle compiler at registration
  (`checkFields`), Guard's `visible` at startup, `evaluate` per call.
- **Three interpreters branch on the nodes:** the reference `evaluate`
  (`packages/entity/src/evaluate.ts`), the Drizzle compiler
  (`packages/remote-drizzle/src/compile.ts`), and `examples/tanstack`'s.
  `examples/livestore` runs a subset. Guard, invariants (`truthOver`), declared
  writes' `when` and Remote's client matching all run through the first two.
- **Values are the stored form.** Rows, input and invariants are read
  encoded (entity-invariant §3); Remote's client matches with encoded input.
- **Missing is the caller's.** `evaluate` reads an absent key as null. Remote's
  client does not ask it about such a row: it skips any row lacking a field
  `Query.dependencies` names, and answers `unknown`
  (`packages/remote/src/matching.ts`). A body `evaluate` refuses
  (`QueryEvaluateError`) is also `unknown` there, which refetches.
- **#182–#184 shipped on these nodes** (0.33.0, #189). Adopting operators
  there means reading the new nodes wherever those features read predicates;
  none of them needs an operator today.

## 2. Reconciling with data-query §6.0 and query-logic

Data-query §6.0 says an operator is portable only once its semantics are stated
in terms an interpreter is held to, and §6.0.2 adds one in four steps: state
its semantics, name the real query that needs it, build the reference
interpreter first, add differential cases for the disagreements the backends
would have. That rule exists because `contains` matched different rows in
three places before a mixed-case fixture caught it.

User-defined operators do not weaken it; they move who is held to it.

- **An operator the kernel ships** follows §6.0.2 unchanged. Its semantics
  go into data-query §6.0.1's table, it has a named caller, and its
  differential cases join `foldkit-entity/conformance`.
- **An operator an application declares** states its semantics in its
  descriptor's doc comment, and is held to them by the same suite: the
  conformance package gains a helper that runs an operator's cases through
  every implementation the application supplies, compared result by result,
  failures included. The kernel cannot prove an application ran it, so the
  README says plainly that an operator without those cases is unchecked.
- **The kernel never guesses.** An interpreter without an implementation of
  an operator refuses the body by that operator's id, as it refuses an
  unsupported kernel operation now.

From query-logic, kept as they are:

- **No rewriting.** Flattening only. A declared law (§8) does not authorize
  regrouping, reordering or elimination.
- **Three values.** A predicate operator answers true, false or unknown, and
  takes its place in `and`, `or` and `not` like any predicate.
- **Settled per request.** The compiler decides a predicate that reads no
  field before writing SQL, now including a predicate operator over inputs
  and literals, which needs the operator's in-memory implementation in the
  compiler's hands (§5).
- **Text orders only under a declared collation**, generalised in §7.

What changes in data-query: §6's kernel gains one scalar node and one predicate
node, and §6.3's derived dependencies list operator ids beside operation names.

## 3. The first caller

No query in the repository needs a new operator today, and that is worth saying
before choosing one. The registry's search is the best real candidate:

```ts
// examples/registry/src/operations.ts, today
Expr.or(
  Expr.contains(fields.description, input.search),
  Expr.contains(fields.upc, input.search),
)
```

A UPC is read and typed from its start. `contains` matches digits anywhere,
so a search for `012` finds every product whose code holds `012` in the
middle. A prefix is what the search means:

```ts
Expr.or(
  Expr.contains(fields.description, input.search),
  Text.startsWith(fields.upc, input.search),
)
```

It exercises the whole path on one query: the Drizzle compiler on SQLite, the
client's matching (a row moves into and out of the list as its UPC is edited),
and the field's declared `Collation.binary`, which `startsWith` reads (§6).

`startsWith` is declared in `foldkit-entity` with the public
`Expr.operator`, implemented with the public implementation API, and compiled
through the public SQL implementation API. Nothing in the kernel names it, which
is the evidence for #185's first criterion: an operator needs no change to the
core.

**`concat` does not ship.** Nothing here computes text from two fields. It is
the README's example of an application's own operator, with laws (§8), and §6
states its semantics so that example is honest. When a query needs it, it moves
into the kernel by §6.0.2.

This caller is weak: it improves a working query rather than unblocking one. A
stronger one is an application that needs an operator of its own. If one
appears before Phase 2 ships, it replaces this one.

## 4. The design

### 4.1 An operator is a descriptor

```ts
const startsWith = Expr.operator('text.startsWith', {
  input: [Schema.String, Schema.String],
  output: Schema.Boolean,
})
```

- **Identity is the descriptor object; the id is its name.** Ids are
  namespaced (`text.startsWith`, `acme.slugOf`), checked by a pattern at
  declaration, and `foldkit.` is reserved. Two descriptors with one id in one
  table are refused as ambiguous. Ids are not stable across versions and
  nothing is serialised by them: bodies stay on the server (query-logic "No
  protocol change"), so a persisted id is out of scope until something stores a
  body.
- **It holds no behaviour.** No evaluator, no SQL, no service. A descriptor is
  frozen like every node.
- **Its schemas describe the stored form**, since every interpreter runs over
  it (§1). An operand is accepted when its encoded form is the input's: the
  same reading `Expr.lt` makes of a field's encoded AST to decide how it orders.
  At the type level, operands are checked by their `Type` as every other
  constructor checks them (`ValueOf`). Where the two forms differ (a `Date`
  stored as text) the runtime check is the one that holds, and the type test
  covers the case.
- **A Boolean output makes a predicate.** Calling a descriptor whose output is
  `Schema.Boolean` builds a predicate node, usable in `and`, `or`, `not`, a
  Guard row rule, an invariant and a `when` with no cast. Any other output
  builds a scalar node, usable as an operand anywhere a scalar of that type is.
- **Declared once, at module level.** `Expr.operator` validates its arguments
  for untyped callers (an id that fails the pattern, a non-Schema input, an
  arity mismatch at call time) and throws where it is written.

### 4.2 Two nodes

```text
Call  (scalar):    { _tag: 'Call', operator, args, collation }
Test  (predicate): { _tag: 'Test', operator, args }
```

Two tags, not one with a flag, so `isPredicate` and every `Match.tagsExhaustive`
tell them apart without reading a field. Every walker gains both:
`fieldsIn`, `childrenOf`, `walk`, `showExpr`, ownership, the node budget
(each argument counts on each path, as shared operands do now), `sideKind`
(a call's kind is its output's encoded kind), `readsAField`/`decided`,
`valueOf`/`holds` in `evaluate`, and the compiler's operand and predicate
cases.

- **Dependencies walk the arguments.** A field passed to an operator is a field
  the body reads, so Remote's client skips a row lacking it and Guard's
  `guardFields` names it. An implementation receives only its arguments; it
  cannot read anything else, so nothing is hidden from this walk.
- **Ownership walks them too.** A field of another Entity under a call is
  refused by the type (`ReadsOf` of a call is the union of its arguments')
  and at run time, as under a connective now.

### 4.3 Implementations, kept apart

```ts
// foldkit-entity: the in-memory implementation
const memory = Operators.memory(
  Operators.implement(startsWith, (text, prefix) => text.startsWith(prefix)),
)

// foldkit-remote-drizzle: the SQL implementation
const sql = DrizzleOperators.make(
  DrizzleOperators.implement(startsWith, ({ args: [text, prefix], collated }) =>
    sql`${collated(substr(text, prefix))} = ${collated(prefix)}`,
  ),
)
```

- **An implementation table is an immutable value**, keyed by descriptor.
  `Operators.memory(...)` refuses two implementations of one operator;
  `Operators.override(table, ...)` is the explicit way to replace one. Tables
  combine with `Operators.merge`, which refuses an overlap the same way. No
  registration is global.
- **The kernel's own operators come in `Operators.kernel`** (and
  `DrizzleOperators.kernel`), which every interpreter starts from unless given
  another table, so the registry needs no wiring for `startsWith`.
- **A memory implementation is a pure synchronous function** over encoded,
  non-null values (§6). It may not return an Effect. An operator that must look
  something up is not an operator: that is a principal guard's work, or a
  server's.
- **A SQL implementation builds Drizzle `SQL`** from its arguments, already
  compiled, with the dialect and a helper that applies the call's collation as
  the cursor does (`collatedColumn`). Nothing translates the JavaScript
  function into SQL.

### 4.4 Completeness

- `Query.unsupported(body, interpreter)` names every kernel operation and every
  operator id the interpreter lacks. Each existing check site
  (`checkFields`, Guard's Drizzle `visible`, `evaluate`) reads it with that
  interpreter's table, and `GuardServer.validate`, which does not ask it today,
  gains the same check, so a server whose policies need an operator it cannot
  run does not start. The message names the operator, the query or guard, and
  the interpreter.
- **The SQL side never weakens a rule.** A guard whose operator has no SQL
  implementation is refused at startup; it is never compiled without that
  condition and never post-filtered.
- **The client may lack one.** Remote's client evaluating a body whose
  operator its table lacks gets a `QueryEvaluateError`, which matching already
  reads as `unknown` and refetches. That is remote-improvement-plan §16.2's
  rule for "a derived member only the server computes", reached with no new
  code.
- **Not checked by the type.** A body's type does not carry the operators it
  needs. Tracking them would add a parameter to `Query` and every interpreter
  signature, and an Effect requirement on a service would not prove per-operator
  coverage anyway. Startup checks are the guarantee, and the README says so.

## 5. Evaluation stays synchronous

#185 sketches `Expr.evaluate(expression)` returning an Effect that needs an
interpreter service. That does not fit three callers:

- **Remote's client** evaluates bodies in its matching on every relevant
  change, outside any Effect environment. An Effect per evaluation, or a
  service lookup per node, is cost on that path for nothing.
- **`evaluate` is the reference semantics** and "may depend on the IR and
  nothing else" (its module comment). A service requirement is a dependency.
- **Invariants and Schema checks** (#183) run inside a Schema check, which is
  synchronous.

So the table is a value, and every interpreter takes it as an argument:

```ts
evaluate(body, input, rows, { operators: memory })
```

**A Layer is assembly, not evaluation.** `Operators.layer(table)` provides a
`MemoryOperators` service, and `DrizzleOperators.layer(table)` a
`DrizzleOperators` one. A server built from Layers (`RemoteServer`,
`GuardServer`, a Drizzle binding) reads the service once where it is built and
passes the table down; nothing reads it per request or per node. An application
that builds no Layers passes the table directly. Both routes end in the same
value, so there is one way to evaluate and one way to supply a table to it.

Whether each of those servers is built inside an Effect that can read a service
is Phase 3's first check; where one is not, it takes the table as an option and
no Layer is added for it.

## 6. Semantics

### 6.1 Rules every operator keeps

- **Strict on null.** If any argument is null, a scalar call is null and a
  predicate call is unknown. The implementation never sees a null. This is
  SQL's rule for operators and functions, and the kernel enforces it before
  calling the memory implementation; a SQL implementation must keep it, which
  the conformance helper checks with a null in each position. An operator that
  wants another rule for null is out of scope until a caller needs one.
- **Missing is not null, and is not the operator's.** Callers that can lack a
  field check for it before evaluating (§1); dependencies now reach fields under
  calls, so that check covers them.
- **Encoded values in, encoded value out.** A brand is not kept: `concat` of two
  `Slug`s is a `string`, because its output schema says so.
- **NUL is refused.** Text holding NUL is refused by every kernel operation
  (`holdsNul`), since Postgres text cannot hold it; operators keep that, checked
  by the kernel before the implementation runs.
- **Total over their stated domain.** An implementation that throws is a bug,
  reported as a `QueryEvaluateError` naming the operator. A partial operator
  (one that refuses some non-null inputs) would need its SQL implementation to
  fail the statement on exactly those inputs, which none here can promise, so
  partial operators are out of scope.

### 6.2 `startsWith(text, prefix)`

| Case | Answer |
| --- | --- |
| either is null | unknown |
| prefix is `''` | true |
| otherwise | whether `text` begins with `prefix` under the call's collation |

- **It compares under a collation, like `Expr.lt`.** The collation is the one
  passed, or the text operand's declared one (a field's, or a call's by §7).
  `binary` compares exactly; `asciiFold` folds ASCII letters on both sides.
  Text with no collation, or a `Locale` one, is refused where it is written,
  with `Expr.lt`'s messages.
- **Why not fold always, as `contains` does.** `contains` was built before
  fields declared collations and folds ASCII case by definition; that stays, so
  nothing built changes meaning. A new text operator follows the field's
  declaration instead. A UPC is `binary`; a label a user searches by its start
  would declare `asciiFold`.
- **Characters, not bytes or code units.** In memory, `text.startsWith(prefix)`
  after folding when folded. In SQL, the first `length(prefix)` characters of
  `text` equal `prefix` under the collation: `substr(text, 1, length(prefix))`
  on SQLite, `left(text, length(prefix))` on Postgres, each side wrapped as the
  cursor wraps a collated column. Over valid strings, a prefix by code points is
  a prefix by UTF-16 units, so the three agree.
- **Not `like 'p%'`.** It would need the input's `%` and `_` escaped, and
  SQLite's `like` folds case whatever the collation. The cost is that neither
  form uses an index; that is measured on the registry before anything cleverer
  (§11).

### 6.3 `concat(a, b)`, as the README's application operator

| Case | Answer |
| --- | --- |
| either is null | null |
| otherwise | `a` followed by `b` |

- **SQL's `||`, not Postgres's `concat()`.** `||` gives null for a null operand
  on SQLite and Postgres alike; Postgres's `concat()` reads null as `''`, which
  would disagree with SQLite and with the strict rule. In memory, the kernel's
  null check means `a + b` never meets a null, so `"null" + b` cannot happen.
- **Text only.** Its inputs are `Schema.String`; a number is not coerced.
- **Its collation** is its operands' (§7), so `startsWith(concat(dir, name), p)`
  is writable when `dir` and `name` declare the same collation.

## 7. Collation of computed text

Today `Expr.lt` over text requires a field on one side, since the collation is
a field's (`collationFor`, `expr.ts`). A call's text result has no field, so
under that rule `lt(concat(a, b), x)` and `startsWith(concat(a, b), p)` are
refused.

**The rule becomes "text needs a collation".** A text operand has one when it
is a field or `Next` that declares one, or a call whose operator keeps its
operands':

```ts
const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
```

- **`collation: 'operands'`** gives the call the collation its collated
  operands share. Literals and inputs carry none and do not vote. Operands that
  disagree are refused where written, as two fields that disagree are now. With
  no collated operand the call has none.
- **It is only sound for an operator that commutes with the collation**: folding
  the result must equal the result of folding the operands. `concat` does, under
  `binary` (nothing to fold) and `asciiFold` (folding is per character). A
  `substring` would too; an operator that reorders or drops characters by case
  would not. The descriptor's author asserts it, and the conformance helper
  checks it with mixed-case cases when it is declared.
- **The default is none**, so an operator says nothing and its text is refused
  in comparisons, the conservative answer.
- **Ordering by a call stays out.** `orderBy` takes a field only (data-query
  §6.0.1), and this does not change it.

## 8. Laws and evidence

Laws are built last, because nothing consumes them: there is no optimiser and
query-logic forbids rewriting. Their first use is testing and documentation.

- **A law is a typed descriptor on the operator**, naming what it needs:
  `Law.associative`, `Law.commutative`, `Law.identity(value)` (left, right or
  both), `Law.idempotent`, `Law.distributes(over)` with the other operator's
  descriptor. Each states its domain: over non-null values of the input schema,
  under the call's collation, compared by encoded equality. With the strict null
  rule, a null operand gives null on both sides of every law, so no law needs a
  null case of its own.
- **Evidence is per implementation, not per operator.** `Law.tested(law,
  implementation, cases)` records that an implementation passed the helper's
  cases. Nothing records "proven": no verifier is integrated, and a label would
  read as one.
- **The helper generates cases** for each declared law and runs them through
  every implementation given, comparing actual results across them, so a law
  that holds in memory and fails in SQL is caught as a disagreement.
- **The README example:** `concat` is associative with `''` as both identities,
  and not commutative or idempotent. A floating-point addition would not be
  declared associative; a bounded-text type is not closed under `concat`, so
  `concat`'s laws do not transfer to it.
- **No rewrite reads a law.** If an optimiser is ever built, it reads evidence,
  not claims, and a security-relevant rewrite (a Guard condition) needs a rule
  of its own. Algebraic idempotence is not a write's retry safety; that is the
  write ledger's (write-improvement-PLAN Phase 3).

## 9. What this does not do

- No change to existing nodes. `contains`, `eq` and the rest stay fixed nodes
  with their own compile rules (settling, `In`'s lists, `contains`'s folding).
  Moving them onto descriptors would be churn with no caller; it is done only if
  it deletes code, as query-logic Phase 5 decided for Guard.
- No serialised bodies or stable ids (§4.1).
- No operators with effects, hidden reads, or their own null rule (§6.1).
- No operator in `orderBy` (§7).
- No type-level completeness (§4.4).
- No optimiser (§8).

## 10. Phases

Each phase is one change in its owning package, with tests shown to fail by a
mutation spec, the docs and skill references in step, and the changelog.

0. **Probes.** Postgres with an untyped parameter on each side of `||` and of
   the prefix comparison (`$1 || $2` and `left($1, length($2)) = $2`): whether it
   resolves or needs a `cast(? as text)`, which the SQL implementation helper
   then adds. Whether `RemoteServer`, `GuardServer` and the Drizzle binding are
   built where a service can be read (§5). Findings go in §12.
1. **Descriptors and nodes** (`foldkit-entity`). `Expr.operator`, `Call` and
   `Test`, every walker, ownership, the budget, `ReadsOf`, runtime validation.
   Type tests: a call over another Entity's field, a wrong-typed operand and a
   wrong arity are `@ts-expect-error`; a `Test` in `Expr.and` needs no cast.
   Unit tests: dependencies list a field under a call under an `or`; a shared
   call counts on each path.
2. **The memory implementation and `startsWith`** (`foldkit-entity`).
   `Operators`, `Operators.kernel`, `evaluate`'s table argument, the strict null
   and NUL checks, `startsWith` with its row in data-query §6.0.1, the
   generalised collation rule (§7), and conformance cases: mixed case under both
   collations, empty prefix, null in each position, a non-ASCII prefix.
3. **SQL and assembly** (`foldkit-remote-drizzle`, `foldkit-remote-server`,
   `foldkit-guard`). `DrizzleOperators`, the compiler's two cases and settling
   of a field-free `Test`, `Query.unsupported` with tables at every check site,
   and the Layers where §5's probe allows. The same conformance suite on SQLite,
   and Postgres where it runs.
4. **The registry adopts it.** The search uses `startsWith` for the UPC, with
   a test that `012` no longer finds a product holding it mid-code, and a client
   test that editing a UPC moves its row into and out of the list.
5. **Application operators in the docs.** The Entity README's operator section,
   with `concat` declared by an application, implemented in memory and SQL, and
   checked by the conformance helper; the skill's Entity reference.
6. **Laws and evidence** (§8), when an operator with a law ships or an
   application asks for the helper.

## 11. Questions, with proposals

1. **Index use for prefix search.** Proposal: measure on the registry's seed
   before anything else. If it matters, a `binary` prefix can compile to a range
   on the column (from the prefix up to the prefix with its last character
   incremented), which both databases index; that is the compiler's choice, its
   edges (an empty prefix, a last character at the top of the range) are
   conformance cases, and it changes no semantics.
2. **Should `contains` gain a collation-following variant?** Proposal: no,
   until a field that declares `binary` needs a case-sensitive search.
3. **A non-strict operator** (`coalesce`-like). Proposal: out until a caller;
   it would need a declared null rule and conformance cases for it.
4. **Where `Operators.kernel` lives once there are several text operators.**
   Proposal: `foldkit-entity/text`, a subpath, so the kernel module stays the IR.

## 12. Findings

Empty until Phase 0 runs.
