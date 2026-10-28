# A write's effects are inferred; only server-chosen values are declared (#232)

Status: built (2026-10-28). `Entity.stamps` in `foldkit-entity`, filled by
`RemoteServer.write`, predicted by the Remote client, and pending creates
placed in the lists their bodies admit (#266). `GuardServer.writer`'s
`presets` and `stamps`, and `EntityWriter.sets`, are removed. Proven in
`examples/chirp` and `examples/reference`. See [Deferred](#deferred).

`Entity.stamps` and `Stamp` were replaced, before release, by `Entity.sets`
over `Expr.viewer` and `Expr.now`: see
[operations-phase3-DESIGN.md](./operations-phase3-DESIGN.md).

## The problem

The issue opened with a table: a write's consequences (who wrote it and when,
the counts it moves, the lists it joins, what the answer carries) lived in
four places, and an app kept them in agreement by hand. It proposed a
`Write.effects` declaration with stamps, derived effects and `joins`.

Most of that table was already inferred by the time this was built, from
declarations the app makes anyway:

| A write's effect | Inferred from | Built in |
| --- | --- | --- |
| The row it writes, as the client shows it | the `Write` (`Write.bind`, `Write.apply`) | #213, `optimisticOfWrite` |
| A count or "liked by me" it moves | the Entity's `Derived.count` / `Derived.exists` over the written row's relation | #233 |
| Hiding a deleted row from every list | the delete itself (a pending tombstone) | #246 |
| What the answer carries | the client's active Selections (`shown`) and the rows the write points at | #245, #233 |
| Which lists a row is in, and where | each query's body and order (`impact.ts`: `belongsEncoded`, `placeIn`) | #238; pending creates here (#266) |
| A refusal it can be told | the `Write`'s `expect`, `when`, the Entity's invariants | #200s |

One thing is left that no Expr can infer, because nothing in the input or the
rows says it: **a value the server chooses**. Who is asking, and what time it
is. A guard rule can check `authorId = p.id`, but cannot say "set it"; an
`Entity.input` can leave the field out, but then the client cannot predict it,
so the new row is missing a field every Selection reads, and joins no list
ordered by it. Chirp and the reference app worked around this two ways: send
the value from the client and check it on the server (the like's `userId`,
the note's `authorId`, `author` and `createdAt`, plus a guard wrapper
`ownLikes`), or set it server-side with `GuardServer.writer`'s `presets` and
`stamps`, which the client could not see.

## Decision

```text
Entity.stamps({ field | one relation: Stamp.viewer | Stamp.clock })   declared once, on the Entity
        │
        ├─ every Write of the Entity: an insert stamps them (write.stamps); any input that sets one is refused where the write is declared
        ├─ server: RemoteServer.write fills them (RemoteServer.make's viewer, Effect Clock) before the writer and its guard run
        └─ client: Data.mutate predicts them (Remote.make's viewer, the time the store last heard)
                └─ then, with no further declaration: the derived counts and exists the new row moves,
                   its own counts at 0, and its place in every loaded list its body admits
```

```ts
export const Post = Chirp.Post.pipe(
  Entity.stamps({ authorId: Stamp.viewer, author: Stamp.viewer, createdAt: Stamp.clock }),
)
export const LikePost = Mutation.write(
  'LikePost',
  Write.insert(Entity.input(Like, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
    postId: 'post',
  }), { id: 'id' }),
)
```

There is no per-write effects declaration. A stamp is a fact about a member
of an Entity, like its Schema or a `Derived` member: "a post's author is
whoever made it". Every write of the Entity follows from it.

### Why on the Entity, not the write

The first cut of this slice put `stamps` on `Write.insert`. It was moved,
because:

- Two inserts of one Entity (a post and a reply) would each have to repeat it,
  and one that forgot would let the client name the author.
- An update that set the author would pass, since the stamp spoke only for the
  insert that declared it. On the Entity, every write's input is checked.
- The guard's `presets` were already a second, server-only copy; a write
  option would have been a third.

### Who asks: the viewer

The issue's sketch was `Stamp.principal(p => p.id)`, which needs the
principal's type in shared code and a client stand-in for it. Both sides
already declare who reads, as a row, for `Derived.exists`: `Remote.make({
viewer })` on the client, and a principal-to-ref function on the server. So
`Stamp.viewer` is that row: a `one` relation is pointed at it, a text field
holds its id. On the server the function is given once, to
`RemoteServer.make({ viewer })`, which hands it to every mutation's `run`; a
server that registers a write stamping the viewer without one is refused where
it is made. A visitor's insert that stamps the viewer is refused as
forbidden, as a preset's was.

A relation stamped with a viewer of another Entity (a Team reading where a
User is pointed at) is unfilled: forbidden on the server, unpredicted on the
client.

### When: the clock, and its client stand-in

The server reads Effect's `Clock`, so a test pins it. The client cannot: a
pending layer is made in `update`, which reads no clock. Its stand-in is the
latest clock reading the store was written at, when the client last heard
from the server. A new row then sorts after every row the client has read,
which is what "now" means to a newest-first list. A store never written has
none, and the time is left out (the row reads as missing it until the
answer). The answer brings the server's time, and the list re-places the row
by it in the reduction that releases the layer.

A clock stamp is left out of a retried insert's comparison (`stamped`), so a
retry answers the row it made (#203); a viewer stamp is compared, so the same
id from another asker is someone else's row. Both count as set where an insert
is registered against an invariant that reads them (#202).

### A field and a link over one column

Chirp's post, and the reference note, have both an `authorId` field (the guard
rule reads it, a query filters on it) and an `author` relation (the Selection
follows it, `Derived.count` counts by it), stored in one column. Both are
stamped; the drizzle writer sets the column once from each, with one value.
This settles #267 (the input sent the author twice): no input sends it at
all. That one column has two members is the Entity's modeling, and is left
as it is.

### Lists: pending creates placed by the body

`impact.ts` already judged a row a write creates: membership by the body,
position by the order. The pending path skipped rows a list did not hold,
because their selected fields might not be loaded. A created row's are: the
layer holds the whole row, stamps and derived members included. So a pending
create now joins each loaded list its body admits, where its order puts it,
and the answer's placement (which already ran for created rows) keeps it there
by the server's values. A list with no body, or filtered by a read rule the
client does not run, is the server's: the pending row joins none, and the
answer invalidates it. Where the row lacks a field the list selects (Chirp's
`may`, which only the server can say), the list leaves it out until the answer
brings it, and plans no read of a row the server has not made.

## What was removed

- `Write.insert`'s `stamps` option (committed earlier in this slice, never
  released): one way, on the Entity.
- `GuardServer.writer`'s `presets` and `stamps`: replaced by `Entity.stamps`,
  which the guard sees already set on the proposed row, so a rule over the
  author holds of the creator. A preset of anything but the asker
  (`orgId: user => user.orgId`) has no replacement yet: see Deferred.
- `EntityWriter.sets`: only the guard's presets filled it.
- Chirp's `ownLikes` wrapper and the like's `userId` input; the like's
  person is stamped, and taking one back is the guard rule `isLiker` over the
  stamped `userId` field.
- The reference app's clock read, its `authorId`/`author`/`createdAt` input
  keys, and its `Data.overlay(ConnectionChange.prepend(...))` workaround.

## Failure semantics

- **A wrong declaration** (the id, a many relation, the clock on a relation or
  on text, the viewer on a number, a member stamped twice, an input key that
  writes a stamped member) is refused where it is declared, and by the type
  where the type can say it.
- **A visitor** stamping the viewer is forbidden; nothing is written.
- **A server with no viewer** for a write that stamps one is refused at
  `RemoteServer.make`.
- **A refused write** releases its layer: the row, its stamps, its counts and
  its place in every list go together.

## Deferred

- **A value from the principal that is not the asker's row** (a tenant id, a
  role): the removed `presets` covered it server-side only. A
  `Stamp.principal(path)` would need a client stand-in, which the viewer
  declaration does not give.
- **A server-minted id.** Inserts still name their row with a client id; a
  `Stamp.id` would need the client to place a row under a temporary id and
  re-key it on the answer.
- **An update's clock** (`editedAt`): a stamp is written at creation only.
- **`may` for a row the viewer just made** (#242): until the client can judge
  guards, a list that selects `may` shows a new row when the answer lands.
- **One column, two members**: an Entity relation stored through one of its
  own fields, so a stamp on the relation is the field's too.
- **The source's `viewer`** (`foldkit-remote-drizzle`'s `source(binding, {
  viewer })`) is the same function as `RemoteServer.make`'s, passed twice.
  Folding it needs every reader of a source (the live poll, the guard's own
  reads) to carry the server's viewer.
- **Conformance** of the prediction against a fresh read over every declared
  write (#257).

## Tests

- `packages/entity/test/stamp.test.ts` (16 mutations): the declaration's
  refusals, by the runtime and the type; what an insert stamps; what
  `Write.stamp` fills and names unfilled; an input that sets a stamped member
  refused on an insert and an update.
- `packages/remote-drizzle/test/stamp.test.ts` (8 mutations): over SQLite,
  the asker and the clock written and answered, never from the input; a
  visitor refused; a retry keeping its time; another asker refused; a server
  without a viewer refused; a stamped field registered against an invariant.
- `packages/remote/test/stamp.test.ts` (10 mutations): the prediction (the
  viewer, the last-heard time, a new row's derived members), a stamped link
  moving a count and an exists, and a pending create placed by a list's body
  and kept there by the answer.
- `packages/guard/test/stamps.test.ts`: the same through a guarded writer.
- `examples/chirp/test/post.test.ts`, `examples/reference/test/notebook.test.ts`
  and both examples' mutation specs and e2e tests.
