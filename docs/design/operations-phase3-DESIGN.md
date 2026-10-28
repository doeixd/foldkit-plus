# A field's value over the context, and rules over links (operations phase 3, #232)

Status: built (2026-10-28). Phase 3 of [operations-PLAN.md](./operations-PLAN.md).
`Entity.sets(…, { on })` replaces `Entity.stamps` and `Stamp`; a `one`
relation is an `Expr` operand, so a rule compares the link itself and Chirp's
`authorId` and `userId` go.

## The problem

[232](./232-write-effects-DESIGN.md) declared the server's values with a
closed enum (`Stamp.viewer`, `Stamp.clock`), on create only, and only from the
asker's own row. Three gaps followed:

- A value derived from the asker (their organisation) had no declaration: the
  removed `presets` had covered it on the server alone.
- An update's time (`editedAt`) had none.
- A rule could not read a relation, so every stamped link kept a twin field
  over the same column for the guards and the queries: `authorId` beside
  `author`, `userId` beside `user`.

## Decision

```text
Entity.sets({ member: context value }, { on: 'create' | 'write' })

context value   Expr.now                                  a field stored as a number
                Expr.viewer(User)                         a one relation to User, or a field stored as text
                Expr.path(Expr.viewer(User), end)         a field the end's value fits

on: 'create'    every insert
on: 'write'     every insert and every update; a delete sets nothing

server  RemoteServer.write: viewer (make's), now (the write's time), a path read
        through the server's own sources as the asker sees them   → the truth
client  Data.mutate: Remote.make's viewer, the operation's now, a path read
        from the store; a row or field it lacks is unknown        → no prediction
```

```ts
const Post = Chirp.Post.pipe(
  Entity.sets({ author: Expr.viewer(User), createdAt: Expr.now }, { on: 'create' }),
  Entity.sets({ editedAt: Expr.now }, { on: 'write' }),
)
const Note = Notes.Note.pipe(
  Entity.sets(
    { orgId: Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.orgId)) },
    { on: 'create' },
  ),
)
// A rule over the link itself:
guard.row(Chirp.Like, p => Expr.eq(Chirp.Like.relations.user, p.id))
```

### The names

- **`Entity.sets(values, { on })`**, as the plan named it; `on` is required,
  so a reader never guesses which writes a value is for.
- **`on: 'write'` includes the create.** A row was last written when it was
  made, so `editedAt` is never null and equals `createdAt` (the same captured
  `now`) until the first edit. "Edited" is `editedAt > createdAt`. A member
  that must stay empty until an edit is an ordinary nullable field set by the
  update's input.
- **A delete sets nothing.** There is no row left to hold a value.
- **A path from the viewer is `Expr.path(Expr.viewer(E), end)`**: the same
  constructor, started at the viewer instead of the judged row. `end` is a
  field of `E` or a path from `E`, as for any path. It is a value of its own
  (`ViewerPathExpr`), not a member of `Expr` yet: no interpreter of a query
  body or a rule reads it in this phase, so the type refuses it there and
  `Expr.eq` refuses it at run time. Phase 5 adds it to rules.
- **A `one` relation is an operand** (`Expr.eq(Like.relations.user, …)`): its
  value is the id it points at, null for none, typed as the target's id. A row
  given to an interpreter holds it under the relation's key as that id, as
  `Held.rows` already takes it. In SQL it is the relation's column (a relation
  stored `{ field }`); a relation stored on the other table is refused where
  the body is registered. Its key is listed among the fields an expression
  reads, so a list or a guard that watches what a body reads watches the link.
- **The Write's record is `write.context`** (`ContextSet`: the member and its
  value), since `write.sets` already names what the input sets.
  `Write.contextValues(write, context, read)` replaces `Write.stamp`. It is
  an Effect: `read` gives a path one member of one row at a time, the
  server's through its own sources (`MutationSource.run`'s new `read`), the
  client's from its store (run with `Effect.runSync`).
- **A ref-keyed row is read through `Held.fromRefs(query, row)`.** A Source
  and the Remote store keep a link as its ref key (`'User:ada'`); the client's
  list judgement, the memory server and Guard's rules convert the links a
  body reads to ids first. A link is found as a key the body reads that is no
  field of its Entity, since a guard's Entity may be the one declared before
  `Entity.relate`.

### What is refused, and where

| Case | Refused |
| --- | --- |
| The id; a `many` relation; a derived member; a member set twice | `Entity.sets` |
| A relation set to anything but `Expr.viewer` of its target | `Entity.sets`, and the type |
| `Expr.now` on a field not stored as a number; the viewer on one not stored as text; a path whose end the field cannot hold | `Entity.sets`, and the type where it can say |
| Any other value (an input, a literal: those are `compute` and a default) | `Entity.sets`, and the type |
| An input key that writes a set member | the `Write`, where declared (insert and update alike, whatever `on` says) |
| A set needing a viewer, on a server with none | `RemoteServer.make` |
| A path through an Entity the server has no source for | `RemoteServer.make` |
| A value that comes to null for a member that holds none (a visitor; a viewer of another Entity; a path reaching no row the asker may see) | the write, as `Forbidden` |
| A link operand over a relation stored on the target's table | the compiler, where the body or rule is registered |
| Ordering by a link | where the term is made (a list orders by its own fields) |

### Edge cases

- **Unknown on the client.** A path whose row or field the store lacks (the
  viewer's own row not loaded, a hidden field) predicts nothing for that
  member. The row reads as missing it until the answer, as a time did without
  `now` in phase 4. A null for a member that holds none is left out too: the
  server will refuse the write, and the layer is released with it.
- **The server reads a path as the asker may see it.** Each step reads through
  the server's own Entity source, with its read rule and `viewer`, so a value
  the asker could not read never reaches a row they write. A hidden row reads
  as null, as a path in a query body does, and a null for a non-null member is
  `Forbidden`.
- **Guards** see the values already set on the proposed row, for a create and
  for an update. A member rule over a set member judges the server's value
  like any other: an app declares none there.
- **Invariants** count a set field as set where an insert is registered
  (#202), and an after-row rule reads the value set.
- **Derived members** move with a set link as with an input's: a new post's
  `author` adds one to the author's `postCount`, predicted and answered.
- **The ledger and retries.** A retry carries the same id and the same `now`
  (phase 4), so it recomputes the same values. A writer with a ledger answers a
  retried create or update from its record before anything is recomputed;
  without one, an update sent again writes the same `editedAt`. A retry whose
  first attempt fell back to the server's clock (skewed, or an older client)
  writes the clock's new reading: the same rule as phase 4's.

## What was removed

`Entity.stamps`, `Stamp`, `WriteStamp`, `Write.stamp`, `write.stamps` and
`entity.stamps`, all unreleased. Chirp's `Post.authorId` and `Like.userId`,
and the reference app's `Note.authorId`: their columns stay, as the relations'
storage.

## Deferred

- A path from the viewer in query bodies and rules (`Expr.eq(Note.fields.orgId,
  viewer's orgId)`): phase 5, which runs rules on the client.
- A relation set from a path (`org: viewer's org`): a path ends at a field.
- `Remote.patch`-style sets for opaque handlers: they read `now` and `viewer`
  from their run context, as before.

## Tests

- `packages/entity/test/link.test.ts`, `link.test-d.ts` (4 mutations): the
  link as the id, null for an optional one, unknown to a holder that lacks
  it, its dependency, and the refusals (a many relation, ordering, another
  Entity's link) by the runtime and the type.
- `packages/remote-drizzle/test/link.test.ts` (3), `packages/guard/test/link.test.ts`
  (1), `packages/remote/test/link.test.ts` (3): a body over a link through
  SQL and the memory server alike, a link stored on the other table refused,
  a guard rule filtering a read and deciding a delete over a ref-keyed row,
  the client judging its store.
- `packages/entity/test/sets.test.ts` (19): the declaration's refusals, what
  an insert and an update set, `unfilled`. `viewerPath.test.ts` (9): a path
  read through a holder, null against unheld, the Entities it reads, the
  refusals.
- `packages/remote-drizzle/test/sets.test.ts` (18; `setsColumn` 5): the
  server writes the viewer and the time on create, `editedAt` on update, a
  visitor refused. `viewerPath.test.ts` (3, two marked equivalent): `orgId`
  from the asker's team over SQLite, a path reaching no row or a hidden one
  refused, a server serving no Team refused.
- `packages/remote/test/sets.test.ts` (20), `viewerPath.test.ts` (3): the
  prediction, `editedAt` on an edit at the reader's time, a path predicted
  from the store, and not where it lacks a row or a field.
- `packages/guard/test/sets.test.ts` (3): an update's `editedAt` judged by a
  row rule as the row it leaves holds it.
- `examples/chirp` and `examples/reference`: the author declared once, their
  tests, mutation specs and e2e.
- `heldValue.test.ts` gets no generator: no Message is added, and a predicted
  context value is an ordinary pending patch, which its generators cover.
