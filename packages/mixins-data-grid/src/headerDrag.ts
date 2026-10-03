import { Effect, Option, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const HeaderDragStarted = Schema.TaggedStruct('HeaderDragStarted', {
  /** The dragged columnheader's DOM id. */
  header: Schema.String,
})
export const HeaderDragged = Schema.TaggedStruct('HeaderDragged', {
  /** From where the pointer went down, in CSS pixels. */
  deltaX: Schema.Number,
})
export const HeaderDragEnded = Schema.TaggedStruct('HeaderDragEnded', {
  /** `false` when the pointer was cancelled or capture was lost. */
  completed: Schema.Boolean,
})
type Fact = typeof HeaderDragStarted.Type | typeof HeaderDragged.Type | typeof HeaderDragEnded.Type

/** How far a press moves before it is a drag, so a click on a header stays a click. */
const threshold = 4

type PointerLike = Event & {
  readonly pointerId?: number
  readonly button?: number
  readonly clientX?: number
}

interface Press {
  readonly pointerId: number
  readonly x: number
  readonly header: string
  dragging: boolean
}

/**
 * Column headers dragged with the pointer, from one listener on the row that
 * holds them. A press on a header becomes a drag once it has moved 4px, and
 * only then is the pointer captured, so a click (on a sort button, say) stays
 * a click. A press on a resize handle is the handle's. The listeners that
 * follow the pointer are attached for the length of a press. Where a drag
 * lands is the grid's update.
 */
export const HeaderDrag = Mount.defineStream('DataGridHeaderDrag', {
  messages: [HeaderDragStarted, HeaderDragged, HeaderDragEnded],
  execute: ({ element }) =>
    Stream.callback<Fact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const page = element.ownerDocument
          let press: Option.Option<Press> = Option.none()
          const offer = (fact: Fact) => Queue.offerUnsafe(queue, fact)
          // Without capture the browser may click the button the drag began
          // on; a click straight after a drag is the drag's, not the button's.
          const swallow = (event: Event) => {
            event.stopPropagation()
            event.preventDefault()
          }
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
          // The press this event's pointer made, if one is under way.
          const pressOf = (event: Event): Option.Option<Press> =>
            Option.filter(
              press,
              current => current.pointerId === ((event as PointerLike).pointerId ?? 0),
            )
          const finish = (event: Event, completed: boolean) => {
            const found = pressOf(event)
            if (Option.isNone(found)) return
            const current = found.value
            press = Option.none()
            release(current)
            if (!current.dragging) return
            offer(HeaderDragEnded.make({ completed }))
            element.addEventListener('click', swallow, { capture: true, once: true })
            setTimeout(() => element.removeEventListener('click', swallow, true), 0)
          }
          const onUp = (event: Event) => finish(event, true)
          const onCancel = (event: Event) => finish(event, false)
          const onMove = (event: Event) => {
            const found = pressOf(event)
            if (Option.isNone(found)) return
            const current = found.value
            const deltaX = ((event as PointerLike).clientX ?? 0) - current.x
            if (!current.dragging) {
              if (Math.abs(deltaX) < threshold) return
              current.dragging = true
              try {
                element.setPointerCapture(current.pointerId)
              } catch {
                // Without capture the drag still follows the pointer on the page.
              }
              offer(HeaderDragStarted.make({ header: current.header }))
            }
            offer(HeaderDragged.make({ deltaX }))
          }
          const onDown = (event: Event) => {
            const pointer = event as PointerLike
            const from = event.target
            if ((pointer.button ?? 0) !== 0 || Option.isSome(press)) return
            if (!(from instanceof Element) || from.closest('[role="separator"]') !== null) return
            const header = from.closest('[role="columnheader"]')
            if (header === null || !element.contains(header) || header.id === '') return
            press = Option.some({
              pointerId: pointer.pointerId ?? 0,
              x: pointer.clientX ?? 0,
              header: header.id,
              dragging: false,
            })
            page.addEventListener('pointermove', onMove)
            page.addEventListener('pointerup', onUp)
            page.addEventListener('pointercancel', onCancel)
            element.addEventListener('lostpointercapture', onCancel)
          }
          element.addEventListener('pointerdown', onDown)
          return { onDown, current: () => press, release }
        }),
        ({ onDown, current, release }) =>
          Effect.sync(() => {
            element.removeEventListener('pointerdown', onDown)
            const left = current()
            if (Option.isSome(left)) release(left.value)
          }),
      ),
    ),
})
