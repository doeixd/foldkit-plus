# foldkit-mixins-crud

Building list tables, loading/empty/error states, retry buttons, detail views, edit cards, and delete confirmations for every resource repeats the same ARIA wiring (`aria-sort`, `aria-busy`, `role="alert"`, keyboard-focusable row actions) across your app.

`foldkit-mixins-crud` turns [`foldkit-crud`](../crud/README.md) lists, details, editors, and removers into accessible HTML views whose every element is a [`foldkit-mixins`](../mixins/README.md) Slot. `foldkit-remote` owns the fetched rows, `foldkit-crud` defines columns and `Display` formatters, your application owns Messages and styles, and `foldkit-mixins-crud` draws the DOM structure without internal state. See CRUD screens running in [the Chirp demo](https://foldkit-chirp-demo.pages.dev/).

## Install

```sh
pnpm add effect foldkit foldkit-crud foldkit-mixins foldkit-mixins-crud foldkit-remote
```

## A first CRUD table

Create a `Crud.list`, bind a `ListView` to your Message union with `ListView.forMessages<Message>().define(list)`, and render a `page` from your view:

```ts
import { Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { ListView } from 'foldkit-mixins-crud'
import { Query, type Page, type RemoteData } from 'foldkit-remote'
import type { Html, HtmlBuilder } from 'foldkit/html'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const PostsQuery = Query.make('Posts', { Input: {}, Result: Query.connection(Post) })
const PostList = Crud.list('Posts', {
  query: PostsQuery,
  selection: Entity.select(Post, { id: true, title: true }),
})
type Message = { readonly _tag: 'OpenedPost'; readonly id: string }

const PostTable = ListView.forMessages<Message>().define(PostList)

const renderTable = (
  page: RemoteData<Page<{ readonly id: string; readonly title: string }>>,
  h: HtmlBuilder<Message>,
): Html =>
  PostTable({ page, onOpen: row => ({ _tag: 'OpenedPost', id: row.id }) }, h)
```

`PostTable` renders a `<table>` with a column header per shown field, formatted cell values using each column's `Display`, an empty/loading status message when no rows exist, and a `<button>` in the first cell of each row that dispatches `OpenedPost` when clicked.

To hide a field (such as `id`) while keeping it available on `row` for `onOpen`, annotate it with `Entity.annotateMembers({ id: Display.of(Display.hidden()) })`.

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Crud, Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Capability, Slot, Slots, type SlotView } from 'foldkit-mixins'
import { ListView } from 'foldkit-mixins-crud'
import { Query, Remote, type Page, type RemoteData } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'

const PostSort = Schema.Literals(['oldest', 'title'])
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, published: Schema.Boolean }),
).pipe(Entity.annotateMembers({ id: Display.of(Display.hidden()) }))
const PostRow = Entity.select(Post, { id: true, title: true, published: true })

const PostsQuery = Query.make('Posts', { Input: {}, Result: Query.connection(Post) })
const Model = Schema.Struct({
  remote: Remote.Model,
  postSort: PostSort,
  shown: Schema.NullOr(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  OpenedPost: { id: Schema.String },
  OpenedPage: { id: Schema.String },
  RetriedPosts: {},
  RetriedPages: {},
  RequestedMorePosts: {},
  SortedPosts: { sort: PostSort },
  ClosedPost: {},
  ConfirmedDelete: {},
  CancelledDelete: {},
})
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Post], queries: [PostsQuery] })

const PostList = Crud.list('Posts', { query: PostsQuery, selection: PostRow })
const Posts = PostList.at({ data: Data, input: () => Option.some({}) })
const PostDetail = Crud.detail('PostDetail', { selection: PostRow })
const Shown = PostDetail.at({ data: Data, id: (model: Model) => Option.fromNullOr(model.shown) })
const PostTable = ListView.forMessages<Message>().define(PostList)

type PageRow = { readonly id: string; readonly label: string }
declare const SitePages: { read: (model: Model) => RemoteData<Page<PageRow>> }

const StatusSlots = Slots.define({ status: Slot.make({ capability: Capability.Container }) })
declare const slots: SlotView.SlotBuilders<typeof StatusSlots, Message>
declare const model: Model
declare const h: HtmlBuilder<Message>
-->

## Render custom rows with `RowListView`

When a list represents navigation items or pickers rather than tabular columns, use `RowListView` to render a `<ul>` / `<li>` list with the same loading, empty, retry, and pagination handling as `ListView`:

```ts
import { RowListView } from 'foldkit-mixins-crud'

const PageList = RowListView.forMessages<Message>().define<PageRow>({ name: 'Pages' })

const pages = (model: Model, h: HtmlBuilder<Message>): Html =>
  PageList(
    {
      page: SitePages.read(model),
      row: (page, h) => [h.span([], [page.label])],
      onOpen: page => Message.OpenedPage({ id: page.id }),
      onRetry: Message.RetriedPages(),
    },
    h,
  )
```

`RowListSlots` exposes `root`, `status`, `list`, `row`, `open`, `more`, and `retry`. Every row element carries `data-row-key` (including in server-rendered HTML) so you can restore focus with ``Dom.focus(`[data-row-key="${CSS.escape(id)}"] button`)``.

## Wire row clicks, pagination, and sorting in `update`

`onOpen`, `onMore`, and column sort headers only dispatch your Messages—rendering never triggers queries on its own. Handle those Messages in `update` to open the placed editor (`open(id)`), advance your query window, or change the sort order.

## Recover from failed reads with `onRetry`

When a read fails, the view renders a `role="alert"` paragraph (keeping stale rows visible below it during a failed refresh). Pass `onRetry` to display a retry button, and return a `Dom.focus` Command in your retry handler so keyboard focus moves to the list when the retry button disappears:

```ts
PostTable({ page: Posts.page(model), onRetry: Message.RetriedPosts() }, h)

const retryPosts = (current: Model) => ({
  model: Posts.refresh(current),
  // Also emit your Dom.focus('#Posts', { makeFocusable: true }) Command here.
})
```

`DetailView` behaves identically, placing its alert and retry button above the description list.

## Reuse loading, empty, and failure status views

Export `Loading`, `Empty`, and `Failure` for standalone status slots outside lists or details:

```ts
import { Empty, Failure, Loading } from 'foldkit-mixins-crud'

Loading.view(slots.status, h, 'Loading…')
Empty.view(slots.status, h, 'Nothing yet.')
Failure.view(slots.status, h, 'The pages could not be read.')
```

`Loading` and `Empty` render `role="status"` (`aria-busy` while loading), and `Failure` renders `role="alert"`. Attaching `Utilities.busyReveal` from `foldkit-mixins/utilities` delays showing loading text so fast responses never flash.

## Add sorting, pagination, and custom cells

```ts
PostTable(
  {
    page: Posts.page(model),
    onOpen: row => Message.OpenedPost({ id: row.id }),
    onMore: Message.RequestedMorePosts(),
    sort: {
      title: {
        direction: model.postSort === 'title' ? 'asc' : undefined,
        message: Message.SortedPosts({ sort: 'title' }),
      },
    },
    cells: {
      published: (row, h) => h.span([h.Class(row.published ? 'live' : 'draft')], ['●']),
    },
    words: { yes: 'Live', no: 'Draft', empty: 'No posts yet.', more: 'Load more', retry: 'Reload' },
  },
  h,
)
```

When using a `foldkit-crud` `Sort`, pass `PostSort.inputs(model.postSort, ...)` for `sort` (see [`foldkit-crud`](../crud/README.md#limits)). Customize every column of a `Display` kind using `renderers` (receiving the `badge` Slot for consistent styling), and customize localized strings via `words` (sharing no keys with form `words`; see [words in one place](../form/README.md#words-as-text-in-one-place)).

## Draw a detail view

```ts
import { DetailView } from 'foldkit-mixins-crud'

const PostLines = DetailView.forMessages<Message>().define(PostDetail)

PostLines({ value: Shown.value(model) }, h)
```

`DetailView` renders a `<dl>` with a `<dt>` and `<dd>` per shown field, supporting `cells` and `words` just like `ListView`.

## Draw an editor, delete confirmation, and toolbar

`EditorView` wraps your edit form with status feedback, `ConfirmView` asks before deleting, and `Toolbar` lays out list controls:

```ts
import { ConfirmView, EditorView, Toolbar } from 'foldkit-mixins-crud'

const PostEditorView = EditorView.forMessages<Message>().define()
const DeletePost = ConfirmView.forMessages<Message>().define()
const PostTools = Toolbar.forMessages<Message>().define()

PostTools({ search: h.input([h.Type('search'), h.AriaLabel('Search titles')]) }, h)
PostEditorView(
  {
    id: 'post-editor',
    status: 'Editing',
    title: 'Edit post',
    form: h.form([], []),
    onClose: Message.ClosedPost(),
  },
  h,
)
DeletePost(
  {
    id: 'delete-post',
    status: 'Confirming',
    name: Option.some('Hello'),
    onConfirm: Message.ConfirmedDelete(),
    onCancel: Message.CancelledDelete(),
  },
  h,
)
```

Each editor status updates the section cleanly while keeping the draft visible on failures:

| Status | Status line | Form shown |
| --- | --- | --- |
| `Closed` | Nothing drawn | — |
| `Loading` | `Loading…` (`aria-busy`) | No |
| `NotFound`, `LoadFailed` | Alert with optional `onRetry` | No |
| `Editing` | None | Yes |
| `Saving`, `Saved` | `Saving…` (`aria-busy`), `Saved.` | Yes |
| `SaveFailed`, `Conflict` | Shown in the form's `failure` Slot | Yes (draft kept) |
| `Moved` | Notice that record changed elsewhere | Yes |

When placing `EditorView` inside a `foldkit-mixins-ui` Dialog or Drawer, answer the dialog's `Closed` OutMessage with `editor.close()` so the editor stops holding the record open. `ConfirmView` renders a `role="group"` asking `Delete {name}?` and disables confirmation while `name` is `None`.

## Style views with theme recipes

`foldkit-mixins-crud/recipes` provides token-backed Styles for `List`, `RowList`, `Editor`, `Confirm`, and `Toolbar`:

```ts
import { Style } from 'foldkit-mixins'
import { ListSlots } from 'foldkit-mixins-crud'
import { List } from 'foldkit-mixins-crud/recipes'

const StyledTable = ListView.forMessages<Message>()
  .define(PostList)
  .pipe(Style.attach(Style.forSlots(ListSlots)(List({}))))
```

Customize recipes with `.extend(...)` (for example, `List.extend({ base: { cell: { padding: '1rem 0.5rem' } } })({})`) rather than forking them.

## Rendered HTML and Slots

| Part | Element | Slot |
| --- | --- | --- |
| Root wrapper | `div` with list name `id` | `root` |
| Status line | `p role="status"` or `role="alert"` | `status` |
| Retry action | `button type="button"` when `onRetry` set | `retry` |
| Table | `table` (`aria-busy` while refreshing) | `table` |
| Table sections | `thead`, `tr`, `tbody` | `head`, `headRow`, `body` |
| Column header | `th scope="col"` with `aria-sort` | `headCell` |
| Sort trigger | `button type="button"` | `sort` |
| Row | `tr` keyed with `data-row-key` | `row` |
| Cell | `td` | `cell` |
| Row open trigger | `button type="button"` in first cell | `open` |
| Load more trigger | `button type="button"` | `more` |

`DetailSlots` publishes `root`, `list` (`dl`), `status`, `term`, `value`, and `retry`. Opening a row uses a real `<button>` rather than a row click handler for keyboard and screen-reader accessibility.

## Limits

- **Fixed layouts:** `ListView` draws a table and `DetailView` draws a description list; render from `list.columns` and `Display.show` directly for card grids or grouped headers.
- **Nested values:** Nested relations in a Selection render as joined text; format them with `cells`.
- **No row selection or inline cell editing:** Use `foldkit-data-grid` when you need grid selection or inline editing.
- **Cursor pagination:** Remote pages are cursor-based, so `onMore` appends rows rather than jumping to numbered pages.

## Next

- Declare lists, details, editors, and removers: [`foldkit-crud`](../crud/README.md#list-detail-editor-and-remover)
- Render and style edit forms inside `EditorView`: [`foldkit-mixins-form`](../mixins-form/README.md)
- Style Slots with Mixins recipes and Behaviors: [`foldkit-mixins`](../mixins/README.md)
