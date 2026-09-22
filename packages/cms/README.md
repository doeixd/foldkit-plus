# foldkit-cms

What a CMS adds to a domain that is already declared. The domain is a
[`foldkit-entity`](../entity/README.md) Entity, editing it is a
[`foldkit-form`](../form/README.md) form, and the screens are
[`foldkit-crud`](../crud/README.md)'s. None of that is CMS-specific. Three things
are: **audience** (a visitor sees what is published, an author sees everything),
**time** (drafts, revisions, a schedule), and **address** (a slug).

The client contract and editor live here. The
[server adapter](../cms-drizzle/README.md) persists drafts and enforces the
audience boundary. [The CMS example](../../examples/cms/README.md) runs both
as a transcript or in a browser.

## What it owns

| Fact | Owner |
| --- | --- |
| Published content | your tables, read as any Entity is |
| What an author has entered and not published | a draft, kept **beside** the row, never in it |
| Which state a piece of content is in | nobody stores it: `Cms.state` derives it |
| Which transitions that state offers | `Cms.offers`, before anyone asks who is asking |
| Who may make a transition | your `allow`, asked by the server |
| The draft being typed | `foldkit-form`, in your Model, inside the editor's slice |
| How far the saves have got | `Cms.editor`, in that slice |
| The draft's `updatedAt`, the entry's `revision` | Remote's store: read, never copied |

It reads no database.

## Mental model

**A draft is an unsent form.** The content row holds what is published. A draft
is what an author has entered and not sent: the input of the operation that
would publish it, saved. So publishing is your own mutation, run with the
draft's value; a visitor's read cannot reach unfinished work, because it never
touches drafts; a revision is the same value, kept; and a half-filled form that
does not validate can be saved, which a row with a `not null` title cannot hold.

```text
   Entry ── Draft ── publish ──> your own mutation ──> content row ──> a visitor's read
     └── Revision  <── appended ──┘
```

An **Entry** is a piece of content from its first keystroke to its archive. It
exists before the row does, and after the row is hidden.

## Run the local example

From a checkout, run `pnpm install`, `pnpm build`, then
`pnpm --filter foldkit-example-cms demo`. This is the reproducible path for the
workspace version; use the package install below for a published version.

## Install

```sh
pnpm add effect foldkit foldkit-entity foldkit-form foldkit-crud foldkit-remote foldkit-cms
```

## Example

This integration extends an existing Entity, form, and pair of Remote mutations.
`Blog.Post`, `PostForm`, `CreatePostMutation`, and `UpdatePostMutation` come from
your domain module; [the example domain](../../examples/cms/src/domain.ts) shows
those definitions together. Start with [Form](../form/README.md) if you have not
yet defined the operation's input.

```ts
import { Cms } from 'foldkit-cms'

// Which members play a CMS part is a fact about the Entity: metadata, by a pipe step.
const Post = Blog.Post.pipe(
  Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }),
)

// How a type of content is authored is a fact about the application.
const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm, // an ordinary form: Form.make('PostForm', Entity.input(Post, PostInput))
  publish: { create: CreatePostMutation, update: UpdatePostMutation },
  words: { one: 'Post', many: 'Posts' },
  // Optional: how a value would look in the store, for in-app preview.
  preview: (value, id) => [{ entity: 'Post', id, values: value }],
})
```

- `Post` is the same Entity as `Blog.Post`; only its metadata changed. Register
  and bind the annotated one.
- A role names a member that can play it. `slug` on a number, or `published` on a
  field that admits no `null`, is a type error and throws.
- `publish.create`'s input is the form's value and its output names the row;
  `publish.update`'s input is that value and the row's id. A mutation of another
  shape is a type error. They are your own mutations: what publishing a post
  *does* stays your code.
- **A capability is declared, never implied.** No `slug` role, no slug handling.
  No `published` role, no unpublish, and every row is visible.

`Cms.rolesOf(Post)` reads the roles back as Fields. Anything may: the server's
audience policy, a `bySlug` query, a sitemap this package knows nothing of.

## The lifecycle

State is derived from facts and a clock. Nothing stores a status, so it cannot
disagree with what is true.

```ts
Cms.state({ archivedAt: null, row: 'visible', draft: { scheduledFor, scheduleError: null } }, now)
// { _tag: 'Changed', schedule: { at, overdue: false, error: null } }
```

| State | Facts |
| --- | --- |
| `New` | no row yet |
| `Published` | a row a visitor sees, and no draft |
| `Changed` | a row a visitor sees, and unpublished work beside it |
| `Unpublished` | a row hidden by its `published` role |
| `Archived` | the entry was archived; nothing else applies until it is restored |

A `schedule` rides beside a state that has a draft. **A scheduled publish that
did not happen reads `overdue`, with the reason**, because that is true; it does
not read `Published`.

`Cms.offers(facts, now, content)` is the transitions an entry offers now:
`save`, `discard`, `publish`, `schedule`, `unschedule`, `unpublish`, `archive`,
`unarchive`, `restore`. It is what a view enables and what a server checks
before it asks who is asking. `unpublish` is offered only to a content type with
a `published` role.

## The editor

`Cms.editor` is the authoring screen's state: a form, the entry it belongs to,
and the draft that keeps what the author has entered. It is a Bundle, placed
like any other; the view is the form's own.

```ts
const Editor = Cms.editor('PostEditor', { content: Posts })
const Slot = Bundle.declare(Editor.bundle, 'editor') // its Model and its Messages, in yours

const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
const update = PostEditor.after(Page.assemble(Placed).update(yourUpdate))

Data.subscriptions({ ...yourSurfaces, ...PostEditor.actives })

Placed.helpers.open(entryId) // resume the draft, else show what is published
Placed.helpers.create(Cms.newEntryId()) // something new; its first save makes the entry
Editor.Message.PublishAsked() // also: ScheduleAsked({ at }), UnscheduleAsked, DiscardAsked,
// RestoreAsked({ revision }), UnpublishAsked, ArchiveAsked, UnarchiveAsked, ReloadAsked, OverwriteAsked

PostEditor.status(model) // Opened | Editing | Saving | Saved | Conflict | Publishing | Published | ...
PostEditor.state(model) // the entry's lifecycle state, as the server last derived it
PostEditor.pageId(model) // the row's id, or the entry's until there is a row: what a preview shows under
```

- **Saving is automatic and is not publishing.** Each edit starts a rest (`rest`,
  one second by default), and the edit that is still the last one when its rest
  ends saves the form as it stands, valid or not. There is no Save button to
  forget, and a validation error never costs an author their work.
- **`Editing` means there are edits that are not saved yet**, and `Opened` means
  the form is as it was found. A draft the editor filled the form from is on the
  server already, so it reads `Saved`.
- A draft is listed by what its author called it, valid or not, and `untitled`
  until they have. Publish pressed twice asks once.
- **Publishing submits the form**, so its rules and checks decide, and an invalid
  form publishes nothing and says why in place. What is published is the saved
  draft, so a publish saves first when the last edit has not.
- **Scheduling is a publish promised for later**: `ScheduleAsked({ at })` submits
  and saves the form now, and the server keeps the promise. The entry's `state`
  says for when, and whether it happened. The form's own submit is always a
  publish now.
- **Leaving within the rest.** `open`, `create` and `close` drop what is in the
  form. Run `PostEditor.flush(model)` first, as
  [the example](../../examples/cms/src/app.ts) does: it saves what has not been
  saved, now, and does nothing when there is nothing to save.
- **A draft never fails to open.** The saved Model is tried first, guarded by the
  form's name and `version`; then the saved values, key by key, keeping what the
  form still accepts; then what is published. `PostEditor.resumed(model)` says
  which: `Model` (shown with nothing in flight: a check that was running when it
  was saved will never answer), `Values`, `Published`, `Blank`, or `Lost`, which is worth
  telling the author. Bump `version` when you change the form incompatibly.
- **A second author's save is a `Conflict`**, with the text still in the form.
  `ReloadAsked` shows the server's copy; `OverwriteAsked` saves over it, based on
  it. Merging is not attempted.
- **A taken address lands on the address.** A publish refused with
  `CmsSlugTaken` marks the slug's own field invalid, keeping what was typed, and
  clears when the author edits it. Nothing to wire: the editor does it.
- **Restoring** a revision replaces what is in the form with that value, as a
  draft. It publishes nothing.
- **Preview is the application's own views.** Give the content type `preview`,
  the operations an optimistic publish of a value would show, and `PreviewShown`
  lays what is in the form over Remote's store until `PreviewHidden`: every
  Selection and view draws it, edit by edit, and nothing is sent. Only what
  decodes is shown. It is lifted when the editor closes, reloads or discards. No
  `preview`, no preview: `PostEditor.canPreview` says which.
- **Discarding** shows what is published again; something never published has
  nothing left, and the editor closes.
- What the server holds is read from Remote and never copied: a save is based on
  the draft's `updatedAt` in the store, a publish on the entry's `revision`. The
  server answers each operation with patches, so nothing is refetched to know them.
- `create` takes the id so that `update` stays pure: make it in a Command or an
  event handler.

## Kinds, and how they are drawn

Two controls and two displays, made with `Input.kind` and `Display.kind` exactly
as you make your own. There is no CMS view package: a kind and its renderer are
all a view needs.

```ts
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  inputs: {
    slug: Cms.slug('title', { prefix: '/blog/' }), // follows the title until the author writes it
    goesLiveAt: Cms.dateTime(), // a datetime-local input, submitted as an ISO string
  },
})

FormView.define(PostForm, { renderers: Cms.controlRenderers() })
EntryTable({ page, renderers: Cms.displayRenderers() }, h)
```

| Kind | What it is |
| --- | --- |
| `Cms.Input.Slug` | Text shown after the address it completes. `Cms.slug(from, { prefix?, through? })` makes one that follows `from` through `Cms.slugify`. A form filled with a published slug does not follow: an address must not move because its title did. |
| `Cms.Input.DateTime` | A moment. Text that is none is `Invalid`, not submitted. |
| `Cms.Display.State` | An entry's state as words: `Changed, scheduled`, `New, overdue`. `of({ words })` takes yours. Its renderer is a `span` with `data-cms-state` and `data-cms-schedule` to style. |
| `Cms.Display.Moment` | A time. `of({ now })` reads relative to that clock (`3 days ago`), and you decide how often it moves; without one it is the date and time. Its renderer is a `time`. |

`Cms.Entities` already say how they are shown: an entry's `state` is a `State`,
and its times are `Moment`s, so a `Crud.list` over `Cms.Entries` needs only the
renderers.

## Entities and operations

`Cms.Entities` is `Entry`, `Draft` and `Revision`, related: an entry has one
optional draft and many revisions. They are ordinary Entities. Register them
with Remote beside your own, and list them with `Crud.list`; an entry's
`state` is a derived member the server supplies with its clock.

`Cms.Operations` is what an author may ask, as Remote mutations: `SaveDraft`,
`DiscardDraft`, `Publish`, `Unpublish`, `Schedule`, `Unschedule`, `Archive`,
`Unarchive`, `Restore`. They are the same for every content type. `SaveDraft`
and `Publish` each carry what they were based on, so a second author's save or
publish is a conflict and not an overwrite. `Cms.operations` is the list, for
`Remote.make({ mutations })`.

An entry's id is `EntryId`, branded, so an entry is not opened with a post's id.
The client names something new (`Cms.newEntryId()`), and the first save of an id
nobody has makes the entry, so an editor need not wait to learn what it edits.

## API

| Call | Meaning |
| --- | --- |
| `Cms.roles({ label?, slug?, published? })` | Pipe step: the members of an Entity that play a CMS part. |
| `Cms.rolesOf(entity)` | Those roles, as Fields; `undefined` for a part nobody named. |
| `Cms.content(name, { entity, form, publish, words, preview? })` | A type of content: its Entity, form, publish operations, and name. |
| `Cms.editor(name, { content, rest?, version?, untitled? })` | The authoring editor: `bundle`, `Message`, and `at({ data, model })`. |
| `Cms.newEntryId()` | An id for something new. |
| `Cms.editorView(view)` | A form's Submodel view as its editor's, for `Bundle.withView`. |
| `Cms.slug(from, options?)`, `Cms.dateTime()`, `Cms.slugify(text)` | Controls for a form's `inputs`. |
| `Cms.Input.{Slug, DateTime}`, `Cms.Display.{State, Moment}` | The kinds: `.of(data)`, `.is(x)`. |
| `Cms.controlRenderers()`, `Cms.displayRenderers()` | Their renderers, to spread beside the mixins' own. |
| `Cms.state(facts, now)` | The state of an entry, with its schedule. |
| `Cms.offers(facts, now, content)` | The transitions it offers now. |
| `Cms.Entities`, `Cms.Operations`, `Cms.operations` | The CMS's own Entities and mutations. |
| `Cms.Entries` | The worklist query: one content type's entries, by label, archived or not. |
| `Cms.bySlug(content)` | The query `<name>BySlug`: the content at an address, a connection of one or none. Throws with no `slug` role. |
| `Cms.slugTaken.key(message)` | The form key a server's `CmsSlugTaken: ...` error names, or `undefined`. |

## End-to-end example

[`examples/cms`](../../examples/cms) takes a post from its first keystroke to being
taken off show, from a writer's, an editor's and a visitor's chair, over SQLite,
with its transcript pinned by a test.

## Limits

- A revision list is a `Crud.list` you declare over `Cms.Entities.Revision`.
- Preview is for the author, in their own session. A link someone else can open
  is an audience, and is [later](../../docs/design/cms-DESIGN.md#14-later-and-how-each-would-attach).
- The editor has no view of its own: render the form with `foldkit-mixins-form`,
  and the status and buttons yourself.
- An address is checked while typing by `Cms.addressFree('posts')`, added with
  the `Form.checks` step. It is advice, not the rule: two authors can both be
  told an address is free and both publish, and the server refuses the second on
  the same key. Put a unique index on the column.
- One working draft per entry, not one per author.
- Media, rich text, localization, and review states beyond "who may publish" are
  [later](../../docs/design/cms-DESIGN.md#14-later-and-how-each-would-attach).
