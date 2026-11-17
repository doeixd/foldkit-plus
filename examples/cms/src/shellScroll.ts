/**
 * The studio's centre column scrolls, not the window, so `keepScroll` (which keeps the window's
 * offset) does not see it. This keeps the column's own across the studio's navigations, by the
 * same three rules: the offset is taken when the reader acts, because the next screen is drawn
 * before the address is pushed and the column is already clamped to it; a pushed entry starts at
 * the top; and Back, Forward or a reload return where the entry was, held while the screen
 * settles. On a phone the column does not scroll (its document does, which `keepScroll` keeps),
 * so there is nothing to record.
 */
import { Effect, Option, Stream } from 'effect'

const STORAGE_KEY = 'foldkit:cms-shell-scroll'
const KEPT = 50
// Longer than `keepScroll`'s: a reload waits for the demo's server to start before the screen has its height.
const PATIENCE = 10_000

const readSaved = (): Map<string, number> => {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    return new Map(
      Array.isArray(stored)
        ? stored.filter(
            (pair): pair is [string, number] =>
              Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'number',
          )
        : [],
    )
  } catch {
    return new Map()
  }
}

const column = (): HTMLElement | null => document.getElementById('studio-main')

const attach = (): (() => void) => {
  const navigation: Navigation | undefined = window.navigation
  if (navigation === undefined) return () => {}
  const saved = readSaved()
  const detaches: Array<() => void> = []
  const on = (target: EventTarget, type: string, listener: EventListener, capture?: boolean) => {
    target.addEventListener(type, listener, capture)
    detaches.push(() => target.removeEventListener(type, listener, capture))
  }
  const keyOf = () =>
    Option.fromNullOr(navigation.currentEntry).pipe(Option.map(entry => entry.key))
  const savedHere = () => Option.flatMap(keyOf(), key => Option.fromUndefinedOr(saved.get(key)))
  const remember = () => {
    const key = keyOf()
    const main = column()
    if (Option.isNone(key) || main === null) return
    saved.delete(key.value)
    saved.set(key.value, main.scrollTop)
    for (const old of saved.keys()) {
      if (saved.size <= KEPT) break
      saved.delete(old)
    }
  }

  let settling = new AbortController()
  const settle = (top: number) => {
    settling.abort()
    settling = new AbortController()
    const { signal } = settling
    for (const input of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
      window.addEventListener(input, () => settling.abort(), { passive: true, signal })
    const until = performance.now() + PATIENCE
    const step = () => {
      if (signal.aborted) return
      const main = column()
      if (main !== null) {
        const room = main.scrollHeight - main.clientHeight
        if (room >= top && Math.round(main.scrollTop) !== top)
          main.scrollTo({ top, behavior: 'instant' })
      }
      if (performance.now() < until) requestAnimationFrame(step)
      else settling.abort()
    }
    step()
  }

  for (const input of ['click', 'keydown']) on(window, input, () => remember(), true)
  on(navigation, 'navigate', event => {
    if ('navigationType' in event && event.navigationType === 'traverse') remember()
  })
  on(navigation, 'currententrychange', event => {
    const type = 'navigationType' in event ? event.navigationType : undefined
    if (type === 'push') settle(0)
    else if (type === 'traverse') settle(Option.getOrElse(savedHere(), () => 0))
  })
  // Foldkit's runtime is gone by `pagehide` and `visibilitychange`, which took this with it before
  // it could write: only `beforeunload` ran in time on a reload. The others stay for a page that
  // is put away without one (a phone's tab switch).
  const persist = () => {
    remember()
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...saved]))
    } catch {
      // Storage blocked: the next document starts at the top.
    }
  }
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
  on(window, 'pagehide', persist)
  on(window, 'beforeunload', persist)
  const here = savedHere()
  if (Option.isSome(here)) settle(here.value)
  return () => {
    settling.abort()
    for (const detach of detaches) detach()
  }
}

/** Keeps the centre column's scroll across the studio's navigations; lift with `Subscription.persistentEntry`. */
export const keepShellScroll = (): Stream.Stream<never> => {
  if (typeof window === 'undefined') return Stream.empty
  // `Stream.callback` ends, and so releases, once its setup returns: hold the scope open.
  return Stream.callback<never>(() =>
    Effect.acquireRelease(
      Effect.sync(() => attach()),
      detach => Effect.sync(detach),
    ).pipe(Effect.andThen(Effect.never)),
  )
}
