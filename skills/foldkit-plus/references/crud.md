# foldkit-crud

Management screens assembled from parts the application already has. An
**editor** joins a `foldkit-form` form, the Remote mutation its value feeds, and
the Entity they share: it loads what the form writes, fills the form, turns a
valid submit into the mutation, and reports how it went. A **list** joins a
Remote query and an Entity Selection; a **detail** reads one Entity through a
Selection; a **remover** deletes through a mutation with a yes in between. All
are headless.

Nothing is generated from an Entity alone: no form and mutation, no editor.

## Ownership

| Fact | Owner |
| --- | --- |
| Drafts and their validity | the form |
| Current values; whether a save is pending, applied, failed | Remote's store |
| What to load, how a loaded value becomes input values | the form's input (`Entity.selectFor` / `valuesFor`) |
| Which id is open, whether it was shown, which save is this editor's | the editor's slice of the parent Model |
| What happens after a save | the application, reading `status` |

`status` is derived from those, never stored.

## Minimal example

`EditPostForm` is a `Form.make` result; `EditPostMutation` is a Remote mutation
over the same input struct (see [form.md](form.md), [remote.md](remote.md)).

```ts
import { Crud } from 'foldkit-crud'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Editor = Crud.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

const Slot = Bundle.declare(Editor.bundle, 'editor')
const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

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

## Common tasks

- **Open it** from your own `update`: `Placed.helpers.open(id)` (edit: empties the
  form, fills it when the value arrives), `.blank()` (create: nothing to load),
  `.close()`.
- **Dispatch form Messages** as before: the editor's Messages are the form's own
  (`EditPostForm.Message.Changed(...)` wrapped in `Message.GotEditorMessage`).
- **Read state:** `PostEditor.status(model)` is `Closed`, `Loading`, `NotFound`,
  `LoadFailed`, `Editing`, `Saving`, `Saved`, or `SaveFailed`;
  `PostEditor.saveError(model)` is why a save failed, `PostEditor.refresh(model)`
  retries a `LoadFailed` read, and
  `PostEditor.target(model)` the id being edited (`null` for a new one). The form's Model is
  `model.editor.form`.
- **Draw it:** give the editor's Bundle the form's view, lifted:
  `Editor.bundle.pipe(Bundle.withView(Crud.editorView(FormView.submodel(EditPostForm, view))))`,
  then `Placed.view(model, h, { options: pickers(model) })`. Or draw from
  `EditPostForm.controls`.
- **Compose `update` yourself:** `PostEditor.sync` is the Step `after` runs.

## Lists

One query and one Selection. The pages live in Remote, so a list holds no state
and is not a Bundle.

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

- `Authors.columns`: the selected members in order, each with `key`, `member`,
  and a `label` (schema `title`, else `Form.label`, else the key).
- `AuthorList.page(model)`: `RemoteData<Page<Row>>`, rows typed by the Selection.
- `AuthorList.more(model)`: the Command for the next page, or `undefined`.
- `AuthorList.refresh(model)` (and a placed detail's `refresh`): the Model with
  it asked for again. Failed reads are not retried automatically; this is the
  retry.
- `Crud.options(EditPostForm, [AuthorList])(model)`: every relation picker of
  the form fed by the list over its target, keyed by the form's keys, for
  `foldkit-mixins-form`'s `options`. Needs `choice` on the list. A picker with no
  list over its target throws when `Crud.options` is called. Empty until loaded;
  only the rows loaded so far. `AuthorList.choices(model)` is one list's.
- Sorting and filtering are the query's input, which your Model holds.

## Deleting and detail

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

- `RemoveForm.helpers.ask(id)` asks; `Remover.Message.Confirmed()` / `Cancelled()`
  answer; `dismiss()` clears. `PostRemover.status(model)` is `Idle`, `Confirming`,
  `Deleting`, `Deleted`, or `DeleteFailed`; `target(model)`, `error(model)`.
- The server's mutation returns `deleted: [{ entity, id }]` and names no list.
  Remote drops the entity from every list and relation, and an open editor or a
  detail of it reads `NotFound`.
- `Crud.detail(name, { selection }).at({ data, id: model => ... })` gives `value(model)`
  (a `RemoteData`), `active`, and `fields` (labelled like a list's `columns`). No state.

## Display, and drawing a list

Each column (`list.columns`, `detail.fields`) has a `display`, one primitive
`{ kind, shown, data, text }`. The shipped kinds are `Text`, `Number`, `Flag`,
`Hidden`, `Ref`, and `Nested`; make your own with `Display.kind('Badge', { text })`,
narrow with `Badge.is(display)`, and draw it everywhere with
`renderers: { Badge: ctx => ... }` in `foldkit-mixins-crud`. `Nested` is a relation
read through a Selection, with the target's columns. Set one with `Entity.annotateMembers({ id: Display.of(Display.hidden()) })`;
`Display.show(display, value, words?)` is the cell's text.

`foldkit-mixins-crud` draws them through Mixins slots. A list holds no state, so
every click is a Message you pass in:

```ts
import { DetailView, ListView } from 'foldkit-mixins-crud'

const PostTable = ListView.forMessages<Message>().define(PostList) // the list, not the placed one
PostTable(
  {
    page: Posts.page(model),
    onOpen: row => Message.OpenedPost({ id: row.id }),
    onMore: Message.RequestedMorePosts(),
    onRetry: Message.RetriedPosts(), // update: { model: Posts.refresh(model) }
    sort: { title: { direction: 'asc', message: Message.SortedPosts({ sort: 'title-desc' }) } },
    cells: { published: (row, h) => h.span([], [row.published ? '●' : '○']) },
    words: { yes: 'Live', no: 'Draft', empty: 'No posts yet.' },
  },
  h,
)

DetailView.forMessages<Message>().define(PostDetail)({ value: Shown.value(model) }, h)
```

Slots: `ListSlots` (`root`, `status`, `table`, `headCell`, `sort`, `row`, `cell`,
`open`, `more`, `retry`) and `DetailSlots` (`root`, a `div` in every state;
`list`, the `dl`; `status`, `term`, `value`, `retry`). A failed read shows a `role="alert"` line; a failed refresh keeps the
rows (or the detail's value) below it, and `onRetry` adds a button. The button
goes once the refresh starts, so the retry's `update` branch should return a
`Dom.focus('#Posts', { makeFocusable: true })` Command to keep keyboard focus.

## Pickers that search

```ts
const AuthorList = Authors.at({
  data: Data,
  input: model => ({ search: EditPostForm.search(model.editor.form, 'authorId') }),
})
const pickers = Crud.options(EditPostForm, [AuthorList], { chosen: model => model.editor.form })
Data.subscriptions({ authors: AuthorList.active, chosen: pickers.active })
```

`chosen` keeps what a picker holds among its choices when the search no longer
finds it, and `pickers.active` has Remote read those rows so they can be named.
A placed list also gives `row(id)` (a Projection of one row through the list's
Selection), `choiceOf(model, id)` (that row as a choice once read), and `owner`.

## Gotchas

- **Wire every piece's `active`**, or it never loads: `Data.wiring(Crud.actives({ posts: Posts, editor: PostEditor, pickers }))`
  gathers them from placed editors, lists, details, and `Crud.options` pickers.

- **Sort state written once:** `const PostSort = Sort.make(['title', 'created'])`
  gives `PostSort.Schema` (Model field and query input), `none`, `toggle(current, column)`,
  and `inputs(current, sort => Message.Sorted({ sort }))` for `ListView`'s `sort`.
  Server: `orderBy: ({ sort }) => sortTerms(sort, { title: posts.title })` from
  `foldkit-remote-drizzle`.
- **Sorting and filtering a list** are the query's input: keep them in your Model,
  return them from `.at({ input })`, and read them in the server query's `where`
  and `orderBy` (both may be functions of the input in `foldkit-remote-drizzle`).

- With a branded Entity `id`: `helpers.open(id)` and the placed editor's
  `target(model)` use `IdOf<Entity>`; give a remover `id: 'id'` when its
  input is just the id (else `input: (id: PostId) => ({ ... })`), so `ask(id)` and
  `target(model)` are typed; list rows are the Selection's value.

- `Editor.at` needs the slice as a `ModelRef` (`App.model.editor`), so the Model
  must be the application's (`Surface.application`).
- Name the service: `Bundle.parent(...).withServices<RemoteClient>()`, or `onOut`
  does not type-check.
- Register `PostEditor.active` with `Data.subscriptions`, or nothing is fetched.
- Use `after` (or run `sync`), or the form never fills.
- The form fills once per `open`. A later refresh does not overwrite drafts.
- A form and a mutation with different inputs is a type error at `Crud.editor`.
- One editor serves one form; create and edit are usually two editors.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/crud/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-crud/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/entity
