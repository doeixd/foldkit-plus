/**
 * Dragging one marked descendant of an element onto another, as a Mount. A
 * descendant is marked by an attribute whose value is its id, as `Targets`
 * marks them; a press on one that then moves past a threshold starts a drag,
 * and the pointer's place over another marked descendant is reported with the
 * zone of it the pointer is in: its first third (`before`), its middle
 * (`inside`), or its last third (`after`). Releasing drops, and Escape or a
 * cancelled pointer ends the drag with nothing dropped.
 *
 * It writes no roles, no `tabindex` and no key handling, so the marked
 * elements can be anything: a tree's rows, a canvas's nodes. The keyboard's way
 * to do what a drag does is the parent's to give. Geometry is measured when the
 * pointer moves and never kept; what a drop means is the parent's `update`.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { targetOf } from './targets.js'

export const DragZone = Schema.Literals(['before', 'inside', 'after'])
export type DragZone = typeof DragZone.Type

/** A marked descendant under the pointer, and the zone of it the pointer is in. */
export const DragPlace = Schema.Struct({ id: Schema.String, zone: DragZone })
export type DragPlace = typeof DragPlace.Type

export const DragStarted = Schema.TaggedStruct('DragStarted', {
  /** The marked descendant being dragged. */
  id: Schema.String,
})
export type DragStarted = typeof DragStarted.Type

export const DraggedOver = Schema.TaggedStruct('DraggedOver', {
  /** Where the pointer is, or `null` over nothing marked, or over what is dragged. */
  over: Schema.NullOr(DragPlace),
})
export type DraggedOver = typeof DraggedOver.Type

export const DragDropped = Schema.TaggedStruct('DragDropped', {
  id: Schema.String,
  over: Schema.NullOr(DragPlace),
})
export type DragDropped = typeof DragDropped.Type

export const DragCancelled = Schema.TaggedStruct('DragCancelled', { id: Schema.String })
export type DragCancelled = typeof DragCancelled.Type

export type DragFact = DragStarted | DraggedOver | DragDropped | DragCancelled

/** How far, in CSS pixels, a press moves before it is a drag rather than a click. */
export const DRAG_THRESHOLD = 4

interface Box {
  readonly top: number
  readonly height: number
}

/** The zone of a box a vertical position falls in, by thirds. */
export const zoneOf = (box: Box, y: number): DragZone => {
  if (box.height <= 0) return 'inside'
  const at = (y - box.top) / box.height
  return at < 1 / 3 ? 'before' : at > 2 / 3 ? 'after' : 'inside'
}

/**
 * An element's box. An element drawn as `display: contents` has none, so its
 * first child's stands for it, as an editor's node wrapper's does.
 */
export const boxOf = (element: Element): Box => {
  const own = element.getBoundingClientRect()
  if (own.width > 0 || own.height > 0) return own
  const child = element.firstElementChild
  return child === null ? own : boxOf(child)
}

type Positioned = Event & {
  readonly clientX?: number
  readonly clientY?: number
  readonly button?: number
  readonly key?: string
}

export const PointerDrag = Mount.defineStream('PointerDrag', {
  messages: [DragStarted, DraggedOver, DragDropped, DragCancelled],
  args: {
    /** The attribute that marks a descendant, holding its id. */
    attribute: Schema.String,
  },
  execute: ({ element, attribute }) =>
    Stream.callback<DragFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const owner = element.ownerDocument
          const find = (from: EventTarget | null): Element | null => {
            if (!(from instanceof Element)) return null
            const marked = from.closest(`[${attribute}]`)
            return marked !== null && element.contains(marked) ? marked : null
          }
          // A press not yet a drag, or a drag under way.
          let pressed: { readonly id: string; readonly x: number; readonly y: number } | null = null
          let dragging: string | null = null
          let over: DragPlace | null = null
          // The click that ends a drag is not a press on what it ends over.
          let swallowClick = false

          const placeAt = (event: Positioned): DragPlace | null => {
            const marked = find(event.target)
            const id = marked?.getAttribute(attribute) ?? null
            if (marked === null || id === null || id === dragging) return null
            return { id, zone: zoneOf(boxOf(marked), event.clientY ?? 0) }
          }
          // `inside`: the release was on the container, so its click will reach it.
          const end = (dropped: boolean, inside = false) => {
            const id = dragging
            pressed = null
            dragging = null
            const last = over
            over = null
            if (id === null) return
            swallowClick = dropped && inside
            Queue.offerUnsafe(
              queue,
              dropped ? DragDropped.make({ id, over: last }) : DragCancelled.make({ id }),
            )
          }

          const onElement: ReadonlyArray<readonly [string, (event: Event) => void, boolean]> = [
            [
              'pointerdown',
              event => {
                const positioned = event as Positioned
                if ((positioned.button ?? 0) !== 0) return
                const id = targetOf(element, event.target, attribute)
                if (id === null) return
                swallowClick = false
                pressed = { id, x: positioned.clientX ?? 0, y: positioned.clientY ?? 0 }
              },
              false,
            ],
            [
              'click',
              event => {
                if (!swallowClick) return
                swallowClick = false
                event.preventDefault()
                event.stopImmediatePropagation()
              },
              true,
            ],
            // A link or an image would start the browser's own drag instead.
            ['dragstart', event => event.preventDefault(), false],
          ]
          const onDocument: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointermove',
              event => {
                const positioned = event as Positioned
                if (pressed === null) return
                if (dragging === null) {
                  const moved = Math.hypot(
                    (positioned.clientX ?? 0) - pressed.x,
                    (positioned.clientY ?? 0) - pressed.y,
                  )
                  if (moved < DRAG_THRESHOLD) return
                  dragging = pressed.id
                  owner.getSelection()?.removeAllRanges()
                  Queue.offerUnsafe(queue, DragStarted.make({ id: dragging }))
                }
                const place = placeAt(positioned)
                if (place?.id === over?.id && place?.zone === over?.zone) return
                over = place
                Queue.offerUnsafe(queue, DraggedOver.make({ over: place }))
              },
            ],
            [
              'pointerup',
              event => {
                if (dragging === null) pressed = null
                else end(true, event.target instanceof Node && element.contains(event.target))
              },
            ],
            ['pointercancel', () => end(false)],
            [
              'keydown',
              event => {
                if (dragging === null || (event as Positioned).key !== 'Escape') return
                event.preventDefault()
                end(false)
              },
            ],
          ]
          for (const [type, listener, capture] of onElement)
            element.addEventListener(type, listener, capture)
          for (const [type, listener] of onDocument) owner.addEventListener(type, listener)
          return { onElement, onDocument, owner }
        }),
        ({ onElement, onDocument, owner }) =>
          Effect.sync(() => {
            for (const [type, listener, capture] of onElement)
              element.removeEventListener(type, listener, capture)
            for (const [type, listener] of onDocument) owner.removeEventListener(type, listener)
          }),
      ),
    ),
})
