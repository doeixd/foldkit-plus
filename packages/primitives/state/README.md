# `foldkit-primitives/state`

Owned UI state: pages, undo stacks, locales, selections, and virtual windows. Most
transitions are pure; Locale reads the environment at initialization, and Virtual uses a
settling timer. See the [package README](../README.md) for the full guide; this page
walks through one placement before the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/state))

## Owns

Application facts with nowhere else to live: the page, the past, the locale, the
selection, the scroll window. Data loading stays the application's job — these bundles
own the frame, not the contents.

```text
user intent → Message → update → parent Model → derived view
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { SelectionSet } from 'foldkit-primitives/state'

const Picked = Bundle.declare(SelectionSet, 'picked')
const Model = Schema.Struct({ ...Picked.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Picked.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Picked))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.picked.selected.length)]),
  subscriptions: placements.subscriptions(),
})
```

The selection starts empty. Dispatch `Message.GotPickedMessage({ message:
SelectionSetMessage.Toggle({ id: 'task-1' }) })` to toggle a row (import
`SelectionSetMessage` from this subpath). The reducer stores ids; it neither loads rows
nor persists the selection. Selecting an existing id preserves its position; deselecting
and selecting again appends it.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Pagination` | bundle `{ page, perPage, total }`, clamped | `{ perPage }` (+ optional `total`) |
| `history` | factory bundle `{ past, present, future }` | value Schema (+ `capacity`) |
| `Locale` | bundle `{ locale }` | `{ default }` |
| `SelectionSet` | bundle `{ selected }` in first-selection order | none |
| `Virtual` | bundle `{ scrollTop, heights, scrolling, ...layout }` | layout args (+ restore/settle options) |
| `Viewport`, `MeasureRow` | Mounts: scroll position, row heights | element (+ row key) |
| `range` | pure: half-open integers | — |
| `windowFor`, `isAtEnd`, `distanceToEnd`, `offsetFor`, `totalHeight`, `visibleRange`, `stickyHeader`, `masonry` | pure: windowing and layout math | — |

`pageCount`/`offset` derive pages; `canUndo`/`canRedo` read history edges; `isSelected`
reads membership. `Prune` drops heights for departed keys. Persisted slices belong to
`Mirror.kv`, not here.

## Failure

Clamping absorbs out-of-range pages and totals; negative totals and non-finite sizes are
rejected or ignored at the boundary. Poisoned virtual positions and heights are ignored,
never stored.
