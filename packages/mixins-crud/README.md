# foldkit-mixins-crud

Draws a [`foldkit-crud`](../crud/README.md) list as an accessible table and a
detail as a description list, with every element published as a
[`foldkit-mixins`](../mixins/README.md) Slot. The list decides which rows and
columns there are; each column's `Display` decides what a cell says; this package
decides which elements show it; your Style and Behavior attachments decide how
it looks.

## What it owns

| Fact | Owner |
| --- | --- |
| The rows, the pages, whether they are loading | `foldkit-remote`, read through `Crud.list(...).at` |
| The columns, their labels, and each one's `Display` | `foldkit-crud` |
| Which element draws them, and the accessibility wiring | `foldkit-mixins-crud` |
| What opening a row, sorting, and "more" mean | the application, as Messages it passes in |
| Classes, inline style, extra attributes and events | your `Style` / `Behavior` attachments |

It holds no state and defines no Messages. A list is not a Bundle, so there is
nothing for a click to be sent to but your own `update`: every button here sends
a Message you gave it.

## Mental model

```text
Crud.list('Posts', { query, selection })        columns + Displays (no view)
      |
ListView.forMessages<Message>().define(list)    a SlotView over ListSlots
      |   .pipe(Style.attach(...))
Table({ page, onOpen, onMore, sort, words }, h) one call in your view
```

The view is given the page each time it draws, the same value
`PostList.page(model)` returns. It never reads Remote itself.

## Install

```sh
pnpm add effect foldkit foldkit-crud foldkit-mixins foldkit-mixins-crud foldkit-remote
```

## Example

This is a view integration fragment. Define `PostList` and bind `Posts` with
[Crud's list API](../crud/README.md#lists) first; the parent Model and Message
union must include its loading and `OpenedPost` paths. Import `Html` and
`HtmlBuilder` from `foldkit/html` for the view signature.

```ts
import { ListView } from 'foldkit-mixins-crud'

const PostTable = ListView.forMessages<Message>().define(PostList)

const table = (model: Model, h: HtmlBuilder<Message>): Html =>
  PostTable(
    {
      page: Posts.page(model), // Posts = PostList.at({ data, input })
      onOpen: row => Message.OpenedPost({ id: row.id }),
    },
    h,
  )
```

That is a whole table: a header per shown column with its label, a row per item,
each cell saying what its `Display` calls for, a status line while there are no
rows, and the first cell of each row a button that sends `OpenedPost`.

- `forMessages<Message>()` names the Messages the buttons send, as
  `SlotView.forMessages` does. `define` takes the list itself, not the placed
  one, and types `row` from the list's Selection.
- A column whose `Display` is `Hidden` is read and not drawn. Hide the id with
  `Entity.annotateMembers({ id: Display.of(Display.hidden()) })` and `row.id` is
  still there for `onOpen`.

## Rows instead of a table

When a list is a navigation or a picker of whole rows, a table is the wrong
markup. `RowListView` carries the same state contract over `ul`/`li`: you draw
each row's content, and `onOpen` makes the whole row a button.

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

`define<Row>({ name })` names the view and the row type. Its Slots are
`RowListSlots`: `root`, `status`, `list` (the `ul`), `row` (an `li`), `open`,
`more`, `retry`. Loading, empty, a failed read with its retry, and a failed
refresh kept above its rows are handled exactly as for `ListView` — one
implementation, so the two cannot drift.

## Follow a row click

The table reads the `page` value you pass it. `onOpen` constructs `OpenedPost`;
it does not open an editor by itself. Handle that Message in the parent update,
for example by applying the placed editor's `open(id)` Step. Loading and saves
then follow the editor's Remote integration.

Similarly, `onMore` and a sort header only send your Messages. Your update must
change the query window or ordering. Rendering the table alone never starts a
query. This lets the same view render a test page or a live Remote page.

## When the read fails

A failed read is said in a `role="alert"` paragraph. If the list already had
rows (a refresh that failed), they stay on screen below it, because they are
still the best answer there is. Remote does not retry a failed read on its own,
so give `onRetry` a Message and the view adds a button that sends it:

```ts sketch
PostTable({ page: Posts.page(model), onRetry: Message.RetriedPosts() }, h)

// in update
case 'RetriedPosts':
  return { model: Posts.refresh(model) }
```

`DetailView` does the same with its value: the alert and the button above the
description list, inside the same root.

The button leaves the page once the refresh starts, and with it the keyboard
focus. The view cannot move focus itself: focus caused by a Message belongs to
that Message. Return a `Dom.focus` Command from the retry's branch, which runs
after the next render, and focus lands on the list instead of the page:

```ts sketch
case 'RetriedPosts':
  return { model: Posts.refresh(model), commands: [FocusPosts()] }

// FocusPosts: Command.define('FocusPosts', { messages: [CompletedFocusPosts],
//   execute: Dom.focus('#Posts', { makeFocusable: true }).pipe(
//     Effect.ignore, Effect.as(CompletedFocusPosts())) })
```

`examples/entity` does exactly this, and its page test checks where focus lands.

## Loading, empty, and failure elsewhere

The list's and the detail's status lines are three exported views over any
status slot, for reads that are not a list or a detail:

```ts
import { Empty, Failure, Loading } from 'foldkit-mixins-crud'

Loading.view(slots.status, h, 'Loading…')
Empty.view(slots.status, h, 'Nothing yet.')
Failure.view(slots.status, h, 'The pages could not be read.')
```

The words are the caller's; the `role` and `aria-busy` are the views':
`role="status"` with `aria-busy` while loading, `role="status"` when empty,
`role="alert"` when failed. Attach `Loading.shown` to the status slot and busy
text appears only once the wait is noticeable: the paragraph always renders,
so its space is held, and answering in time removes `aria-busy` before the
delay ends, so a quick answer never flashes.

## Sorting, more, and special cells

```ts
PostTable(
  {
    page: Posts.page(model),
    onOpen: row => Message.OpenedPost({ id: row.id }),
    onMore: Message.RequestedMorePosts(), // shown while the page has a next one
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

- `sort: PostSort.inputs(model.postSort, (_, column) => Message.SortedPosts({ column }))`
  is the whole `sort` input when the state is a `foldkit-crud` `Sort`.
- **Sorting is state the application holds**, as the query's input (see
  [`foldkit-crud`](../crud/README.md#limits)). `sort` names the columns that sort,
  how each is sorted now, and the Message a click sends. The header becomes a
  button and the column carries `aria-sort`.
- `cells` draws one column specially, and gets the whole row, so a link can use
  the id. `renderers` draws every column of a Display **kind**, a shipped one or
  your own, in any list or detail:
  `renderers: { Badge: ({ value, h, badge }) => h.span(badge.attrs(), [String(value)]) }`.
  `badge` is the list's (or detail's) `badge` Slot, so what a renderer draws is
  styled like any other part.
  A column's `cells` entry wins over its kind's renderer, and a kind with neither
  says `Display.show`.
- `words` is text, with `{message}` a blank in `failed`; it shares no key with a
  form's words, so [one object](../form/README.md#words-as-text-in-one-place)
  serves both.
- `words` supplies every word the view says itself, and the words `Display.show`
  uses (`yes`, `no`, `nothing`, `separator`), for wording and for translation.

## A detail

```ts
import { DetailView } from 'foldkit-mixins-crud'

const PostLines = DetailView.forMessages<Message>().define(PostDetail)

PostLines({ value: Shown.value(model) }, h) // Shown = PostDetail.at({ data, id })
```

A `dl` with a `dt` per shown field and its value in a `dd`. It takes `cells` and
`words` as a list does.

## An editor, a delete, and a toolbar

`EditorView` draws what an editor says around its form in each of its states;
`ConfirmView` asks before a delete; `Toolbar` lays out a list's controls. Each is
given its state and Messages and owns neither: saving is `Crud.editor`'s,
deleting `Crud.remover`'s, closing the application's.

```ts
import { ConfirmView, EditorView, Toolbar } from 'foldkit-mixins-crud'

const PostEditorView = EditorView.forMessages<Message>().define()
const DeletePost = ConfirmView.forMessages<Message>().define()
const PostTools = Toolbar.forMessages<Message>().define()

// The names are examples/entity's: its editor, remover, form and Messages.
PostEditorView(
  {
    id: 'post-editor',
    status: PostEditor.status(model),
    title: 'Edit post',
    form: EditForm.view(model, h, { options: pickers(model) }),
    error: PostEditor.saveError(model)?.message,
    onClose: Message.ClosedPost(),
  },
  h,
)
DeletePost(
  {
    id: 'delete-post',
    status: PostRemover.status(model),
    name: Option.fromNullishOr(PostRemover.target(model)),
    onConfirm: Message.GotRemovePostMessage({ message: RemoverMessage.Confirmed() }),
    onCancel: Message.GotRemovePostMessage({ message: RemoverMessage.Cancelled() }),
    error: PostRemover.error(model)?.message,
  },
  h,
)
PostTools({ search: h.input([h.Type('search'), h.AriaLabel('Search titles')]) }, h)
```

Each editor state draws its own line, and the form stays while there is
something to edit:

| Status | Says | Form |
| --- | --- | --- |
| `Closed` | nothing is drawn | — |
| `Loading` | `Loading…`, busy | no |
| `NotFound`, `LoadFailed` | a status; a failed read as an alert, with `onRetry`'s button | no |
| `Editing` | nothing | yes |
| `Saving`, `Saved` | `Saving…` (busy), `Saved.` | yes |
| `SaveFailed`, `Conflict` | an alert: the error, or that someone saved first | yes: a failed save keeps the draft |
| `Moved` | that someone else has saved since | yes |

The root is a `section` named by its title (`h2`), with the status in
`data-status`. `ConfirmView` asks `Delete {name}?` in a `role="group"`, and its
confirm button is disabled while `name` is none: a delete is confirmed only for a
thing a person can name. A failed delete asks again, with why it failed.

To draw the editor in a dialog or a drawer, draw it inside the Dialog or Drawer
your application places (`foldkit-mixins-ui`): focus going in on open, staying in
while it is open, and back to the button that opened it is that component's.
Escape and the backdrop close the Dialog by itself: answer its `Closed`
OutMessage with the editor's close (`Placed.helpers.close()`), as `onClose`
does for the Close button, or the dialog hides while the editor stays open and
its row stays required. Every word is the view's `words`, text with
blanks (`saveFailed: 'Not saved: {message}'`, `question: 'Delete {name}?'`).

## A look for each view

The views draw unstyled Slots. `foldkit-mixins-crud/recipes` gives each a look over
the theme's tokens, as `foldkit-mixins-ui`'s `Recipes` do for its components:

```ts
import { Style } from 'foldkit-mixins'
import { ConfirmSlots, EditorSlots, ListSlots, ListView } from 'foldkit-mixins-crud'
import { Confirm, Editor, List } from 'foldkit-mixins-crud/recipes'

const PostTable = ListView.forMessages<Message>()
  .define(PostList)
  .pipe(Style.attach(Style.forSlots(ListSlots)(List({}))))
```

- `List({ open })` is a quiet table: small headings over rows divided by a line,
  each lit under the pointer. `open: 'row'` (the default) stretches the way into a
  row across it, so a press anywhere on the row opens it; `open: 'link'` keeps it to
  the title, drawn as a link, for rows with controls of their own. Nothing to list
  says so in a dashed box; a wait says so only once it is noticeable.
- `RowList({})` is `RowListView`'s rows as lines divided by a rule, each a finger's
  height, its parts side by side; a row the list opens is a button across it. It
  says what `List` says in place of its rows.
- `Editor({})` is a card: the title, what the editor says (a failure in the error's
  ink), the form, and the actions.
- `Confirm({})` asks, with the yes in the error's fill.
- `Toolbar({})` lays the controls in a row that wraps, the search widest.

Adjust one with `.extend`, never a fork: `List.extend({ base: { cell: { padding:
'1rem 0.5rem' } } })({})`, as the CMS example does for roomier rows.

## What is drawn

| Part | Element | Slot |
| --- | --- | --- |
| The list | `div` with the list's name as its `id` | `root` |
| Loading, failed, or empty | `p role="status"`, `aria-busy` while loading, or `role="alert"` for a failure | `status` |
| Asking again after a failure | `button type="button"`, when `onRetry` is given | `retry` |
| The rows | `table`, `aria-busy` while refreshing | `table` |
| The header and the body | `thead`, its `tr`, and `tbody` | `head`, `headRow`, `body` |
| A column header | `th scope="col"`, with `aria-sort` when it sorts | `headCell` |
| A header that sorts | `button type="button"` | `sort` |
| A row | `tr`, keyed by `rowKey`, else the row's `id`, else its position | `row` |
| A cell | `td` | `cell` |
| The way into a row | `button type="button"` in the first shown cell | `open` |
| The next page | `button type="button"`, disabled while refreshing | `more` |

`DetailSlots` publishes `root` (the `div` around everything the detail says,
in every state, as a list's root is), `list` (the `dl`, `aria-busy` while
refreshing), `status`, `term`, `value`, and `retry`.

The way into a row is a button, not a click on the `tr`, so a keyboard reaches
it and a screen reader announces it.

## Limits

- One layout each: a table, and a description list. For cards, or a table with
  grouped headers, draw from `list.columns` and `Display.show` yourself; this
  package is the default, not the only way.
- A nested value (a relation read through a Selection) is shown as text, its
  members joined. Draw it specially with `cells`.
- No selection of rows, and no inline editing.
- No pager with page numbers: Remote's pages are cursors, and `more` appends.
