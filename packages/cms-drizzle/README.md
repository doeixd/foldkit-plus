# foldkit-cms-drizzle

The server half of [`foldkit-cms`](../cms/README.md), over
[`foldkit-remote-drizzle`](../remote-drizzle/README.md). It keeps an author's
unpublished work in three tables beside your own, and it is where the **audience
boundary** is enforced: who is not an author is refused entries, drafts and
revisions outright, and sees of your content only what is published.

> **Status: drafts and publishing.** Saving and discarding a draft, publishing
> and unpublishing, the worklist, an entry's derived state, and the boundary.
> Scheduling, restoring and slugs are the next steps of [the design](../../docs/design/cms-DESIGN.md#13-build-order).
> Not on npm. SQLite and Postgres; MySQL has no `returning`, which the conflict
> rule needs.

## What it owns

| Fact | Owner |
| --- | --- |
| Published content | your tables, bound with `bind` as any are |
| Unpublished work | `cms_entries`, `cms_drafts`, `cms_revisions` |
| Which rows of those a principal may see | this package: none, unless they are an author |
| Which rows of your content a visitor may see | your binding's `visible`, which `published(...)` makes |
| Who is an author, and who may make a transition | your `isAuthor` and `allow` |
| What publishing a post *does* | your own `create` and `update` handlers |
| That a publish is whole | this package, inside the `transaction` you name |
| The time | your `now`, which defaults to the server's clock |

## Mental model

A table is read four ways: by id, as the children of a relation, as the target
of a ref, and through a query. A rule on one of them leaves three open. So the
boundary is not a filter this package adds somewhere; it is a
[`visible`](../remote-drizzle/README.md#which-rows-a-principal-may-see) rule on
each binding, which every one of those paths applies.

```text
an author's principal ──> entries, drafts, revisions, every content row
a visitor's principal ──> published content rows, and nothing else
```

## Install

```sh
pnpm add effect drizzle-orm foldkit-cms foldkit-cms-drizzle foldkit-remote-drizzle foldkit-remote-server
```

## Example

```ts
import { CmsServer, Transaction, published, sqliteTables } from 'foldkit-cms-drizzle'

const cmsTables = sqliteTables() // or pgTables(); add them to your schema and migrations

const Db = bind(Blog, {
  Post: {
    table: posts,
    // A visitor sees what is published; an author sees every row.
    visible: published(posts.publishedAt, isAuthor),
  },
})

// Your own handlers of the two mutations the content type publishes through.
const CreatePost = RemoteServer.mutation(Posts.publish.create, ({ input }) => /* insert */)
const UpdatePost = RemoteServer.mutation(Posts.publish.update, ({ input }) => /* update */)

const cms = CmsServer.make({
  tables: cmsTables,
  content: [{ type: Posts, binding: Db.Post, create: CreatePost, update: UpdatePost }],
  transaction: Transaction.statements, // one connection; Transaction.drizzle for Postgres
  isAuthor: principal => principal?.role === 'author',
})

RemoteServer.make({
  entities: [...cms.sources, source(Db.Author)],
  queries: [...cms.queries],
  mutations: [...cms.mutations],
})
```

- **Register `cms.sources`, not `source(Db.Post)`.** They are the content types'
  sources and the CMS's own, each behind the boundary.
- **A content type that can be unpublished must be bound with a `visible` rule.**
  `CmsServer.make` throws for a type with a `published` role whose binding shows
  every row to everyone. It checks that a rule is there; whether the rule is
  right is yours to say, since only you know what a principal is.
- A content type with no `published` role has nothing to hide, and needs none.
- **`create` and `update` go to the CMS, not to `RemoteServer.make`.** Registered
  there too, they are a way to publish with no draft, no revision and no `allow`.

## Saving a draft

`CmsSaveDraft` writes the working copy, valid or not. Its first save of something
new makes the entry.

- **A save names what it was made from** (`basedOn`, the draft's `updatedAt`). A
  newer one on the server means someone else saved in between, and the save is
  refused with `CmsConflict: ...` instead of undoing their work. It is one
  statement, compare and set, so two saves cannot both win.
- Two saves in the same instant still get different `updatedAt`s, so the next
  save can tell them apart.
- It answers with the entry and the draft as patches, so the client holds both
  with no refetch.
- Refused: a type the server does not know, an entry that is not there or is of
  another type, an archived entry, a principal that is not an author, and an
  author your `allow` refuses.

`CmsDiscardDraft` removes the working copy. A published entry is left as it was
published. An entry that was never published has nothing left, so it is removed
too, and the client is told both are gone.

## Publishing

`CmsPublish` runs your handler with the draft's value: `create` when the entry
has no row, `update`, with the row's id added, when it has. Around it, in one
transaction: the `published` column is set if it was empty, the revision is
appended, the draft is removed, and the entry is told its row. A handler that
fails after writing leaves nothing behind.

- **You name the transaction**, because Drizzle's differ by driver.
  `Transaction.statements` is `begin` and `commit` as statements, for a database
  that is one connection (a SQLite file). `Transaction.drizzle` is
  `database.transaction`, for a driver whose transactions are asynchronous
  (Postgres, libSQL); your handlers then get the transaction as their
  `DrizzleDatabase`. Statements over a pool would not roll back.
- **A publish names the revision it was made from** (`basedOn`, the latest `n`, or
  `null`). A newer one is `CmsConflict: ...`, not a publish over someone else's.
- A draft your mutation's Input refuses is not published, and the error says why.
  The draft is kept.
- A row that is already shown keeps the date it was first published on.
- What your handler returns (patches, connection changes, deletions) goes to the
  client with the entry, the revision and the row's `published` member.

`CmsUnpublish` empties the `published` column. The row and its revisions are
kept; a visitor stops seeing it, by every path, and publishing shows it again.
Only a type with a `published` role offers it.

## The worklist, and an entry's state

`cms.queries` is `Cms.Entries`: the entries of one content type, searched by
label, the archived ones or the rest. It lists entries, not content rows, so
something never published is in it.

An entry's `state` is not a column. This server derives it, with `Cms.state`,
from whether the entry has a draft and whether a visitor can see its row, using
your `now`. An overdue scheduled publish reads overdue, with its reason.

## API

| Call | Meaning |
| --- | --- |
| `sqliteTables()`, `pgTables()` | The three tables, per dialect. `sqliteSchema` is their `create table` statements. |
| `published(column, isAuthor)` | A `visible` rule for a content table: a visitor sees rows whose column is set. |
| `Transaction.statements`, `Transaction.drizzle` | How a publish is made whole, by driver. |
| `CmsServer.make({ tables, content, transaction, isAuthor, allow?, now?, newId?, nameOf? })` | `sources`, `queries`, `mutations`, and `bindings`. |

## Limits

- No scheduling, archive or restore yet; `allow` is asked about `save`, `discard`,
  `publish` and `unpublish`.
- No slug handling yet: a unique index refuses a taken slug, as an ordinary error.
- Conflicts are refused, not merged.
- A client that holds an entry's `revisions` list refetches it after a publish;
  the new revision arrives as a patch, not as a place in that list.
