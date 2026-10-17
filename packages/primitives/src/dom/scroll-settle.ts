import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const ScrollSettled = Schema.TaggedStruct('ScrollSettled', {
  /** The item whose start lies nearest the scroller's start, from 0. */
  index: Schema.Number,
})
export type ScrollSettled = typeof ScrollSettled.Type

/** How long a scroll must be still to count as settled, where `scrollend` is missing. */
export const SETTLE_QUIET = 120

/**
 * Hears a scroller come to rest, as a Mount: after a swipe, a fling, a
 * trackpad or a scroll a Command made, it reports which of its items starts
 * nearest its own start (inside its `scroll-padding`), the start being the
 * right edge right to left. A snapping carousel reads it as the slide shown.
 *
 * At insert it first scrolls, at once, to item `start` (the Mount's args are
 * read only then, so this is where a redrawn or restored scroller begins),
 * and reports where it lies, since a scroller drawn already at rest sends no
 * `scrollend`. It listens for `scrollend` where the browser has it, and
 * otherwise for a scroll that is quiet for `SETTLE_QUIET` milliseconds.
 */
export const ScrollSettle = Mount.defineStream('ScrollSettle', {
  messages: [ScrollSettled],
  args: {
    /** Which children are the items; default every child. */
    item: Schema.optional(Schema.String),
    /** Default `inline`, the row a carousel scrolls along. */
    axis: Schema.optional(Schema.Literals(['inline', 'block'])),
    /** The item to scroll to at insert; default the first, which needs no scroll. */
    start: Schema.optional(Schema.Number),
  },
  execute: ({ element, item, axis = 'inline', start = 0 }) =>
    Stream.callback<ScrollSettled>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const items = () =>
            Array.from(
              item === undefined ? element.children : element.querySelectorAll(`:scope > ${item}`),
            )
          /** How far `child`'s start lies past the scroller's start, along the axis. */
          const offsetOf = (child: Element): number => {
            const style = getComputedStyle(element)
            const box = element.getBoundingClientRect()
            const own = child.getBoundingClientRect()
            if (axis === 'block') {
              return own.top - box.top - (parseFloat(style.scrollPaddingBlockStart) || 0)
            }
            const padding = parseFloat(style.scrollPaddingInlineStart) || 0
            return style.direction === 'rtl'
              ? box.right - padding - own.right
              : own.left - box.left - padding
          }
          const report = () => {
            let nearest = -1
            let distance = Infinity
            items().forEach((child, index) => {
              const away = Math.abs(offsetOf(child))
              if (away < distance) {
                nearest = index
                distance = away
              }
            })
            if (nearest >= 0) Queue.offerUnsafe(queue, ScrollSettled.make({ index: nearest }))
          }
          const first = items()[start]
          const before = element.scrollLeft + element.scrollTop
          if (start > 0 && first !== undefined) {
            const by = offsetOf(first)
            const rtl = axis === 'inline' && getComputedStyle(element).direction === 'rtl'
            // Positive `left` moves the content toward the start either way, so right to left
            // the way to an item's start is the other sign.
            element.scrollBy(
              axis === 'block'
                ? { top: by, behavior: 'instant' }
                : { left: rtl ? -by : by, behavior: 'instant' },
            )
          }
          // A scroll just made reports itself when it ends; one that moved nothing never ends.
          if (element.scrollLeft + element.scrollTop === before) report()
          let quiet: ReturnType<typeof setTimeout> | undefined
          const hasEnd = 'onscrollend' in element
          const listener = hasEnd
            ? report
            : () => {
                clearTimeout(quiet)
                quiet = setTimeout(report, SETTLE_QUIET)
              }
          const type = hasEnd ? 'scrollend' : 'scroll'
          element.addEventListener(type, listener)
          return () => {
            clearTimeout(quiet)
            element.removeEventListener(type, listener)
          }
        }),
        detach => Effect.sync(detach),
      ),
    ),
})
