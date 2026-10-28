# Derived members say what they derive (#233)

Status: built (2026-10-27). Slice 1: `Derived.count`, declared in
`foldkit-entity`, compiled by `foldkit-remote-drizzle`, predicted by the
Remote client, and answered by the server for the rows a write changes
indirectly (#245's slice 2). Slice 2: `Derived.exists`, a viewer-relative
member ("liked by me"), end to end, and Chirp's like as a declared write pair
(#216). See [Viewer-relative members](#viewer-relative-members-slice-2) and
[Deferred](#deferred).

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
| Who reads, for a `Derived.exists` | the application: its principal on the server (`source`'s `viewer`), its Model on the client (`Remote.make`'s `viewer`) |

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

## Viewer-relative members (slice 2)

```ts
liked: Derived.exists(Like.relations.post, { viewer: Like.relations.user }),
```

### The declaration

The slice-1 sketch was a predicate over the pointing row with a viewer
schema (`({ row, viewer }) => Expr.eq(row.accountId, viewer.id)`). It was
rejected for the reason a count names an edge rather than the owner's
`many`: "liked by me", "followed by me", "replied to by me" are each two edges
of one pointing row, one to the row that shows the member and one to the
reader. Named as relations, the client predicts from the written row's links
with nothing to evaluate, the server compiles from both relations' storage
with no Expr and no input mapping, and there is no viewer schema for the two
sides to disagree on. A filtered exists can come later, as a filtered count
would.

- `relation` is a `one` relation pointing at the Entity it is added to, as a
  count's; `viewer` is another `one` relation of the same pointing Entity.
  Either wrong is refused by the type and where it is declared.
- **Its value is the id of the row it found, or none** (`Option<string>`,
  `OptionFromNullOr` on the wire, so it stores and sends). Not a boolean,
  because a reader who sees "liked" must be able to take it back: the id is
  what `Unlike` deletes. It also makes a delete predictable with no Like row
  held (below).
- `Derivation` gains `Exists { relation, viewer }`.

### The server

`bind` takes no entry for it, and records beside the count's `over` the
pointing table's column for `viewer` and the Entity that relation points at.
`source(binding, { viewer })` says who reads, as a row: `principal =>
Option<{ entity, id }>`. Each read runs one statement per batch, as a count
does: `select parent, min(id) ... where parent in (...) and viewer_col = ? and
<the pointing table's visible> group by parent`, the least id where a reader
has two. A visitor, or a reader of an Entity `viewer` does not point at, reads
none. It is the semi-join an `exists (...)` subquery would be, batched the way
counts already are rather than correlated per row.

### Caching: who may hold it

A viewer-relative value is a fact about a (row, reader) pair, stored under the
row. Every holder is either one reader's, or must not hold it:

| Holder | Keyed by | So |
| --- | --- | --- |
| The client store (`Entity:id` to fields) | one principal already: `Data.forget` at a change of principal | holds it as any field; a change of viewer is a change of principal |
| Client persistence | one snapshot per principal key | as the store |
| A server render's resumed store | one request | as the store |
| The live hub's re-read groups | `key(principal)` | the key must tell readers apart (`Policy.keyOf` does; a key by role does not), said in remote-server's README |
| A Source's `shared` fields | nobody: sent to every subscriber as written | refused: `source` throws for an exists listed as shared |
| A write's answer | the asker | read through the Sources as the asker |

So the client store needs no viewer dimension: it was never shared between
principals. What would be wrong is sharing across readers on the server, and
the one declared form of that (`shared`) refuses it.

`source` refuses a binding with an exists and no `viewer`: answering none for
everyone would be a quiet wrong value. A `writer` builds its reading source
without one, since it reads only stored fields.

### The client

`Remote.make({ viewer: model => Option<{ entity, id }> })`, read from the
application's Model at `Data.mutate` (`Remote.ref(User, model.me)`). For a
declared write of the pointing Entity:

| Write | Prediction |
| --- | --- |
| insert pointing `relation` at p and `viewer` at the viewer | p's member becomes the new id, where p is held with the member read as none |
| delete | each held row whose member is this id becomes none |
| update relinking `relation` or `viewer` | a row showing this id loses it unless the row still points there and at the viewer; the row it now points at gains it as an insert would |
| anything the client cannot place | none: the answer decides |

Where the written row pointed before is read from the store as in slice 1,
and now also from a row whose exists shows this id: that row is where it
points through `relation`, and the viewer is where it points through
`viewer`. So an unlike lowers its post's count too, though the client never
read the Like. Finding those rows scans the store once per exists of the
written Entity, at `Data.mutate`, not per render.

Without `viewer`, nothing is found; a delete still loses its id, which needs
no viewer.

### Chirp (#216)

A `Like` is an Entity pointing at a post and a person. A post's `likeCount`
is `Derived.count(Like.post)` and its `liked` is the exists. `LikePost` and
`Unlike` are `Mutation.write`s, so the heart and the count move at once with no
`optimistic` list and no counts in Messages, and `update` reads `liked` from
the Model to choose, so a second press before the answer takes back the
pending like. A like's id is the pair (`likeOf(postId, userId)`), so liking
twice is one row. The `ToggleLike` handler, the join table without ids, and
the `likedBy` read of every liker are gone.

The client sends the like's `user` itself: a server preset would keep it out
of the written row, and then nothing could predict `liked` (#232's stamps fix
that). A guard rule cannot say "this link is the asker", since a rule is an
Expr over fields, so Chirp wraps its Like writer (`ownLikes`) to refuse a like
made or taken back in another's name.

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

- ~~A viewer link a server presets~~: built with #232 as `Entity.stamps({ user:
  Stamp.viewer })`; Chirp's like no longer sends its user, and `ownLikes` is
  gone (see [232-write-effects-DESIGN.md](./232-write-effects-DESIGN.md)).
- A guard rule over where a relation points ("this link is the asker"), which
  would replace Chirp's `ownLikes`.
- An exists with a filter, and exactness where several rows match one reader:
  deleting one of two predicts none until the answer.
- `RemoteServer.memory` computing derived members.
- Counts with a filter (`Derived.count(relation, where)`): predicted only where
  the filter can be evaluated over the written row.
- Other aggregates (sum, max): server-only at first.
- Live subscribers: the hub hears what a write answered; telling other viewers a
  post's count changed, or another tab of yours that you liked it, needs the
  hub to read a pointed-at row's derived members.
- `Guards.may` as a viewer-relative derived member underneath.
