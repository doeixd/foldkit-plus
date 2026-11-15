import { Schema } from 'effect'

/**
 * Scrolling the nearest scrolling ancestor while a pointer is held near its
 * edge, so a drag or a lasso reaches what is out of view. An empty struct
 * takes the defaults.
 */
export const EdgeScroll = Schema.Struct({
  /** The width, in CSS pixels, of the strip along each edge that scrolls. Default `EDGE_BAND`. */
  edge: Schema.optionalKey(Schema.Number),
  /** Pixels per second at the very edge, less nearer the strip's inner side. Default `EDGE_SPEED`. */
  speed: Schema.optionalKey(Schema.Number),
})
export type EdgeScroll = typeof EdgeScroll.Type

export const EDGE_BAND = 40
export const EDGE_SPEED = 600

/** Under reduced motion the scroll jumps this often, by what the same time would have moved it. */
export const REDUCED_STEP_MS = 150

type Scrolling = ReturnType<typeof import('./edge-scroller.js').edgeScroller>

/**
 * `edgeScroller`, loaded when a Mount that scrolls starts rather than with the
 * Mount's module: a page whose drags never scroll keeps none of it. A pointer
 * held before it has loaded is handed to it once it has.
 */
export const edgeScrollerLater = (
  element: Element,
  options: EdgeScroll,
  onScrolled: () => void,
): Scrolling => {
  let loaded: Scrolling | undefined
  let held: { readonly x: number; readonly y: number } | undefined
  void import('./edge-scroller.js').then(({ edgeScroller }) => {
    loaded = edgeScroller(element, options, onScrolled)
    if (held !== undefined) loaded.move(held.x, held.y)
  })
  return {
    move: (x, y) => {
      held = { x, y }
      loaded?.move(x, y)
    },
    stop: () => {
      held = undefined
      loaded?.stop()
    },
  }
}
