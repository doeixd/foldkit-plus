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

```ts
PostTable({ page: Posts.page(model), onRetry: Message.RetriedPosts() }, h)

// in update
case 'RetriedPosts':
  return { model: Posts.refresh(model) }
```

`DetailView` does the same with its value: the alert and the button above the
description list, which stays the view's root element.

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

- `sort: PostSort.inputs(model.postSort, sort => Message.SortedPosts({ sort }))`
  is the whole `sort` input when the state is a `foldkit-crud` `Sort`.
- **Sorting is state the application holds**, as the query's input (see
  [`foldkit-crud`](../crud/README.md#limits)). `sort` names the columns that sort,
  how each is sorted now, and the Message a click sends. The header becomes a
  button and the column carries `aria-sort`.
- `cells` draws one column specially, and gets the whole row, so a link can use
  the id. `renderers` draws every column of a Display **kind**, a shipped one or
  your own, in any list or detail:
  `renderers: { Badge: ({ display, value, h }) => h.span([...], [String(value)]) }`.
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

## What is drawn

| Part | Element | Slot |
| --- | --- | --- |
| The list | `div` with the list's name as its `id` | `root` |
| Loading, failed, or empty | `p role="status"`, or `role="alert"` for a failure | `status` |
| Asking again after a failure | `button type="button"`, when `onRetry` is given | `retry` |
| The rows | `table`, `aria-busy` while refreshing | `table` |
| A column header | `th scope="col"`, with `aria-sort` when it sorts | `headCell` |
| A header that sorts | `button type="button"` | `sort` |
| A row | `tr`, keyed by `rowKey`, else the row's `id`, else its position | `row` |
| A cell | `td` | `cell` |
| The way into a row | `button type="button"` in the first shown cell | `open` |
| The next page | `button type="button"`, disabled while refreshing | `more` |

`DetailSlots` publishes `root` (the `dl`, or the `div` around a status line),
`status`, `term`, and `value`.

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
