# `foldkit-primitives/state`

Application state with nowhere else to live: the current page, the undo stack,
the locale, a selection, a virtualized list's window. These bundles own the
frame, not the contents; loading the rows stays the application's job.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/state))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Pagination` | bundle | `{ page, perPage, total }` | `GoToPage`, `NextPage`, `PrevPage`, `SetPerPage`, `SetTotal` | `{ perPage, total? }` |
| `history({ name, value, capacity?, within?, equals? })` | bundle factory | `{ past, present, future, group, groupedAt }` | `Push { value, group?, at? }`, `Undo`, `Redo`, `GoTo { step }`, `Clear` | `{ initial }` |
| `History.*` | functions | the same steps, pure | | |
| `Box.moveBy`, `moveEach`, `resize`, `moveKey`, `resizeKey` | functions | `Box { x, y, width, height }` | | |
| `Locale` | bundle | `{ locale }` | `SetLocale` | `{ default }` |
| `SelectionSet` | bundle | `{ selected }` | `Select`, `Deselect`, `Toggle`, `ReplaceAll`, `Clear` | none |
| `Virtual` | bundle | scroll, heights, layout | `Scrolled`, `Measured`, `Prune`, `Settled` | layout args |
| `Viewport`, `WindowViewport`, `MeasureRow({ key })`, `MeasureRows({ attribute })` | Mounts | | `ViewportScrolled`, `ViewportPlaced`, `RowMeasured`, `RowsMeasured` | |
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

The Model holds `{ past, present, future, group, groupedAt }`. `Push` records a value and
drops the redo future (an already empty future is kept as it was, so a view
reading it is not redrawn per push); `Undo` and `Redo` move one step; `GoTo { step }`
jumps to any kept value, counted from the oldest (0), so the present is at
`past.length`; `Clear` empties both sides and keeps the present. The past holds
at most `capacity` entries (default 100); a negative or fractional capacity
throws at the factory. The factory attaches the Message union, so a placement
dispatches `EditHistory.Message.Push({ value })`. `canUndo` and `canRedo` read
the edges.

A `Push` may name a `group`: consecutive pushes of the same group are one
step, so typing a word, or dragging a brush, undoes as a whole. The Model reads
no clock: a `Push` that carries `at` (milliseconds, from the Command or event
that made the edit) and a factory `within` end the step at a pause, so typing
that stops for longer than `within` starts a new one, and steady typing never
splits. Without `equals`, a push of an unchanged value is recorded; give the
factory (or `History.push`) an `equals` and a value equal to the present
records nothing and returns the Model it was given.

History does not name a step. A value that carries its own label and source is
how a menu reads "Undo rename" from `present` (the step an undo takes back) and
"Redo paste" from `future[0]`, and who made the edit with it:

```ts
import { Option } from 'effect'
import { History, type HistoryModel } from 'foldkit-primitives/state'

type Step = { readonly text: string; readonly label: string; readonly source: 'reader' | 'agent' }

const edit = (model: HistoryModel<Step>, step: Step) =>
  History.push(model, step, { capacity: 50 })

const renamed = edit(History.start({ text: 'a', label: 'start', source: 'reader' }), {
  text: 'b',
  label: 'rename',
  source: 'agent',
})
const undoLabel = `Undo ${renamed.present.label}`
const redoLabel = Option.fromNullishOr(History.undo(renamed).future[0]?.label)
```

The steps are also pure functions, `History.start`, `push`, `undo`, `redo`,
`goTo`, and `clear`, for a parent that records an edit in the same transition
that makes it. Two more exist only as functions: `History.close(model)` ends
the current group, so the same group pushed again is a step of its own, and
`History.revert(model, group)` takes back the step `group` is making with
nothing left to redo, which is what a cancelled edit leaves, and
`History.map(model, change)` rewrites every kept value without adding a step
(a status that changes everywhere it appears).
[`examples/foldkit/pixel-art`](../../../examples/foldkit/pixel-art) keeps its
grid this way, one group per stroke.

## `Box`: move and resize within limits

A box that a pointer drags (the `Move` Behavior in
[`interaction`](../interaction/README.md) reports the deltas) or a key nudges is
held in the Model, and these functions turn a delta into the next box. They are
pure, so a key and a drag obey the same limits and the Model is the only owner:

- `Box.moveBy(box, dx, dy, { bounds?, snap? })` and `Box.moveEach(boxes, ids,
  dx, dy, limits)` for several boxes at once. A group keeps its shape: the delta
  is limited so the whole group stays inside `bounds`, rather than each box
  stopping alone. `snap` lands the first id on the grid, on the axes that move,
  and the rest keep their distance from it.
- `Box.resize(box, handle, dx, dy, { bounds?, min?, max?, aspect?, snap? })`
  moves the edges a handle (`n`, `e`, `se`, ...) owns and keeps the others. The
  grid takes the moving edge first and the limits still win; with `aspect` an
  edge grows the other side about the box's middle and a corner follows the edge
  that moved further.
- `Box.moveKey(press, { step?, largeStep? })`: Alt with an arrow, Shift for the
  larger step (ten steps by default). `Box.resizeKey(press, handle, options)`:
  an arrow moves the handle's own edges (an east handle reads Left and Right
  only), and Home and End take its axes to the smallest and largest size the
  limits allow. Both are `Option`, none for another key or a press with Control
  or Meta; read them from a `Pressed` or an attribute-handler key, not a Mount.

A function that changes nothing returns the box it was given, so a nudge against
the edge records no undo step (see `History.push`'s `equals`). `moveBy` and
`moveEach` refuse a delta that is not finite; `resize` reads an infinite one as
"as far as the limits allow", which is what `resizeKey` sends for Home and End. Announcing the result ("Card moved to 40, 20") is the
parent's: say it through `LiveAnnounce` in the same transition.

```ts
import { Option } from 'effect'
import type { KeyPress } from 'foldkit-primitives/events'
import { Box } from 'foldkit-primitives/state'

const area = { left: 0, top: 0, right: 100, bottom: 50 }
const card = { x: 10, y: 10, width: 20, height: 10 }

const press: KeyPress = {
  key: 'ArrowRight',
  repeat: false,
  ctrl: false,
  shift: true,
  alt: true,
  meta: false,
}
const nudged = Option.map(Box.moveKey(press, { step: 100 }), ({ dx, dy }) =>
  Box.moveBy(card, dx, dy, { bounds: area }),
)
const grown = Box.resize(card, 'se', 500, 500, { bounds: area, aspect: 2 })
```

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
`MeasureRow({ key })` a row's height, its border box (a padded row's padding
counts). `MeasureRows({ attribute })` on the list instead measures every child
carrying `attribute` (its value the key) with one observer and reports a
frame's resized rows as one `RowsMeasured` batch, so a first draw is one
Message, not one per row. Four functions read it:

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

For a list that scrolls with the document, put `WindowViewport` on the
list's own box in place of `Viewport`: its `ViewportPlaced { top, height }`
is how far the viewport's top is past the list's (negative while the list is
below it) and the viewport's height, read again on every scroll, resize, and
resize of the page, so content above the list counts. Map `top` into
`Scrolled` and pass `height` as `windowFor`'s viewport height.
`foldkit-mixins-ui`'s `WindowList` is that list, drawn. For follow-bottom, hold the end while `isAtEnd` and scroll on extend; to anchor a
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
