# foldkit-crud

An edit screen looks like a form plus a request. By hand it is much more:
load the record when the screen opens and keep it loaded while it is shown;
fill the form once when the value arrives without overwriting what the user
typed; turn a valid submit into a mutation and remember which request belongs
to this screen; show loading, saving, saved, and failed from that request; and
notice if the record was deleted while it was open. A list also needs its pages
loaded, retained, extended, and offered to relation pickers.

`foldkit-crud` wires those pieces once from parts your application already has:
a [`foldkit-remote`](../remote/README.md) domain,
[`foldkit-entity`](../entity/README.md) definitions, and
[`foldkit-form`](../form/README.md) forms. The records and save state stay in
Remote's store, the drafts stay in the form, and every screen status derives
from them. It is headless; draw tables, details, and forms with
[`foldkit-mixins-crud`](../mixins-crud/README.md) and
[`foldkit-mixins-form`](../mixins-form/README.md).

See a live list, editor, and remover running in
[`examples/entity`](../../examples/entity) and at
[foldkit-chirp-demo.pages.dev](https://foldkit-chirp-demo.pages.dev/).

## List, detail, editor, and remover

| Piece | Joins | State of its own | Placed as |
| --- | --- | --- | --- |
| **list** | a Remote query and an Entity Selection | Remote holds pages | a value |
| **detail** | an Entity Selection and a Model ID | Remote holds the row | a value |
| **editor** | a form, its mutation, and their Entity | open ID, filled flag, request ID | a Bundle |
| **remover** | a delete mutation with confirmation | pending ID, request ID | a Bundle |

Screens are declared explicitly from your queries, forms, and mutations: an
editor exists because you pass a form and a mutation, and a list exists because
you pass a query your server authorizes.

## Where records, drafts, and screens live

| Fact | Owner |
| --- | --- |
| Records and save/delete request state | Remote, in its store |
| Record shape, labels, and relations | The Entity |
| Drafts and field validation | The form |
| Open ID, confirmation state, and request ID | The editor or remover slice in your Model |
| Active search, sort, and filters | Your Model, passed as query input |
| Navigation or toast after save/delete | Your `update`, reading the piece's status |
| Visual rendering | Your views, `foldkit-mixins-crud`, or `-form` |

## How active requirements drive loading and saves

Your Model holds what is on screen, and each piece's `active` tells `Data.wiring`
(or `Data.subscriptions`) what Remote needs to fetch and retain. Each piece
reads Remote's store back as a page, a value, or a status for your view.

When the user submits or confirms, a Message triggers the piece's helper or the
editor's `onOut`, which calls `Data.mutate`; Remote tracks the request (`busy`
reads directly from Remote's ledger) and updates the screen's status when it
settles.

**Every piece must have its `active` wired.** Unwired pieces stay `Initial`
without loading. [Wiring a page](#wiring-a-page) gathers every piece's
`active` in one call.

## Install

```sh
pnpm add effect foldkit foldkit-crud foldkit-bundle foldkit-entity foldkit-form foldkit-remote foldkit-surface
```

## A first list

This defines an `Author` entity, a paginated query, and a `Crud.list`, then
reads the list's current page state from an initial Model:

```ts
import { Option, Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Query, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const AuthorsQuery = Query.make('Authors', {
  Input: { search: Schema.String },
  Result: Query.connection(Author),
})
const Authors = Crud.list('Authors', {
  query: AuthorsQuery,
  selection: Entity.select(Author, { id: true, name: true }),
  pageSize: 25,
  choice: { value: row => row.id, label: row => row.name },
})

const Model = Schema.Struct({ remote: Remote.Model, search: Schema.NullOr(Schema.String) })
const App = Surface.application({ Model, Message: Remote.Message })
const Data = Remote.make({ model: App.model.remote, entities: [Author], queries: [AuthorsQuery] })

const AuthorList = Authors.at({
  data: Data,
  input: model => Option.map(Option.fromNullOr(model.search), search => ({ search })),
})

AuthorList.page({ remote: Remote.initial, search: null }) // { _tag: 'Initial' } until active is wired
const subscriptions = Data.subscriptions({ authors: AuthorList.active })
```

When `search` is `null`, `AuthorList.page` returns `{ _tag: 'Initial' }`. Once
`search` becomes a string (such as `""`) and `AuthorList.active` runs in
`Data.subscriptions`, Remote fetches the page and `AuthorList.page(model)` yields
`Loading` and then `Ready` with typed `items`, `hasNext`, and `hasPrevious`.

What each member does:

- **`Crud.list`** declares the list without starting requests. `Authors.columns`
  lists the selected columns in order with `key`, `member`, `label` (from
  schema `title`, `Form.label`, or the key), and `display`. Pass
  `live: liveQuery` from `foldkit-remote/live` to stream row updates live from
  a `pollLive` server source.
- **`Authors.at`** binds the list to your Remote domain and Model input selector.
- **`AuthorList.active`** retains and fetches the current input's connection
  while `input(model)` returns `Option.some(...)`.
- **`AuthorList.more(model)`** returns `Option<Model>` extended by one page
  (`Option.none()` once every row is loaded); return
  `Option.getOrElse(AuthorList.more(model), () => model)` from your `update`.
- **`AuthorList.refresh(model)`** marks the list stale for refetching (used by
  retry buttons after a failed read).
- **`AuthorList.connection(model)`** returns `Option<Connection>` for passing to
  optimistic list helpers such as `ConnectionChange.prepend`.

`AuthorList.row(id)` creates a Projection for one row using the list's
Selection, and `AuthorList.choiceOf(model, id)` formats a loaded row as a
picker choice.

## Wiring a page

Every placed piece has an `active`. `Crud.actives` gathers them from the pieces
themselves, so a page keeps all of them wired together:

```ts sketch
Data.wiring(Crud.actives({ posts: Posts, authors: Authors, editor: PostEditor, pickers }))
```

It accepts any placed editor, list, detail, and `pickers` from `Crud.options`,
returning `{ posts: Posts.active, ... }` for `Data.wiring` in a `foldkit-bundle`
assembly or `Data.subscriptions`.

## An editor

An editor joins a form, the mutation its value feeds, and the Entity they
share. `EditPostForm` is a `Form.make` result and `EditPostMutation` a Remote
mutation over the same input struct, as in
[`examples/entity`](../../examples/entity); `Blog` is that application's Entity
domain.

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })
const EditPostInput = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  authorId: Schema.String,
})
const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
const EditPostForm = Form.make(
  'EditPost',
  Entity.input(Blog.Post, EditPostInput, { authorId: Relation.input(Blog.Post.relations.author) }),
  { inputs: { id: Input.hidden() } },
)
const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
-->

```ts
import { Crud } from 'foldkit-crud'
import { Bundle } from 'foldkit-bundle'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

// The editor is a Submodel of the page: a Model field and a Message variant.
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle),
)

const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

// Where it lives: its slice of the Model, and the domain it saves through.
const PostEditor = Editor.at({ data: Data, model: App.model.editor })

// Its placement needs the domain, so it is given once the domain exists.
const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', PostEditor.placement),
)
const Placed = Page.children.editor
const { placements } = Page

const update = PostEditor.after(
  placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

const subscriptions = Data.subscriptions({ editor: PostEditor.active })
```

- **`Crud.editor`** checks at compile time that the form's submitted value
  matches the mutation's input.
- **Over a variant Entity's form** (an input with `_tag`; see
  [`foldkit-form`](../form/README.md#a-form-over-a-variant-entity)), the editor
  loads each row as its case and fills that case's keys alone.
- **`Editor.bundle`** wraps the form's Bundle and keeps its Messages (`Changed`,
  `Submitted`, and the rest) intact for views.
- **`Bundle.compose`** declares the page first, then `Bundle.configure('editor', PostEditor.placement)`
  supplies the domain-dependent placement (see
  [composing a parent](../bundle/README.md#composing-a-parent)).
- **`Editor.at`** binds the editor slice (`App.model.editor`) and Remote domain,
  returning `placement` (`onOut` + `viewInputs`), `busy(model)`, `active`,
  `after(update)` (and `sync`), `status(model)`, `saveError(model)`,
  `refresh(model)`, and `target(model)`.
- Saves execute Commands needing `RemoteClient`, so the page declares
  `Bundle.withServices<RemoteClient>()`.

### What starts the work

| Call | What happens |
| --- | --- |
| `Crud.editor(...)` / `Editor.at(...)` | Builds the editor configuration without sending requests |
| `Placed.helpers.open(id)` | Returns an Update Step to open a record for editing |
| `Data.subscriptions({ editor: PostEditor.active })` | Installs the loader subscription with `RemoteClient` |
| `PostEditor.after(update)` | Fills the form once loaded and reconciles status |
| A valid submit, through `placement.onOut` | Returns the mutation Command; Remote settles the save |

Include the placement's own Subscriptions when your form uses async checks or
stateful controls. Only the mutation's outcome moves status to `Saved`.

### Opening it

`open`, `blank`, and `close` are Update Steps returned from the placement's
helpers:

```ts
Placed.helpers.open('p2') // edit p2: the form empties, then fills when the value arrives
Placed.helpers.blank() // a new one: nothing to load, editing at once
Placed.helpers.close()
```

When create and edit share one form whose `id` is an `Option`, a `blank()` form
submits `Option.none()` (`Create`) and an `open(id)` form submits `Option.some(id)`
(`Update`). After a create saves, the form resets to blank (preserving any edits
typed while the request was in flight). Declared writes (`Write.update` and
`Write.insert`) use two separate editors.

### Its status

| Status | When |
| --- | --- |
| `Closed` | Nothing is open |
| `Loading` | An ID is open and its current values are in flight |
| `Editing` | The form is active with no pending or settled save |
| `Saving` | This editor's mutation is pending |
| `Saved` | The mutation applied |
| `SaveFailed` | The save failed; drafts stay intact and `saveError(model)` has details |
| `Conflict` | Server refused with `Refusal.conflict` (row changed elsewhere) |
| `Moved` | A revision-pinned declared write saw the row move after loading |
| `LoadFailed` | Initial load failed; call `refresh(model)` to retry |
| `NotFound` | The record is absent or deleted; outranks earlier saves |

Any edit after a save moves status back to `Editing`.

Field-level server refusals (`Refusal.field(key, reason)`) attach directly to
the matching key (`Message.Refused`) while it still holds the refused value, and
status becomes `SaveFailed`. Invariant refusals (`Refusal.invalid`) highlight
the keys named in their path.

The editor also loads fields referenced by Entity invariants (`Entity.judgedBy`)
and calls `form.over` automatically, catching cross-field invariant errors
client-side before sending. Read-guarded fields withheld by the server remain
undecided on the client and are judged by the server on save; redacted fields
judge against their redacted value unless omitted.

### A save in flight

While a save runs, `busy(model)` is `true` and `viewInputs` set `submitting`
(`aria-busy`, `data-submitting`, and `aria-disabled` on the submit button).
`busy` reads directly from Remote's ledger by request ID and clears as soon as
the mutation settles.

- **Submitting while busy** returns the Model unchanged without starting a
  second write.
- **Key refusals** render on the matching field; **general refusals** (conflicts
  or unpathed invariants) render in the form's `failure` Slot.
- **Network failures** render in `failure` with a retry trigger sending
  `Data.retry` with the original operation ID; editing the form starts a fresh
  write.
- **A landed create** resets the form to blank with an `aria-disabled` submit
  button that keeps focus and announces missing fields if pressed.

`foldkit-mixins-crud`'s `EditorView` leaves `SaveFailed` and `Conflict` to the
form's `failure` Slot so failures announce once, keeping transport messages in
`saveError(model)` for diagnostics. Customize default sentences with `words`:

```ts
const Worded = Crud.editor('PostEditor', {
  form: EditPostForm,
  mutation: EditPostMutation,
  words: {
    failed: 'Could not save. Check your connection and try again.',
    conflict: 'Someone else saved this first, so your changes were not saved.',
    refused: 'This could not be saved.',
  },
})
```

Passing a custom `failure` in the form's view inputs overrides these strings.

### How it treats the form

- **Fills once per open:** refetches or live updates leave user drafts alone;
  calling `open` again clears and refills.
- **Selects form keys + `Entity.judgedBy`:** unmapped keys (`Entity.unmapped`)
  start empty and skip loading.
- **Validates before sending:** invalid submits run form validation and checks
  without starting a mutation.
- **Declared writes send deltas:** with `Mutation.write`, saves include only
  keys changed from what the form loaded or last saved, avoiding overwrites on
  untouched fields; new blank forms send all keys.
- **Revision-pinned writes track saves:** after a revision-expected write lands,
  the form adopts the new revision so follow-up saves succeed cleanly while
  external edits transition status to `Moved`.
- **Status follows edits:** editing after a save resets status to `Editing` (or
  `Moved`), while late responses still attach field refusals if they land.

### Drawing it

Lift any Submodel form view into the editor with `Crud.editorView`:

```ts
import { FormView } from 'foldkit-mixins-form'

const DrawnEditor = Editor.bundle.pipe(
  Bundle.withView(Crud.editorView(FormView.submodel(EditPostForm, FormView.define(EditPostForm)))),
)
// Place it as before: Bundle.withChild('editor', DrawnEditor)
```

Where the page draws the placement of `DrawnEditor`:

```ts sketch
Placed.view(model, h, { options: pickers(model), words: { submit: 'Save' } })
```

Pass `locks: May.locks(Blog.Post)` (`foldkit-guard`) to `Crud.editor` and forward
`locked: PostEditor.locked(model)` to the form view so read-only keys render
locked while loaded (new blank forms unlock all fields; the Source must select
`may`, and the server still enforces writes).

## Deleting

A remover wraps a delete mutation with a confirmation step (`Idle`, `Confirming`,
`Deleting`, `Deleted`, `DeleteFailed`):

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Mutation, Query, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })
const EditPostInput = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  authorId: Schema.String,
})
const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
const DeletePostMutation = Mutation.make('DeletePost', {
  Input: { id: Schema.String },
  Output: { id: Schema.String },
})
const EditPostForm = Form.make(
  'EditPost',
  Entity.input(Blog.Post, EditPostInput, { authorId: Relation.input(Blog.Post.relations.author) }),
  { inputs: { id: Input.hidden() } },
)
const AuthorsQuery = Query.make('Authors', {
  Input: { search: Schema.String },
  Result: Query.connection(Blog.Author),
})

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })
const RemoverDef = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  input: id => ({ id }),
})
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle),
  Bundle.withChild('remover', RemoverDef.bundle),
)
const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  queries: [AuthorsQuery],
  mutations: [EditPostMutation, DeletePostMutation],
})
const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const RemoverAt = RemoverDef.at({ data: Data, model: App.model.remover })
const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', PostEditor.placement),
  Bundle.configure('remover', { onOut: RemoverAt.onOut }),
)
const Placed = Page.children.editor
const { placements } = Page
const Authors = Crud.list('Authors', {
  query: AuthorsQuery,
  selection: Entity.select(Blog.Author, { id: true, name: true }),
  choice: { value: row => row.id, label: row => row.name },
})
-->

```ts
const Remover = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  input: id => ({ id }), // the mutation's input for an id
})
// In the page: Bundle.withChild('remover', Remover.bundle), beside the editor.

const PostRemover = Remover.at({ data: Data, model: App.model.remover })
// With the editor's: Bundle.configure('remover', { onOut: PostRemover.onOut })
const RemoveForm = Page.children.remover
```

- `RemoveForm.helpers.ask(id)` opens confirmation and `dismiss()` clears it.
- Pass `{ returnFocus: '#delete' }` (or `id => '#delete-' + id`) as a third
  argument so cancelling returns focus to the button that opened the prompt.
- `Remover.Message.Confirmed()` and `Cancelled()` confirm or dismiss.
- `PostRemover.status(model)`, `target(model)`, and `error(model)` drive the
  confirmation UI.

When the server mutation returns `deleted` IDs, Remote removes the record from
every list and relation automatically and transitions open details and editors
to `NotFound`.

## A screen's Messages

A page with an editor and remover handles the same four Messages (`OpenedPost`,
`CreatedPost`, `ClosedPost`, `AskedToRemovePost`). `Crud.screen` defines those
Messages and routes them to the placements' helpers:

```ts
const PostScreen = Crud.screen('Post', { id: Schema.String })
// In the page: Bundle.withMessages({ ...PostScreen.messages }), beside its own:
// OpenedPost({ id }), CreatedPost(), ClosedPost(), AskedToRemovePost({ id }).

const update = PostScreen.update(
  { editor: PostEditor, editing: Placed, removing: RemoveForm },
  placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)
```

Leave `removing` out for screens without delete. Passing `pickers` (from
`Crud.options`) also handles `AskedForMore` via `pickers.ask` (handle it via
`Crud.screen` or directly in your `update`, not both). `Crud.screen` delegates
all other Messages to your `update` and runs `PostEditor.after` after each.

## Detail

`Crud.detail` reads one record through a Selection without holding local state:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'

const Blog = {
  Post: Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String })),
}
const PostPage = Entity.select(Blog.Post, { id: true, title: true })
const Model = Schema.Struct({ remote: Remote.Model, shownPostId: Schema.NullOr(Schema.String) })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Blog.Post] })
declare const model: typeof Model.Type
-->

```ts
const PostDetail = Crud.detail('PostDetail', { selection: PostPage }).at({
  data: Data,
  id: model => Option.fromNullOr(model.shownPostId), // none while none is shown
})

PostDetail.value(model) // RemoteData of the Selection's value
```

`Crud.detail(...).fields` lists the selected members with labels,
`PostDetail.active` retains and fetches the record while an ID is shown, and
`PostDetail.refresh(model)` marks it for refetching.

## When something fails

Failed reads stay visible until your application requests a retry via `refresh`:

| What happened | What the piece reports | What to do |
| --- | --- | --- |
| List read failed | `page(model)` is `Failed` (keeps `previous`) | Call `refresh(model)` on retry |
| Detail read failed | `value(model)` is `Failed` | Call `refresh(model)` on retry |
| Editor load failed | `LoadFailed` (keeps `Editing` on refresh fail) | Call `refresh(model)` on retry |
| Save failed | `SaveFailed` (drafts kept; form shows why) | Submit again to retry |
| Delete failed | `DeleteFailed` | Show `error(model)` and retry |
| Record deleted | `NotFound` on detail/editor; leaves lists | Close screen or inform user |
| `active` unwired | Stays `Initial` or `Loading` | Wire via [`Crud.actives`](#wiring-a-page) |

## Showing values

### How a column shows

`Display` describes how a selected member formats as text without coupling to a
specific UI library:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Display, type ListColumn } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'

const Blog = {
  Post: Entity.define(
    'Post',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      cents: Schema.Number,
      status: Schema.String,
    }),
  ),
}
declare const column: ListColumn
declare const row: Readonly<Record<string, unknown>>
-->

```ts
const Post = Blog.Post.pipe(
  Entity.annotateMembers({
    id: Display.of(Display.hidden()), // read, so a row can be opened by it, and not shown
    cents: Display.of(Display.number(cents => `$${(cents / 100).toFixed(2)}`)),
  }),
)

Display.show(column.display, row[column.key], { yes: 'Live', no: 'Draft' }) // the cell's text
```

| Kind | For |
| --- | --- |
| `Text`, `Number` | Raw value or formatted with `format` |
| `Flag` | Boolean rendered with `yes` / `no` words |
| `Hidden` | Selected for IDs or actions; hidden from tables |
| `Ref` | Relation selected with `true` (shows IDs) |
| `Nested` | Nested Selection columns (`one`, `many`, `page`) |

Display kinds resolve from `Display.of` metadata, then relation selection, then
schema shape. Define custom kinds such as badges with `Display.kind`:

```ts
const Badge = Display.kind<{ readonly tone: string }>('Badge', {
  text: (_, value) => String(value), // fallback text when rendered without a custom cell
})

const Badged = Blog.Post.pipe(
  Entity.annotateMembers({ status: Display.of(Badge.of({ tone: 'soft' })) }),
)
```

`Badge.is(display)` narrows `display.data` for custom cell renderers in
[`foldkit-mixins-crud`](../mixins-crud/README.md).

### A relation picker's choices

Relation pickers pull choices from a `Crud.list` with a `choice` mapper so your
server query authorizes which rows appear. `Crud.options` maps each picker key
on the form to its target Entity's list:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Mutation, Query, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { HtmlBuilder } from 'foldkit/html'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })
const EditPostInput = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  authorId: Schema.String,
})
const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
const DeletePostMutation = Mutation.make('DeletePost', {
  Input: { id: Schema.String },
  Output: { id: Schema.String },
})
const EditPostForm = Form.make(
  'EditPost',
  Entity.input(Blog.Post, EditPostInput, { authorId: Relation.input(Blog.Post.relations.author) }),
  { inputs: { id: Input.hidden() } },
)
const AuthorsQuery = Query.make('Authors', {
  Input: { search: Schema.String },
  Result: Query.connection(Blog.Author),
})

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })
const RemoverDef = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  input: id => ({ id }),
})
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle),
  Bundle.withChild('remover', RemoverDef.bundle),
)
const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  queries: [AuthorsQuery],
  mutations: [EditPostMutation, DeletePostMutation],
})
const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const RemoverAt = RemoverDef.at({ data: Data, model: App.model.remover })
const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', PostEditor.placement),
  Bundle.configure('remover', { onOut: RemoverAt.onOut }),
)
const Placed = Page.children.editor
const { placements } = Page
const Authors = Crud.list('Authors', {
  query: AuthorsQuery,
  selection: Entity.select(Blog.Author, { id: true, name: true }),
  choice: { value: row => row.id, label: row => row.name },
})
const AuthorList = Authors.at({ data: Data, input: () => Option.some({ search: '' }) })
const PostScreen = Crud.screen('Post', { id: Schema.String })
declare const model: typeof Page.Model.Type
declare const h: HtmlBuilder<typeof Page.Message.Type>
-->

```ts
const pickers = Crud.options(EditPostForm, [AuthorList])
```

```ts sketch
Placed.view(model, h, { options: pickers(model) }) // with foldkit-mixins-form
```

`pickers(model)` returns `{ authorId: [{ value, label }, …] }`, matching lists
by target Entity (so one `AuthorList` serves both `authorId` and `editorId`).
Missing target lists or lists lacking `choice` throw when `Crud.options` runs.
`AuthorList.choices(model)` returns one list's choices on its own.

#### When a picker searches

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Mutation, Query, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { HtmlBuilder } from 'foldkit/html'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })
const EditPostInput = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  authorId: Schema.String,
})
const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
const DeletePostMutation = Mutation.make('DeletePost', {
  Input: { id: Schema.String },
  Output: { id: Schema.String },
})
const EditPostForm = Form.make(
  'EditPost',
  Entity.input(Blog.Post, EditPostInput, { authorId: Relation.input(Blog.Post.relations.author) }),
  { inputs: { id: Input.hidden() } },
)
const AuthorsQuery = Query.make('Authors', {
  Input: { search: Schema.String },
  Result: Query.connection(Blog.Author),
})

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })
const RemoverDef = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  input: id => ({ id }),
})
const Base = Bundle.compose({ remote: Remote.Model }).pipe(
  Bundle.withMessages(Remote.messages),
  Bundle.withChild('editor', Editor.bundle),
  Bundle.withChild('remover', RemoverDef.bundle),
)
const App = Surface.application(Base)
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  queries: [AuthorsQuery],
  mutations: [EditPostMutation, DeletePostMutation],
})
const PostEditor = Editor.at({ data: Data, model: App.model.editor })
const RemoverAt = RemoverDef.at({ data: Data, model: App.model.remover })
const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('editor', PostEditor.placement),
  Bundle.configure('remover', { onOut: RemoverAt.onOut }),
)
const Placed = Page.children.editor
const { placements } = Page
const Authors = Crud.list('Authors', {
  query: AuthorsQuery,
  selection: Entity.select(Blog.Author, { id: true, name: true }),
  choice: { value: row => row.id, label: row => row.name },
})
const PostScreen = Crud.screen('Post', { id: Schema.String })
declare const model: typeof Page.Model.Type
declare const h: HtmlBuilder<typeof Page.Message.Type>
-->

```ts
const AuthorList = Authors.at({
  data: Data,
  // What the picker's search box holds is the form's; here it is the query's input.
  input: model => Option.some({ search: EditPostForm.search(model.editor.form, 'authorId') }),
})

const pickers = Crud.options(EditPostForm, [AuthorList], {
  chosen: model => model.editor.form, // the form's Model, wherever the page keeps it
})

const subscriptions = Data.subscriptions({ authors: AuthorList.active, chosen: pickers.active })
```

Passing `chosen` and wiring `pickers.active` keeps the currently selected
record loaded and visible at the top of the choices even when a search filter
hides it from `AuthorList`. Pass `more: pickers.more(model)` to the form view to
render "Show more" buttons and handle `AskedForMore` via `pickers.ask(model, key)`
or `Crud.screen`:

```ts sketch
Placed.view(model, h, { options: pickers(model), more: pickers.more(model) })
```

```ts
PostScreen.update(
  { editor: PostEditor, editing: Placed, pickers },
  placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)
```

## Sorting a list

`Sort` keeps your Model state, clickable table headers, and server query input
in sync:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { defineMessageUnion } from 'foldkit/message'

const Blog = {
  Post: Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String })),
}
const Message = defineMessageUnion({ SortedPosts: { column: Schema.String } })
-->

```ts
import { Sort } from 'foldkit-crud'

const PostSort = Sort.make(['title', 'created']) // the orders offered, by name

const PostsQuery = Query.make('Posts', {
  Input: { sort: PostSort.Schema },
  Result: Query.connection(Blog.Post),
})
// Model: `postSort: PostSort.Schema`, starting at `PostSort.none`
// update: `SortedPosts` toggles `postSort` by the column the Message carries
```

<!-- docs-check
declare const model: { readonly postSort: typeof PostSort.Schema.Type }
-->

```ts
PostSort.toggle(model.postSort, 'title') // asc, then desc, then the server's own order
PostSort.inputs(model.postSort, (_, column) => Message.SortedPosts({ column }))
```

`Sort` names order keys rather than raw database columns. Map those keys on the
query with `Query.orderBy(Order.chosen(input.sort, { title: Post.fields.title }))`
(`foldkit-entity`) so client placement matches the server, or on the server
with `foldkit-remote-drizzle`'s `sortTerms(sort, { title: posts.title })`.

## Typed ids

Branded Entity `id` schemas flow through `helpers.open(id)`, `target(model)`,
removers (`id: 'id'`, or `(id: PostId) => ({ id, reason: 'spam' })`), and list
rows (`row.id`).

## Limits

- **Filter and sort state stays in your Model:** lists read your Model's query
  input so changing search or sort loads that connection through Remote.
- **Headless:** draw lists and details with
  [`foldkit-mixins-crud`](../mixins-crud/README.md) (or `columns` +
  `Display.show`), and editors with `Crud.editorView` over
  [`foldkit-mixins-form`](../mixins-form/README.md) (or `EditPostForm.controls`).
- **One editor per form:** create and edit flows with different schemas or
  declared writes use two editors.

## Next

- Render tables, details, and editor dialogs: [`foldkit-mixins-crud`](../mixins-crud/README.md)
- Render accessible form controls: [`foldkit-mixins-form`](../mixins-form/README.md)
- Declare forms and custom controls: [`foldkit-form`](../form/README.md)
- See a complete list, editor, and remover app: [`examples/entity`](../../examples/entity)
