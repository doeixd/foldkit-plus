/**
 * What the server writes into a page for the browser to read, and the one
 * limit a served page waits for. This module imports nothing, so
 * `foldkit-ssr/loader` reads the same names as the runtime without carrying
 * `effect`, Foldkit or the application.
 */

/**
 * The attribute Foldkit's server stamps on an application's root, as
 * `foldkit/experimental/server` exports it. Written out here so a page can
 * find its root without that module; a test pins the two together.
 */
export const FOLDKIT_APP_ATTRIBUTE = 'data-foldkit-app'

/**
 * The attribute on the stamped root that carries a page's resume envelope.
 * Foldkit pairs its own handoff the same way: the build id rides on the root
 * beside the app stamp, and the client reads it before adopting anything.
 */
export const RESUME_ATTRIBUTE = 'data-foldkit-plus-resume'

/** The attribute prefix of an element's binding marker. */
export const BINDING_ATTRIBUTE = 'data-foldkit-plus-on-'

/**
 * The attribute on a field whose typing before boot is kept (`KeepTyped`),
 * naming the binding whose Message replays it.
 */
export const KEEP_ATTRIBUTE = 'data-foldkit-plus-keep'

/**
 * The longest a served page waits on the runtime: for a fresh application to
 * satisfy `until`, and for the runtime's chunk to answer a press the loader
 * holds, counted from the press.
 */
export const UNTIL_LIMIT_MS = 3000

/**
 * The elements whose handlers the live page would run for an event: the
 * whole path for one that bubbles, its target alone for one that does not
 * (`focus`, `mouseenter`).
 */
export const pathOf = (event: Event): ReadonlyArray<EventTarget> =>
  event.bubbles ? event.composedPath() : event.target === null ? [] : [event.target]
