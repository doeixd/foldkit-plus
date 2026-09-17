# `foldkit-primitives/state`

Owned UI state: pages, undo stacks, locales, selections, and virtual
windows. Pure logic unless noted — no streams, no environment. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/state))

## Owns

Application facts with nowhere else to live: the page, the past, the
locale, the selection, the scroll window. Data loading stays the
application's job — these bundles own the frame, not the contents.

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

`pageCount`/`offset` derive pages; `canUndo`/`canRedo` read history edges;
`isSelected` reads membership. `Prune` drops heights for departed keys.
Persisted slices belong to `Mirror.kv`, not here.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { SelectionSet } from 'foldkit-primitives/state'

const Picked = Bundle.declare(SelectionSet, 'picked')
// ...Model/Message/parent, then:
Page.assemble(Page.at(Picked))
```

## Failure

Clamping absorbs out-of-range pages and totals; negative totals and
non-finite sizes are rejected or ignored at the boundary. Poisoned virtual
positions and heights are ignored, never stored.
