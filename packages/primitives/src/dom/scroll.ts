/**
 * Where the window, or one scrolling element, is scrolled, across an
 * application's own navigations, as a stream. Left to itself, a browser keeps
 * the scroll of the entry it leaves when a link pushes a new one, and on Back
 * restores the old offset before the application has drawn the entry it
 * returns to, so the offset is clamped to a page still loading. Here a pushed
 * entry starts at the top, and Back, Forward or a reload return where that
 * entry was, once the page is tall enough to hold it.
 *
 * Four rules, each found the slow way:
 *
 * 1. The offset is taken when the reader acts. The next screen is drawn
 *    before a Navigate Command pushes the address, so by the time the URL
 *    changes the scroller is already clamped to the new, shorter page. The
 *    scroll is recorded at the reader's click or key (capture phase), and at
 *    the start of Back and Forward, which begin in the browser before
 *    anything is drawn.
 * 2. A restore holds its place while the next screen settles. A restore made
 *    when the entry changes is undone by the loading state drawn right after
 *    it, so the target is applied on each frame once the page can hold it,
 *    and the hold ends when the page's height has stood still for two frames
 *    (or the reader scrolls, touches or types, or another navigation starts,
 *    or `patience` runs out, which is only a ceiling).
 * 3. Entries are keyed by the Navigation API's entry key, which a reload and
 *    a full navigation keep; offsets rest in `sessionStorage`, so Back into
 *    another document restores too. They are written when the reader acts
 *    and again as the page is left: at `beforeunload` (the one that runs on
 *    a desktop reload before the runtime holding this stream is torn down:
 *    Foldkit disposes it at `pagehide`), and at `visibilitychange` to hidden
 *    and `pagehide`, which cover a page put away without `beforeunload` (a
 *    phone's tab switch, a page kept for Back and Forward). There is no
 *    `unload` handler: it makes a page ineligible for the back/forward
 *    cache. Where the browser has no Navigation API the stream attaches
 *    nothing and leaves the browser's own behaviour alone.
 * 4. One mechanism for any scroller. `scroller` names the element that
 *    scrolls in place of the window, such as an application shell's centre
 *    column; it is looked up each time, since the application draws it.
 *
 * Lift with `Subscription.persistentEntry`; the stream sends no Messages.
 */
import { Effect, Option, Stream } from 'effect'

/** How `keepScroll` remembers and restores each history entry's offset. */
export interface KeepScrollOptions {
  /** The `sessionStorage` key holding entry offsets. Default `'foldkit:scroll'`. */
  readonly storageKey?: string | undefined
  /** Entries remembered at most: the oldest are forgotten first. Default 50. */
  readonly kept?: number | undefined
  /**
   * The longest a restore holds its place while the next screen settles, in
   * milliseconds: the hold ends sooner, once the page is at the offset and
   * its height has stood still for two frames. Default 10000.
   */
  readonly patience?: number | undefined
  /**
   * The element that scrolls in place of the window, looked up each time it
   * is read (`null` while it is not drawn). Default: the window.
   */
  readonly scroller?: (() => Element | null) | undefined
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

interface Measure {
  readonly top: number
  readonly height: number
  readonly view: number
}

/** Starts keeping the scroll; the release undoes everything it installed. */
const attach = (
  storageKey: string,
  kept: number,
  patience: number,
  scroller: (() => Element | null) | undefined,
): (() => void) => {
  // TypeScript's DOM library declares it on every window; a browser without
  // the Navigation API has none.
  const navigation: Navigation | undefined = window.navigation
  if (navigation === undefined) return () => {}
  const restoration = window.history.scrollRestoration
  window.history.scrollRestoration = 'manual'
  const saved = readSaved(storageKey)
  const detaches: Array<() => void> = []
  const on = (target: EventTarget, type: string, listener: EventListener, capture?: boolean) => {
    target.addEventListener(type, listener, capture)
    detaches.push(() => target.removeEventListener(type, listener, capture))
  }
  /** What the scroller reads now; none while an element scroller is not drawn. */
  const measure = (): Option.Option<Measure> => {
    if (scroller === undefined)
      return Option.some({
        top: window.scrollY,
        height: document.documentElement.scrollHeight,
        view: window.innerHeight,
      })
    return Option.fromNullOr(scroller()).pipe(
      Option.map(element => ({
        top: element.scrollTop,
        height: element.scrollHeight,
        view: element.clientHeight,
      })),
    )
  }
  const scrollTo = (top: number) => {
    if (scroller === undefined) window.scrollTo({ top, behavior: 'instant' })
    else scroller()?.scrollTo({ top, behavior: 'instant' })
  }
  const keyOf = () =>
    Option.fromNullOr(navigation.currentEntry).pipe(Option.map(entry => entry.key))
  /** Where the current entry was left, if it has been. */
  const savedHere = () => Option.flatMap(keyOf(), key => Option.fromUndefinedOr(saved.get(key)))
  const remember = () => {
    const key = keyOf()
    const now = measure()
    if (Option.isNone(key) || Option.isNone(now)) return
    // Moved to the end, so it is the last to be forgotten.
    saved.delete(key.value)
    saved.set(key.value, now.value.top)
    for (const old of saved.keys()) {
      if (saved.size <= kept) break
      saved.delete(old)
    }
  }

  let settling = new AbortController()
  /**
   * Holds the scroller at `top` while the next screen settles: applied each
   * frame once the page can hold it, ended when its height has stood still for
   * two frames, the reader scrolls, touches or types, another navigation
   * starts, or `patience` runs out.
   */
  const settle = (top: number) => {
    settling.abort()
    settling = new AbortController()
    const { signal } = settling
    for (const input of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
      window.addEventListener(input, () => settling.abort(), { passive: true, signal })
    const until = performance.now() + patience
    let height = -1
    let still = 0
    const step = () => {
      if (signal.aborted) return
      const now = measure()
      if (Option.isSome(now) && now.value.height - now.value.view >= top) {
        if (Math.round(now.value.top) !== top) scrollTo(top)
        still = now.value.height === height ? still + 1 : 0
        height = now.value.height
        if (still >= 2) {
          settling.abort()
          return
        }
      } else still = 0
      if (performance.now() < until) requestAnimationFrame(step)
      else settling.abort()
    }
    step()
  }

  // Remembered where the reader acts, before the application does: by the time
  // it pushes an address it has drawn the next screen, and the scroller is
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
  const persist = () => {
    remember()
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...saved]))
    } catch {
      // Storage blocked: the next document starts at the top.
    }
  }
  on(window, 'beforeunload', persist)
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
  on(window, 'pagehide', persist)
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
 * Keeps the window's scroll (or `scroller`'s) across same-document
 * navigations: a pushed entry starts at the top, and Back, Forward or a
 * reload return where that entry was. Without a window the stream is empty
 * instead of throwing. Lift with `Subscription.persistentEntry`; the stream
 * sends no Messages.
 */
export const keepScroll = (options: KeepScrollOptions = {}): Stream.Stream<never> => {
  if (typeof window === 'undefined') return Stream.empty
  const storageKey = options.storageKey ?? 'foldkit:scroll'
  const kept = options.kept ?? 50
  const patience = options.patience ?? 10_000
  const scroller = options.scroller
  return Stream.callback<never>(() =>
    Effect.acquireRelease(
      Effect.sync(() => attach(storageKey, kept, patience, scroller)),
      detach => Effect.sync(detach),
    ),
  )
}
