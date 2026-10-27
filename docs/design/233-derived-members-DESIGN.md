# Derived members say what they derive (#233)

Status: slice 1 built (2026-10-27): `Derived.count`, declared in
`foldkit-entity`, compiled by `foldkit-remote-drizzle`, predicted by the
Remote client, and answered by the server for the rows a write changes
indirectly (#245's slice 2). `Derived.exists` and viewer-relative members are
designed here and deferred. See [Deferred](#deferred).

## The problem

A derived member today is `Derived.make(schema)`: the Entity says a value
exists and nothing about what it is. The one fact that makes it a count lives
in `remote-drizzle`'s binding, as a name string:

```ts
Entity.derived({ likeCount: Derived.make(Schema.Number) })
// …and, on the server only:
derived: { likeCount: { relation: 'likes' } }
```

Three things follow, each hit in Chirp (#216, #226, #231):

1. **The client cannot predict it.** A like's optimistic patch computes
   `likeCount + 1` by hand, and the Message carries the current count to do it.
2. **The answer cannot carry it.** A Like's answer names the Like, not its post,
   so once the layer is released the count went back to its old value. #245
   now answers what the client shows of the rows a write *names*; the post is
   not named, because only the binding knows the like counts toward it.
3. **"Did I like this?" has no member.** Apps select the whole relation and
   test membership on the client, which reads every like of every post.

## Options considered

1. **Keep the binding's `{ relation }` and teach the client to read it.**
   Rejected: the binding is server code, and the fact would still be a string
   the client and server could disagree on.
2. **`Derived.count(Post.relations.likes)`: count the owner's `many`
   relation.** It reads naturally, but to predict it the client must know which
   field of a Like points back at the post, which a `many` relation does not
   say (its storage may be a foreign key or a join table). Inferring the inverse
   among the target's `one` relations is ambiguous as soon as there are two, and
   disambiguating needs a second option.
3. **`Derived.count(Like.relations.post)`: count the rows whose `one` relation
   points here (chosen).** The member names the edge that decides membership.
   A Like row's `post` *is* the fact "this like counts toward that post", so:
   - the client predicts from the written row itself: an insert linking `post`
     adds one to that post, a delete of a held Like subtracts one from the post
     it held;
   - the server compiles it from the pointing relation's own storage (its
     foreign key column), with no `derived` entry;
   - there is nothing to infer and nothing ambiguous.

   A join table with no Entity (Chirp's `likedBy`) cannot be said this way, and
   no declared write can change it either, so nothing could predict it. It
   stays `Derived.make` plus the binding's count, which is the server-only path
   the issue keeps for members only the server computes.

## API

```ts
const Domain = Entity.relate(
  { Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields) } },
)

export const Post = Domain.Post.pipe(
  Entity.derived({ likeCount: Derived.count(Domain.Like.relations.post) }),
)
```

- `Derived.count(relation)` takes a `one` relation, by reference, whose target
  is the Entity it is added to. Anything else is refused: by the type (a
  relation to another Entity names both in the error) and where it is declared
  (a `many` relation, or a relation of another Entity's identity).
- Its value is a non-negative integer.
- Because it names another Entity's relation, it is added after
  `Entity.relate`, as `Guards.attach` is.
- `Derived.make(schema)` is unchanged: a member the server supplies.
- Each derived member now carries `derives`, a tagged value
  (`Supplied`, `Count { relation }`) that interpreters match on.

`remote-drizzle`'s `bind` compiles a `Derived.count` from the pointing
relation's storage: `select count(*) … where fk in (…) group by fk`, under the
pointing table's `visible` rule, as an existing count is. Its `derived` entry
takes only `Derived.make` members; an entry for a `Derived.count` is refused
(a second statement of the same fact).

## Who owns what

| Fact | Owner |
| --- | --- |
| What a derived member is (a count of the rows whose `post` points here) | the Entity (`foldkit-entity`) |
| How it is read from the database (which column, which visibility rule) | `remote-drizzle`'s `bind`, from the pointing relation's storage |
| What it reads like while a write is pending | the Remote client, from the declaration and the rows it holds |
| What it is once the write has landed | the server's answer: the fresh read of the rows the write points at |

No layer restates another: the binding no longer names the relation, the client
no longer receives counts through Messages, and no handler names the post.

## How the client predicts

`Data.mutate` already turns a declared write into a pending patch
(`optimisticOfWrite`). For each `Derived.count` over the written Entity's
relation, it adds a pending increment to the row that relation points at:

| Write | Before (as the client holds the row) | After | Prediction |
| --- | --- | --- | --- |
| insert linking `post` to p | not held | p | p's count + 1 |
| delete of a held Like | p | — | p's count − 1 |
| update relinking `post` | p | q | p − 1, q + 1 |
| update not touching `post` | p | p | none |
| anything whose before is not held | unknown | | none: the answer decides |

The increment is the existing `adds` mechanism: it is worked out over the count
the store holds whenever the store is read, so a read of the post that lands
while the write is pending is added to, not hidden. It is made only for a
counting row the client holds with a number in that member: a count it has
never shown is not invented.

An app's own `optimistic` still wins wholly, as before; the prediction is part
of what a declared write derives, not added to a hand-written list.

## How the answer carries it (#245, slice 2)

`RemoteServer.write` names, beside the row it wrote, every row that row points
at through a `one` relation: before an update or a delete and after an insert
or an update, read through the writer's `linked`. #245's answer read then reads
what the client shows of each, through the same Sources and `authorize` as any
read. The release of the layer and the server's count land in one reduction, so
no frame shows the old count.

Naming every pointed-at row, not only those with a `Derived.count`, is
deliberate. A row's derived members can depend only on what is stored, and the
rows a write can change through a relation are the rows it points at; this also
covers a server-only `Derived.make` over a relation. The cost is one read of the
shown fields of each, which the answer already makes for the row itself.

A name with no values (as these are, and as a handler's
`Remote.patch(Post, id, {})` is) carries nothing of its own, so it is no longer
sent as a patch: the client receives the row through the read, or not at all
when the asker may not read it. A hidden row's id is not disclosed.

## Viewer-relative members (designed, deferred)

```ts
likedByMe: Derived.exists(Like.relations.post, Viewer, ({ row, viewer }) =>
  Expr.eq(row.accountId, viewer.id)),
```

- **Declaration.** The same pointing relation, a predicate over the pointing
  row, and a viewer schema whose fields are `Expr.input`s, as a guard's
  principal fields are.
- **Server.** An `exists (select 1 … where fk = id and <predicate>)`, with the
  viewer's values from the principal. The binding needs that mapping
  (`principal → Option<Viewer>`); with none, the member is `false`.
- **Live and caching.** Its value depends on the asker, so a source must not
  list it as `shared`, and the live hub keys it by principal, as it does `may`.
- **Client.** A pending insert predicts `true` when the predicate holds over
  the written row with the client's viewer. That needs a viewer on the client
  (`Remote.make({ viewer })`), and the field the predicate reads must be in the
  written row: a server preset (`accountId` from the principal) is not, which is
  what #232's stamps fix. A delete predicts `false` only for a held row the
  predicate held for, and is exact only where at most one row can match.

Each of those is a piece of its own, and none is needed for counts, so slice 1
ships counts alone.

## Failure semantics

- **A wrong declaration** (a `many` relation, a relation of another Entity, a
  `derived` entry for a count, a pointing Entity not bound) is refused where it
  is declared or bound, never at the first read.
- **A pending write the server refuses** releases its layer, increment included:
  the count reads what it read before.
- **A prediction over a count read meanwhile.** The increment is added to the
  newer count. If that read already includes the write (it committed before the
  answer arrived), the count reads one too many until the answer, which replaces
  it. This is the same window an increment has today.
- **The answer's read fails** (or the asker may not read the post): as in #245,
  the mutation still succeeds, and the client fetches the count as before.
- **A writer without `linked`** names no pointed-at rows; the client then
  fetches a shown count it lacks, as before this change.

## Deferred

- `Derived.exists` and viewer-relative members, above, with a client viewer
  and #232's stamps.
- Counts with a filter (`Derived.count(relation, where)`): predicted only where
  the filter can be evaluated over the written row.
- Other aggregates (sum, max): server-only at first.
- Live subscribers: the hub hears what a write answered; telling other viewers a
  post's count changed needs the hub to read a pointed-at row's derived members.
- `Guards.may` as a viewer-relative derived member underneath.
- Chirp's like as a declared write pair over a `Like` Entity (#216): needs
  `exists` for its pressed state. Until then Chirp's like stays a handler over a
  join table, and Chirp proves the count on a person's post count.
