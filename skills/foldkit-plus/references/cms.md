# foldkit-cms

What a CMS adds to a domain that is already declared: **audience** (a visitor
sees what is published, an author sees everything), **time** (drafts, revisions,
a schedule), and **address** (a slug). The domain is a `foldkit-entity` Entity,
editing it is a `foldkit-form` form, and the screens are `foldkit-crud`'s; none
of that is CMS-specific and none is repeated here.

**Status: a server, no editor.** `foldkit-cms` is the pure core: roles, content
types, three Entities, the operations as descriptors, the lifecycle.
`foldkit-cms-drizzle` is its server: the audience boundary, saving, discarding,
publishing and unpublishing, the worklist, an entry's derived state. There is no
client editor, no scheduling and no restore yet, and neither is on npm. Do not
tell a user there is an authoring screen.

## Ownership

| Fact | Owner |
| --- | --- |
| Published content | the application's tables |
| Unpublished work | a draft, kept beside the row, never in it |
| Which state content is in | nobody stores it: `Cms.state` derives it |
| Who may make a transition | the application's `allow`, asked by a server |

## Mental model

**A draft is an unsent form.** The row holds what is published. A draft is the
saved input of the operation that would publish it. So publishing is the
application's own mutation run with the draft's value; a visitor's read cannot
reach unfinished work; a revision is the same value, kept; and a form that does
not validate yet can still be saved.

An **Entry** is a piece of content from first keystroke to archive. It exists
before the row does.

## Minimal example

```ts
import { Cms } from 'foldkit-cms'

// A fact about the Entity: metadata, by a pipe step. Same Entity, new metadata.
const Post = Blog.Post.pipe(
  Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }),
)

// A fact about the application.
const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm, // Form.make('PostForm', Entity.input(Post, PostInput))
  publish: { create: CreatePostMutation, update: UpdatePostMutation },
  words: { one: 'Post', many: 'Posts' },
})

Cms.rolesOf(Post).slug // Post.fields.slug

Cms.state({ archivedAt: null, row: 'visible', draft: { scheduledFor: null, scheduleError: null } }, now)
// { _tag: 'Changed', schedule: null }
Cms.offers(facts, now, Posts) // ['save', 'discard', 'publish', 'schedule', 'unpublish', 'restore', 'archive']
```

## Common tasks

- **Mark the slug, the label, the visibility field:** `Cms.roles`. `label` and
  `slug` are text fields; `published` is a field that admits `null` (present
  means a visitor may see the row). A wrong member is a type error and throws.
- **Read roles elsewhere** (a policy, a sitemap): `Cms.rolesOf(entity)`.
- **Know what state an entry is in:** `Cms.state(facts, now)` gives `New`,
  `Published`, `Changed`, `Unpublished` or `Archived`, with a `schedule`
  (`at`, `overdue`, `error`) beside a state that has a draft.
- **Know what to enable:** `Cms.offers(facts, now, content)`.
- **Register the CMS's data:** `Remote.make({ entities: [...yours, ...Object.values(Cms.Entities)], mutations: [...yours, ...Cms.operations] })`.
  `Cms.Entities` is `Entry`, `Draft`, `Revision`; list them with `Crud.list`.

## The server

```ts
import { CmsServer, Transaction, published, sqliteTables } from 'foldkit-cms-drizzle'

const Db = bind(Blog, {
  Post: { table: posts, visible: published(posts.publishedAt, isAuthor) }, // a visitor sees published rows
})
const cms = CmsServer.make({
  tables: sqliteTables(), // or pgTables()
  // create/update: your own RemoteServer.mutation handlers of Posts.publish.create/.update
  content: [{ type: Posts, binding: Db.Post, create: CreatePost, update: UpdatePost }],
  transaction: Transaction.statements, // one connection (SQLite); Transaction.drizzle for Postgres, libSQL
  isAuthor: principal => principal?.role === 'author',
})
RemoteServer.make({
  entities: [...cms.sources, source(Db.Author)], // cms.sources, not source(Db.Post)
  queries: [...cms.queries], // Cms.Entries: the worklist
  mutations: [...cms.mutations], // CmsSaveDraft, CmsDiscardDraft, CmsPublish, CmsUnpublish
})
```

- The audience boundary is a binding's `visible`, so it holds by id, through
  relations, refs and queries. To a visitor, entries, drafts and revisions are
  empty tables, and every CMS operation is refused.
- `CmsServer.make` throws for a content type with a `published` role whose
  binding has no `visible`.
- `CmsSaveDraft` carries `basedOn` (the draft's `updatedAt`); a stale one is
  refused as `CmsConflict: ...`. Its first save with `entry: null` makes the entry.
- `CmsPublish` runs `create` (no row yet) or `update` (the draft's value plus the
  row's `id`) inside `transaction`, with the row shown, the revision appended and
  the draft removed, all or nothing. Do not register `create`/`update` with
  `RemoteServer.make` yourself unless authors should also bypass drafts.
- `CmsPublish` carries `basedOn` (the latest revision's `n`, or `null`); a stale
  one is `CmsConflict: ...`. A draft the mutation's Input refuses is not published.
- `CmsUnpublish` empties the `published` column; the row is kept.
- `allow(principal, transition, entry)` decides which author may; `now` is the clock.

## Gotchas

- State is never stored. Do not add a `status` column to content; a draft beside
  the row is the model, and a status on the row is the design this rejects.
- `publish.create`'s input must be the form's value, and its output `{ id }`;
  `publish.update`'s input is that value plus `id`.
- No `published` role means the type cannot be unpublished and every row is
  visible. No `slug` role means no slug handling. Capabilities are declared.
- An entry's id is the branded `EntryId`, not the content row's id.
- A slug that follows a title is `foldkit-form`'s `Input.following('title', slugify)`.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/cms/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/cms-drizzle/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/cms-DESIGN.md
