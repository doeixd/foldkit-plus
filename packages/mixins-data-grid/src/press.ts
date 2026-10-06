import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import {
  FillDragEnded,
  FillDragStarted,
  FillDraggedOver,
  type FillFact,
  fillDragOn,
} from './fillDrag.js'

export const CellClicked = Schema.TaggedStruct('CellClicked', {
  /** The clicked gridcell's DOM id. */
  cell: Schema.String,
  shiftKey: Schema.Boolean,
  /** Ctrl, or Meta on a Mac: a toggle. */
  toggleKey: Schema.Boolean,
})

type Modified = Event & {
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
}

/**
 * Clicks on a grid's cells, with their modifier keys, and the fill handle's
 * drag (`fillDragOn`), from listeners on the element that holds the cells
 * rather than one per cell: one Mount, since an element holds one. A click
 * outside a gridcell, on the fill handle, or ending a fill reports nothing;
 * what a click means is the grid's update.
 */
export const CellPress = Mount.defineStream('DataGridCellPress', {
  messages: [CellClicked, FillDragStarted, FillDraggedOver, FillDragEnded],
  execute: ({ element }) =>
    Stream.callback<typeof CellClicked.Type | FillFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const fill = fillDragOn(element, fact => Queue.offerUnsafe(queue, fact))
          const listener = (event: Event) => {
            if (fill.owns(event)) return
            const from = event.target
            if (!(from instanceof Element)) return
            const cell = from.closest('[role="gridcell"]')
            if (cell === null || !element.contains(cell) || cell.id === '') return
            const modified = event as Modified
            Queue.offerUnsafe(
              queue,
              CellClicked.make({
                cell: cell.id,
                shiftKey: modified.shiftKey === true,
                toggleKey: modified.ctrlKey === true || modified.metaKey === true,
              }),
            )
          }
          element.addEventListener('click', listener)
          return { listener, fill }
        }),
        ({ listener, fill }) =>
          Effect.sync(() => {
            element.removeEventListener('click', listener)
            fill.dispose()
          }),
      ),
    ),
})
