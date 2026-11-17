import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { EdgeScroll, edgeScrollerLater } from './edge-scroll.js'
import { gapPlace } from './drag-gap.js'
import { escapeEnds, whilePressed } from './press-session.js'
import { targetOf } from './targets.js'

export const DragZone = Schema.Literals(['before', 'inside', 'after'])
export type DragZone = typeof DragZone.Type

/**
 * A marked descendant under the pointer, and the zone of it the pointer is in.
 * `part` is the value of the `part` attribute on the element found, such as
 * the empty Region of a node a drop goes into; a place with one is `inside`.
 */
export const DragPlace = Schema.Struct({
  id: Schema.String,
  zone: DragZone,
  part: Schema.optionalKey(Schema.String),
})
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

/**
 * How long a finger is held still before its press is a drag. A touch that moves first is a
 * scroll, so a list of draggable rows still scrolls under a finger.
 */
export const HOLD_TO_DRAG_MS = 400

/** How far, in CSS pixels, a held finger may wander before the hold is a scroll. */
export const HOLD_SLOP = 8

/**
 * What a drag under way writes on the document's root, for something that follows
 * the pointer to read without the view drawing again on every move: the pointer's
 * viewport position in pixels (`x`, `y`), and its kind (`mouse`, `touch` or `pen`)
 * as the `kind` attribute. All are removed when the drag ends.
 */
export const DRAGGING = {
  x: '--fk-drag-x',
  y: '--fk-drag-y',
  kind: 'data-fk-drag',
} as const

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
export const boxOf = (element: Element): DOMRect => {
  const own = element.getBoundingClientRect()
  if (own.width > 0 || own.height > 0) return own
  const child = element.firstElementChild
  return child === null ? own : boxOf(child)
}

/** Where the pointer is, and what it was over when last heard. */
interface Point {
  readonly clientX?: number | undefined
  readonly clientY?: number | undefined
  readonly target: EventTarget | null
}

type Positioned = Event & {
  readonly clientX?: number
  readonly clientY?: number
  readonly button?: number
  readonly buttons?: number
  readonly pointerId?: number
  readonly pointerType?: string
  readonly key?: string
}

/**
 * Dragging one marked descendant of an element onto another, as a Mount. A
 * descendant is marked by an attribute whose value is its id, as `Targets`
 * marks them; a press on one that then moves past a threshold starts a drag (a
 * finger's, held still for `HOLD_TO_DRAG_MS`, as a touch that moves first scrolls), and
 * the pointer's place over another marked descendant is reported with the
 * zone of it the pointer is in: its first third (`before`), its middle
 * (`inside`), or its last third (`after`). Releasing drops, and Escape or a
 * cancelled pointer ends the drag with nothing dropped.
 *
 * It writes no roles, no `tabindex` and no key handling, so the marked
 * elements can be anything: a tree's rows, a canvas's nodes. The keyboard's way
 * to do what a drag does is the parent's to give. Geometry is measured when the
 * pointer moves and never kept; what a drop means is the parent's `update`.
 */
export const PointerDrag = Mount.defineStream('PointerDrag', {
  messages: [DragStarted, DraggedOver, DragDropped, DragCancelled],
  args: {
    /** The attribute that marks a descendant, holding its id. */
    attribute: Schema.String,
    /**
     * Where a drag may land, when not on the element's own marked descendants:
     * the elements marked by each `attribute` inside the one its `within` selects,
     * such as a palette's Blocks dragged onto a page and onto its layers. A drop's
     * `over` is then one of those; what is dragged is still one of the element's own.
     * `within` is looked for nearest first, under the element's closest ancestor that
     * holds a match, so two editors on one page each drop onto their own.
     */
    targets: Schema.optionalKey(
      Schema.Array(Schema.Struct({ attribute: Schema.String, within: Schema.String })),
    ),
    /**
     * An attribute that names a part of what a drop lands on, on an element
     * also marked as one: a place over it carries the part and is `inside`.
     */
    part: Schema.optionalKey(Schema.String),
    /**
     * Over a container's own space (its padding, the gap between two children), where the
     * descendants are nested, report the place between its children by where the pointer is
     * along their flow, not the container's own thirds: before the first child whose middle is
     * past the pointer, else after the last (past the last of the whole region, `over: null`).
     * Only that one container's children are measured. Absent: a container is one place.
     */
    gaps: Schema.optionalKey(Schema.Boolean),
    /**
     * Scroll the nearest scrolling ancestor while the drag is held near its
     * edge, and report the place under the still pointer after each step.
     * Absent: a drag scrolls nothing.
     */
    edgeScroll: Schema.optionalKey(EdgeScroll),
  },
  execute: ({ element, attribute, targets, part, gaps, edgeScroll }) =>
    Stream.callback<DragFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const owner = element.ownerDocument
          // What a drop lands on: the element's own marked descendants, or those of `targets`.
          const lands = targets ?? [{ attribute, within: '' }]
          // Looked for at each move, so a redraw that replaced it is followed.
          const regionOf = (within: string): Element | null => {
            if (targets === undefined) return element
            for (let at = element.parentElement; at !== null; at = at.parentElement) {
              const found = at.querySelector(within)
              if (found !== null) return found
            }
            return null
          }
          const find = (from: EventTarget | null) => {
            if (!(from instanceof Element))
              return { marked: null, landsOn: attribute, inRegion: false, scope: null }
            let inRegion = false
            let scope: Element | null = null
            let scopeAttribute = attribute
            for (const land of lands) {
              const region = regionOf(land.within)
              if (region === null) continue
              const marked = from.closest(`[${land.attribute}]`)
              if (marked !== null && region.contains(marked))
                return {
                  marked,
                  landsOn: land.attribute,
                  inRegion: targets !== undefined,
                  scope: region,
                }
              if (region.contains(from)) {
                scope = region
                scopeAttribute = land.attribute
                // Only a drag onto `targets` tells its regions' empty space from elsewhere.
                inRegion ||= targets !== undefined
              }
            }
            return { marked: null, landsOn: scopeAttribute, inRegion, scope }
          }
          // A press not yet a drag, or a drag under way: one pointer's, the first down.
          let pressed: {
            readonly id: string
            readonly pointer: number | undefined
            readonly x: number
            readonly y: number
            /** A finger's: a drag once held still, a scroll if it moves first. */
            readonly touch: boolean
            readonly kind: string
          } | null = null
          let holding: ReturnType<typeof setTimeout> | undefined
          const root = owner.documentElement
          const writeAt = (x: number, y: number) => {
            root.style.setProperty(DRAGGING.x, `${x}px`)
            root.style.setProperty(DRAGGING.y, `${y}px`)
          }
          const clearAt = () => {
            root.style.removeProperty(DRAGGING.x)
            root.style.removeProperty(DRAGGING.y)
            root.removeAttribute(DRAGGING.kind)
          }
          const begin = (pressed: {
            readonly id: string
            readonly kind: string
            readonly x: number
            readonly y: number
          }) => {
            dragging = pressed.id
            owner.getSelection()?.removeAllRanges()
            root.setAttribute(DRAGGING.kind, pressed.kind === '' ? 'mouse' : pressed.kind)
            writeAt(pressed.x, pressed.y)
            Queue.offerUnsafe(queue, DragStarted.make({ id: pressed.id }))
          }
          let dragging: string | null = null
          let over: DragPlace | null = null
          let inRegion = false
          // The click that ends a drag is not a press on what it ends over.
          let swallowClick = false

          const placeAt = (event: Point) => {
            // Touch and pen capture the pointer to where it went down, so the
            // event's target is the dragged element: ask what is under it instead.
            const under =
              typeof owner.elementFromPoint === 'function' && event.clientX !== undefined
                ? owner.elementFromPoint(event.clientX, event.clientY ?? 0)
                : null
            const { marked, landsOn, inRegion: region, scope } = find(under ?? event.target)
            const id = marked?.getAttribute(landsOn) ?? null
            // Over itself is over nothing, where what is dragged is among what it lands on.
            const named = part === undefined ? null : (marked?.getAttribute(part) ?? null)
            const skip = targets === undefined ? dragging : null
            const x = event.clientX ?? 0
            const y = event.clientY ?? 0
            // Over a container's own space, not over one of its children: between its children, by
            // where the pointer is now (the children of that one container are measured, no others).
            const container = marked !== null ? (named === null ? marked : null) : undefined
            if (
              gaps === true &&
              scope !== null &&
              container !== null &&
              (marked === null || (id !== null && id !== skip))
            ) {
              const gap = gapPlace({
                scope: container ?? scope,
                host: container ?? null,
                attribute: landsOn,
                part,
                x,
                y,
                skip,
              })
              if (gap !== undefined) return { place: gap, region }
            }
            const place: DragPlace | null =
              marked === null || id === null || id === skip
                ? null
                : named === null
                  ? { id, zone: zoneOf(boxOf(marked), y) }
                  : { id, zone: 'inside', part: named }
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
            clearTimeout(holding)
            holding = undefined
            scroller?.stop()
            clearAt()
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
            // The click comes in the release's own task, or never (a release a browser sends no click
            // for): past it, a keyboard's click on a button is no part of the drop.
            if (swallowClick) setTimeout(() => (swallowClick = false), 0)
            Queue.offerUnsafe(
              queue,
              dropped
                ? DragDropped.make({ id, over: last, ...withRegion(lastRegion) })
                : DragCancelled.make({ id }),
            )
          }

          /** Reports where the pointer is, if that is not where it last was reported. */
          const report = (point: Point) => {
            const { place, region } = placeAt(point)
            if (
              place?.id === over?.id &&
              place?.zone === over?.zone &&
              place?.part === over?.part &&
              region === inRegion
            )
              return
            over = place
            inRegion = region
            Queue.offerUnsafe(queue, DraggedOver.make({ over: place, ...withRegion(region) }))
          }
          // The last move, kept to measure again when the list scrolled under a still pointer.
          let heard: Point | null = null
          const scroller =
            edgeScroll === undefined
              ? undefined
              : edgeScrollerLater(element, edgeScroll, () => {
                  if (dragging !== null && heard !== null) report(heard)
                })
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
                  // A finger that moves before its hold is up is scrolling, not dragging.
                  if (pressed.touch) return moved < HOLD_SLOP ? undefined : end(false)
                  if (moved < DRAG_THRESHOLD) return
                  begin(pressed)
                }
                writeAt(positioned.clientX ?? 0, positioned.clientY ?? 0)
                heard = {
                  clientX: positioned.clientX,
                  clientY: positioned.clientY,
                  target: positioned.target,
                }
                report(heard)
                scroller?.move(positioned.clientX ?? 0, positioned.clientY ?? 0)
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
          const onEscape = escapeEnds(
            () => pressed !== null,
            () => dragging !== null,
            () => end(false),
          )
          // Once a finger's drag is under way, the browser must not take its moves for a scroll,
          // and a held finger opens no menu of its own (Android's `contextmenu`). Not passive:
          // only a listener that may cancel can keep the page still.
          const heldStill = (event: Event) => {
            if (dragging !== null) event.preventDefault()
          }
          const noMenu = (event: Event) => {
            if (pressed?.touch === true) event.preventDefault()
          }
          // The document is listened to only while a press is under way.
          const { listen, release } = whilePressed(owner, [
            ...onDocument,
            ['keydown', onEscape, true],
            ['touchmove', heldStill, { passive: false }],
            ['contextmenu', noMenu],
            // The browser's own text selection would extend under a drag; removing it once is not enough.
            ['selectstart', event => event.preventDefault()],
          ])

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
                const touch = positioned.pointerType === 'touch'
                pressed = {
                  id,
                  pointer: positioned.pointerId,
                  x: positioned.clientX ?? 0,
                  y: positioned.clientY ?? 0,
                  touch,
                  kind: positioned.pointerType ?? 'mouse',
                }
                listen()
                if (touch) {
                  holding = setTimeout(() => {
                    holding = undefined
                    if (pressed !== null && dragging === null) begin(pressed)
                  }, HOLD_TO_DRAG_MS)
                }
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
          // No callout of iOS's own over a finger held to drag, on anything inside (inherited).
          const callout =
            element instanceof HTMLElement
              ? element.style.getPropertyValue('-webkit-touch-callout')
              : undefined
          if (element instanceof HTMLElement) {
            element.style.setProperty('-webkit-touch-callout', 'none')
          }
          // Ended mid-hold: the hold must not start a drag after it.
          const stop = () => {
            clearTimeout(holding)
            scroller?.stop()
            clearAt()
            release()
            if (!(element instanceof HTMLElement)) return
            if (callout === undefined || callout === '') {
              element.style.removeProperty('-webkit-touch-callout')
            } else element.style.setProperty('-webkit-touch-callout', callout)
          }
          return { onElement, stop }
        }),
        ({ onElement, stop }) =>
          Effect.sync(() => {
            for (const [type, listener, capture] of onElement)
              element.removeEventListener(type, listener, capture)
            stop()
          }),
      ),
    ),
})
