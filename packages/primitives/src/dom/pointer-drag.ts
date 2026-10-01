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
  /**
   * For a drag onto `targets`: whether the pointer is inside the region they
   * are in, so `over: null` with `region: true` is its empty space (an empty
   * page, the space below the last node). Absent for a drag among its own.
   */
  region: Schema.optionalKey(Schema.Boolean),
})
export type DraggedOver = typeof DraggedOver.Type

export const DragDropped = Schema.TaggedStruct('DragDropped', {
  id: Schema.String,
  over: Schema.NullOr(DragPlace),
  /** As `DraggedOver`'s: released inside the `targets` region. */
  region: Schema.optionalKey(Schema.Boolean),
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
  readonly buttons?: number
  readonly pointerId?: number
  readonly key?: string
}

export const PointerDrag = Mount.defineStream('PointerDrag', {
  messages: [DragStarted, DraggedOver, DragDropped, DragCancelled],
  args: {
    /** The attribute that marks a descendant, holding its id. */
    attribute: Schema.String,
    /**
     * Where a drag may land, when not on the element's own marked descendants:
     * the elements marked by `attribute` inside the one `within` selects, such
     * as a palette's Blocks dragged onto a page. A drop's `over` is then one of
     * those; what is dragged is still one of the element's own. `within` is
     * looked for nearest first, under the element's closest ancestor that holds
     * a match, so two editors on one page each drop onto their own.
     */
    targets: Schema.optionalKey(Schema.Struct({ attribute: Schema.String, within: Schema.String })),
  },
  execute: ({ element, attribute, targets }) =>
    Stream.callback<DragFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const owner = element.ownerDocument
          // What a drop lands on: the element's own marked descendants, or those of `targets`.
          const landsOn = targets?.attribute ?? attribute
          // Looked for at each move, so a redraw that replaced it is followed.
          const regionOf = (within: string): Element | null => {
            for (let at = element.parentElement; at !== null; at = at.parentElement) {
              const found = at.querySelector(within)
              if (found !== null) return found
            }
            return null
          }
          const find = (from: EventTarget | null) => {
            if (!(from instanceof Element)) return { marked: null, inRegion: false }
            const region = targets === undefined ? element : regionOf(targets.within)
            const marked = from.closest(`[${landsOn}]`)
            return {
              marked: marked !== null && region !== null && region.contains(marked) ? marked : null,
              // Only a drag onto `targets` tells its region's empty space from elsewhere.
              inRegion: targets !== undefined && region !== null && region.contains(from),
            }
          }
          // A press not yet a drag, or a drag under way: one pointer's, the first down.
          let pressed: {
            readonly id: string
            readonly pointer: number | undefined
            readonly x: number
            readonly y: number
          } | null = null
          let dragging: string | null = null
          let over: DragPlace | null = null
          let inRegion = false
          // The click that ends a drag is not a press on what it ends over.
          let swallowClick = false

          const placeAt = (event: Positioned) => {
            // Touch and pen capture the pointer to where it went down, so the
            // event's target is the dragged element: ask what is under it instead.
            const under =
              typeof owner.elementFromPoint === 'function' && event.clientX !== undefined
                ? owner.elementFromPoint(event.clientX, event.clientY ?? 0)
                : null
            const { marked, inRegion: region } = find(under ?? event.target)
            const id = marked?.getAttribute(landsOn) ?? null
            // Over itself is over nothing, where what is dragged is among what it lands on.
            const place: DragPlace | null =
              marked === null || id === null || (targets === undefined && id === dragging)
                ? null
                : { id, zone: zoneOf(boxOf(marked), event.clientY ?? 0) }
            return { place, region }
          }
          /** The region flag a fact carries: only for a drag onto `targets`. */
          const withRegion = (region: boolean) => (targets === undefined ? {} : { region })
          const ours = (event: Positioned) =>
            pressed !== null &&
            (pressed.pointer === undefined || event.pointerId === pressed.pointer)
          // `inside`: the release was on the container, so its click will reach it.
          // The release is hit-tested again: the layout may have moved since
          // the last move (a scroll, a row that shifted), and the drop says
          // where the pointer was let go, not where it was last seen. A
          // release with no position of its own keeps the last move's answer.
          const end = (dropped: boolean, at?: Positioned, inside = false) => {
            const id = dragging
            if (id !== null && at?.clientX !== undefined && at.clientY !== undefined) {
              const { place, region } = placeAt(at)
              over = place
              inRegion = region
            }
            pressed = null
            dragging = null
            const last = over
            const lastRegion = inRegion
            over = null
            inRegion = false
            release()
            if (id === null) return
            swallowClick = dropped && inside
            Queue.offerUnsafe(
              queue,
              dropped
                ? DragDropped.make({ id, over: last, ...withRegion(lastRegion) })
                : DragCancelled.make({ id }),
            )
          }

          const onDocument: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointermove',
              event => {
                const positioned = event as Positioned
                if (!ours(positioned) || pressed === null) return
                // Released where no pointerup reached us, such as over a frame.
                if (positioned.buttons !== undefined && (positioned.buttons & 1) === 0)
                  return end(false)
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
                const { place, region } = placeAt(positioned)
                if (place?.id === over?.id && place?.zone === over?.zone && region === inRegion)
                  return
                over = place
                inRegion = region
                Queue.offerUnsafe(queue, DraggedOver.make({ over: place, ...withRegion(region) }))
              },
            ],
            [
              'pointerup',
              event => {
                if (!ours(event as Positioned)) return
                if (dragging === null) end(false)
                else
                  end(
                    true,
                    event as Positioned,
                    event.target instanceof Node && element.contains(event.target),
                  )
              },
            ],
            [
              'pointercancel',
              event => {
                if (ours(event as Positioned)) end(false)
              },
            ],
          ]
          // Heard on the way down, and kept there: an Escape that ends a drag is the
          // drag's, not also the focused element's (a canvas that would deselect).
          const onEscape = (event: Event) => {
            if (pressed === null || (event as Positioned).key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            end(false)
          }
          // The document is listened to only while a press is under way.
          let listening = false
          const listen = () => {
            if (listening) return
            listening = true
            for (const [type, listener] of onDocument) owner.addEventListener(type, listener)
            owner.addEventListener('keydown', onEscape, true)
          }
          const release = () => {
            if (!listening) return
            listening = false
            for (const [type, listener] of onDocument) owner.removeEventListener(type, listener)
            owner.removeEventListener('keydown', onEscape, true)
          }

          const onElement: ReadonlyArray<readonly [string, (event: Event) => void, boolean]> = [
            [
              'pointerdown',
              event => {
                const positioned = event as Positioned
                // Any press is past the drop a swallowed click was waiting for.
                swallowClick = false
                // A second pointer while one is down is not a new drag.
                if (pressed !== null) return
                if ((positioned.button ?? 0) !== 0) return
                // A press in text being edited selects text: it is no drag.
                if (
                  event.target instanceof Element &&
                  event.target.closest('[contenteditable]:not([contenteditable="false"])') !== null
                )
                  return
                const id = targetOf(element, event.target, attribute)
                if (id === null) return
                pressed = {
                  id,
                  pointer: positioned.pointerId,
                  x: positioned.clientX ?? 0,
                  y: positioned.clientY ?? 0,
                }
                listen()
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
          for (const [type, listener, capture] of onElement)
            element.addEventListener(type, listener, capture)
          return { onElement, release }
        }),
        ({ onElement, release }) =>
          Effect.sync(() => {
            for (const [type, listener, capture] of onElement)
              element.removeEventListener(type, listener, capture)
            release()
          }),
      ),
    ),
})
