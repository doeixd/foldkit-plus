import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import {
  FillDragEnded,
  FillDragStarted,
  FillDraggedOver,
  type FillFact,
  fillDragOn,
} from './fillDrag.js'

/** The body's listeners are attached: the Mount's answer when it starts, which changes nothing. */
export const CellsListening = Schema.TaggedStruct('CellsListening', {})
export const CellClicked = Schema.TaggedStruct('CellClicked', {
  /** The clicked gridcell's DOM id. */
  cell: Schema.String,
  shiftKey: Schema.Boolean,
  /** Ctrl, or Meta on a Mac: a toggle. */
  toggleKey: Schema.Boolean,
})

/**
 * A plain click on the checkbox a gridcell draws (`role="checkbox"`), with
 * the state it was drawn in: read from the page at the click, since a
 * Mount's arguments are its first render's.
 */
export const CheckboxClicked = Schema.TaggedStruct('CheckboxClicked', {
  /** The DOM id of the gridcell that holds the checkbox. */
  cell: Schema.String,
  checked: Schema.Boolean,
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
 * with no modifier on a cell's checkbox is a `CheckboxClicked`. A click
 * outside a gridcell, on the fill handle, or ending a fill reports nothing;
 * what a click means is the grid's update. It answers `CellsListening` when
 * it starts, so a Scene test resolves it with a Message the runtime also sends.
 */
export const CellPress = Mount.defineStream('DataGridCellPress', {
  messages: [
    CellsListening,
    CellClicked,
    CheckboxClicked,
    FillDragStarted,
    FillDraggedOver,
    FillDragEnded,
  ],
  execute: ({ element }) =>
    Stream.callback<
      typeof CellsListening.Type | typeof CellClicked.Type | typeof CheckboxClicked.Type | FillFact
    >(queue =>
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
            const shiftKey = modified.shiftKey === true
            const toggleKey = modified.ctrlKey === true || modified.metaKey === true
            const box = from.closest('[role="checkbox"]')
            if (box !== null && cell.contains(box) && !shiftKey && !toggleKey) {
              Queue.offerUnsafe(
                queue,
                CheckboxClicked.make({
                  cell: cell.id,
                  checked: box.getAttribute('aria-checked') === 'true',
                }),
              )
              return
            }
            Queue.offerUnsafe(queue, CellClicked.make({ cell: cell.id, shiftKey, toggleKey }))
          }
          element.addEventListener('click', listener)
          Queue.offerUnsafe(queue, CellsListening.make({}))
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
