import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

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
 * Clicks on a grid's cells, with their modifier keys, from one listener on
 * the element that holds them rather than one per cell. A click outside a
 * gridcell reports nothing; what a click means is the grid's update.
 */
export const CellPress = Mount.defineStream('DataGridCellPress', {
  messages: [CellClicked],
  execute: ({ element }) =>
    Stream.callback<typeof CellClicked.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = (event: Event) => {
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
          return listener
        }),
        listener => Effect.sync(() => element.removeEventListener('click', listener)),
      ),
    ),
})
