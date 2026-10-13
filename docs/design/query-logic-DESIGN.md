# `and`, `or` and `not` in queries

> Status 2026-10-12: proposed, not built. This document is the plan.

A query body can say "every one of these holds" today, and nothing else. This
adds the other two connectives, `or` and `not`, and an `and` that can sit
inside them, to `foldkit-entity`'s IR, and carries them through every place
that reads a query: the in-memory evaluator, the Drizzle compiler, Remote's
client-side matching, the memory server and Guard.

## Why now

The data-query design held `or` back until a query needed it, and named the
query that would: "a search box filtering over two fields at once"
([data-query-DESIGN.md](./data-query-DESIGN.md), "What would open each of
Phase 13's members"). Two exist now:

- **The registry's product search** (`examples/registry/src/operations.ts`)
  searches `description` only; a reader typing a UPC finds nothing. It wants
  `description` *or* `upc` contains the text.
- **An optional filter.** "Only this status, if one is chosen" has no spelling
  today except two query bodies. With `or` it is one:
  `or(isNull($status), eq(status, $status))`.

And Guard already built a boolean algebra of its own because `Expr` had none:
`Condition` (`packages/guard/src/condition.ts`) holds row guards under
and/or, since "`Expr` has no `or`, so a disjunction of row guards cannot be
one `Expr`" ([guard-DESIGN.md](./guard-DESIGN.md), slice 3). Its "No negation"
entry deferred `not` "until null semantics are settled". They are, below.

## What exists

- **The IR** (`packages/entity/src/expr.ts`). A `Predicate` is `Eq`, `Null`,
  `Contains` or `In`. A predicate may stand where a value is wanted
  (`eq(isNotNull(x), $archived)`). `Query.where` is a list, and the list is the
  conjunction; two `where`s narrow.
- **Every walker switches on the predicate tags:** `fieldsIn` (the ownership
  check), `childrenOf` and `expandedSize` (the 1,000-node budget), `walk`
  (`Query.dependencies`: fields, inputs and the `operations` used), and
  `showExpr` (`Query.show`).
- **Two interpreters, kept in agreement** by the conformance suite in
  `packages/entity/src/conformance`:
  - `evaluate` (`packages/entity/src/evaluate.ts`) runs a body over rows. It
    follows SQL, not JavaScript: a comparison is `true`, `false` or
    `'unknown'`, and a row is kept only on `true`. `RemoteServer.memory` reads
    with it, and Remote's client judges a changed row with it.
  - `compile` (`packages/remote-drizzle/src/compile.ts`) turns a body into
    Drizzle SQL per request, with the input in hand. It already settles
    `eq(predicate, $boolean)` into the predicate or its `not`, so no boolean
    reaches the database as a parameter.
- **Interpreters refuse what they do not run.** Each declares its `supported`
  operations (`'eq' | 'isNull' | 'isNotNull' | 'contains' | 'in'`) and
  `Query.unsupported` names the rest, so a new operation is refused by an
  interpreter that has not learned it rather than ignored. The two example
  interpreters (`examples/livestore`, `examples/tanstack`) rely on this.
- **Remote's impact analysis** (`packages/remote/src/impact.ts`) asks which
  fields a body's predicates read, then whether a changed row belongs, as
  `yes`, `no` or `unknown`; `unknown` refetches the list. It reads predicates
  only through `dependencies` and `evaluate`.
- **Queries do not cross the wire.** A client sends a query's name and its
  input; the body runs on the server from its own definition. Nothing here
  changes a protocol.

## The design

### The nodes

```ts
interface AndPredicate { readonly _tag: 'And'; readonly operands: NonEmptyReadonlyArray<Predicate> }
interface OrPredicate  { readonly _tag: 'Or';  readonly operands: NonEmptyReadonlyArray<Predicate> }
interface NotPredicate { readonly _tag: 'Not'; readonly operand: Predicate }

type Predicate = EqPredicate | NullPredicate | ContainsPredicate | InPredicate
  | AndPredicate | OrPredicate | NotPredicate
```

They are predicates, so they nest anywhere a predicate does, including inside
`eq` as a value. `Query.where` stays a list: the conjunction-as-list is what
makes a `where` a reusable fragment, and an `and` node is for a conjunction
*inside* something else (`or(and(a, b), c)`).

### The constructors

```ts
Expr.and(a, b, ...rest)
Expr.or(a, b, ...rest)
Expr.not(a)
```

- **Operands are predicates.** A boolean field or input joins through `eq`
  (`Expr.eq(fields.published, true)`), as it does in a `where` today: one way
  to write it, and every interpreter keeps seeing only predicates.
- **At least one operand, checked by the type.** The signature is
  `(first: Predicate, ...rest: ReadonlyArray<Predicate>)`, so `Expr.or()` does
  not compile. A list built at run time passes through
  `Array.isReadonlyArrayNonEmpty`; an empty `or` would be `false` and an empty
  `and` `true`, and a query that silently matches nothing, or everything,
  because a list came back empty is the bug this refuses.
- **One operand is that operand.** `Expr.or(a)` returns `a`, with no node.
- **Nested nodes of the same kind flatten** when built: `and(and(a, b), c)` is
  `and(a, b, c)`. Nothing else is rewritten: no De Morgan, no reordering.
  `Query.show` prints what was written, less the redundant nesting.
- **Ownership** is the existing check: every field under the connective must
  belong to the query's Entity, and `fieldsIn` gains the three cases.

### What they mean: SQL's three values

A row is kept only when its predicate is `true`. `unknown` comes from a null
(`null = x`, `null like x`) and propagates as SQL's does:

| `a` | `b` | `and(a, b)` | `or(a, b)` | `not(a)` |
| --- | --- | --- | --- | --- |
| true | true | true | true | false |
| true | false | false | true | false |
| true | unknown | unknown | true | false |
| false | false | false | false | true |
| false | unknown | false | unknown | true |
| unknown | unknown | unknown | unknown | unknown |

`evaluate` already returns `'unknown'`, so these are three small functions
over `Truth`, and the compiled SQL is Drizzle's own `and`, `or` and `not`. The
conformance suite holds every row of this table for both interpreters.

**The trap it keeps, and says so.** `not(eq(status, 'draft'))` does not match
a row whose `status` is null, in SQL or here, because `null = 'draft'` is
unknown and `not unknown` is unknown. A reader expecting "everything that is
not a draft" writes `or(isNull(status), not(eq(status, 'draft')))`. The
`Expr.not` doc comment and the README say this with that example. A null-safe
`isDistinctFrom` is the alternative, and is not in this plan (see Open
questions).

### Settled per request

The compiler runs once per request with the input in hand, and already settles
a boolean comparison rather than sending a boolean parameter. It extends that
to the new nodes: **an operand that reads no field is decided before any SQL is
written.**

- `isNull($status)` with `status: null` is `true` (today it reaches the
  database as `? is null` with the input as a parameter); then
  `or(isNull($status), eq(status, $status))` is `true` and the whole term goes,
  and with a status given the `or` is just `eq(status, $status)`. The optional
  filter compiles to the SQL a hand-written `if` would have produced.
- `and` with a `false` operand is `false`, `or` with a `true` one is `true`,
  and `not` flips a decided operand; a decided `unknown` stays `null`.
- `evaluate` needs no such step: deciding early and deciding per row give the
  same truth, which the conformance cases with input-only operands check.

### Operations and interpreters

`Operation` gains `'and' | 'or' | 'not'`, recorded by `walk` like the others.
`evaluate` and `compile` add them to `supported`. The livestore and tanstack
examples do not, so a body using them is refused there, by name, until each
learns them, which is the behaviour `Query.unsupported` exists for.

### Remote, the server and Guard

- **Remote's client** needs nothing new. `dependencies` reports the fields
  under an `or` or a `not` as fields the body filters on, so a change to one is
  judged, and `evaluate` judges it. A row whose membership comes out `unknown`
  refetches its list, as now. `remote/test/matching.test.ts` gains or/not cases
  that move a row into and out of a list.
- **`RemoteServer.memory`** reads through `evaluate`, so it runs them as soon
  as the evaluator does; its conformance test proves it.
- **Guard** can lower a `Condition` of row guards to one `Predicate`, `Or` of
  each surface's guards inside the `And` of `always`, and so compile through
  the one code path instead of its own. That is a simplification, not a
  requirement; Phase 5 does it only if it deletes Guard code. `not` in a guard
  stays out until a rule asks for it.

## What this does not do

- **No comparisons.** `lt`, `gt`, `between` and friends are the other half of
  "and so on", and a separate design: they bring ordering semantics (which
  values order the same in every interpreter) that `Query.placement` already
  reasons about for `orderBy`, and text needs a collation. Phase 6 opens it.
- **No `ne` or `notIn` sugar.** Each is `not(…)` over the existing predicate,
  and a name that reads as "not equal" hides the null trap above.
- **No boolean fields as bare predicates.** They join through `eq`, as today.
- **No `exists` or joins.** Those are data-query Phase 13.
- **No rewriting.** Flattening only; the evaluator and compiler run what was
  written.
- **No protocol change.** Bodies stay on the server.

## Plan

Each phase is one change with its tests and docs, in its owning package, and
each test is shown to fail by a mutation spec.

1. **The IR** (`foldkit-entity`). The three nodes and constructors, flattening,
   the four walkers (`fieldsIn`, `childrenOf`, `walk`, `showExpr`, printing
   `(a or b)` parenthesised inside an `and` and `not (…)`), and the three
   operations. Type tests: an empty `and`/`or` and a non-predicate operand are
   `@ts-expect-error`. Unit tests: flattening, a single operand returning
   itself, the node budget counting a shared operand on each path, ownership
   refused through an `or`, `dependencies` listing fields under `not`.
2. **The evaluator and the suite** (`foldkit-entity`). `holds` gains the three
   cases over `Truth`; `evaluate.supported` adds them. The conformance suite
   gains the truth table above over nullable columns, nesting, and input-only
   operands. `RemoteServer.memory` and Remote's client matching pass it with no
   change of their own.
3. **The compiler** (`foldkit-remote-drizzle`). Drizzle's `and`/`or`/`not`, the
   per-request settling of field-free operands, and `supported`. It passes the
   same suite on SQLite; Postgres runs it when the TODO's live-Postgres item
   lands.
4. **The adopters.** The registry's search becomes `description` or `upc`, with
   a test that finds a product by its UPC, which it could not before; one
   optional filter written as
   `or(isNull($x), eq(field, $x))` with a test of the compiled SQL in both
   cases. Docs: the Entity README's operator table (and its "no `Expr.and`"
   paragraph), the skill's Entity and Remote references, data-query-DESIGN's
   "There is no `and` and no `or`" status, and the changelog.
5. **Guard, if it deletes code.** Lower `Condition` to one predicate where a
   binding compiles it; keep `Condition` where principal guards decide whether
   row guards apply at all.
6. **Comparisons**, as their own design: `lt`, `lte`, `gt`, `gte`, over the
   values `Query.placement` already calls intrinsically ordered (numbers,
   booleans) and text only under a declared `Binary` or `AsciiFold` collation.

## Open questions

1. **A null-safe inequality.** `isDistinctFrom(a, b)` (SQL's `IS DISTINCT
   FROM`) is what most "not this value" filters mean. Add it with comparisons
   in Phase 6, or here if an adopter in Phase 4 needs it.
2. **How deep a body may nest.** The node budget bounds work; it does not stop
   a body Postgres's planner handles badly. Measure with the first real `or`
   over an indexed column before adding any limit.
3. **Whether a generated form or list filter should build these.** A CRUD
   list's filters are a list of conditions today; an "any of" toggle would
   build an `or`. Decide with a screen that asks for it, not before.
