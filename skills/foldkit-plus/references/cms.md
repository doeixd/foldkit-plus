# foldkit-cms

What a CMS adds to a domain that is already declared: **audience** (a visitor
sees what is published, an author sees everything), **time** (drafts, revisions,
a schedule), and **address** (a slug). The domain is a `foldkit-entity` Entity,
editing it is a `foldkit-form` form, and the screens are `foldkit-crud`'s; none
of that is CMS-specific and none is repeated here.

**Status: core, editor state, server.** `foldkit-cms` is roles, content types,
three Entities, the operations as descriptors, the lifecycle, and `Cms.editor`.
`foldkit-cms-drizzle` is its server: the audience boundary, saving, discarding,
publishing and unpublishing, the worklist, an entry's derived state. Neither is on npm. The editor is state, not a screen: render its form with `foldkit-mixins-form`.

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

## The editor

```ts
const Editor = Cms.editor('PostEditor', { content: Posts }) // rest?, version?, untitled?
const Slot = Bundle.declare(Editor.bundle, 'editor')
const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
const update = PostEditor.after(Page.assemble(Placed).update(yourUpdate)) // required: it syncs after every Message
Data.subscriptions({ ...surfaces, ...PostEditor.actives })

Placed.helpers.open(entryId)
Placed.helpers.create(Cms.newEntryId()) // make the id in a Command or handler, not in update
Editor.Message.PublishAsked() // ScheduleAsked({ at }), UnscheduleAsked, DiscardAsked, RestoreAsked({ revision }), UnpublishAsked,
// ArchiveAsked, UnarchiveAsked, ReloadAsked, OverwriteAsked
PostEditor.status(model) // Closed Loading NotFound LoadFailed Editing Saving Saved Conflict SaveFailed
// Publishing Published PublishFailed Scheduling Scheduled ScheduleFailed
PostEditor.state(model); PostEditor.resumed(model); PostEditor.error(model)
```

- The editor's Messages are the form's plus its own, so a form view works as is.
- Autosave: an edit rests (`rest`, 1s), then the form is saved, valid or not.
  Publish submits the form; invalid publishes nothing. A publish saves first.
- Opening resumes the draft: saved Model (same form name and `version`), else
  saved values key by key, else what is published. `resumed` is `Lost` when a
  draft fit nothing.
- Preview: give `Cms.content` a `preview: (value, id) => operations`; `PreviewShown` /
  `PreviewHidden` lay the form's decodable value over Remote's store (`Data.overlay`),
  so the app's own views draw it. Nothing is sent. `PostEditor.canPreview`, `.previewing(model)`.
- `open`/`create`/`close` drop the form: run `PostEditor.flush(model)` first (it
  returns `{ model, commands }`) so edits made within the rest are saved.
- `Conflict`: `ReloadAsked` takes the server's copy, `OverwriteAsked` saves over it.
- Register `Cms.Entities` and `Cms.operations` with `Remote.make`.

## Kinds

- Form `inputs`: `slug: Cms.slug('title', { prefix: '/blog/' })` (follows the title
  through `Cms.slugify` until written; a filled slug never follows),
  `goesLiveAt: Cms.dateTime()` (ISO string out).
- Columns: `Cms.Entities` are already annotated, so an entry's `state` and times
  show as `Cms.Display.State` / `Cms.Display.Moment`; `Moment.of({ now })` is relative.
- Draw them: `FormView.define(form, { renderers: Cms.controlRenderers() })`,
  `ListView(...)({ page, renderers: Cms.displayRenderers() }, h)`. The state badge
  carries `data-cms-state` and `data-cms-schedule`.
- Narrow with `Cms.Input.Slug.is(control)`, as with `Input.Text.is`.

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
  mutations: [...cms.mutations], // every Cms operation
})
```

- The audience boundary is a binding's `visible`, so it holds by id, through
  relations, refs and queries. To a visitor, entries, drafts and revisions are
  empty tables, and every CMS operation is refused.
- `CmsServer.make` throws for a content type with a `published` role whose
  binding has no `visible`.
- `CmsSaveDraft` carries `basedOn` (the draft's `updatedAt`); a stale one is
  refused as `CmsConflict: ...`. The first save of an id nobody has makes the entry.
- `CmsPublish` runs `create` (no row yet) or `update` (the draft's value plus the
  row's `id`) inside `transaction`, with the row shown, the revision appended and
  the draft removed, all or nothing. Do not register `create`/`update` with
  `RemoteServer.make` yourself unless authors should also bypass drafts.
- `CmsPublish` carries `basedOn` (the latest revision's `n`, or `null`); a stale
  one is `CmsConflict: ...`. A draft the mutation's Input refuses is not published.
- `CmsUnpublish` empties the `published` column; the row is kept.
- `CmsSchedule { entry, at }` promises a draft that would publish now; nothing runs
  until the host calls `cms.due(new Date(), { as: name => principal })` (cron, interval,
  queue: the package owns no timer). A failed one stays scheduled with its error
  (state reads overdue) and is not retried until the draft changes.
- `CmsRestore { entry, revision }` makes that revision's value the draft (replacing
  it, clearing its schedule) and publishes nothing.
- A scheduled draft is published as its scheduler, so saving, restoring or
  discarding it is refused to an author `allow` would not let `schedule`.
- Every operation is one `transaction`; `Transaction.statements` serialises them
  on the connection. Wrap your own writes on that connection in it too.
- `CmsArchive` also hides the row of a type with a `published` role; `CmsUnarchive`
  brings it back unpublished.
- A `slug` role adds `Cms.bySlug(Posts)` (`postsBySlug`, input `{ slug }`) to
  `cms.queries`; a visitor finds only published rows. A taken slug fails a publish
  as `CmsSlugTaken: <key>: ...`; `Cms.slugTaken.key(message)` is the key. Put a
  unique index on the column: the check alone loses a race.
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
- https://github.com/doeixd/foldkit-plus/tree/main/examples/cms (a whole application, with a pinned transcript)
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/cms-DESIGN.md
