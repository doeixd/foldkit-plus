# Cascading deletes, declared (#343, toward #348)

## The problem

A row's delete behaviour lived only in its table. Chirp's `likes.post_id` is
`on delete cascade`, so deleting a post deletes its likes, and in a thread
whose replies point at their post the same way, deleting a post deletes its
replies. The Entity did not know, so:

- the client predicted only the row it was asked to delete (`Law.check` over
  a delete of a post with replies: its author's `postCount`, client 1,
  server 0, until the answer landed);
- the cascade held only where the store enforced foreign keys (sql.js leaves
  them off, so chirp's published demo kept a deleted post's likes until it
  set `pragma foreign_keys = on`), and a hand-written table could disagree
  with the domain unnoticed.

## What #343 builds

```text
Relation.one(Post, { onDelete: 'cascade' })        the domain says it, once
  -> Entity.cascading(Post)                         the relations pointing here that cascade
  -> Data.mutate(Write.delete)                      deletes every held row reached, moves their counts
  -> writer(binding).delete                         deletes them in the write's transaction or batch
  -> RemoteServer.write answer                      names them deleted, re-reads what they pointed at
  -> bind                                           refuses a table foreign key that says otherwise
```

- **Declared on the `one` side.** The cascade is a property of the link the
  child holds, as its foreign key is: `Like.post: Relation.one(Post, {
  onDelete: 'cascade' })` reads "this like goes when its post goes". A `many`
  is a view of those links from the other side and declares nothing; a
  domain without a `many` (chirp has no `Post.likes`) declares it all the
  same. `Derived.count` names the pointing `one` relation for the same
  reason.
- **Only `cascade` for now.** `OnDelete` is `'cascade'`; `Relation.one`
  refuses anything else where it is called. `setNull` and `restrict` are
  #348's, and join the same type.
- **Transitive, self-references included.** A reply's replies go with it,
  and a like of a reply with the reply. The writer compiles each Entity's
  removed ids as a subquery, recursive (`with recursive`) where the Entity
  cascades into itself; a cycle through two or more Entities is refused
  when the writer is made.
- **The writer applies it itself**, so it holds on a store without foreign
  keys: the root's delete first, as before (its revision, `when` and guard
  `requires` judged in its own statement), then each Entity's rows,
  leaves first, each statement guarded by "the root row is gone", so a
  delete that missed removes nothing. They run in one transaction, or on D1
  in one `batch`, which is D1's transaction. A table whose foreign key
  cascades too finds nothing left to remove.
- **The answer carries them.** The delete returns `DeleteOutcome.Deleted({
  cascaded })`, each removed row with the links it held, so
  `RemoteServer.write` answers every removed row as deleted and re-reads
  what each pointed at (the counts it moved), as it does for the row named.
  `RemoteServer.write` refuses, where it is registered, a delete of an
  Entity with cascades through a writer that does not say it applies them
  (`cascades: true`).
- **The client predicts held rows only.** `Data.mutate` of a delete
  removes, transitively, every row the store holds pointing at a removed
  row through a cascading relation, from every list, and moves each
  `Derived.count` and `Derived.exists` over them. A row the client does not
  hold it cannot remove, and a count over it is corrected by the answer: the
  page holds the rows it shows, so what it shows is predicted.
- **The table agrees or `bind` refuses.** Where a Drizzle table declares a
  foreign key on the column a `one` relation is stored on, its `onDelete`
  must be `cascade` exactly when the relation's is, and `bind` names the
  declaration to add or the table to change. A table with no foreign key,
  or one written in SQL (chirp's), is not checked: the writer holds the
  cascade there.

## How it fits #348

#348 asks for `restrict`, `cascade` and `setNull` on a relation, each
authorized by the children's `Delete` rules. #343 is its `cascade` half,
built in #348's shape:

| #348 asks | Here |
| --- | --- |
| the relation declares the action | `Relation.one(…, { onDelete })`, on the link's own side |
| the writer applies it in the same statement or batch | yes, on SQLite, Postgres and D1 |
| `bind` derives or checks the foreign key's action | checks a Drizzle table's; derives nothing yet |
| `Data.mutate` removes cascading rows and moves counts | yes, over what the store holds |
| `Law.check` holds the prediction to the server | yes, pending and answered |
| a cascade judged by each child's `Delete` rule | **not yet** |
| `restrict`, `setNull` | **not yet** |

**Authorization is unchanged, and still #348's.** A cascade today is what it
was: the guard judges the row named, and its likes or replies go with it
whoever wrote them. That was true of the table's `on delete cascade` before
this change; declaring it makes it visible in the domain, which is where
#348's rule (each child's `Delete` rule judged, `Forbidden` if any fails,
with an explicit opt-out) will read it. The writer already reads every row
it removes before it removes it, in the same transaction, so the guard's
check can be added there.

**The default stays "whatever the table says".** An undeclared relation
does nothing on delete, as before, and a table foreign key that cascades
beside an undeclared relation is refused by `bind`: an application moving
to this release declares the cascades its tables already make, which
#348's compatibility section wanted to warn about. Refusing is clearer than
a warning nobody reads, and the packages are 0.x.

**`restrict` with conditions stays a delete's `when`.** As #348's comment
says, "no replies by anyone but me" is an `Expr.exists` over the replies,
judged where the delete commits; the relation's action is the part an
expression cannot be.
