import { Effect, Option, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const FillDragStarted = Schema.TaggedStruct('FillDragStarted', {})
export const FillDraggedOver = Schema.TaggedStruct('FillDraggedOver', {
  /** The DOM id of the gridcell under the pointer. */
  cell: Schema.String,
})
export const FillDragEnded = Schema.TaggedStruct('FillDragEnded', {
  /** `false` when the pointer was cancelled or capture was lost. */
  completed: Schema.Boolean,
})
type Fact = typeof FillDragStarted.Type | typeof FillDraggedOver.Type | typeof FillDragEnded.Type

/** How far a press moves before it is a fill, so a stray click fills nothing. */
const threshold = 4

type PointerLike = Event & {
  readonly pointerId?: number
  readonly button?: number
  readonly clientX?: number
  readonly clientY?: number
}

interface Press {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  dragging: boolean
  over: string
}

/**
 * The fill handle dragged with the pointer. The handle's own press is kept
 * from its cell (a press there would select the cell instead), and so is the
 * click a captured pointer ends with. Once the press has moved 4px the
 * pointer is captured, so the cell under it is found by where it is
 * (`elementFromPoint`), not by the event's target, which capture makes the
 * handle. The listeners that follow the pointer live for one press.
 */
export const FillDrag = Mount.defineStream('DataGridFillDrag', {
  messages: [FillDragStarted, FillDraggedOver, FillDragEnded],
  execute: ({ element }) =>
    Stream.callback<Fact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const page = element.ownerDocument
          let press: Option.Option<Press> = Option.none()
          const offer = (fact: Fact) => Queue.offerUnsafe(queue, fact)
          const pointerOf = (event: Event) => (event as PointerLike).pointerId ?? 0
          const release = (current: Press) => {
            page.removeEventListener('pointermove', onMove)
            page.removeEventListener('pointerup', onUp)
            page.removeEventListener('pointercancel', onCancel)
            element.removeEventListener('lostpointercapture', onCancel)
            if (!current.dragging) return
            try {
              element.releasePointerCapture(current.pointerId)
            } catch {
              // Capture may already be gone.
            }
          }
          const finish = (event: Event, completed: boolean) => {
            const found = Option.filter(press, current => current.pointerId === pointerOf(event))
            if (Option.isNone(found)) return
            press = Option.none()
            release(found.value)
            if (found.value.dragging) offer(FillDragEnded.make({ completed }))
          }
          const onUp = (event: Event) => finish(event, true)
          const onCancel = (event: Event) => finish(event, false)
          const onMove = (event: Event) => {
            const found = Option.filter(press, current => current.pointerId === pointerOf(event))
            if (Option.isNone(found)) return
            const current = found.value
            const pointer = event as PointerLike
            const x = pointer.clientX ?? 0
            const y = pointer.clientY ?? 0
            if (!current.dragging) {
              if (Math.abs(x - current.x) < threshold && Math.abs(y - current.y) < threshold) return
              current.dragging = true
              try {
                element.setPointerCapture(current.pointerId)
              } catch {
                // Without capture the drag still follows the pointer on the page.
              }
              offer(FillDragStarted.make({}))
            }
            const cell = page.elementFromPoint(x, y)?.closest('[role="gridcell"]')
            if (cell === null || cell === undefined || cell.id === '' || cell.id === current.over) {
              return
            }
            current.over = cell.id
            offer(FillDraggedOver.make({ cell: cell.id }))
          }
          const onDown = (event: Event) => {
            const pointer = event as PointerLike
            event.stopPropagation()
            if ((pointer.button ?? 0) !== 0 || Option.isSome(press)) return
            // No text selection, and no focus taken from the grid.
            event.preventDefault()
            press = Option.some({
              pointerId: pointerOf(event),
              x: pointer.clientX ?? 0,
              y: pointer.clientY ?? 0,
              dragging: false,
              over: '',
            })
            page.addEventListener('pointermove', onMove)
            page.addEventListener('pointerup', onUp)
            page.addEventListener('pointercancel', onCancel)
            element.addEventListener('lostpointercapture', onCancel)
          }
          const onClick = (event: Event) => event.stopPropagation()
          element.addEventListener('pointerdown', onDown)
          element.addEventListener('click', onClick)
          return { onDown, onClick, current: () => press, release }
        }),
        ({ onDown, onClick, current, release }) =>
          Effect.sync(() => {
            element.removeEventListener('pointerdown', onDown)
            element.removeEventListener('click', onClick)
            const left = current()
            if (Option.isSome(left)) release(left.value)
          }),
      ),
    ),
})
