/**
 * Where the window is scrolled, across the studio's and the site's own
 * navigations. Left to itself, a browser keeps the scroll of the entry it
 * leaves when a link pushes a new one, and on Back restores the old offset
 * before Foldkit has drawn the entry it returns to, so the offset is clamped to
 * a page still loading. Here a pushed entry starts at the top, and Back,
 * Forward or a reload return where that entry was, once the page is tall
 * enough to hold it.
 *
 * It keys each offset by the Navigation API's entry key, which a reload and a
 * full navigation keep; where the browser has no Navigation API it leaves the
 * browser's own behaviour alone.
 */
import { Option } from 'effect'

/** The part of the Navigation API used here: TypeScript's DOM library does not declare it yet. */
interface Navigation extends EventTarget {
  readonly currentEntry: { readonly key: string } | null
}
declare global {
  interface Window {
    readonly navigation?: Navigation
  }
}

const storageKey = 'cms:scroll'
/** Entries remembered at most: the oldest are forgotten first. */
const kept = 50
/**
 * How long a restore holds its place while the next screen settles. The
 * entry changes before Foldkit draws it, and it may draw a short loading state
 * before its content, which clamps the window; a restore made once, at the
 * change, was undone by the draw after it.
 */
const patience = 2000

const navigationTypeOf = (event: Event): Option.Option<unknown> =>
  'navigationType' in event ? Option.some(event.navigationType) : Option.none()

const readSaved = (): Map<string, number> => {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')
    return new Map(
      Array.isArray(stored)
        ? stored.filter(
            (pair): pair is [string, number] =>
              Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'number',
          )
        : [],
    )
  } catch {
    // Storage blocked, or something else wrote the key: nothing is remembered.
    return new Map()
  }
}

export const keepScroll = (): void => {
  const navigation = window.navigation
  if (navigation === undefined) return
  window.history.scrollRestoration = 'manual'
  const saved = readSaved()
  const keyOf = () =>
    Option.fromNullOr(navigation.currentEntry).pipe(Option.map(entry => entry.key))
  /** Where the current entry was left, if it has been. */
  const savedHere = () => Option.flatMap(keyOf(), key => Option.fromUndefinedOr(saved.get(key)))
  const remember = () => {
    const key = keyOf()
    if (Option.isNone(key)) return
    // Moved to the end, so it is the last to be forgotten.
    saved.delete(key.value)
    saved.set(key.value, window.scrollY)
    for (const old of saved.keys()) {
      if (saved.size <= kept) break
      saved.delete(old)
    }
  }

  let settling = new AbortController()
  /**
   * Holds the window at `top` while the next screen settles, whenever the page
   * can hold it, until the reader scrolls, touches or types, or another
   * navigation starts.
   */
  const settle = (top: number) => {
    settling.abort()
    settling = new AbortController()
    const { signal } = settling
    const until = performance.now() + patience
    for (const input of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
      window.addEventListener(input, () => settling.abort(), { passive: true, signal })
    const step = () => {
      if (signal.aborted) return
      const room = document.documentElement.scrollHeight - window.innerHeight
      if (room >= top && Math.round(window.scrollY) !== top)
        window.scrollTo({ top, behavior: 'instant' })
      if (performance.now() < until) requestAnimationFrame(step)
      else settling.abort()
    }
    step()
  }

  // Remembered where the reader acts, before the application does: by the time
  // it pushes an address it has drawn the next screen, and the window is
  // already clamped to it. Back and Forward start in the browser, before
  // anything is drawn, so they are remembered as they begin.
  for (const input of ['click', 'keydown'])
    window.addEventListener(input, remember, { capture: true, passive: true })
  navigation.addEventListener('navigate', event => {
    if (Option.contains(navigationTypeOf(event), 'traverse')) remember()
  })
  navigation.addEventListener('currententrychange', event => {
    const type = navigationTypeOf(event)
    if (Option.contains(type, 'push')) settle(0)
    else if (Option.contains(type, 'traverse')) settle(Option.getOrElse(savedHere(), () => 0))
    // A replace is the same entry, narrowed or selected in place: it stays where it is.
  })
  window.addEventListener('pagehide', () => {
    remember()
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...saved]))
    } catch {
      // Storage blocked: the next document starts at the top.
    }
  })
  // A reload, or Back into this document from another: where this entry was.
  const here = savedHere()
  if (Option.isSome(here)) settle(here.value)
}
