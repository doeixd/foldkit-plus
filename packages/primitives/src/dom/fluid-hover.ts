import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** The custom properties `FluidHover` writes on its container for a highlight named `name`. */
export const fluidHovered = (name: string) =>
  ({
    x: `--fk-${name}-x`,
    y: `--fk-${name}-y`,
    w: `--fk-${name}-w`,
    h: `--fk-${name}-h`,
    /** `1` while an item is highlighted, `0` once the pointer and focus have left. */
    shown: `--fk-${name}-shown`,
    /**
     * `0` for the frame the highlight appears in, then `1`: a highlight's
     * movement scales its duration by it, so it appears on its item rather
     * than sliding in from where it last was.
     */
    moving: `--fk-${name}-moving`,
  }) as const

/** The attribute that names, inside an item, the control a press in a gap reaches. */
export const FLUID_PRESS_ATTRIBUTE = 'data-fluid-press'

const Axis = Schema.Literals(['x', 'y', 'xy'])
export type FluidAxis = typeof Axis.Type

/** How far a point is from a rectangle along each axis: zero inside it. */
const gap = (low: number, high: number, at: number) => Math.max(low - at, 0, at - high)

// On one axis the other only breaks ties, so a list's highlight never leaves
// the row level with the pointer for a nearer edge of the next column.
const away: Record<FluidAxis, (dx: number, dy: number) => number> = {
  x: (dx, dy) => dx * 1e6 + dy,
  y: (dx, dy) => dy * 1e6 + dx,
  xy: Math.hypot,
}

const distance = (rect: DOMRect, x: number, y: number, axis: FluidAxis) =>
  away[axis](gap(rect.left, rect.right, x), gap(rect.top, rect.bottom, y))

const isDisabled = (item: Element) =>
  item.matches('[aria-disabled="true"], [data-disabled]:not([data-disabled="false"]), :disabled')

/**
 * One highlight that follows the pointer across a container's items, as a
 * Mount, with no Message and no Model: which item the pointer is nearest is
 * presentation, known to the DOM and to no transition.
 *
 * The item nearest the pointer is the one highlighted, so the pointer in a gap
 * between two items still points at one, and the highlight moves from item to
 * item instead of blinking off between them. On the `y` axis nearness is read
 * vertically (a list), on `x` horizontally (a strip), on `xy` both (a grid). A
 * disabled item (`aria-disabled="true"`, `data-disabled`, `:disabled`) is never
 * highlighted. An item reached by the keyboard (`:focus-visible`) is
 * highlighted too; a touch highlights nothing, since there is no pointer to
 * follow before the press.
 *
 * The container gets `--fk-<name>-x`, `-y`, `-w` and `-h` in pixels, relative
 * to its scroll box like `Measure`'s, and `-shown` and `-moving` (see
 * `fluidHovered`); a view draws the highlight as an absolutely placed child
 * that reads them. With `gapClick`, a click in a gap presses the highlighted
 * item: its descendant marked `data-fluid-press`, or the item itself.
 */
export const FluidHover = Mount.defineStream('FluidHover', {
  messages: [Schema.Never],
  args: {
    /** The highlight's name, which names the custom properties. */
    name: Schema.String,
    /** The selector of an item within the container. */
    item: Schema.String,
    axis: Axis,
    gapClick: Schema.Boolean,
  },
  execute: ({ element, name, item: selector, axis, gapClick }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const container = element as HTMLElement
          const property = fluidHovered(name)
          let active: Element | null = null
          let pointer: { readonly x: number; readonly y: number } | null = null
          let frame: number | undefined

          const place = () => {
            if (active === null) return
            const box = container.getBoundingClientRect()
            const rect = active.getBoundingClientRect()
            const x = rect.left - box.left - container.clientLeft + container.scrollLeft
            const y = rect.top - box.top - container.clientTop + container.scrollTop
            container.style.setProperty(property.x, `${x}px`)
            container.style.setProperty(property.y, `${y}px`)
            container.style.setProperty(property.w, `${rect.width}px`)
            container.style.setProperty(property.h, `${rect.height}px`)
          }
          const show = (next: Element) => {
            const appearing = container.style.getPropertyValue(property.shown) !== '1'
            active = next
            if (appearing) container.style.setProperty(property.moving, '0')
            place()
            container.style.setProperty(property.shown, '1')
            if (appearing) {
              // The frame after: by then the jump to the item has been drawn without moving.
              requestAnimationFrame(() => container.style.setProperty(property.moving, '1'))
            }
          }
          const hide = () => {
            // `active` is kept, so the highlight fades where it was rather than at the origin.
            container.style.setProperty(property.shown, '0')
          }
          const nearest = (x: number, y: number) => {
            let best: Element | null = null
            let bestDistance = Infinity
            for (const each of Array.from(container.querySelectorAll(selector))) {
              if (isDisabled(each)) continue
              const far = distance(each.getBoundingClientRect(), x, y, axis)
              if (far < bestDistance) {
                best = each
                bestDistance = far
              }
            }
            return best
          }
          const follow = () => {
            frame = undefined
            if (pointer === null) return
            const next = nearest(pointer.x, pointer.y)
            if (next === null) hide()
            else if (next !== active || container.style.getPropertyValue(property.shown) !== '1')
              show(next)
          }

          const move = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return
            pointer = { x: event.clientX, y: event.clientY }
            if (frame === undefined) frame = requestAnimationFrame(follow)
          }
          const leave = () => {
            pointer = null
            if (!container.contains(document.activeElement)) hide()
          }
          const focus = (event: FocusEvent) => {
            if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) {
              return
            }
            const owner = event.target.closest(selector)
            if (owner !== null && container.contains(owner) && !isDisabled(owner)) show(owner)
          }
          const blur = (event: FocusEvent) => {
            const to = event.relatedTarget
            if (pointer === null && !(to instanceof Node && container.contains(to))) hide()
          }
          const click = (event: MouseEvent) => {
            if (!gapClick || active === null) return
            if (container.style.getPropertyValue(property.shown) !== '1') return
            const target = event.target
            if (!(target instanceof Element) || target.closest(selector) !== null) return
            const press = active.querySelector(`[${FLUID_PRESS_ATTRIBUTE}]`) ?? active
            if (press instanceof HTMLElement) press.click()
          }
          const soon = () => {
            if (active !== null) requestAnimationFrame(place)
          }

          // Made before anything listens: where it is missing (jsdom), the Mount
          // fails with nothing attached.
          const sizes = new ResizeObserver(soon)
          sizes.observe(container)
          container.addEventListener('pointermove', move, { passive: true })
          container.addEventListener('pointerleave', leave)
          container.addEventListener('focusin', focus)
          container.addEventListener('focusout', blur)
          container.addEventListener('click', click)
          container.addEventListener('scroll', soon, { passive: true })
          window.addEventListener('resize', soon)
          container.style.setProperty(property.shown, '0')
          return () => {
            if (frame !== undefined) cancelAnimationFrame(frame)
            sizes.disconnect()
            container.removeEventListener('pointermove', move)
            container.removeEventListener('pointerleave', leave)
            container.removeEventListener('focusin', focus)
            container.removeEventListener('focusout', blur)
            container.removeEventListener('click', click)
            container.removeEventListener('scroll', soon)
            window.removeEventListener('resize', soon)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
