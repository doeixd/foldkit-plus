/**
 * The seam between `foldkit-ssr/loader` and `SSR.hydrate`. The loader runs
 * the runtime's chunk and offers itself here; `SSR.hydrate`, in that chunk,
 * claims it. Both import this module, which imports nothing, so a build puts
 * it in one chunk and the two share its state.
 */

/** An event the loader held for the runtime, with the elements it passed as it happened. */
export interface HeldEvent {
  readonly event: Event
  readonly path: ReadonlyArray<EventTarget>
}

/** The loader that ran this chunk, as `SSR.hydrate` claims it. */
export interface Loader {
  /** Stops holding, cancels each held event's deadline, and hands the events over. */
  readonly take: () => ReadonlyArray<HeldEvent>
  /** Stops holding and releases what it held to the browser now: a page that does not resume. */
  readonly release: () => void
}

// `undefined` for no loader: this module imports nothing, `effect`'s `Option`
// included; `claim`'s caller converts it.
let offered: Loader | undefined

/** The loader, as it runs the chunk. */
export const offer = (loader: Loader): void => {
  offered = loader
}

/** `SSR.hydrate`: the loader that ran this chunk, if one did, claimed once. */
export const claim = (): Loader | undefined => {
  const loader = offered
  offered = undefined
  return loader
}
