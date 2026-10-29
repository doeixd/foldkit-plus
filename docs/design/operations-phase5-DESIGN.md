# The client runs the rules it is given (operations phase 5, #242)

Status: design (2026-10-28). Phase 5 of [operations-PLAN.md](./operations-PLAN.md).
It builds on phase 1's `Judge` ([ops-1](./ops-1-three-valued-expr-DESIGN.md)),
phase 2's context terms ([ops-2](./ops-2-context-terms-DESIGN.md)) and phase
3's links and viewer paths ([operations-phase3](./operations-phase3-DESIGN.md)).

## The problem

Three things the plan promised the client still need a round trip:

- **`may`** is a `Derived.make` member only the server supplies. A row the
  reader just made has none, so a view that selects `may` (Chirp's timeline,
  for its Edit button) cannot draw the row until the answer lands.
- **Guard rules cannot read the context.** A rule compares a link with the
  principal's fields (`p.id`), which only the server has. `Expr.viewer` in a
  rule is refused at run time: no guard interpreter is given a context.
- **A path from the viewer** (`Expr.path(Expr.viewer(Member), …)`) is read by
  `Entity.sets` only. No body or rule may compare with one.

## Decision

```text
rule  = Expr over the row, Expr.viewer and paths from it        (shared code)
server: SQL (visible), memory (writes), with the request's viewer   → the truth
client: Judge over the store, with Remote.make's viewer           → true | false | unknown
        principal guards and principal inputs are unknown here; unknown predicts nothing
```

### 1. A path from the viewer is an operand

`ViewerPathExpr` joins `Expr<T>`, so `Expr.eq(Note.fields.orgId,
Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.orgId)))`
compiles in a query body and in a guard rule.

- **SQL** compiles it as phase 1 compiles a path, anchored at the viewer's id
  instead of the judged row's column: one scalar subquery per relation, each
  table under its own `visible` rule, so a row the reader may not see reaches
  nothing and the path reads null. A visitor, or a viewer of another Entity,
  binds null. `checkFields` checks it at registration as it checks a path.
- **`Judge`** reads the viewer's row from a holder: `JudgeOptions.rows`
  (`HeldRows`). `Held.rows` gains `find(entity, id)`, which says whether a row
  not held is known absent (a complete table) or unknown, as `follow` does.
- **`evaluate`**, given one plain row, refuses it as it refuses a path
  (`RowsMissingError`). The memory server serves no body over a path today and
  does not start serving one here.

A viewer path reads no field of the judged row, so `Query.dependencies` lists
its Entities in `reaches`, as a path's, and none of its fields among the row's.

### 2. Guard rules read the request's context

- `Visible` (`foldkit-remote-drizzle`) takes a third argument, the request's
  `ExprContext`. The drizzle source and query pass their own; a rule reading
  `Expr.viewer` compiled without one is refused, never read as a visitor's.
- `Condition.holds` takes the context too. `GuardServer` passes the viewer its
  source or writer was given.
- A **write** rule is judged in memory over one row, which cannot follow a
  path. A rule over a path or a viewer path on a write surface is refused
  where `GuardServer.writer` is built, naming it. Read rules compile to SQL and
  take both.

Chirp's and the reference app's rules move from `p.id` to `Expr.viewer(User)`:
`Expr.eq(Post.relations.author, Expr.viewer(User))`. The principal's fields
stay available to rules for claims a row does not hold (a role).

### 3. A supplied member may say how the client predicts it

`Derived.make(schema, { predict })` (*settled here*). `predict(entity, row,
context)` takes the row a write leaves as the client holds it (`HeldRow`) and
the operation's context, and returns the encoded value, or none for unknown.
`predictionOfWrite` runs it for the written row after an insert or an update,
beside `freshDerived`; none adds nothing. The server never calls it.

`Guards.may` declares one: each interaction, member and relation rule judged
three-valued (`Condition.judge`, beside `holds`):

| Part | On the client |
| --- | --- |
| a row guard over the row, links, `Expr.viewer`, viewer paths | `Judge.predicate` over the store |
| a row guard reading the principal's fields (`p.role`) | unknown |
| a principal guard (its body is the server's) | unknown |
| `or` | true if any is true; unknown if any is unknown and none true |
| `and` | false if any is false; unknown if any is unknown and none false |
| a surface with no rules | the set's `unguarded` |

`may` is predicted only when every part is known: a half-known answer would
draw a button the answer then takes away, or hide one it then shows. An
`explain` refusal's sentence is in the shared attachment, so a predicted
refusal carries it.

**Security.** A prediction is a hint for the page, as the server's `may` is.
The server re-evaluates every rule on the write. The client judges only rows
and fields it was sent; a rule over a hidden field or an unheld row is
unknown, so no prediction says more than the client already holds.

### 4. Forms already run the invariants

`foldkit-form` judges a submit with `Entity.judgeInput`, the reference
interpreter over the row the input describes, and shows each failure beside
its field (`packages/form/test/invariant.test.ts`). A field the input does not
set leaves an invariant undecided, which refuses nothing: the plan's "unknown
predicts nothing". Phase 5 adds no form API; it states the claim and its test.

## What is refused, and where

| Case | Refused |
| --- | --- |
| A viewer path whose relation is stored on the other table, or meets a table twice | the compiler, at registration (as a path) |
| A viewer path in a body run by `evaluate` over one row | `RowsMissingError` (as a path) |
| A rule reading `Expr.viewer` compiled or judged without a context | `ContextMissingError` / `QueryCompileError` |
| A write rule over a path or a viewer path | `GuardServer.writer`, where built |
| `predict` returning a value its schema refuses | `predictionOfWrite`, as a thrown programming error |

## Deferred

- **Client list judgement over paths.** `matching` still judges one plain row,
  so a list whose body reads a path or a viewer path is the server's to place
  (its rows are `skipped`). Moving `matching` onto `Judge` over the store is
  phase 6's, where the conformance law checks it.
- **Write rules over paths**, judged in SQL in the write's statement.
- **The client refusing a write locally** from a false invariant or `may`.
  The form refuses a submit; `Data.mutate` sends what it is given, and the
  server's refusal is the answer.

## Tests

To be listed as built.
