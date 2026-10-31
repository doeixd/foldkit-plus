import { Effect, Option, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** The row's listeners are attached: the Mount's answer when it starts, which changes nothing. */
export const HeaderListening = Schema.TaggedStruct('HeaderListening', {})
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
export const HandleDragStarted = Schema.TaggedStruct('HandleDragStarted', {
  /** The DOM id of the columnheader whose resize handle was pressed. */
  header: Schema.String,
})
export const HandleDragged = Schema.TaggedStruct('HandleDragged', {
  /** From where the pointer went down, in CSS pixels. */
  deltaX: Schema.Number,
})
export const HandleDragEnded = Schema.TaggedStruct('HandleDragEnded', {
  /** `false` when the pointer was cancelled or capture was lost. */
  completed: Schema.Boolean,
})
type Fact =
  | typeof HeaderListening.Type
  | typeof HeaderDragStarted.Type
  | typeof HeaderDragged.Type
  | typeof HeaderDragEnded.Type
  | typeof HandleDragStarted.Type
  | typeof HandleDragged.Type
  | typeof HandleDragEnded.Type

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
  /** A press on a resize handle, which drags at once; a header's waits for the threshold. */
  readonly resize: boolean
  /** The element holding the pointer's capture: the handle from the press, the row once a header drags. */
  captor: Option.Option<Element>
}

/**
 * The pointer on a grid's header row, from one listener on the row: a
 * header dragged to reorder it, and a resize handle dragged to resize its
 * column. A press on a header becomes a drag once it has moved 4px, and
 * only then is the pointer captured, so a click (on a sort button, say)
 * stays a click. A press on a resize handle captures the pointer to the
 * handle at once. A press in a column's open menu is the menu's. The
 * listeners that follow the pointer are attached for the length of a press.
 * What a drag does is the grid's update.
 *
 * It answers `HeaderListening` when it starts, so a Scene test resolves it
 * with a Message the runtime also sends, and its handles hold no Mount of
 * their own: a header scrolled into view starts nothing.
 */
export const HeaderPress = Mount.defineStream('DataGridHeaderPress', {
  messages: [
    HeaderListening,
    HeaderDragStarted,
    HeaderDragged,
    HeaderDragEnded,
    HandleDragStarted,
    HandleDragged,
    HandleDragEnded,
  ],
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
          const capture = (current: Press, captor: Element) => {
            current.captor = Option.some(captor)
            try {
              captor.setPointerCapture(current.pointerId)
            } catch {
              // Without capture the drag still follows the pointer on the page.
            }
          }
          const release = (current: Press) => {
            page.removeEventListener('pointermove', onMove)
            page.removeEventListener('pointerup', onUp)
            page.removeEventListener('pointercancel', onCancel)
            element.removeEventListener('lostpointercapture', onCancel)
            if (Option.isNone(current.captor)) return
            try {
              current.captor.value.releasePointerCapture(current.pointerId)
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
            if (current.resize) {
              offer(HandleDragEnded.make({ completed }))
              return
            }
            if (Option.isNone(current.captor)) return
            offer(HeaderDragEnded.make({ completed }))
            element.addEventListener('click', swallow, { capture: true, once: true })
            setTimeout(() => element.removeEventListener('click', swallow, true), 0)
          }
          const onUp = (event: Event) => finish(event, true)
          // Capture lost (bubbled from a handle too) or the pointer cancelled.
          const onCancel = (event: Event) => finish(event, false)
          const onMove = (event: Event) => {
            const found = pressOf(event)
            if (Option.isNone(found)) return
            const current = found.value
            const deltaX = ((event as PointerLike).clientX ?? 0) - current.x
            if (current.resize) {
              offer(HandleDragged.make({ deltaX }))
              return
            }
            if (Option.isNone(current.captor)) {
              if (Math.abs(deltaX) < threshold) return
              capture(current, element)
              offer(HeaderDragStarted.make({ header: current.header }))
            }
            offer(HeaderDragged.make({ deltaX }))
          }
          const onDown = (event: Event) => {
            const pointer = event as PointerLike
            const from = event.target
            if ((pointer.button ?? 0) !== 0 || Option.isSome(press)) return
            if (!(from instanceof Element) || from.closest('[role="menu"]')) return
            const header = from.closest('[role="columnheader"]')
            if (header === null || !element.contains(header) || header.id === '') return
            const handle = from.closest('[role="separator"]')
            const current: Press = {
              pointerId: pointer.pointerId ?? 0,
              x: pointer.clientX ?? 0,
              header: header.id,
              resize: handle !== null,
              captor: Option.none(),
            }
            press = Option.some(current)
            page.addEventListener('pointermove', onMove)
            page.addEventListener('pointerup', onUp)
            page.addEventListener('pointercancel', onCancel)
            element.addEventListener('lostpointercapture', onCancel)
            if (handle === null) return
            capture(current, handle)
            offer(HandleDragStarted.make({ header: current.header }))
          }
          element.addEventListener('pointerdown', onDown)
          offer(HeaderListening.make({}))
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
