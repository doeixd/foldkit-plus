# `foldkit-primitives/state`

Application state with nowhere else to live: the current page, the undo stack,
the locale, a selection, a virtualized list's window. These bundles own the
frame, not the contents; loading the rows stays the application's job.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/state))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Pagination` | bundle | `{ page, perPage, total }` | `GoToPage`, `NextPage`, `PrevPage`, `SetPerPage`, `SetTotal` | `{ perPage, total? }` |
| `history({ name, value, capacity? })` | bundle factory | `{ past, present, future, group }` | `Push { value, group? }`, `Undo`, `Redo`, `GoTo { step }`, `Clear` | `{ initial }` |
| `History.*` | functions | the same steps, pure | | |
| `Locale` | bundle | `{ locale }` | `SetLocale` | `{ default }` |
| `SelectionSet` | bundle | `{ selected }` | `Select`, `Deselect`, `Toggle`, `ReplaceAll`, `Clear` | none |
| `Virtual` | bundle | scroll, heights, layout | `Scrolled`, `Measured`, `Prune`, `Settled` | layout args |
| `Viewport`, `MeasureRow({ key })` | Mounts | | `ViewportScrolled`, `RowMeasured` | |
| `range(start, end, step?)` | function | | | |
| `windowFor`, `isAtEnd`, `distanceToEnd`, `offsetFor`, `stickyHeader`, `masonry` | functions | | | |

Persisted state lives one package over: `Mirror.kv` keeps a slice in Effect's
`KeyValueStore` across reloads. Nothing here duplicates it.

## Start with one: a page

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Pagination, PaginationMessage, pageCount, range } from 'foldkit-primitives/state'

const Page = Bundle.compose({}).pipe(
  Bundle.withChild('paging', Pagination, { args: { perPage: 20 } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.nav(
      [],
      range(1, (pageCount(model.paging) ?? 0) + 1).map(page =>
        h.button(
          [h.OnClick(Page.Message.GotPagingMessage({ message: PaginationMessage.GoToPage({ page }) }))],
          [String(page)],
        ),
      ),
    ),
  subscriptions: placements.subscriptions(),
})
```

`total` is `null` until the application learns it and sends `SetTotal`;
`pageCount` is `null` until then, and `offset(model)` is the first item's index
for a slice or a query. Every transition clamps: past the last page lands on
it, below one lands on one, and a smaller total pulls the page back.
`SetPerPage` ignores a non-positive size and `SetTotal` a negative total.

## `history`: undo and redo over any value

```ts
import { history } from 'foldkit-primitives/state'

const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })

const Editor = Bundle.compose({}).pipe(
  Bundle.withChild('doc', EditHistory, { args: { initial: '' } }),
)
```

The Model holds `{ past, present, future, group }`. `Push` records a value and
drops the redo future (an already empty future is kept as it was, so a view
reading it is not redrawn per push); `Undo` and `Redo` move one step; `GoTo { step }`
jumps to any kept value, counted from the oldest (0), so the present is at
`past.length`; `Clear` empties both sides and keeps the present. The past holds
at most `capacity` entries (default 100); a negative or fractional capacity
throws at the factory. The factory attaches the Message union, so a placement
dispatches `EditHistory.Message.Push({ value })`. `canUndo` and `canRedo` read
the edges.

A `Push` may name a `group`: consecutive pushes of the same group are one
step, so typing a word, or dragging a brush, undoes as a whole, with no clock.

The steps are also pure functions, `History.start`, `push`, `undo`, `redo`,
`goTo`, and `clear`, for a parent that records an edit in the same transition
that makes it. Two more exist only as functions: `History.close(model)` ends
the current group, so the same group pushed again is a step of its own, and
`History.revert(model, group)` takes back the step `group` is making with
nothing left to redo, which is what a cancelled edit leaves.
[`examples/foldkit/pixel-art`](../../../examples/foldkit/pixel-art) keeps its
grid this way, one group per stroke.

## `Locale` and `SelectionSet`

`Locale` keeps one string, read from `navigator.language` at init with the
configured `default` as fallback; `SetLocale` switches it. It does not follow
later changes.

`SelectionSet` keeps string ids in first-selection order: `Select` keeps an
existing id's position, `Deselect` removes, `Toggle` re-appends, `ReplaceAll`
replaces (deduplicated), `Clear` empties. `isSelected(model, id)` reads
membership. It stores ids only; it neither loads rows nor persists. For a
selection a view's slots must reflect, with `aria-selected` and Shift ranges,
see `Selection` in [`interaction`](../interaction/README.md).

## `Virtual`: a windowed list

`Virtual` owns a virtualized list's scroll position, measured heights, and
layout: Model `{ scrollTop, heights, scrolling, generation, estimatedHeight,
overscan, gap, paddingStart, paddingEnd }`, Messages `Scrolled`, `Measured`,
`Prune`, `Settled`, args for the layout plus optional `initialScrollTop` and
`initialHeights` restores (sanitized like live measurements) and a `settleMs`
silence (default 150). Every scroll marks `scrolling` until the silence settles;
suspend loaders and parallax on it.

Two Mounts feed it: `Viewport` reports the container's own scrolls and
`MeasureRow({ key })` a row's height. Four functions read it:

- `windowFor(model, keys, viewportHeight)` answers which rows to render and
  the spacer height;
- `isAtEnd(model, keys, viewportHeight, threshold)` is the infinite-scroll
  check (an empty list counts as ended), and `distanceToEnd` the pixels left,
  for a prefetch threshold;
- `offsetFor` computes a scroll target the application actuates itself.

They share one table of row offsets, built once per `keys` array and `heights`
record and then searched, so keep the keys array between renders (derive it
where the list changes, not in the view) and a scroll costs O(log n) rather
than a pass over every row. Both are compared by identity: never change a keys
array in place. `Prune` drops heights for departed keys, since the bundle never
sees key order. Poisoned positions and heights are ignored, never stored.

For a window-scrolled list, map the scroll entry into `Scrolled`; for
follow-bottom, hold the end while `isAtEnd` and scroll on extend; to anchor a
prepend, re-`Scrolled` by the totals' delta. Render each row keyed, with
`aria-rowcount` and `posinset` from the window, so per-row placements keep
identity.

`stickyHeader(sections, start)` answers which section header sticks; CSS
`position: sticky` does the sticking. `masonry(keys, heights, options)` packs
fixed-width columns shortest-first into `{ placements, totalHeight }`: layout
only, every placed item renders, so it fits hundreds of images rather than
hundreds of thousands. The sums never name an axis: pass column widths as
heights and a horizontal offset as the scroll position to window a carousel
the same way. Windowed grids and per-index estimates stay out by design.

## `range`

`range(start, end, step?)` counts half-open numbers; the page list above is
`range(1, (pageCount(model) ?? 0) + 1)`. A zero or non-finite step throws,
naming it.

## Failure

Clamping absorbs an out-of-range page or total; a negative total and a
non-finite size are ignored or rejected at the boundary. A bad history
capacity or range step throws where it is written.
