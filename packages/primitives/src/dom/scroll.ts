/**
 * Where the window is scrolled, across an application's own navigations, as
 * a stream. Left to itself, a browser keeps the scroll of the entry it
 * leaves when a link pushes a new one, and on Back restores the old offset
 * before the application has drawn the entry it returns to, so the offset is
 * clamped to a page still loading. Here a pushed entry starts at the top,
 * and Back, Forward or a reload return where that entry was, once the page
 * is tall enough to hold it.
 *
 * Three rules, each found the slow way:
 *
 * 1. The offset is taken when the reader acts. The next screen is drawn
 *    before a Navigate Command pushes the address, so by the time the URL
 *    changes the window is already clamped to the new, shorter page. The
 *    scroll is recorded at the reader's click or key (capture phase), and at
 *    the start of Back and Forward, which begin in the browser before
 *    anything is drawn.
 * 2. A restore holds its place while the next screen settles. A restore made
 *    when the entry changes is undone by the loading state drawn right after
 *    it, so the target is held on each frame for a moment, until the reader
 *    scrolls, touches or types, or another navigation starts.
 * 3. Entries are keyed by the Navigation API's entry key, which a reload and
 *    a full navigation keep; offsets rest in `sessionStorage`, so Back into
 *    another document restores too. Where the browser has no Navigation API
 *    the stream attaches nothing and leaves the browser's own behaviour
 *    alone.
 *
 * Lift with `Subscription.persistent`; the stream sends no Messages. Only
 * the window scrolls: a nested container is the route graph's to know, when
 * `Site.transition` arrives.
 */
import { Effect, Option, Stream } from 'effect'

/** The part of the Navigation API used here: TypeScript's DOM library does not declare it yet. */
interface Navigation extends EventTarget {
  readonly currentEntry: { readonly key: string } | null
}
declare global {
  interface Window {
    readonly navigation?: Navigation
  }
}

export interface KeepScrollOptions {
  /** The `sessionStorage` key holding entry offsets. Default `'foldkit:scroll'`. */
  readonly storageKey?: string | undefined
  /** Entries remembered at most: the oldest are forgotten first. Default 50. */
  readonly kept?: number | undefined
  /**
   * How long a restore holds its place while the next screen settles, in
   * milliseconds. Default 2000.
   */
  readonly patience?: number | undefined
}

const navigationTypeOf = (event: Event): Option.Option<unknown> =>
  'navigationType' in event ? Option.some(event.navigationType) : Option.none()

const readSaved = (storageKey: string): Map<string, number> => {
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

/** Starts keeping the scroll; the release undoes everything it installed. */
const attach = (storageKey: string, kept: number, patience: number): (() => void) => {
  const navigation = window.navigation
  if (navigation === undefined) return () => {}
  const restoration = window.history.scrollRestoration
  window.history.scrollRestoration = 'manual'
  const saved = readSaved(storageKey)
  const detaches: Array<() => void> = []
  const on = (target: EventTarget, type: string, listener: EventListener, capture?: boolean) => {
    target.addEventListener(type, listener, capture)
    detaches.push(() => target.removeEventListener(type, listener, capture))
  }
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
    for (const input of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
      window.addEventListener(input, () => settling.abort(), { passive: true, signal })
    const until = performance.now() + patience
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
  const acted = () => remember()
  for (const input of ['click', 'keydown']) on(window, input, acted, true)
  const traversing = (event: Event) => {
    if (Option.contains(navigationTypeOf(event), 'traverse')) remember()
  }
  on(navigation, 'navigate', traversing)
  const changed = (event: Event) => {
    const type = navigationTypeOf(event)
    if (Option.contains(type, 'push')) settle(0)
    else if (Option.contains(type, 'traverse')) settle(Option.getOrElse(savedHere(), () => 0))
    // A replace is the same entry, narrowed or selected in place: it stays where it is.
  }
  on(navigation, 'currententrychange', changed)
  const hidden = () => {
    remember()
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...saved]))
    } catch {
      // Storage blocked: the next document starts at the top.
    }
  }
  on(window, 'pagehide', hidden)
  // A reload, or Back into this document from another: where this entry was.
  const here = savedHere()
  if (Option.isSome(here)) settle(here.value)
  return () => {
    settling.abort()
    for (const detach of detaches) detach()
    window.history.scrollRestoration = restoration
  }
}

/**
 * Keeps the window's scroll across same-document navigations: a pushed entry
 * starts at the top, and Back, Forward or a reload return where that entry
 * was. Without a window the stream is empty instead of throwing. Lift with
 * `Subscription.persistent`; the stream sends no Messages.
 */
export const keepScroll = (options: KeepScrollOptions = {}): Stream.Stream<never> => {
  if (typeof window === 'undefined') return Stream.empty
  const storageKey = options.storageKey ?? 'foldkit:scroll'
  const kept = options.kept ?? 50
  const patience = options.patience ?? 2000
  return Stream.callback<never>(() =>
    Effect.acquireRelease(
      Effect.sync(() => attach(storageKey, kept, patience)),
      detach => Effect.sync(detach),
    ),
  )
}
