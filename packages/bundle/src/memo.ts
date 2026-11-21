/**
 * A child's drawing kept while its Model is the same object (#431), or while
 * no declared write has reached its placement path (#586). A child view is
 * given its Model alone, so the same Model (or unchanged path epoch) draws the
 * same tree: Foldkit's lazy slot hands the last one back, and snabbdom skips
 * diffing it.
 */
import { createLazy, type Html, type HtmlBuilder } from 'foldkit/html'

/**
 * Set by `foldkit-ssr` while it renders a page on the server, under a
 * registered symbol so it crosses bundles (`foldkit-mixins`' Renderer reads
 * it too): a drawing kept from another pass or request would carry that
 * render's resume markers and none of this one's bindings.
 */
const SERVER_RENDER = Symbol.for('foldkit-plus.serverRender')

/**
 * What a view's drawing also depends on besides its Model, for a view that
 * swaps its own body (`Bundle.lazy`): a kept drawing is handed back for the
 * same Model, so a body that arrives for a Model that did not change (a
 * number, a literal) would never be drawn (#511).
 */
export const drawEpochs = new WeakMap<object, () => unknown>()

export interface KeptDrawingOptions {
  /**
   * Optional epoch reader driven by declared write paths (e.g. from
   * `foldkit-surface/writes`, #586). When provided, the lazy slot keys on this
   * epoch instead of raw child Model identity so structurally rebuilt slices
   * whose path was not written stay cached.
   */
  readonly pathEpoch?: (() => unknown) | undefined
}

/** One position's drawing of a child, kept while its Model (or declared path epoch) and builder are the ones it last drew. */
export const keptDrawing = <Model>(
  draw: (model: Model, h: HtmlBuilder<any>) => Html,
  view?: object,
  options?: KeptDrawingOptions,
): ((model: Model, h: HtmlBuilder<any>) => Html) => {
  const lazy = createLazy()
  // Instance-scoped so concurrent renders or nested placements never collide.
  let started = 0
  let latest: Model
  const pathEpoch = options?.pathEpoch
  const counted = (key: unknown, h: HtmlBuilder<any>, _epoch?: unknown): Html => {
    started++
    return draw(pathEpoch === undefined ? (key as Model) : latest, h)
  }
  return (model, h) => {
    if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return draw(model, h)
    latest = model
    const before = started
    try {
      const key = pathEpoch === undefined ? model : pathEpoch()
      return lazy(counted, [key, h, view === undefined ? undefined : drawEpochs.get(view)?.()])
    } catch (error) {
      if (started !== before) throw error
      return draw(model, h)
    }
  }
}
