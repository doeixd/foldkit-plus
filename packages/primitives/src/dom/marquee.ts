import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { DRAG_THRESHOLD, boxOf } from './pointer-drag.js'
import { EdgeScroll, edgeScroller } from './edge-scroll.js'
import { escapeEnds, whilePressed } from './press-session.js'

/** A rectangle in the container's content coordinates: from its padding box's top left, scrolled with it. */
export const MarqueeRect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type MarqueeRect = typeof MarqueeRect.Type

export const MarqueeStarted = Schema.TaggedStruct('MarqueeStarted', {
  /** Shift, Ctrl or Meta was held at the press: the rectangle adds to a selection. */
  additive: Schema.Boolean,
})
export type MarqueeStarted = typeof MarqueeStarted.Type

export const MarqueeChanged = Schema.TaggedStruct('MarqueeChanged', {
  rect: MarqueeRect,
  /** The ids of the marked descendants the rectangle touches, in document order. */
  ids: Schema.Array(Schema.String),
  additive: Schema.Boolean,
})
export type MarqueeChanged = typeof MarqueeChanged.Type

export const MarqueeEnded = Schema.TaggedStruct('MarqueeEnded', {
  rect: MarqueeRect,
  ids: Schema.Array(Schema.String),
  additive: Schema.Boolean,
})
export type MarqueeEnded = typeof MarqueeEnded.Type

export const MarqueeCancelled = Schema.TaggedStruct('MarqueeCancelled', {})
export type MarqueeCancelled = typeof MarqueeCancelled.Type

export type MarqueeFact = MarqueeStarted | MarqueeChanged | MarqueeEnded | MarqueeCancelled

/** What a press on one of these is the control's own, not the empty space a lasso starts from. */
const CONTROLS =
  'a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"])'

type Positioned = Event & {
  readonly clientX?: number
  readonly clientY?: number
  readonly button?: number
  readonly buttons?: number
  readonly pointerId?: number
  readonly pointerType?: string
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
}

/**
 * A lasso over an element's marked descendants, as a Mount. A press on empty
 * space (anywhere in the element that is no marked descendant, no control and
 * no scrollbar) that moves past `DRAG_THRESHOLD` starts a marquee; the
 * rectangle from the press to the pointer, in the element's content
 * coordinates, and the ids of the marked descendants it touches, are reported
 * as the pointer moves. Releasing ends it, and Escape or a cancelled pointer
 * cancels it. A touch never starts one: a finger on empty space scrolls.
 *
 * It draws nothing and selects nothing: the rectangle is for the view to draw
 * in a Slot of its own, and the ids are for the parent's `update` to select
 * (`Selection`'s `Replaced`). A press on a marked descendant is not its
 * business, so it composes with `PointerDrag` on the same element. The
 * pointer's own geometry is measured as it moves and never kept.
 */
export const Marquee = Mount.defineStream('Marquee', {
  messages: [MarqueeStarted, MarqueeChanged, MarqueeEnded, MarqueeCancelled],
  args: {
    /** The attribute that marks a descendant, holding its id. */
    attribute: Schema.String,
    /** Scroll the nearest scrolling ancestor while the pointer is held near its edge. Absent: nothing scrolls. */
    edgeScroll: Schema.optionalKey(EdgeScroll),
  },
  execute: ({ element, attribute, edgeScroll }) =>
    Stream.callback<MarqueeFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const owner = element.ownerDocument
          // A press not yet a marquee, or one under way: one pointer's, the first down.
          let pressed: {
            readonly pointer: number | undefined
            readonly x: number
            readonly y: number
            readonly additive: boolean
          } | null = null
          let started = false
          let heard: { readonly x: number; readonly y: number } | null = null
          let swallowClick = false
          let lastRect: MarqueeRect | null = null

          // Read at each press: a right-to-left container scrolls from 0 down to minus its room.
          let rtl = false
          /** The container's content origin on screen, scrolled with it: what a client point is measured from. */
          const origin = () => {
            const box = element.getBoundingClientRect()
            const fromLeft =
              element.scrollLeft + (rtl ? element.scrollWidth - element.clientWidth : 0)
            return {
              left: box.left + element.clientLeft - fromLeft,
              top: box.top + element.clientTop - element.scrollTop,
            }
          }
          const rectTo = (x: number, y: number) => {
            if (pressed === null) return null
            const { left, top } = origin()
            const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)
            const toX = clamp(x - left, element.scrollWidth)
            const toY = clamp(y - top, element.scrollHeight)
            const fromX = clamp(pressed.x, element.scrollWidth)
            const fromY = clamp(pressed.y, element.scrollHeight)
            return {
              x: Math.min(fromX, toX),
              y: Math.min(fromY, toY),
              width: Math.abs(toX - fromX),
              height: Math.abs(toY - fromY),
            }
          }
          const touching = (rect: MarqueeRect): ReadonlyArray<string> => {
            const { left, top } = origin()
            const found: Array<string> = []
            for (const marked of element.querySelectorAll(`[${attribute}]`)) {
              const id = marked.getAttribute(attribute)
              if (id === null) continue
              const box = boxOf(marked)
              const x = box.left - left
              const y = box.top - top
              if (
                x < rect.x + rect.width &&
                x + box.width > rect.x &&
                y < rect.y + rect.height &&
                y + box.height > rect.y
              )
                found.push(id)
            }
            return found
          }
          const report = () => {
            if (heard === null || pressed === null || !started) return
            const rect = rectTo(heard.x, heard.y)
            if (rect === null) return
            if (
              lastRect !== null &&
              rect.x === lastRect.x &&
              rect.y === lastRect.y &&
              rect.width === lastRect.width &&
              rect.height === lastRect.height
            )
              return
            lastRect = rect
            Queue.offerUnsafe(
              queue,
              MarqueeChanged.make({ rect, ids: touching(rect), additive: pressed.additive }),
            )
          }
          const scroller =
            edgeScroll === undefined ? undefined : edgeScroller(element, edgeScroll, report)

          const end = (ended: boolean, inside = false) => {
            scroller?.stop()
            const wasStarted = started
            const additive = pressed?.additive ?? false
            const rect = heard === null ? null : rectTo(heard.x, heard.y)
            pressed = null
            started = false
            heard = null
            lastRect = null
            release()
            if (!wasStarted) return
            swallowClick = ended && inside
            // The click comes in the release's own task, or never (a release a browser sends no click
            // for): past it, a keyboard's click on a button is no part of the drop.
            if (swallowClick) setTimeout(() => (swallowClick = false), 0)
            Queue.offerUnsafe(
              queue,
              ended && rect !== null
                ? MarqueeEnded.make({ rect, ids: touching(rect), additive })
                : MarqueeCancelled.make({}),
            )
          }
          const ours = (event: Positioned) =>
            pressed !== null &&
            (pressed.pointer === undefined || event.pointerId === pressed.pointer)

          const { listen, release } = whilePressed(owner, [
            [
              'pointermove',
              event => {
                const moved = event as Positioned
                if (!ours(moved) || pressed === null) return
                // Released where no pointerup reached us, such as over a frame.
                if (moved.buttons !== undefined && (moved.buttons & 1) === 0) return end(false)
                heard = { x: moved.clientX ?? 0, y: moved.clientY ?? 0 }
                if (!started) {
                  const { left, top } = origin()
                  if (
                    Math.hypot(heard.x - left - pressed.x, heard.y - top - pressed.y) <
                    DRAG_THRESHOLD
                  )
                    return
                  started = true
                  owner.getSelection()?.removeAllRanges()
                  Queue.offerUnsafe(queue, MarqueeStarted.make({ additive: pressed.additive }))
                }
                report()
                scroller?.move(heard.x, heard.y)
              },
            ],
            [
              'pointerup',
              event => {
                if (!ours(event as Positioned)) return
                const up = event as Positioned
                if (up.clientX !== undefined && up.clientY !== undefined)
                  heard = { x: up.clientX, y: up.clientY }
                end(true, event.target instanceof Node && element.contains(event.target))
              },
            ],
            ['pointercancel', event => ours(event as Positioned) && end(false)],
            // The browser's own text selection would extend under the lasso; removing it once is not enough.
            ['selectstart', event => event.preventDefault()],
            [
              'keydown',
              escapeEnds(
                () => pressed !== null,
                () => end(false),
              ),
              true,
            ],
          ])

          const onElement: ReadonlyArray<readonly [string, (event: Event) => void, boolean]> = [
            [
              'pointerdown',
              event => {
                const down = event as Positioned
                swallowClick = false
                if (pressed !== null || (down.button ?? 0) !== 0 || down.pointerType === 'touch')
                  return
                const target = event.target
                if (!(target instanceof Element) || !element.contains(target)) return
                const marked = target.closest(`[${attribute}]`)
                if (marked !== null && element.contains(marked)) return
                if (target.closest(CONTROLS) !== null) return
                const x = down.clientX ?? 0
                const y = down.clientY ?? 0
                const box = element.getBoundingClientRect()
                // The scrollbars sit in the element's own box, outside what its content fills, on
                // either side: a right-to-left box draws its vertical one on the left.
                const inLeft = box.left + element.clientLeft
                const inTop = box.top + element.clientTop
                if (
                  element.clientWidth > 0 &&
                  (x < inLeft ||
                    x >= inLeft + element.clientWidth ||
                    y < inTop ||
                    y >= inTop + element.clientHeight)
                )
                  return
                rtl = owner.defaultView?.getComputedStyle(element).direction === 'rtl'
                const { left, top } = origin()
                pressed = {
                  pointer: down.pointerId,
                  x: x - left,
                  y: y - top,
                  additive:
                    down.shiftKey === true || down.ctrlKey === true || down.metaKey === true,
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
          ]
          for (const [type, listener, capture] of onElement)
            element.addEventListener(type, listener, capture)
          // Ended mid-press: the document's listeners and the scroll loop must not outlive it.
          const stop = () => {
            scroller?.stop()
            release()
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
