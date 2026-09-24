# foldkit-crud

The screens that list, show, edit and delete records, built from parts your
application already has: a [`foldkit-remote`](../remote/README.md) domain, the
[`foldkit-entity`](../entity/README.md) Entities it holds, and, for an editor, a
[`foldkit-form`](../form/README.md) form. It draws nothing and holds almost no
state. A list is one query and what to show of each row:

```ts
const Authors = Crud.list('Authors', {
  query: AuthorsQuery,
  selection: Entity.select(Blog.Author, { id: true, name: true }),
})
const AuthorList = Authors.at({ data: Data, input: model => ({ search: model.search }) })

AuthorList.page(model) // RemoteData of the page: its typed rows, hasNext, hasPrevious
```

It is for any such screen, a user editing their own post as much as a back
office. [`examples/entity`](../../examples/entity) draws a list, an editor and a
remover, and runs in a browser.

## Why you would use it

An edit screen looks like a form plus a request. By hand it is more: load the
record when the screen opens, and keep it loaded while it is shown; fill the
form once when the value arrives, and never again over what the user typed;
turn a valid submit into the mutation, and remember which request is this
screen's; show loading, saving, saved and failed from that request; notice when
the record was deleted while it was open. A list needs its pages loaded,
retained and extended, its columns labelled, and its rows offered to a picker.

`foldkit-crud` does that glue once. What makes it safe to use is what it
leaves alone: the rows and the save state stay in Remote's store, the drafts
stay in the form, and every status a piece reports is derived from them, so it
cannot disagree with them.

## The four pieces

| Piece | Joins | State of its own | Placed as |
| --- | --- | --- | --- |
| **list** | a Remote query and an Entity Selection | none: the pages are Remote's | a value; nothing to place |
| **detail** | an Entity Selection and an id the Model gives | none | a value |
| **editor** | a form, the mutation its value feeds, and their Entity | which id is open, whether it has been filled, which save is its own | a Bundle, like the form it wraps |
| **remover** | a delete mutation, with a yes in between | which id is being asked about, which delete is its own | a Bundle |

Nothing is generated from an Entity alone. An editor exists because you named
a form and a mutation, and a list because you named a query, which your server
authorizes.

## What it owns, and what it does not

| Fact | Owner |
| --- | --- |
| The records, and whether a save or delete is pending, applied or failed | Remote, in its store |
| What a record is: its members, labels and relations | the Entity |
| The drafts, and whether they are valid | the form |
| Which id is open or being asked about, and which request is this screen's | the editor or remover, in its slice of your Model |
| Which rows a list shows: search, sort, filters | your Model, as the query's input |
| What happens after a save or delete: navigate, close, a toast | your application, reading the piece's status |
| How it looks | you, or [`foldkit-mixins-crud`](../mixins-crud/README.md) and [`foldkit-mixins-form`](../mixins-form/README.md) |

## The mental model

```text
your Model says what is on screen
   ──▶ each piece's `active`: what it requires of Remote
   ──▶ Data.wiring ──▶ Remote fetches and retains it

Remote's store ──▶ each piece reads it: a page, a value, a status ──▶ your view

the user acts ──▶ a Message ──▶ a piece's helper, or the editor's onOut
   ──▶ Data.mutate ──▶ Remote settles it ──▶ the status moves
```

The rule to remember: **a piece loads only what its `active` requires, and only
if that `active` is wired.** A piece that is not wired never loads, and nothing
reports it. [Wiring a page](#wiring-a-page) gathers every piece's `active` so
none is left out.

## Install

```sh
pnpm add effect foldkit foldkit-crud foldkit-bundle foldkit-entity foldkit-form foldkit-remote foldkit-surface
```

## A first list

A list is one query and one Selection: the query decides which rows, the
Selection what to show of each.

```ts
const Authors = Crud.list('Authors', {
  query: AuthorsQuery, // Query.make('Authors', { Input: { search }, Result: Query.connection(Blog.Author) })
  selection: Entity.select(Blog.Author, { id: true, name: true }),
  pageSize: 25,
  // How a row reads as a choice, for a list that feeds relation pickers.
  choice: { value: row => row.id, label: row => row.name },
})

const AuthorList = Authors.at({
  data: Data,
  // The query's input as the Model has it; `undefined` while the list is not shown.
  input: model => (model.search === null ? undefined : { search: model.search }),
})

const subscriptions = Data.subscriptions({ authors: AuthorList.active })
```

What each call does:

- **`Crud.list`** is a declaration: no request, no state. `Authors.columns` is
  the selected members in the Selection's order, each with its `key`,
  `member`, a `label` found the way a form finds one (the schema's `title`,
  else `Form.label` metadata, else the key), and a `display`.
- **`Authors.at`** binds it to your Remote domain and your Model. It still does
  no I/O.
- **`AuthorList.active`** is the requirement: while `input` gives a value, the
  page and its rows are fetched and retained. Another input is another
  connection, fetched on its own.
- **`AuthorList.page(model)`** reads Remote's store: a `RemoteData` of the page,
  with `items` typed by the Selection, `hasNext` and `hasPrevious`.
- **`AuthorList.more(model)`** is the Command that loads the next page onto
  this one, or `undefined` when there is none. Return it from `update`.
- **`AuthorList.refresh(model)`** is the Model with the list asked for again. A
  failed read is not retried on its own, so this is what a retry button's
  Message returns.

`AuthorList.row(id)` is a Projection of one row through the list's Selection,
whether or not the query finds it now, and `AuthorList.choiceOf(model, id)` is
that row as a choice once it is read. Relation pickers use both.

## Wiring a page

Every placed piece has an `active`. `Crud.actives` gathers them from the pieces
themselves, so a page cannot forget one:

```ts
Data.wiring(Crud.actives({ posts: Posts, authors: Authors, editor: PostEditor, pickers }))
```

It takes a placed editor, list or detail, and the pickers from `Crud.options`,
and gives `{ posts: Posts.active, ... }`, for `Data.wiring` in a
`foldkit-bundle` assembly, or for `Data.subscriptions`.

## An editor

An editor joins a form, the mutation its value feeds, and the Entity they
share. `EditPostForm` is a `Form.make` result and `EditPostMutation` a Remote
mutation over the same input struct, as in
[`examples/entity`](../../examples/entity); `Blog` is that application's Entity
domain.

```ts
import { Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

// The editor is a Submodel of the page: a Model field and a Message variant.
const Slot = Bundle.declare(Editor.bundle, 'editor')
const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

// Where it lives: its slice of the Model, and the domain it saves through.
const PostEditor = Editor.at({ data: Data, model: App.model.editor })

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
const placements = Page.assemble(Placed)

const update = PostEditor.after(
  placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

const subscriptions = Data.subscriptions({ editor: PostEditor.active })
```

- **`Crud.editor`** checks, in the types, that the form's value is the
  mutation's input. Declaring the input struct once and giving it to both is
  what makes that true.
- **`Editor.bundle`** wraps the form's Bundle. Its Messages are the form's own,
  so a view dispatches `EditPostForm.Message.Changed(...)` exactly as before.
- **`Editor.at`** takes the editor's slice as a `ModelRef` (`App.model.editor`)
  and the bound Remote domain, and returns what needs the parent:
  - `onOut` for the placement: a valid submit becomes `Data.mutate`, and the
    editor remembers the request id.
  - `active`: while an id is open, what the form writes is fetched and
    retained.
  - `after(update)`: wraps `update` so the editor fills the form and
    reconciles its status after every Message. `sync` is that Step on its own,
    for an `update` composed another way.
  - `status(model)`, `saveError(model)` while it is `SaveFailed`,
    `refresh(model)` to ask for the value again while it is `LoadFailed`, and
    `target(model)`, the id being edited (`null` for a new one, or when
    closed).
- The save is a Command that needs `RemoteClient`, so the parent names it with
  `withServices<RemoteClient>()`.

### What starts the work

| Call | What happens |
| --- | --- |
| `Crud.editor(...)` / `Editor.at(...)` | Builds the editor and its integration; no request runs |
| `Placed.helpers.open(id)` | Returns an Update Step; apply it in your `update` to open a record |
| `Data.subscriptions({ editor: PostEditor.active })` | Describes the loader; the runtime installs it and provides `RemoteClient` |
| `PostEditor.after(update)` | Fills the form once the value loads, and reconciles the status after each Message |
| A valid submit, through `onOut` | Returns the mutation Command; its result comes back through Remote |

Include the placement's own Subscriptions as well if your form has any. Do not
read `Submitted` as `Saved`: only the mutation's outcome settles the save.

### Opening it

`open`, `blank` and `close` are helpers of the placement, so they are Update
Steps to use from your own `update`:

```ts
Placed.helpers.open('p2') // edit p2: the form empties, then fills when the value arrives
Placed.helpers.blank() // a new one: nothing to load, editing at once
Placed.helpers.close()
```

One editor serves one form. A create form and an edit form usually differ (the
edit input has an `id`), so they are two editors; `blank` is for the one whose
form creates.

### Its status

| Status | When |
| --- | --- |
| `Closed` | nothing is open |
| `Loading` | an id is open and its current values have not arrived |
| `Editing` | the form is showing, with no save in progress or just settled |
| `Saving` | this editor's mutation is pending |
| `Saved` | it was applied |
| `SaveFailed` | it failed; the drafts are kept, and `saveError(model)` says why |
| `LoadFailed` | reading it failed, with no earlier value to show; `refresh(model)` asks again |
| `NotFound` | it is gone: the server answered without it, a mutation deleted it, or a live event did. This outranks a save that landed |

An edit after a save returns to `Editing`: the last save no longer describes
what is in the form.

### How it treats the form

- **The form is filled once.** When the value is read again, by a refresh or a
  live update, the drafts are left alone, so nothing the user typed is
  overwritten. Opening the same or another id empties the form and fills it
  again.
- **What is loaded is what the form writes**, with each relation as a ref. A
  key the form marks `Entity.unmapped` is not loaded and starts empty.
- **An invalid submit starts no mutation.** The form emits nothing until every
  key passes the input's schema and its checks. The form's Commands are the
  editor's, so a check the form starts runs.

### Drawing it

The editor wraps the form's Model, so it takes the form's view, lifted:

```ts
import { FormView } from 'foldkit-mixins-form'

const Slot = Bundle.declare(
  Editor.bundle.pipe(
    Bundle.withView(Crud.editorView(FormView.submodel(EditPostForm, FormView.define(EditPostForm)))),
  ),
  'editor',
)

// where the page draws it:
Placed.view(model, h, { options: pickers(model), words: { submit: 'Save' } })
```

`Crud.editorView` works on any Submodel view of the form that takes view
inputs; `foldkit-crud` itself stays headless.

## Deleting

A remover is a mutation with a yes in between. Like the editor it is a Bundle,
because which id is being asked about is state.

```ts
const Remover = Crud.remover('PostRemover', {
  mutation: DeletePostMutation,
  input: id => ({ id }), // the mutation's input for an id
})
const RemoveSlot = Bundle.declare(Remover.bundle, 'remover')
// ...spread RemoveSlot.fields and RemoveSlot.cases into the page's Model and Message...

const PostRemover = Remover.at({ data: Data, model: App.model.remover })
const RemoveForm = Page.at(RemoveSlot, { onOut: PostRemover.onOut })
```

- `RemoveForm.helpers.ask(id)` asks; nothing is deleted yet. `dismiss()`
  clears it.
- `Remover.Message.Confirmed()` and `Cancelled()` are the yes and the no. A
  yes with nothing asked does nothing.
- `PostRemover.status(model)` is `Idle`, `Confirming`, `Deleting`, `Deleted`
  or `DeleteFailed`; `target(model)` is the id, for the confirmation's words,
  and `error(model)` says why a delete failed.

The server's mutation says what is gone, with `deleted` in its outcome, and
names no list. Remote then knows the record absent: it leaves every list and
relation it was in with no refetch, a detail of it reads `NotFound`, and an
editor open on it reports `NotFound`.

## Detail

One record through a Selection, for a page that shows it. Like a list it holds
no state.

```ts
const PostDetail = Crud.detail('PostDetail', { selection: PostPage }).at({
  data: Data,
  id: model => model.shownPostId ?? undefined, // `undefined` while none is shown
})

PostDetail.value(model) // RemoteData of the Selection's value
```

`Crud.detail(...).fields` lists the selected members with their labels, as a
list's `columns` does. `PostDetail.active` makes the value a requirement while
an id is shown, and `PostDetail.refresh(model)` asks for it again.

## When something fails

Nothing here retries on its own: a failure stays visible until your
application asks again.

| What happened | What the piece reports | What to do |
| --- | --- | --- |
| A list's page could not be read | `page(model)` is `Failed`, with `previous` rows if it had some | `refresh(model)` from a retry button |
| A detail's value could not be read | `value(model)` is `Failed` | `refresh(model)` |
| An editor's record could not be read | `LoadFailed`; a record read before and failed on refresh stays `Editing`, showing the last good value | `refresh(model)` |
| A save failed | `SaveFailed`; the drafts are kept | show `saveError(model)`; the user submits again |
| A delete failed | `DeleteFailed` | show `error(model)`; ask again |
| The record was deleted, here or elsewhere | a detail reads `NotFound`, an open editor reports `NotFound`, and it leaves every list | close the screen or say so |
| A piece's `active` is not wired | it stays `Initial` or `Loading`, and nothing reports it | wire every piece with [`Crud.actives`](#wiring-a-page) |

## Showing values

### How a column shows

A `Display` is `foldkit-form`'s `Input` from the reading side: how one selected
member shows, described without a renderer.

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
| `Text`, `Number` | a value as it is, or through `format` |
| `Flag` | a boolean, in the words given (`yes` / `no`) |
| `Hidden` | a member read and not shown |
| `Ref` | a relation selected with `true`: its id, or ids |
| `Nested` | a relation read through a Selection: the target's own columns, with `shape` `one`, `many`, or `page` |

A display is resolved from the most to the least explicit source: `Display.of`
metadata on the member, how the relation was selected, then the shape of the
schema. `Display.show` is the text any view can fall back on; a view that wants
a link or a badge reads `display` and the value.
[`foldkit-mixins-crud`](../mixins-crud/README.md) draws a list as a table and a
detail as a description list from exactly this.

There is one primitive, as with a form's controls: a `kind`, whether it is
`shown`, its `data`, and its `text`. The kinds above are made with
`Display.kind`, and so is yours:

```ts
const Badge = Display.kind<{ readonly tone: string }>('Badge', {
  text: (_, value) => String(value), // the floor: what it says when nothing draws it specially
})

const Post = Blog.Post.pipe(Entity.annotateMembers({ status: Display.of(Badge.of({ tone: 'soft' })) }))
```

`Badge.is(display)` narrows `display.data`. A drawn view draws it specially
once given a renderer for `Badge`.

### A relation picker's choices

A form names a relation's target Entity and leaves listing it to you, because a
relationship existing is no licence to read a table. A list is that licence: a
query you declared and your server authorizes. A list with a `choice` offers
its loaded rows as choices, and `Crud.options` hands each picker of a form the
list over its target:

```ts
const pickers = Crud.options(EditPostForm, [AuthorList])

Placed.view(model, h, { options: pickers(model) }) // with foldkit-mixins-form
```

`pickers(model)` is keyed by the form's keys:
`{ authorId: [{ value, label }, …] }`. A list is matched to a picker by
Entity, so one author list serves `authorId` and `editorId` alike. A picker
whose target no list is over, or whose list has no `choice`, throws when
`Crud.options` is called, not when the form is drawn. `AuthorList.choices(model)`
is one list's choices on its own. Both are empty until the page is loaded, and
hold only the rows loaded so far.

#### When a picker searches

```ts
const AuthorList = Authors.at({
  data: Data,
  // What the picker's search box holds is the form's; here it is the query's input.
  input: model => ({ search: EditPostForm.search(model.editor.form, 'authorId') }),
})

const pickers = Crud.options(EditPostForm, [AuthorList], {
  chosen: model => model.editor.form, // the form's Model, wherever the page keeps it
})

const subscriptions = Data.subscriptions({ authors: AuthorList.active, chosen: pickers.active })
```

A search narrows the list, and what the picker already holds may no longer be
in it. With `chosen`, those rows stay among the choices, first, and
`pickers.active` makes them a requirement so Remote reads them and they can be
named. Without it a `select` would show a post's author as blank the moment a
search stopped finding them.

## Sorting a list

How a list is sorted is your state and the query's input. `Sort` writes that
state down once, so the Model, the header clicks and the server agree:

```ts
const PostSort = Sort.make(['title', 'created']) // the orders offered, by name

const PostsQuery = Query.make('Posts', {
  Input: { sort: PostSort.Schema },
  Result: Query.connection(Blog.Post),
})
// Model: `postSort: PostSort.Schema`, starting at `PostSort.none`
// update: `SortedPosts` sets `postSort` to the state the Message carries

PostSort.toggle(model.postSort, 'title') // asc, then desc, then the server's own order
PostSort.inputs(model.postSort, sort => Message.SortedPosts({ sort })) // a drawn table's `sort`
```

`Sort` holds nothing. A name is an order the server offers, never a column; on
the server, `foldkit-remote-drizzle`'s `sortTerms(sort, { title: posts.title })`
says what each name means and ignores any other.

## Typed ids

When the Entity's `id` is branded, the ids here are too. An editor's
`helpers.open(id)` takes the `IdOf` of its form's Entity, and `target(model)`
reads the id being edited as that type. A remover whose mutation's input is
just the id names the key, `id: 'id'`, and is asked about that key's type; with
a fuller input, annotate the function:
`input: (id: PostId) => ({ id, reason: 'spam' })`. A list's rows are its
Selection's own value, so `row.id` is a `PostId` when the Selection reads `id`.

## Limits

- **A list has no sorting, filtering or selection state of its own.** Those are
  the query's input, which your Model holds. Change the input and the list is
  another connection, fetched because it is on screen; `foldkit-remote-drizzle`'s
  `query` reads the input in `where` and `orderBy`.
  [`examples/entity`](../../examples/entity) searches and sorts its post list
  this way.
- **Headless.** Draw a list or a detail with
  [`foldkit-mixins-crud`](../mixins-crud/README.md), or from `columns` and
  `Display.show`. Draw the editor with `Crud.editorView` over a
  [`foldkit-mixins-form`](../mixins-form/README.md) view, or from
  `EditPostForm.controls`.
- **One editor per form.** A create screen and an edit screen are two editors.
