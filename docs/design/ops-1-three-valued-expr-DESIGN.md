# Three-valued `Expr`, and paths through relations (operations phase 1, #242)

Status: built (2026-10-28). Phase 1 of
[operations-PLAN.md](./operations-PLAN.md): the memory interpreter is
three-valued over what a holder has, and `Expr` reads across `one`
relations (`Expr.path`, `Expr.exists`), compiled to SQL by
`foldkit-remote-drizzle` on SQLite and Postgres. Nothing on the client
predicts with it yet; that is phase 5. See [Deferred](#deferred).

## The problem

The reference interpreter (`evaluate`, `truthOver`) reads one plain row. A key
the row lacks reads as null. On a server that holds every row, that is right.
On a client it is the bug #242 is about: "this field is null" and "I was never
sent this field" read the same, and a list that judged a row by it dropped the
row on no evidence. `foldkit-remote` works around it case by case (`skipped`,
`Belongs`'s `'unknown'`, "a body the client cannot judge is the server's").

And a rule could not cross a relation. Chirp's home feed ("posts by me or by
someone I follow") and a profile's posts by handle could not be bodies, so the
client could place a new row in neither (#238).

## Decision

```text
what a row holds decides     SQL's three values   true · false · null
what a holder lacks decides  unknown              Unknown { reason }

Judge.predicate(p, row)  →  Known(true | false | null) | Unknown(reason)
Judge.query(body, input, row)  →  Known(in | out) | Unknown(reason)

law: where Judge answers Known, it is SQL's answer over every row the reader may see
```

A holder says what it has as a `HeldRow`: each field held, unheld, or hidden;
each `one` relation followed to a held row, to none, or to a row it does not
have; the rows pointing at it, and whether that is all of them. `Held.rows`
builds one over plain records, table by table, each complete or not.

### Four values, not three

SQL's null and the holder's unknown are kept apart. Merging them would make
`not(eq(status, 'draft'))` over a null status unknown on the client, where it
is decided today (the row is out on both sides), and every list over a
nullable field would stop being placeable. So a judgement is SQL's three
values plus one more, and the extra one is never a value a row holds.

| Node | Unknown when | Decided despite an unheld side |
| --- | --- | --- |
| `eq`, `lt` … | a side is unheld | the other side is null: SQL's null whatever this one holds |
| `contains` | the value or search is unheld | either is null |
| `in` | the value or the list is unheld | the list is empty (false), or the value is null |
| `isNull` | the value is unheld | never: absence is what is asked |
| a primitive call | an argument is unheld, or the holder does not run the operator | a strict operator given a null besides: null |
| `and` | an operand is unheld and none is false | an operand is false |
| `or` | an operand is unheld and none is true | an operand is true |
| `not` | its operand is | never |
| a path | a link or the row reached is unheld, or the field is | a link is null, or the holder knows the row is not there: null |
| `exists` | no held pointing row holds, and the holder may lack one | a held pointing row holds (true); every one is held and none holds (false) |

`and(null, unheld)` is unknown, not null: an unheld false would make it false.
A query's `where` list is read at the top, where null and false both mean "out",
so `Judge.query` answers out for either and unknown only past them.

### Where unknown comes from

- A field the holder lacks, or one hidden from this reader.
- A row it lacks: a link to it, or a pointing set it may not hold whole.
- An operator only the server runs (a primitive the holder's table lacks).
  `evaluate` refuses it; `Judge` does not know it.
- A filter only the server runs, conjoined with the body (a Read rule, a
  source's `where`): `Judge.query(…, { serverOnly })` makes a row the body
  admits unknown, and leaves one it refuses out.

### Relation paths

```ts
Expr.path(Post.relations.author, User.fields.handle)
Expr.path(Note.relations.project, Expr.path(Project.relations.org, Org.fields.plan))
Expr.exists(Like.relations.post)                                  // asked of a Post
Expr.path(Post.relations.author,
  Expr.exists(Follow.relations.followee, Expr.eq(Follow.fields.followerId, input.me)))
```

- `Expr.path(relation, end)` follows a `one` relation of the judged row, then
  reads `end` on the row reached: a field, a further path, or an exists. A
  null link, or a row the reader may not see, reaches no row: the field reads
  null, and an exists there reads SQL's null, as a scalar subquery does.
- `Expr.exists(relation, where?)` names the **pointing** edge, a `one`
  relation of another Entity, as `Derived.count` does
  ([233](./233-derived-members-DESIGN.md)): some row of it points here and
  holds `where`. Only rows the reader may see count. SQL's exists is never
  null.
- `where` reads the pointing row's own fields, the input, and the context
  terms. A field of another Entity, a further path or a field after a write is
  refused where it is written.
- Both carry `Reads<…>` of the row they start on, so `Query.where` refuses one
  from another Entity by the type and where it is written. A path's type is its
  field's, or null.
- At most `maxPathLength` (4) relations. A list does not order by a path: a
  client could not place a row by a value another row holds.

### SQL

`foldkit-remote-drizzle` compiles a path to a scalar subquery per relation,
each under its table's visibility rule, and an exists to `exists (select 1 …)`
under the pointing table's:

```sql
(select teams.name from teams where teams.id = members.team_id and (<teams visible>)) = ?
exists (select 1 from badges where badges.member_id = members.id and badges.kind = ? and (<badges visible>))
```

- `bind` gives every binding `reach`, the bindings bound beside it, by Entity
  identity. A binding made with `entity` reaches nothing.
- `query` checks every path at registration: each relation stored on its
  owner's own table (`{ field }`), each Entity bound beside, each field a
  column, and no table met twice along one path or exists (a second meeting
  needs SQL aliases, which this compiler does not write yet).
- Each request resolves the `visible` rule of every table the body reaches for
  its principal, once, and compiles with it (`CompileTarget.visibleOf`). A body
  compiled without it is refused, rather than read rows its reader may not see.

Visibility applies because the server's truth is what this reader may see. A
path that read a hidden row's field would leak it through a filter an input
can probe; it reads null instead, as a hidden counted row is not counted
(233).

## Options considered

1. **Read unknown as false in the two-valued interpreter.** Rejected: it is
   the bug. A list would drop a row on no evidence.
2. **Merge SQL's null and the holder's unknown.** Rejected above: it loses
   decisions the client makes correctly today.
3. **A correlated exists whose filter reads the outer row's fields**
   (`exists(Follow, and(eq(Follow.followee, Post.author), …))`). Rejected for
   now: every interpreter would carry scopes. A path to the anchor says the
   same with no correlation in the filter.
4. **Exists over the owner's `many` relation** (`Post.relations.likes`).
   Rejected for the reason 233 gave: the inverse is the storage's to say, and
   ambiguous between two `one` relations.
5. **A second interpreter beside `evaluate`.** Rejected: the reference
   semantics would be written twice. `evaluate` is now the same code over one
   plain row; only what is not known differs.

## Who owns what

| Fact | Owner |
| --- | --- |
| What a path or an exists means | `foldkit-entity` (`Expr.path`, `Expr.exists`) |
| What a holder has | the holder, as `HeldRow` (`Held.rows` for plain records; the Remote store in phase 5) |
| The answer where the holder has enough | `Judge`, in `foldkit-entity` |
| The truth | the server: the body compiled to SQL under each reached table's visibility |

## The two-valued callers

`evaluate`, `evaluateEach`, `truthOver`, `decided`, `compareRows` and
`valueOfOperand` keep their signatures and answers. They read one plain row,
a missing key as null, as before. They do not read unknown as false:

- `evaluate` and `evaluateEach` refuse a body with a path or an exists up
  front (`supported` does not list them), as for any operation they do not
  run. `foldkit-remote` catches that refusal wherever it judges a list
  (`belongsEncoded` answers `'unknown'`, a local filter an incomplete answer),
  so a list over such a body is the server's to place, as it was.
- `truthOver` and `decided` answer what does not rest on another row
  (`or(true, exists …)` is true) and refuse the rest with `RowsMissingError`, a
  `QueryEvaluateError`. `decided` never decides a predicate that reads a row.
- `remote-drizzle` keeps paths out of rules that are not query bodies: an
  invariant, a write's `when`, a Read rule are refused one at registration.
  Phase 5 runs those on the client, and decides then what they reach.

`predictionOfWrite` and `impact.ts` are not moved (phase 5). The seam phase 5
needs is `HeldRow`, implemented over the Remote store, and `Judge.query`'s
`serverOnly`; nothing else was added for it.

Phase 2's `Expr.viewer` is a term of its own; a path starts at the judged row.
A path from the viewer adds a start to `PathExpr` there.

## Failure semantics

- **A wrong path** (a `many` relation, an end on another Entity, a filter
  reaching past its row, past four relations, ordering by one) is refused
  where it is written, and by the type where the type can say it.
- **A path a binding cannot compile** is refused when its query is
  registered, never on the first request.
- **A row hidden from the reader** reads as absent, on both sides: null at the
  end of a path, not counted by an exists.
- **A NUL in a given value**: `Judge.query` refuses the run, as `evaluate` and
  SQL do.
- **NaN is refused as NUL is**, in an equality, a comparison, a membership
  test and an order key: given, it refuses the run (in memory and in SQL);
  stored, it refuses its row (`evaluateEach` sets the row aside, and the others
  still sort). SQLite stores NaN as null and Postgres orders it after every
  number and equal to itself, so no answer is portable; reading it as unknown
  would claim the server knows one. Before this, one NaN key made the in-memory
  sort leave every row unsorted, and `gt(score, 5)` dropped the NaN row where
  Postgres kept it. `Expr.givesNul` is `Expr.givesUnportable`, for both.
- **A `where` list is asked whole**, as `and` asks every operand. `evaluate`
  stopped at the first false, so whether a row holding NUL was refused
  depended on the order of the list.

## Deferred

- SQL aliases, so a path may meet a table twice (teammates: `Member.team`
  then the team's members).
- Paths and exists in invariants, `when`, guard rules and Read rules: phase 5,
  where the client runs them.
- A `HeldRow` over the Remote store, and moving `matching`, `impact.ts` and
  `predictionOfWrite` onto `Judge`: phase 5.
- `RemoteServer.memory` and other two-valued interpreters running paths over
  tables in memory.
- Ordering by a path; a path from the viewer (phase 2); `many`-relation sugar.
- Bounds on an exists' fan-out in memory. Each judgement scans the pointing
  rows a holder has; a holder that indexes them is the holder's choice.

## Tests

- `packages/entity/test/judge.test.ts`: the relational conformance cases over
  everything the reader may see (all known, equal to SQL's answer) and over
  five partial worlds (known only where it agrees), and each operator's
  unknown and null-beside-unknown rules. `judge.mutations.ts`: 21 mutations.
- `packages/entity/test/path.test.ts`, `path.test-d.ts`: construction,
  refusals by the runtime and the type, dependencies, ownership.
- `packages/remote-drizzle/test/conformance.test.ts`: the same cases on
  SQLite, PGlite, and the Postgres collating by a locale (CI's
  `postgres-locale`). `relational.test.ts`: registration refusals and the
  visibility guard. `relational.mutations.ts`: 7 mutations.
- `packages/entity/test/unportable.test.ts`: NaN refused in each comparison
  and order, given and stored, and a `where` list refusing whatever its order;
  `unportable.mutations.ts`: 10 mutations, three of them in SQL. The
  conformance `refusals` hold the NaN cases for every interpreter.
- The cases live in `foldkit-entity/conformance` (`relationalCases`,
  `relationalTables`, `heldWorlds`), for another interpreter to be held to.
