/**
 * A child's drawing kept while its Model is the same object (#431). A child
 * view is given its Model alone, so the same Model draws the same tree:
 * Foldkit's lazy slot hands the last one back, and snabbdom skips diffing it.
 */
import { createLazy, type Html, type HtmlBuilder } from 'foldkit/html'

/**
 * Set by `foldkit-ssr` while it renders a page on the server, under a
 * registered symbol so it crosses bundles (`foldkit-mixins`' Renderer reads
 * it too): a drawing kept from another pass or request would carry that
 * render's resume markers and none of this one's bindings.
 */
const SERVER_RENDER = Symbol.for('foldkit-plus.serverRender')

// How many kept drawings have started. Foldkit's lazy slot throws before it
// calls the drawing when there is no runtime frame (a test, a server's first
// pass), so a throw with this unchanged is that; one after is the drawing's.
let started = 0

/**
 * What a view's drawing also depends on besides its Model, for a view that
 * swaps its own body (`Bundle.lazy`): a kept drawing is handed back for the
 * same Model, so a body that arrives for a Model that did not change (a
 * number, a literal) would never be drawn (#511).
 */
export const drawEpochs = new WeakMap<object, () => unknown>()

/** One position's drawing of a child, kept while its Model and builder are the ones it last drew. */
export const keptDrawing = <Model>(
  draw: (model: Model, h: HtmlBuilder<any>) => Html,
  view?: object,
): ((model: Model, h: HtmlBuilder<any>) => Html) => {
  const lazy = createLazy()
  const counted = (model: Model, h: HtmlBuilder<any>, _epoch?: unknown): Html => {
    started++
    return draw(model, h)
  }
  return (model, h) => {
    if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return draw(model, h)
    const before = started
    try {
      return lazy(counted, [model, h, view === undefined ? undefined : drawEpochs.get(view)?.()])
    } catch (error) {
      if (started !== before) throw error
      return draw(model, h)
    }
  }
}
