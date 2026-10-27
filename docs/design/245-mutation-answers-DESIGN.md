# A mutation answers with what the client shows (#245)

Status: slice 1 built (2026-10-27). Slice 2 (rows a write changes through a
derived member) built with #233 (2026-10-27): a declared write's answer reads
every row its row points at; see
[233-derived-members-DESIGN.md](./233-derived-members-DESIGN.md).

## The problem

A mutation's answer is whatever its handler returns. A declared write
(`RemoteServer.write`) answers the columns it stored; a hand-written handler
answers what its author remembered to read. The client, meanwhile, showed the
row through its Selections while the request was pending. When the answer
lands, the optimistic layer comes off, and every field a Selection reads that
the answer left out is missing from the store. The planner fetches it, and the
row reads `Loading` until it arrives.

Chirp (the field report, #231) hit this twice:

- **#243.** `CreatePost`'s answer had the stored columns of the new post, not
  `likeCount`, `replyCount`, `likes`, `may`, the null `editedAt` or the
  `author` relation. The feed reads all of them, so the home list read
  `Loading` for one frame each time someone posted.
- **#226.** A like's answer named the new `Like`, not the post's `likeCount`,
  so the count went back to its old value once the layer was released.

The fix in Chirp was a wrapper that re-read, by hand, the fields the client
reads: a copy of the client's Selections on the server, written as name strings
(#251), through a mutable reference from a Source back to the server it is part
of. It missed `editedAt` and `author` the first time, and nothing could catch
that. This repository's own `examples/chirp` does the same in its `ToggleLike`
handler.

`verifyAnswers` (#249, `answerGaps.ts`) now names each such gap in development.
This design removes the gaps.

## The law

From #257, restricted to what this slice checks:

```text
restrict(answer(w, S), shown(s)) = restrict(read(apply(w, S)), shown(s))
```

The answer to a write, on the fields the client shows of the rows the write
names, equals a fresh read of those fields after the write.

## Options considered

1. **The app declares the answer** (`RemoteServer.write(M, writer, { rereads })`,
   or a client-side `answer:` option on `Data.mutate`). Rejected: it is a second
   copy of the Selections, which already say what the client reads. It is what
   Chirp's wrapper is, made official. #245 and #251 keep a typed `rereads` only
   as a stopgap for slice 2; this slice does not add it, because slice 1 needs
   none.
2. **The server answers every field of every row it touches.** Rejected: the
   server does not know what the client reads, so "every field" means every
   derived member and every relation page, for every write. It also cannot
   answer relation targets without a slice to follow.
3. **The client refetches after the answer, before releasing the layer.**
   Rejected: a second round trip on every write, and the layer would have to
   outlive its answer, which breaks "settling is release-the-layer".
4. **The client says what it shows; the server answers it from a fresh read
   (chosen).** The client already computes the union of its active Selections
   to plan reads. It sends that union with the request, per entity. The server
   reads those fields of the rows the write's answer names, through the same
   Sources, `authorize` and `filter` as any read, and returns them beside the
   answer. The client writes them in the same reduction that releases the
   layer, so no frame sees the gap.

Option 4 adds no option to any public API. The client's Selections stay the one
owner of "what is shown"; the write's own answer stays the one owner of "which
rows changed"; the entity Sources stay the one owner of "how a field is read and
who may read it".

### Why per entity, not per row

The client sends, for each entity, the union of the slices its active reads ask
of any row of that entity, rather than a slice per row id. Two reasons:

- An insert's row may not be held under the id the server answers with, and a
  write can change rows the client did not patch (a parent's count, slice 2).
  The server knows which rows changed; the client knows what it reads of a row
  of each kind. Each side says what it owns.
- A per-entity slice is small (a few dozen field names) and bounded by the
  entity's fields.

The cost is over-reading: a feed reading few fields and a detail page reading
more, both active, ask the detail fields of a new post too. That is one row's
worth of extra columns in a read the server makes anyway.

### Why the fields the answer left out, plus every shown relation

The server re-reads, of each named row, the shown fields its answer did not
carry. A declared write's answer is the row as stored, from the write's own
statement, so reading those fields again buys nothing. A relation field is read
again even when the answer carries its ref: the answer has `'User:u1'`, not the
author's `name` that the feed reads through it, and reading the relation is how
the server follows it to the target.

## API

There is no new application-facing option. What changed:

- **`Data.mutate`** (and `Remote.fold(…).mutate`) sends `shown` with the
  request: for each entity, the union of the slices that every active read asks
  (each `Data.get`'s requirement and each `Data.query`'s `select`), with each
  nested relation's slice also added under its own entity. It is computed from
  the Model the request starts in, through the same readers the `subscriptions`
  entries use. Without registered readers nothing is sent.
- **The wire.** `MutationRequest.shown?: ReadonlyArray<ShownSlice>` (a read
  request without its id), and `MutationResult.read?: { requests, result }`:
  the requirements the server read and the `ReadBatchResult` it got, in the
  shape `ReadReceived` already carries. Both are optional, so an older client
  or server ignores them.
- **`MutationSucceeded.read`**, the same `{ requests, result }`. `updateRemote`
  writes it with `writeRead` right after the answer's patches and deletions, in
  the same reduction, so it lands as a read does: relation windows, settled
  fields and failures behave as they do for `ReadReceived`. A repeated answer
  writes nothing, as before. Placement judges the read values with the answer's
  own, so a list sorted by a derived field places the row by it.
- **`RemoteServer.handlers`' `FoldkitRemoteMutate`** builds requirements from
  `shown` and the rows the outcome names, reads them with `readHelper`, and
  answers `read`. A handler names a row it changed by putting it in `entities`;
  a row named with no values (`Remote.patch(Post, id, {})`) is answered entirely
  from the read. That is how a hand-written handler whose write the server
  cannot see (a like in a join table) says which row to answer, with no read of
  its own and no reference back to the server.

`examples/chirp`'s `ToggleLike` drops its hand-written re-read and its
type-annotated self-reference to `server`, and answers `Remote.patch(Post,
input.postId, {})`. `PostChirp` and `EditPost` answer the timeline's
`likeCount`, `may`, `likedBy` and `author` without any change.

## Who owns what

| Fact | Owner |
| --- | --- |
| What the client shows of an entity | the active Selections, through `Data.subscriptions`' readers |
| Which rows a write changed | the write's answer (`entities`, connection inserts) |
| How a field is read, and whether this principal may | the entity's Source (`read`, `authorize`, `filter`) |
| The values the client holds after the write | the answer's patches, then the fresh read, in one reduction |

## Failure semantics

- **The re-read fails** (a Source error, too many ids). The write has committed,
  so the mutation still succeeds: the server logs a warning and answers without
  `read`. The client then fetches the missing fields as it did before this
  change, and `verifyAnswers` names the gap. Failing the mutation instead would
  have the client retry a write that landed.
- **A shown field this principal may not read.** It comes back `settled`, as a
  read's would, and the client stops asking for it.
- **A named row the fresh read does not find** (hidden from this principal).
  Its request is left out of `read`, so the client keeps what the answer wrote
  instead of tombstoning a row the answer just gave it. A write that hides a
  row from its writer already answers it in `deleted`.
- **Malformed or oversized `shown`.** It is decoded by the wire's schemas (field
  count, relation depth, entry count), and the read is bounded by
  `maxIdsPerEntity`, `maxDepth` and the page checks, as any read. A request that
  fails to decode is refused as a whole, as before.
- **Consistency.** The read runs after the write commits, not in its
  transaction. It can see a later write by someone else; it cannot see the
  state before this one. That is the law's reference (`read(apply(w, S))`) as
  observed later, which the client would have fetched anyway.

## Deferred

- **Slice 2: rows a write changes indirectly** (built with #233, which names
  every row a declared write's row points at, before and after; what follows is
  the reasoning as it stood). A like changes its post's
  `likeCount`; a reply changes its parent's `replyCount`. The server can derive
  these once a derived member says what it derives (`Derived.count(relation)`,
  #233): inserting or deleting a row of the counted relation names the row the
  foreign key points at. Today only `remote-drizzle`'s binding knows the
  relation a count reads, and the client cannot predict it, so the derivation
  belongs with #233, which moves that fact into the Entity. A delete needs the
  foreign key before the row goes, which a declared delete can read first.
  Until then, a hand-written handler names the parent (`Remote.patch(Post, id,
  {})`), as `examples/chirp` does; no `rereads` option is added.
- **Live subscribers.** The hub hears what the write itself answered, as before;
  the re-read is the asker's view and is not published. Derived effects reach
  other viewers with slice 2, from the declaration rather than from one
  client's Selections.
- **Same transaction.** Reading inside the write's transaction would need every
  Source to share the writer's transaction handle. The read after commit meets
  the law; the transaction only narrows which later writes it can see.
- **Conformance over every declared write** (#257's `Conformance.writes`). This
  slice tests the law on Chirp's writes and on a memory backend; a generated
  suite belongs with #257.
