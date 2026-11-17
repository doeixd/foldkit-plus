import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** What the grip's handle is marked with when the grip has no room above the node. */
export const GRIP_PLACE_ATTRIBUTE = 'grip-place'

/**
 * The top of what a person can see and reach of `element`: the lowest of the tops of the scrolling
 * ancestors and the window, each moved down by its `scroll-padding-top`, which is where an
 * application says its sticky chrome ends.
 */
const reachableTop = (element: Element): number => {
  const view = element.ownerDocument.defaultView
  if (view === null) return 0
  const padding = (style: CSSStyleDeclaration) => Number.parseFloat(style.scrollPaddingTop) || 0
  let top = padding(view.getComputedStyle(element.ownerDocument.documentElement))
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const style = view.getComputedStyle(at)
    if (/auto|scroll|overlay|hidden|clip/.test(style.overflowY))
      top = Math.max(top, at.getBoundingClientRect().top + padding(style))
  }
  return top
}

/**
 * Puts the grip inside the selected node's top edge when above it there is no room: the node's top is
 * within the grip's height of the top of what is reachable, such as under a sticky bar the page
 * declared with `scroll-padding-top`. The element it is mounted on is marked `data-grip-place="inside"`
 * then, and a look places the grip there. It watches the scroll and the box's own moves, a frame at a time.
 */
export const GripPlace = Mount.defineStream('GripPlace', {
  messages: [Schema.Never],
  args: {},
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const view = element.ownerDocument.defaultView
          let frame: number | undefined
          const place = () => {
            frame = undefined
            const grip = element.querySelector<HTMLElement>('[data-builder-handle]')
            const box = element.getBoundingClientRect()
            if (grip === null || box.width === 0) return
            const inside = box.top - grip.offsetHeight < reachableTop(element)
            if (inside) element.setAttribute(`data-${GRIP_PLACE_ATTRIBUTE}`, 'inside')
            else element.removeAttribute(`data-${GRIP_PLACE_ATTRIBUTE}`)
          }
          const soon = () => {
            if (frame === undefined && view !== null) frame = view.requestAnimationFrame(place)
          }
          // The box is placed by custom properties its canvas gets, so the canvas's `style` is watched too.
          const canvas = element.parentElement
          const observer = new MutationObserver(soon)
          if (canvas !== null)
            observer.observe(canvas, { attributes: true, attributeFilter: ['style'] })
          view?.addEventListener('scroll', soon, { capture: true, passive: true })
          view?.addEventListener('resize', soon, { passive: true })
          soon()
          return () => {
            observer.disconnect()
            view?.removeEventListener('scroll', soon, { capture: true })
            view?.removeEventListener('resize', soon)
            if (frame !== undefined) view?.cancelAnimationFrame(frame)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
