# One Entity per identity (#332)

Status: design (2026-10-30).

## The problem

An Entity is declared in steps, and every step used to return a new frozen
descriptor:

```text
Entity.define('Post', …)   PostFields           fields
Entity.relate({ Post, … }) Chirp.Post           fields + relations
.pipe(Entity.derived(…))   LikedPost            fields + relations + likeCount, liked
.pipe(Entity.sets(…))      …                    + author, createdAt set by the context
```

Each descriptor saw only the steps before it. Code that held one could not see
what a later one added:

- `Chirp.Like.relations.post.target()` returned `Chirp.Post`, as `relate`
  returned it, without the `likeCount` piped on afterwards. So the server could
  not tell from a written Like which rows' derived members the write changed,
  and named every row the Like points at: its User as well as its Post.
- `guard.row(LikeFields, …)` and `Query.from(PostFields)` hold the descriptor
  declared before `relate`, with no relations, though a rule over
  `Like.relations.user` reads one. A converter that looked for links in
  `query.entity.relations` found none and compared `'User:ada'` with `'ada'`;
  `Held.fromRefs` now guesses that a key the body reads that is no field of its
  Entity is a link.
- `Entity.input(Chirp.Post, …)` gives a write that does not know `Entity.sets`
  declared on `LikedPost`, so the write passed `Write.insert`'s checks as
  setting nothing from the context.

Every consumer that walks relations or members has to know which copy it holds,
and each new one meets this again.

## What an Entity's parts are

Two kinds of thing are added after `define`, and they differ in whether a
second, different answer can be right:

| Part | Added by | Two descriptors may differ? |
| --- | --- | --- |
| relations | `Entity.relate` | No: the row has one set of links |
| derived members | `Entity.derived` | No: the row has one set of readable values |
| context sets | `Entity.sets` | No: every write of the row follows them |
| Entity metadata | `Entity.annotate`, `Entity.invariant` | Yes: an interpreter's own view |
| member metadata | `Entity.annotateMembers` | Yes: a form's label, a CMS display |

Members are facts about the row. Metadata is an interpreter's view of it, and
views are made on purpose: `examples/entity/src/editForm.ts` labels `editor`
for one form, `foldkit-crud`'s tests label `author` for one list, and guards
attach rules to a copy (`G.attach`) the server binds. Those are not versions
of the Entity; they are the Entity seen by one reader.

## Options considered

1. **Resolve relation targets by name through the relate-set.** Fixes
   `target()` only when every later step goes back into the set, which nothing
   enforces, and does nothing for `Query.from(PostFields)`.
2. **One declaration step: relate takes the derived members and sets too.**
   Pure, but `Derived.count` names a relation `relate` has not made yet, so the
   step would take a callback over its own result; `annotate`, `invariant`
   and `sets` would follow it in, and every declaration in the repository
   changes shape. The descriptor declared before the step still exists and
   still has no relations, so the guard and query half stays open.
3. **A latest version per identity, and refuse a stale one handed in.** The
   descriptor a query captured at module load is the latest at that moment and
   stale a line later, so the refusal comes at use, far from the mistake, and
   every consumer has to ask for the latest itself.
4. **The members belong to the identity; descriptors read them.** Chosen.

## The design

```text
identity ──► Shape { relations, derived, sets }      one per Entity, added to
   ▲
   ├── descriptor  { fields, metadata, annotations } one per pipe step that annotates
   ├── descriptor  …
```

- `Entity.relate`, `Entity.derived` and `Entity.sets` add to the identity's
  shape, and return the descriptor they were given (typed with the addition).
  Every descriptor of the Entity reads `relations`, `derived`, `members` and
  `sets` from the shape, so a member added through any of them is a member of
  all of them: of the one `target()` returns, of `PostFields`, of the one a
  query captured before `relate` ran.
- `Entity.annotate`, `Entity.annotateMembers` and `Entity.invariant` make a
  new descriptor, as before; it shares the shape and carries its own metadata.
  `annotateMembers` over a relation or derived member records the metadata on
  that descriptor, and its members read as copies carrying it (made once, so a
  member keeps its identity across reads).
- A key added through one descriptor is taken for every other: adding it again
  through another is refused as already a member, as it was through one.
- `relate` checks every relation of the call before adding any, so a refused
  call adds none.

There is nothing stale left to refuse: whichever descriptor is handed in, its
members are the Entity's. The types stay as they were: a descriptor's type
shows the steps it came through, so `PostFields.relations` is `{}` to
TypeScript and holds `author` at runtime once related. Code that reads members
by type keeps using the descriptor `relate` returned, or a later one; code that
walks members at runtime (an interpreter) sees them all from any.

### What changes for a declaration

Nothing for one written as a chain, which every example is
(`define` → `relate` → `derived`/`sets`). What changes: two branches from one
descriptor that each add a member now add both to the one Entity, and the same
key added on two branches is refused. The repository's tests did that with
shared fixtures (`Social.Post` gained `likeCount` in one test and again in the
next); they now define a fresh domain per test.

Also changed: `relate`, `derived` and `sets` return the descriptor given, so
`Blog.Post === PostFields` where no metadata step came between, and
`Entity.same` stays the comparison to use.

## Workarounds removed

- **`Held.fromRefs`** read "a key the body reads that is no field of its
  Entity" as a link. It now reads the body's Entity's `one` relations, which
  every descriptor holds.
- **The server's pointed rows.** `RemoteServer.write` named every row a written
  row points at through a `one` relation, before and after, so the answer read
  each one back. It now names a row only where its Entity has a derived member
  the relation can change: a `Derived.count` or `Derived.exists` over that very
  relation, or a supplied member (`Derived.make`), which may read anything. A
  like names its post, not its user.

## Tests

- `entity/test/versions.test.ts`: a member added after `relate` is on what
  `target()` returns; the descriptor declared before `relate` has its
  relations and its context sets; a query and a guard built from it see them;
  a key added on one branch is refused on another; a refused `relate` adds
  nothing; member metadata stays on its descriptor.
- `Held.fromRefs` over a body built from the pre-relate descriptor.
- The server: a Like insert names its Post and not its User.

Each has a mutation spec beside it.
