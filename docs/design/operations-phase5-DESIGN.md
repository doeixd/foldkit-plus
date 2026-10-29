# The client runs the rules it is given (operations phase 5, #242)

Status: built (2026-10-28). Phase 5 of [operations-PLAN.md](./operations-PLAN.md).
It builds on phase 1's `Judge` ([ops-1](./ops-1-three-valued-expr-DESIGN.md)),
phase 2's context terms ([ops-2](./ops-2-context-terms-DESIGN.md)) and phase
3's links and viewer paths ([operations-phase3](./operations-phase3-DESIGN.md)).

## The problem

Three things the plan promised the client still needed a round trip:

- **`may`** was a `Derived.make` member only the server supplied. A row the
  reader just made had none, so a view selecting `may` (Chirp's timeline, for
  its Edit button) could not draw the row until the answer landed.
- **Guard rules could not read the context.** A rule compared a link with the
  principal's fields (`p.id`), which only the server has. `Expr.viewer` in a
  rule failed at run time: no guard interpreter was given a context.
- **A path from the viewer** (`Expr.path(Expr.viewer(Member), …)`) was read by
  `Entity.sets` only. No body or rule could compare with one.

## Decision

```text
rule  = Expr over the row, its links, Expr.viewer, paths     (shared code)
server: SQL (Read rules, bodies), memory (writes), viewer from the guard set's
        { viewer } by key                                    → the truth
client: Judge over the store, viewer from Remote.make        → foreseen where every
        principal guard, principal field and unheld row could turn either way
        and the answer stays the same; otherwise nothing is shown
```

### 1. A path from the viewer is an operand

`ViewerPathExpr` joins `Expr<T>`, so `Expr.eq(Note.fields.orgId,
Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.orgId)))`
is a query body. `Expr.eq` takes a path on its right, typed `T | null`.

- **SQL** compiles it as phase 1 compiles a path, anchored at the viewer's id
  instead of the judged row's column: one scalar subquery per table, each
  under its `visible` rule, the viewer's own table's too. A visitor, or a
  viewer of another Entity, binds a null id, which no row has, so the path
  reads null. `checkFields` checks it at registration as it checks a path;
  the judged row's table may be the viewer's, since no subquery reads the
  judged row.
- **`Judge`** reads the viewer's row from a holder: `JudgeOptions.rows`
  (`HeldRows`). `Held.rows` gains `find(entity, id)`: none where the table is
  complete and lacks the row, unheld where it is not.
- **`evaluate`**, given one plain row, refuses it as it refuses a path. So
  does the memory server, which serves no body over a path.
- `Query.dependencies` lists it in `reaches` and its operations as `viewer`
  and `path`, so an engine without them refuses it by name. No list orders by
  one.

### 2. Guard rules read who asks

The design first threaded the request's context through `Visible` and
`Condition.holds`. That meant changing remote-server's read seams, and the
guard set already owns the principal-to-person mapping (`key`). So:

- **`Guards.declare(…, { viewer: User })`** names the Entity each principal is
  a row of, by `key`. The Policy works out the context from the principal, so
  every seam that already decides a rule for a principal decides it with
  `Expr.viewer`: the memory judge (`Condition.Row` carries the context it was
  decided with) and the SQL compile (`GuardDrizzle.visible`).
- **`Policy.viewer(principal)`** is that ref, handed to
  `RemoteServer.make({ viewer: Policy.viewer })`, so the server still has one
  viewer.
- A rule over `Expr.viewer` in a set without `viewer`, or over `Expr.now`
  (who may does not move with the clock), is refused where it is declared.
- **Only a row's `Read` rule reaches other rows** (a path, an exists, a path
  from the viewer). It compiles to SQL, which reads the rows it reaches **as
  stored**: a rule is the server's decision, as a principal guard's body is,
  not a read by the principal. Every other surface (a write, a member, a
  relation, `always`) is judged over one row in memory, so `Guards.attach`
  refuses such a rule there.

Chirp's rules compare with `Expr.viewer(UserFields)` and its server's viewer
is `Policy.viewer`. The reference app keeps `p.id`; both forms stand.

### 3. A supplied member may say how the client foresees it

`Derived.make(schema, { predict })`. `predict({ entity, row, rows, context })`
takes the row a write leaves as the client holds it (`HeldRow`), the store as
a holder (`HeldRows`) and the operation's context, and returns the encoded
value, or none. `predictionOfWrite` runs it for the written row of an insert
or an update, beside `freshDerived`; none adds nothing, so the row waits for
the answer. The row a write leaves is the store's row with the write's values
over it; a field the write moves (an increment, a computed value) is unheld.
The store as a holder (`packages/remote/src/held.ts`) reads a link as the id
it points at, an unread row as unheld and a tombstone as absent; it never
holds every pointing row, so an exists over it is unknown unless a held row
decides it.

`Guards.may` declares one. The server's `may` and the client's are assembled
by the same code (`mayRules`, `answerOf` in `may.ts`); only how a rule is
decided differs:

| Part | Server | Client (`Condition.judge`) |
| --- | --- | --- |
| a principal guard | its body | unknown |
| a row guard reading the principal's fields (`p.role`) | over the input | unknown |
| a row guard over the row, links, `Expr.viewer` | `evaluate` | `Judge.predicate` over the store; unknown where it is |
| an inherited Read | its row's rule | unknown (only a Read inherits; `may` asks no Read) |
| a surface with no rules | the set's `unguarded` | the same |

A condition is an `or` of `and`s with no negation, so it is monotone in each
unknown part. The client works the whole answer out twice, every unknown part
taken to hold and taken not to, and foresees `may` only when the two agree:
then no way the unknown parts turn out changes it. A half-known answer would
draw a button the answer takes away, or hide one it shows.

A client without a viewer is never taken for a visitor (a visitor passes no
rule over the principal's fields): it may be signed in and not told so.

**Security.** A prediction is a hint for the page, as the server's `may` is;
the server re-decides every rule on the write. The client judges only rows and
fields it was sent; a rule over a hidden field or an unheld row is unknown, so
no prediction says more than the client already holds.

### 4. Forms already run the invariants

`foldkit-form` judges a submit with `Entity.judgeInput`, the reference
interpreter over the row the input describes, and shows each failure beside
its field (`packages/form/test/invariant.test.ts`). A field the input does not
set leaves an invariant undecided, which refuses nothing: the plan's "unknown
predicts nothing". Phase 5 adds no form API.

## What is refused, and where

| Case | Refused |
| --- | --- |
| A viewer path whose relation is stored on the other table, or meets a table twice | the compiler, at registration (as a path) |
| A viewer path in a body run over one row (`evaluate`, the memory server) | the run, by name (`path`) |
| A rule over `Expr.viewer` in a set with no `viewer` | `Guards.declare` |
| A rule over `Expr.now` | `Guards.declare` |
| A rule reaching another row on a write, member, relation or `always` surface | `Guards.attach` |
| Ordering by a viewer path | where the term is made |

## Deferred

- **Client list judgement over paths.** `matching` still judges one plain row,
  so a list whose body reads a path or a viewer path is the server's to place
  (its rows are `skipped`). Moving it onto `Judge` over the store is phase 6's,
  where the conformance law checks it.
- **Derived counts and exists as `Expr`.** `freshDerived` and `derivedOfWrite`
  still predict `Derived.count` and `Derived.exists` by their own code; they
  become an `Expr` over relations, judged like any other, in phase 6.
- **Write rules over paths**, judged in SQL in the write's statement.
- **The client refusing a write locally** from a false invariant or `may`.
  The form refuses a submit; `Data.mutate` sends what it is given.

## Tests

- `packages/entity/test/viewerPath.test.ts`, `.test-d.ts` (14 mutations in
  `viewerPath.mutations.ts`): a body over a viewer path judged over a holder,
  a visitor and a viewer of another Entity, unknown and known-absent rows, a
  hidden field, no rows given, refused by a one-row run, its dependencies, no
  order; the type takes a path on `eq`'s right and refuses a mismatched one.
- `packages/entity/src/conformance/relational.ts`: six viewer-path cases
  (`relationalContext`), judged by `Judge` over every held world
  (`judge.test.ts`) and by SQL on SQLite and PGlite (`remote-drizzle`'s
  `conformance.test.ts`, 5 mutations in `viewerPathBody.mutations.ts`).
- `packages/guard/test/viewerRule.test.ts` (6 mutations): a rule over
  `Expr.viewer` decided in memory, `Policy.viewer`, the refusals, and a Read
  rule over a viewer path compiled to SQL on SQLite and PGlite.
- `packages/guard/test/mayPrediction.test.ts`,
  `packages/remote/test/suppliedPrediction.test.ts`,
  `examples/chirp/test/drawn.test.ts` (9 mutations in
  `mayPrediction.mutations.ts`): `may` foreseen for a new post, not where a
  principal guard or the principal's fields decide, refused with its sentence
  where nothing unknown could allow it, not over an unheld link, a visitor
  refused, a client with no viewer not taken for one; a supplied member over
  a new row, over the store's row, and not over a moved field; Chirp's
  timeline drawing a new chirp with its Edit before the answer.
- `packages/remote/test/heldValue.test.ts`: a generator for a create whose
  supplied member is foreseen.
- Re-anchored: `judge`, `primitive`, `sites`, `relational`, `parameters`,
  `condition`, `server` (`may` now in `may.ts`), `viewerPath`, `write` and
  Chirp's specs.
