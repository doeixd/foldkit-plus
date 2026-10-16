import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/**
 * The attribute that marks a bar beside a scroller `ScrollBars` runs on, set
 * to the axis it shows: `block` (the up-and-down bar) or `inline`.
 */
export const SCROLL_BAR_ATTRIBUTE = 'data-scroll-bar'

/**
 * The attribute `ScrollBars` sets on its scroller while it draws the bars, so a
 * style hides the native bar only then: with no Mount running (a coarse
 * pointer, a page not yet hydrated) the browser's bar stays.
 */
export const SCROLL_OVERLAID_ATTRIBUTE = 'data-scroll-overlaid'

/**
 * The custom properties `ScrollBars` writes on each bar, in pixels, for its
 * thumb to read: how far along the bar the thumb starts, and how long it is.
 * Physical: an inline bar's offset is from its left edge in either direction.
 */
export const scrollThumb = {
  offset: '--fk-scroll-thumb-offset',
  size: '--fk-scroll-thumb-size',
} as const

/** The shortest a thumb is drawn, however long the content, so it stays a target. */
const SHORTEST = 20

const FINE_POINTER = '(hover: hover) and (pointer: fine)'

type Axis = 'block' | 'inline'

/**
 * An overlay scrollbar as a Mount, with no Message and no Model: where a
 * scroller is scrolled is the browser's, and the bar only shows it.
 *
 * It runs on the scroller (or on an element holding it, named by `scroller`,
 * when the scroller carries another Mount) and drives the bars drawn beside
 * it: the scroller's parent's children marked `data-scroll-bar` (`block` or
 * `inline`), which a style lays over the scroller's edge. Each bar gets `data-scrollable` while its axis has
 * more to scroll, `data-shown` while the scroller scrolls or the pointer moves
 * over it, until `idle` milliseconds pass with neither (or longer, while the
 * pointer rests on a bar), and `data-dragging` while its thumb is dragged; and
 * `--fk-scroll-thumb-offset` and `-size` (see `scrollThumb`). Pressing a bar
 * off its thumb moves the thumb there, then drags it.
 *
 * It does nothing where the primary pointer is coarse or cannot hover, decided
 * when it mounts: touch keeps the browser's bar and its physics. Otherwise the
 * scroller gets `data-scroll-overlaid`, for a style to hide the native bar.
 * How the bar looks, rests, widens and fades is the style's.
 */
export const ScrollBars = Mount.defineStream('ScrollBars', {
  messages: [Schema.Never],
  args: {
    /** How long, in milliseconds, the bars stay after the last scroll or move. Default 600. */
    idle: Schema.optional(Schema.Number),
    /**
     * The scroller, as a selector within the element, when it cannot hold this
     * Mount itself (another component's, with a Mount of its own); looked for
     * once, when it mounts. Default: the element is the scroller.
     */
    scroller: Schema.optional(Schema.String),
  },
  execute: ({ element, idle = 600, scroller: within }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (typeof matchMedia !== 'function' || !matchMedia(FINE_POINTER).matches) {
            return () => {}
          }
          const found = within === undefined ? element : element.querySelector(within)
          if (!(found instanceof HTMLElement)) return () => {}
          const scroller = found
          const area = scroller.parentElement
          if (area === null) return () => {}

          const isBar = (child: Element): child is HTMLElement =>
            child instanceof HTMLElement && child.hasAttribute(SCROLL_BAR_ATTRIBUTE)
          /** Looked for at each use, so a redraw that replaced a bar is followed. */
          const bars = () => Array.from(area.children).filter(isBar)
          const axisOf = (bar: HTMLElement): Axis =>
            bar.getAttribute(SCROLL_BAR_ATTRIBUTE) === 'inline' ? 'inline' : 'block'

          /** The scroller along one axis, with the start measured from the top or the left. */
          const extent = (axis: Axis) => {
            if (axis === 'block') {
              return {
                view: scroller.clientHeight,
                content: scroller.scrollHeight,
                start: scroller.scrollTop,
              }
            }
            const room = scroller.scrollWidth - scroller.clientWidth
            // A right-to-left scroller counts from 0 at the right down to minus its room.
            const rtl = getComputedStyle(scroller).direction === 'rtl'
            return {
              view: scroller.clientWidth,
              content: scroller.scrollWidth,
              start: rtl ? room + scroller.scrollLeft : scroller.scrollLeft,
            }
          }
          const scrollTo = (axis: Axis, start: number) => {
            if (axis === 'block') {
              scroller.scrollTop = start
              return
            }
            const room = scroller.scrollWidth - scroller.clientWidth
            const rtl = getComputedStyle(scroller).direction === 'rtl'
            scroller.scrollLeft = rtl ? start - room : start
          }
          const trackOf = (bar: HTMLElement, axis: Axis) =>
            axis === 'block' ? bar.clientHeight : bar.clientWidth
          /** Where the thumb is along its bar, or nothing while the axis has nothing to scroll. */
          const thumbOf = (bar: HTMLElement, axis: Axis) => {
            const { view, content, start } = extent(axis)
            const track = trackOf(bar, axis)
            if (content - view < 1 || track <= 0) return null
            const size = Math.min(track, Math.max(SHORTEST, (track * view) / content))
            const offset = ((track - size) * start) / (content - view)
            return { track, size, offset, room: content - view }
          }
          const set = (bar: HTMLElement, name: string, value: string) => {
            if (bar.style.getPropertyValue(name) !== value) bar.style.setProperty(name, value)
          }
          const mark = (bar: HTMLElement, name: string, on: boolean) => {
            if (bar.hasAttribute(name) !== on) bar.toggleAttribute(name, on)
          }

          let frame: number | undefined
          const update = () => {
            if (frame !== undefined) cancelAnimationFrame(frame)
            frame = undefined
            for (const bar of bars()) {
              const axis = axisOf(bar)
              const { view, content } = extent(axis)
              // Marked first: a style draws no bar until it is, so it has no length before.
              mark(bar, 'data-scrollable', content - view >= 1)
              const thumb = thumbOf(bar, axis)
              if (thumb === null) continue
              set(bar, scrollThumb.offset, `${thumb.offset}px`)
              set(bar, scrollThumb.size, `${thumb.size}px`)
            }
          }
          const soon = () => {
            if (frame === undefined) frame = requestAnimationFrame(update)
          }

          let hiding: ReturnType<typeof setTimeout> | undefined
          let resting: HTMLElement | null = null
          /** Ends the drag under way, if one is. */
          let dragging: (() => void) | null = null
          const hide = () => {
            hiding = undefined
            // A bar the pointer rests on, or one being dragged, stays until it is left.
            if (resting !== null || dragging !== null) return
            for (const bar of bars()) mark(bar, 'data-shown', false)
          }
          const show = () => {
            for (const bar of bars()) mark(bar, 'data-shown', true)
            if (hiding !== undefined) clearTimeout(hiding)
            hiding = setTimeout(hide, idle)
          }

          const scrolled = () => {
            update()
            show()
          }
          // Listened to only while the pointer is over the area.
          const moved = (event: PointerEvent) => {
            if (event.pointerType !== 'touch') show()
          }
          const entered = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return
            area.addEventListener('pointermove', moved, { passive: true })
            show()
          }
          const left = () => {
            area.removeEventListener('pointermove', moved)
            resting = null
            // A hide that came while the pointer rested on a bar waited for this.
            if (hiding === undefined) hiding = setTimeout(hide, idle)
          }
          const over = (event: PointerEvent) => {
            const target = event.target
            resting =
              target instanceof Element ? (bars().find(bar => bar.contains(target)) ?? null) : null
          }

          const pressed = (event: PointerEvent) => {
            if (event.button !== 0 || event.pointerType === 'touch' || dragging !== null) return
            const target = event.target
            if (!(target instanceof Element)) return
            const bar = bars().find(each => each.contains(target))
            if (bar === undefined) return
            const axis = axisOf(bar)
            const thumb = thumbOf(bar, axis)
            if (thumb === null) return
            // The bar takes the press: no text selected, no focus moved off the scroller.
            event.preventDefault()
            const along = (at: PointerEvent) => {
              const box = bar.getBoundingClientRect()
              return axis === 'block'
                ? at.clientY - box.top - bar.clientTop
                : at.clientX - box.left - bar.clientLeft
            }
            const at = along(event)
            const onThumb = at >= thumb.offset && at <= thumb.offset + thumb.size
            // Held where it was taken, or by its middle when the press jumped it there.
            const grab = onThumb ? at - thumb.offset : thumb.size / 2
            const follow = (to: PointerEvent) => {
              const current = thumbOf(bar, axis)
              if (current === null) return
              const offset = Math.min(Math.max(along(to) - grab, 0), current.track - current.size)
              scrollTo(axis, (offset / (current.track - current.size)) * current.room)
            }
            const id = event.pointerId
            const move = (to: PointerEvent) => {
              if (to.pointerId === id) follow(to)
            }
            const end = (to: PointerEvent) => {
              if (to.pointerId === id) stop()
            }
            // On the document, for the drag alone: the pointer leaves the bar as it drags.
            const owner = bar.ownerDocument
            const stop = () => {
              owner.removeEventListener('pointermove', move)
              owner.removeEventListener('pointerup', end)
              owner.removeEventListener('pointercancel', end)
              mark(bar, 'data-dragging', false)
              dragging = null
              show()
            }
            owner.addEventListener('pointermove', move)
            owner.addEventListener('pointerup', end)
            owner.addEventListener('pointercancel', end)
            mark(bar, 'data-dragging', true)
            dragging = stop
            show()
            if (!onThumb) follow(event)
          }

          // Both made before anything observes: where one is missing, the Mount
          // fails with nothing attached.
          const sizes = new ResizeObserver(soon)
          // The content's size moves the thumb as much as the scroller's, so each
          // child of the scroller is watched, and each bar for its track. Only what
          // a change added or removed is watched or let go: a virtual list swaps
          // a row or two each frame it scrolls, out of many.
          const changes = new MutationObserver(records => {
            for (const record of records) {
              for (const node of Array.from(record.removedNodes)) {
                if (node instanceof Element) sizes.unobserve(node)
              }
              for (const node of Array.from(record.addedNodes)) {
                if (node instanceof Element && (record.target === scroller || isBar(node))) {
                  sizes.observe(node)
                }
              }
            }
            soon()
          })
          sizes.observe(scroller)
          for (const child of Array.from(scroller.children)) sizes.observe(child)
          for (const bar of bars()) sizes.observe(bar)
          changes.observe(scroller, { childList: true })
          changes.observe(area, { childList: true })
          scroller.addEventListener('scroll', scrolled, { passive: true })
          area.addEventListener('pointerenter', entered)
          area.addEventListener('pointerleave', left)
          area.addEventListener('pointerover', over)
          area.addEventListener('pointerdown', pressed)
          scroller.setAttribute(SCROLL_OVERLAID_ATTRIBUTE, '')
          update()
          return () => {
            // Ended first: ending a drag shows the bars, which sets a hide to clear.
            dragging?.()
            if (frame !== undefined) cancelAnimationFrame(frame)
            if (hiding !== undefined) clearTimeout(hiding)
            sizes.disconnect()
            changes.disconnect()
            scroller.removeEventListener('scroll', scrolled)
            area.removeEventListener('pointerenter', entered)
            area.removeEventListener('pointerleave', left)
            area.removeEventListener('pointerover', over)
            area.removeEventListener('pointerdown', pressed)
            area.removeEventListener('pointermove', moved)
            scroller.removeAttribute(SCROLL_OVERLAID_ATTRIBUTE)
            for (const bar of bars()) {
              for (const name of ['data-scrollable', 'data-shown', 'data-dragging'])
                bar.removeAttribute(name)
              bar.style.removeProperty(scrollThumb.offset)
              bar.style.removeProperty(scrollThumb.size)
            }
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
