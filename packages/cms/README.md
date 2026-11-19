# foldkit-cms

When an author edits a live blog post or marketing page, their half-written
changes cannot overwrite the public table: visitors would see broken copy, and an
unfinished title would fail database constraints. You need working drafts beside
your published rows, revision history, scheduled releases, and unique URL slugs,
while keeping unpublished work invisible to visitors.

`foldkit-cms` keeps drafts as unsent form inputs beside your existing content
rows and runs your own create or update mutations when an author publishes.
Visitors keep reading your existing tables; editors autosave drafts, preview
edits in place, schedule releases, and restore earlier revisions.

See the editor, in-app preview, and server rules running in the
[live CMS demo](https://foldkit-cms-demo.pages.dev/).

## Install

```sh
pnpm add effect foldkit foldkit-entity foldkit-form foldkit-crud foldkit-remote foldkit-cms
```

## A first content type

This declares a blog post type with title, slug, and publish timestamp roles,
then derives the entry's current state and allowed actions from a draft beside a
live row:

```ts
import { Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

const PostInput = Schema.Struct({ title: Schema.String, slug: Schema.String })
const Posts = Cms.content('posts', {
  entity: Post,
  form: Form.make('PostForm', Entity.input(Post, PostInput)),
  publish: {
    create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: Schema.String } }),
    update: Mutation.make('UpdatePost', { Input: { ...PostInput.fields, id: Schema.String }, Output: {} }),
  },
  words: { one: 'Post', many: 'Posts' },
})

const facts = { archivedAt: null, row: 'visible' as const, draft: { scheduledFor: null, scheduleError: null } }
const state = Cms.state(facts, new Date())
const actions = Cms.offers(facts, new Date(), Posts)
```

Because a live row exists alongside an unscheduled draft, `state` is
`{ _tag: 'Changed', schedule: null }` and `actions` is
`['save', 'discard', 'publish', 'schedule', 'unpublish', 'restore', 'archive']`.

- `Post` is a `foldkit-entity` Entity annotated with `Cms.roles`, naming which
  fields hold the title, URL slug, and publish timestamp. A role on an
  incompatible field (such as `slug` on a number, or `published` on a non-null
  field) is a type error and throws.
- `Posts` binds that Entity to a `foldkit-form` Form and your own
  `foldkit-remote` `create` and `update` mutations, so what publishing writes
  stays your code.
- Capabilities follow declared roles: omitting `slug` skips slug handling, and
  omitting `published` keeps every row visible without an unpublish action.
- `Cms.rolesOf(Post)` reads those roles back as Fields for public queries,
  audience policies, or your own sitemap query.

## Where content, drafts, and state live

| Fact | Owner |
| --- | --- |
| Published content | your tables, read as any Entity is |
| Unfinished author edits | a draft, kept **beside** the row, never in it |
| Entry lifecycle state | derived by `Cms.state`, never stored |
| Allowed transitions for a state | `Cms.offers`, checked before user permissions |
| Who may make a transition | your `allow` rule, checked on the server |
| The draft being typed | `foldkit-form`, inside the editor's Model slice |
| Save progress and conflicts | `Cms.editor`, in that slice |
| Draft `updatedAt` and entry `revision` | Remote's store, read directly |

Persistence and visitor filtering live in the
[server adapter](../cms-drizzle/README.md).

## How drafts sit beside live rows

**A draft is an unsent form.** Your content row holds only what is published,
while a draft stores the unsent input of the operation that will publish it.
Publishing runs your own mutation with the draft's value; visitors read only
content rows and never touch drafts; a revision saves a published value; and a
half-filled form can autosave even when a `not null` column would reject it.

An **Entry** tracks a piece of content from its first keystroke to its archive.
It exists before the first published row and remains after a row is unpublished.
Publishing runs your mutation to update the live row and appends a **Revision**
to the Entry.

## The lifecycle

State is derived from facts and a clock. Nothing stores a status, so it cannot
disagree with what is true.

<!-- docs-check
declare const scheduledFor: string
declare const now: Date
-->

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
import { Bundle } from 'foldkit-bundle'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Editor = Cms.editor('PostEditor', { content: Posts })
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle), // its Model and its Messages, in yours
)
const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, ...Object.values(Cms.Entities)],
  mutations: [...Cms.operations],
})

const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', { onOut: PostEditor.onOut }), // made from Data, so given now
)
const Placed = Page.children.editor
const update = PostEditor.after(
  Page.placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

Data.subscriptions({ ...PostEditor.actives }) // beside your own Surfaces' actives
```

<!-- docs-check
declare const model: typeof Base.Model.Type
declare const entryId: string
-->

```ts
Placed.helpers.open(entryId) // resume the draft, else show what is published
Placed.helpers.create(Cms.newEntryId()) // something new; its first save makes the entry
Editor.Message.PublishAsked() // also: ScheduleAsked({ at }), UnscheduleAsked, DiscardAsked,
// RestoreAsked({ revision }), UnpublishAsked, ArchiveAsked, UnarchiveAsked, ReloadAsked, OverwriteAsked

PostEditor.status(model) // Opened | Editing | Saving | Saved | Conflict | Publishing | Published | ...
PostEditor.state(model) // Option: the entry's lifecycle state, as the server last derived it
PostEditor.may(model, 'publish') // whether the server's `allow` lets this principal ask it; false until read
PostEditor.pageId(model) // Option: the row's id, or the entry's until there is a row: what a preview shows under
PostEditor.storedEntry(model) // Option: the entry the server knows, none until something new is first saved
```

- **Saving is automatic and is not publishing.** Each edit starts a rest (`rest`,
  one second by default), and the edit that is still the last one when its rest
  ends saves the form as it stands, valid or not. There is no Save button to
  forget, and a validation error never costs an author their work.
- **A publish the form's own checks stop is `Incomplete`**, not whatever the
  last save said: nothing was sent, the failing fields say why, and the next
  edit clears it. One waiting for a check still running (an address being
  looked up) is `Publishing` until the check answers.
- **What counts as an edit is the form's answer, not a Message tag.** The editor
  asks `form.authoredChanged(before, after)`, so a blur, a refusal, or a repeated
  value starts no rest, while a control the editor has never heard of — a
  stateful or Bundle-backed one — autosaves exactly like a text field.
- **A form control backed by a Bundle keeps running inside the editor.** Its
  Subscriptions and Resources (see
  [`Input.bundle`](../form/README.md#a-control-with-a-model-of-its-own)) run
  while an entry is open and stop when the editor closes. A runtime that runs
  the editor provides their Resources, as for any Bundle that has some.
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
  [the example](../../examples/cms/src/apps/app.ts) does: it saves what has not been
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
  `Cms.refusal.field(slugKey, reason)` marks the slug's own field invalid,
  keeping what was typed, and clears when the author edits it. Nothing to wire:
  the editor reads it with `Data.refusal`.
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

An entry's address and its publish time use
[`foldkit-form-recipes`](../form-recipes/README.md)' `slug` and `dateTime`
controls; the CMS adds two display kinds (`Cms.Display.State` and
`Cms.Display.Moment`) made with `Display.kind`. Render them alongside your form
renderers—a kind and its renderer are all a view needs.

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    goesLiveAt: Schema.String,
  }),
)
const PostInput = Schema.Struct({
  title: Schema.String,
  slug: Schema.String,
  goesLiveAt: Schema.String,
})
-->

```ts
import { Form } from 'foldkit-form'
import { FieldRecipes } from 'foldkit-form-recipes'
import { renderers } from 'foldkit-form-recipes/html'
import { FormView } from 'foldkit-mixins-form'

const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  inputs: {
    // follows the title until the author writes it
    slug: FieldRecipes.slug('title', { prefix: '/blog/' }).control,
    // a datetime-local input, read in London, submitted as an ISO instant
    goesLiveAt: FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' }).control,
  },
})

FormView.define(PostForm, { renderers: renderers() })
```

Beside a `Crud.list` over `Cms.Entries`, pass `Cms.displayRenderers()` to
`EntryTable({ page, renderers: Cms.displayRenderers() }, h)`.

A slug follows its title until the author writes it, and a form filled with a
published slug stays fixed so an existing URL never moves when a title changes.

| Kind | What it renders |
| --- | --- |
| `Cms.Display.State` | `span` with `data-cms-state` and `data-cms-schedule` for the entry state |
| `Cms.Display.Moment` | `time` element, relative to `now` or formatted as a date and time |

Pass custom labels to `Cms.Display.State.of({ words })` for each state,
`scheduled`, `overdue`, and `withSchedule` (`'{state}, {schedule}'`). Pass
`Cms.Display.Moment.of({ now })` to format relative times like `3 days ago`
against your chosen clock.

`Cms.Entities` already declare these kinds on their `state` and timestamp
fields, so a `Crud.list` over `Cms.Entries` needs only `Cms.displayRenderers()`.

Entry-level views live beside the kinds: `Cms.stateBadge` for the state
(written in `Cms.stateAttribute`, `data-cms-state`, matching list cells),
`Cms.revisionsOf` for the open entry's published revisions, `Cms.historyCard`
for the timeline, and `Cms.moreCard` for the remaining actions. They draw on your
own slot builders so you keep your slots and styles; you supply `authorName`,
the archive icon, and an explicit `locale` and `timeZone` so server and browser
renders match:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Capability, Slot, Slots, type SlotView } from 'foldkit-mixins'
import { Cms, type RevisionRow, type State } from 'foldkit-cms'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { RemoteData } from 'foldkit-remote'

const Message = defineMessageUnion({ RestoreAsked: { revision: Schema.Number } })
type Message = typeof Message.Type
type Model = { readonly entryId: string }

const EntrySlots = Slots.define({
  card: Slot.make({ capability: Capability.Container }),
  cardTitle: Slot.make({ capability: Capability.Container }),
  badge: Slot.make({ capability: Capability.Container }),
  muted: Slot.make({ capability: Capability.Container }),
  timeline: Slot.make({ capability: Capability.Container }),
  revision: Slot.make({ capability: Capability.Container }),
  revisionMark: Slot.make({ capability: Capability.Container }),
  revisionBody: Slot.make({ capability: Capability.Container }),
  revisionTitle: Slot.make({ capability: Capability.Container }),
  revisionLive: Slot.make({ capability: Capability.Container }),
  revisionMeta: Slot.make({ capability: Capability.Container }),
  revisionRestore: Slot.make({ capability: Capability.Interactive }),
  toolbar: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Capability.Interactive }),
  danger: Slot.make({ capability: Capability.Interactive }),
})
declare const slots: SlotView.SlotBuilders<typeof EntrySlots, Message>
declare const h: HtmlBuilder<Message>
declare const model: Model
declare const state: Option.Option<State>
declare const history: (model: Model) => Option.Option<{
  readonly read: (
    model: Model,
  ) => RemoteData<{ readonly revisions: ReadonlyArray<RevisionRow> }>
}>
declare const directoryName: (name: string) => string
-->

```ts
Cms.historyCard(slots, h, Cms.revisionsOf(model, history), {
  state,
  restore: revision => Message.RestoreAsked({ revision }),
  authorName: name => directoryName(name),
  locale: 'en',
  timeZone: 'UTC',
})
```

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

## Main exports

| Call | Meaning |
| --- | --- |
| `Cms.roles({ label?, slug?, published? })` | Pipe step: the members of an Entity that play a CMS part. |
| `Cms.rolesOf(entity)` | Those roles as Fields; `undefined` for an unnamed part. |
| `Cms.published(entity)` | Published-row predicate for queries and Read rules (needs `published` role). |
| `Cms.content(name, { entity, form, publish, words, preview? })` | Declares a content type: Entity, form, publish mutations, and words. |
| `Cms.editor(name, { content, rest?, version?, untitled? })` | Authoring editor Bundle: `bundle`, `Message`, and `at({ data, model })`. |
| `Cms.newEntryId()` | Generates an `EntryId` for a new entry. |
| `Cms.editorView(view)` | Adapts a form's Submodel view for `Bundle.withView`. |
| `Cms.Display.{State, Moment}` | Display kinds for entry state and timestamps (`.of(data)`, `.is(x)`). |
| `Cms.displayRenderers()` | Renderers for `Cms.Display`, to spread beside your own. |
| `Cms.state(facts, now)` | Derives an entry's state and schedule from facts and a clock. |
| `Cms.offers(facts, now, content)` | Lists the transitions currently offered for an entry. |
| `Cms.Entities`, `Cms.Operations`, `Cms.operations` | Built-in Entities and Remote mutations for CMS operations. |
| `Cms.Entries` | Worklist query: one content type's entries, by label or archived state. |
| `Cms.bySlug(content)` | Query `<name>BySlug` returning one or none at a slug (needs `slug` role). |
| `Cms.refusal` | Server refusal constructors (`field(key, reason)`, `conflict`). |

`Cms.bySlug(content)` accepts any `ContentReader` (`{ name, entity, roles }`,
which every `Content` satisfies), so a public site can query by slug without
importing the authoring form.

## Limits

- A revision list is a `Crud.list` you declare over `Cms.Entities.Revision`.
- Preview is for the author, in their own session; shareable preview links
  for external reviewers are not built yet.
- Form layout and status controls come from `foldkit-mixins-form` and your own
  view slots.
- `Cms.addressFree('posts')` (added via `Form.checks`) advises authors while
  typing; put a unique index on the database column to enforce uniqueness on
  concurrent publishes.
- One working draft per entry, not one per author.
- Media, rich text, localization, and multi-step review workflows beyond who
  may publish are not built yet.

## Next

- Store drafts in Drizzle and enforce visitor visibility on the server:
  [`foldkit-cms-drizzle`](../cms-drizzle/README.md).
- Run a complete post lifecycle over SQLite and in the browser:
  [the CMS example](../../examples/cms/README.md).
- Build and validate the forms that back each draft:
  [`foldkit-form`](../form/README.md).
