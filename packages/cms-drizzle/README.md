# foldkit-cms-drizzle

The server half of [`foldkit-cms`](../cms/README.md), over
[`foldkit-remote-drizzle`](../remote-drizzle/README.md). It keeps an author's
unpublished work in three tables beside your own, and it is where the **audience
boundary** is enforced: who is not an author is refused entries, drafts and
revisions outright, and sees of your content only what is published.

> **Status: drafts.** Saving and discarding a draft, the worklist, an entry's
> derived state, and the boundary. Publishing, scheduling and restoring are the
> next steps of [the design](../../docs/design/cms-DESIGN.md#13-build-order).
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
import { CmsServer, published, sqliteTables } from 'foldkit-cms-drizzle'

const cmsTables = sqliteTables() // or pgTables(); add them to your schema and migrations

const Db = bind(Blog, {
  Post: {
    table: posts,
    // A visitor sees what is published; an author sees every row.
    visible: published(posts.publishedAt, isAuthor),
  },
})

const cms = CmsServer.make({
  tables: cmsTables,
  content: [{ type: Posts, binding: Db.Post }],
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
| `CmsServer.make({ tables, content, isAuthor, allow?, now?, newId?, nameOf? })` | `sources`, `queries`, `mutations`, and `bindings`. |

## Limits

- No publish yet, so no revisions are written by this package.
- Conflicts are refused, not merged.
- `allow` is asked about `save` and `discard`; the other transitions arrive with
  the operations that make them.
