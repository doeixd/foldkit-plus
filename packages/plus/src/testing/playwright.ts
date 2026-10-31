/**
 * `foldkit-plus/testing/playwright`: what a user sees, asserted on a running
 * page. A write shows before the server answers, holds still until it is
 * answered, and stays after; a step never shows a given text, at any moment;
 * the page logs no error.
 *
 * Each checks the page as drawn, over the real network: it proves that the
 * whole application (server, hydration, persistence, the Worker) delivers a
 * property. Which Message breaks a read's property is
 * `foldkit-plus/remote/testing`'s `Trace`, which records every Model without
 * a browser; reach for it once one of these fails.
 *
 * Playwright is an optional peer of `foldkit-plus`, needed only for its types:
 * this module calls nothing but the `Page` it is given.
 */
import { Duration, Option, Schema } from 'effect'
import { RemoteJsonRequest } from 'foldkit-remote'
import type { ConsoleMessage, Locator, Page, Request, Route } from 'playwright'

const decodeRequest = Schema.decodeUnknownOption(Schema.fromJsonString(RemoteJsonRequest))

/** The operation of a Remote request over HTTP, by the JSON request `Remote.http` sends. */
const remoteOperation = (request: Request): Option.Option<RemoteJsonRequest['operation']> => {
  const body = request.method() === 'POST' ? request.postData() : null
  return body === null ? Option.none() : Option.map(decodeRequest(body), sent => sent.operation)
}

const isRemoteMutation = (request: Request): boolean =>
  Option.contains(remoteOperation(request), 'mutate')

const millis = (input: Duration.Input) => Duration.toMillis(Duration.fromInputUnsafe(input))

/**
 * Resolves once three frames in a row pass with no change to the document,
 * or after two seconds of changes: a Message an answer caused has been drawn.
 */
const quiet = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>(resolve => {
        let calm = 0
        const observer = new MutationObserver(() => {
          calm = 0
        })
        const done = () => {
          observer.disconnect()
          resolve()
        }
        observer.observe(document, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        })
        setTimeout(done, 2000)
        const frame = () => {
          calm += 1
          if (calm >= 3) done()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
  )

/**
 * Writes that reach the server some way other than `Remote.http` (a port to a
 * SharedWorker, a sandbox in the page). The page holds its own answers (the
 * test opened it so), and `answered` resolves on the page's own evidence that
 * nothing it wrote is pending: an outbox emptied, a status gone.
 */
export interface PageWrites {
  readonly answered: () => Promise<unknown>
}

export interface OptimisticOptions {
  /** The user's action that writes: a click, a key. */
  readonly act: () => Promise<unknown>
  /** What the page shows once the write is made. */
  readonly shows: Locator
  /**
   * What must hold still from the moment `shows` shows until the write is
   * answered and drawn: `'put'` (the default), each element `shows` resolves
   * to; a `Locator`, what it resolves to instead (the list around a row its
   * answer deliberately draws again); `'shown'`, nothing, so only that
   * `shows` shows again after the answer.
   */
  readonly stays?: 'put' | 'shown' | Locator
  /** How the writes travel: `'http'` (the default), `Remote.http`'s requests, held at the network. */
  readonly writes?: 'http' | PageWrites
  /** How long each Remote mutation is held at the network. `'3 seconds'` unless given. */
  readonly hold?: Duration.Input
  /** How soon after `act` begins `shows` must show, while every write is held. `'1 second'` unless given. */
  readonly within?: Duration.Input
}

/** What the page script needs to keep what it watches apart from another watch's. */
interface StillWatch {
  readonly key: string
}

// Runs in the page over the elements to keep still. A node removed and put
// back in one batch reads as attached in the callback, so removals and
// `hidden` are replayed from the records; layout and visibility are sampled
// every frame, as a reader sees them. Each element reports each kind of fault once.
const watchStill = (elements: ReadonlyArray<Element>, { key }: StillWatch): number => {
  const started = performance.now()
  const where = (element: Element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + window.scrollX, y: box.top + window.scrollY }
  }
  const named = (element: Element) => {
    const html = element.outerHTML.replace(/\s+/g, ' ')
    return html.length > 80 ? `${html.slice(0, 77)}...` : html
  }
  const watched = elements.map(element => {
    const lineage = new Set<Node>()
    for (let node: Node | null = element; node !== null; node = node.parentNode) lineage.add(node)
    return { element, lineage, first: where(element), faults: new Map<string, string>() }
  })
  const fault = (each: (typeof watched)[number], kind: string, words: string) => {
    if (!each.faults.has(kind))
      each.faults.set(
        kind,
        `${named(each.element)} ${words}, ${Math.round(performance.now() - started)} ms after it showed`,
      )
  }
  const observer = new MutationObserver(records => {
    for (const record of records)
      for (const each of watched) {
        if ([...record.removedNodes].some(node => each.lineage.has(node)))
          fault(each, 'removed', 'was taken out of the page')
        if (
          record.type === 'attributes' &&
          record.attributeName === 'hidden' &&
          record.oldValue === null &&
          each.lineage.has(record.target)
        )
          fault(each, 'hidden', 'was hidden')
      }
    for (const each of watched)
      if (each.faults.has('removed') && each.element.isConnected)
        fault(each, 'moved', 'was taken out and put back')
  })
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
    attributeOldValue: true,
  })
  let frame = 0
  const sample = () => {
    for (const each of watched) {
      if (!each.element.isConnected) continue
      if (!each.element.checkVisibility({ visibilityProperty: true }))
        fault(each, 'hidden', 'was hidden')
      const now = where(each.element)
      const dx = now.x - each.first.x
      const dy = now.y - each.first.y
      const away = [
        ...(Math.abs(dx) > 1 ? [`${Math.round(Math.abs(dx))}px ${dx < 0 ? 'left' : 'right'}`] : []),
        ...(Math.abs(dy) > 1 ? [`${Math.round(Math.abs(dy))}px ${dy < 0 ? 'up' : 'down'}`] : []),
      ]
      if (away.length > 0) fault(each, 'shifted', `moved ${away.join(' and ')}`)
    }
    frame = requestAnimationFrame(sample)
  }
  sample()
  Reflect.set(window, key, () => {
    Reflect.deleteProperty(window, key)
    observer.disconnect()
    cancelAnimationFrame(frame)
    return watched.map(each => ({
      element: each.element,
      name: named(each.element),
      faults: each.faults,
    }))
  })
  return elements.length
}

/**
 * Stops the watch and lists what went wrong. `now` is what the locator
 * resolves to once settled: a watched element gone from the page while one
 * that was not watched stands there was replaced, not only removed.
 */
const stopStill = (now: ReadonlyArray<Element>, { key }: StillWatch): ReadonlyArray<string> => {
  const report: ReadonlyArray<{
    readonly element: Element
    readonly name: string
    readonly faults: ReadonlyMap<string, string>
  }> = Reflect.apply(Reflect.get(window, key), undefined, [])
  const newcomer = now.some(element => !report.some(each => each.element === element))
  return report.flatMap(each => {
    const replaced = newcomer && !each.element.isConnected
    return [
      ...[...each.faults].flatMap(([kind, words]) =>
        replaced && kind === 'removed' ? [] : [words],
      ),
      ...(replaced ? [`${each.name} was replaced by a new element`] : []),
    ]
  })
}

const stopIfWatching = ({ key }: StillWatch) => {
  const stop: unknown = Reflect.get(window, key)
  if (typeof stop === 'function') stop()
}

/**
 * The write shows before the server answers, holds still until it has been
 * answered and drawn, and still shows after.
 *
 * Every Remote mutation the page sends is held at the network for `hold`;
 * `shows` must be visible within `within` of `act` while they are held. From
 * then until settled, what `stays` names must stay in the page as the same
 * nodes, in the same place in their parent, within 1px of where they were
 * drawn, and visible. Settled is evidence, not a wait: no Remote request of
 * the page in flight (an answer can lead to more, such as a placed list's
 * first page under `verifyPredictions`), or `writes.answered`, then the page
 * quiet for three frames. An error the page logs meanwhile fails it too: a
 * `PredictionMismatch` is logged as one. Throws otherwise, and when `act`
 * sent no Remote mutation over HTTP, since nothing was then held.
 */
const optimistic = async (page: Page, options: OptimisticOptions): Promise<void> => {
  const writes = options.writes ?? 'http'
  const hold = millis(options.hold ?? '3 seconds')
  const within = millis(options.within ?? '1 second')
  if (writes === 'http' && within >= hold)
    throw new Error(
      `optimistic: within (${within} ms) must be shorter than hold (${hold} ms), ` +
        'or what shows could be the answer',
    )
  const held: Array<Promise<void>> = []
  // Every Remote request from `act` on that is not yet answered.
  const inFlight = new Set<Request>()
  const sent = (request: Request) => {
    if (Option.isSome(remoteOperation(request))) inFlight.add(request)
  }
  // How many have been answered: a quiet that began before the last answer
  // may have ended before the page drew it.
  let answers = 0
  const done = (request: Request) => {
    if (inFlight.delete(request)) answers += 1
  }
  const errors: Array<string> = []
  const logged = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  }
  const thrown = (error: Error) => errors.push(String(error))
  // Let through after `hold`. The answer is awaited apart from the handler:
  // Playwright passes a request on to the next handler only once this one returns.
  const letThrough = async (route: Route) => {
    await new Promise(resume => setTimeout(resume, hold))
    await route.fallback()
  }
  const answered = async (request: Request) => {
    const response = await request.response()
    if (response !== null) await response.finished()
  }
  const route = await page.route('**/*', (route, request) => {
    if (writes !== 'http' || !isRemoteMutation(request)) return route.fallback()
    held.push(answered(request))
    return letThrough(route)
  })
  page.on('request', sent)
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  page.on('console', logged)
  page.on('pageerror', thrown)
  const shows = String(options.shows)
  const stays = options.stays ?? 'put'
  const watched =
    stays === 'shown'
      ? Option.none<Locator>()
      : Option.some(stays === 'put' ? options.shows : stays)
  const watch: StillWatch = { key: `__foldkitStill${crypto.randomUUID().replaceAll('-', '')}` }
  try {
    const started = Date.now()
    await options.act()
    // A write is let through `hold` after it was sent, which was after `act`
    // began, so whatever shows by this deadline was drawn before any answer.
    await options.shows
      .waitFor({ state: 'visible', timeout: Math.max(1, within - (Date.now() - started)) })
      .catch((error: unknown) => {
        throw new Error(`optimistic: ${shows} did not show within ${within} ms of the action`, {
          cause: error,
        })
      })
    if (Option.isSome(watched) && (await watched.value.evaluateAll(watchStill, watch)) === 0)
      throw new Error(`optimistic: ${String(watched.value)}, what stays, matches nothing`)
    if (writes === 'http') {
      if (held.length === 0)
        throw new Error(`optimistic: ${shows} showed, but the action sent no Remote mutation`)
    } else {
      await writes.answered()
    }
    // Every held write is in flight until answered, and an answer drawn can ask
    // for more: settled once the page asks nothing and stays quiet from after
    // the last answer. The network finishes before the page reads the answer,
    // and an app draws it on a later frame.
    for (;;) {
      const before = answers
      await quiet(page)
      if (inFlight.size === 0 && answers === before) break
    }
    if (Option.isSome(watched)) {
      const faults = await watched.value.evaluateAll(stopStill, watch)
      if (faults.length > 0)
        throw new Error(
          `optimistic: ${String(watched.value)} did not hold still until the write settled:\n  ${faults.join('\n  ')}`,
        )
    }
    if (!(await options.shows.isVisible()))
      throw new Error(
        `optimistic: ${shows} showed while the write was held, but not after its answer`,
      )
    if (errors.length > 0)
      throw new Error(
        `optimistic: the page logged an error while the write settled:\n  ${errors.join('\n  ')}`,
      )
  } finally {
    // A check that failed before reading the watch leaves it sampling every frame.
    if (!page.isClosed()) await page.evaluate(stopIfWatching, watch)
    page.off('request', sent)
    page.off('requestfinished', done)
    page.off('requestfailed', done)
    page.off('console', logged)
    page.off('pageerror', thrown)
    await route.dispose()
    await Promise.allSettled(held)
  }
}

export interface NeverShowsOptions {
  /** What the page must not show at any moment of `during`. */
  readonly text: string | RegExp
  /**
   * The steps to watch: a reload, a navigation away and back. End it on what
   * the page waits for (an answer, a row), since watching stops once it ends
   * and the page is quiet.
   */
  readonly during: () => Promise<unknown>
}

/** What the page script needs: the binding to report through, and the text as a pattern. */
interface Watch {
  readonly key: string
  readonly source: string
  readonly flags: string
}

// Runs in the page, in the open document and in each one loaded after: after
// every change to the document, the rendered text (`innerText` leaves hidden
// text out) is searched, so a text shown for one frame is seen, not sampled.
const watchText = ({ key, source, flags }: Watch) => {
  if (window !== window.top) return
  const pattern = new RegExp(source, flags)
  let reported = false
  const check = () => {
    if (reported) return
    const line = (document.body?.innerText ?? '').split('\n').find(each => pattern.test(each))
    if (line === undefined) return
    reported = true
    Reflect.apply(Reflect.get(window, key), undefined, [line])
  }
  const observer = new MutationObserver(check)
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  })
  Reflect.set(window, `${key}Stop`, () => observer.disconnect())
  check()
}

const stopWatching = (key: string) =>
  Reflect.apply(Reflect.get(window, `${key}Stop`), undefined, [])

/**
 * The page never shows `text` while `during` runs, nor until the page is
 * quiet after it: a cached page revisited never reads "Loading…", even for
 * one frame. Throws with the line that showed.
 */
const neverShows = async (page: Page, options: NeverShowsOptions): Promise<void> => {
  const key = `__foldkitNeverShows${crypto.randomUUID().replaceAll('-', '')}`
  const { text } = options
  const watch: Watch =
    typeof text === 'string'
      ? { key, source: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags: '' }
      : { key, source: text.source, flags: text.flags }
  const shown: Array<string> = []
  const binding = await page.exposeBinding(key, (_, line: string) => {
    shown.push(line)
  })
  const script = await page.addInitScript(watchText, watch)
  try {
    await page.evaluate(watchText, watch)
    await options.during()
    await quiet(page)
  } finally {
    await script.dispose()
    if (!page.isClosed()) await page.evaluate(stopWatching, key)
    await binding.dispose()
  }
  if (shown.length > 0)
    throw new Error(`neverShows: the page showed ${String(text)}: "${shown[0]}"`)
}

/**
 * Collects every error the page logs (`console.error`) and every exception it
 * does not catch, from now until the page closes. Read the list at the end.
 */
const consoleErrors = (page: Page): (() => ReadonlyArray<string>) => {
  const errors: Array<string> = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(String(error)))
  return () => [...errors]
}

/** Assertions on what a running page shows, for Playwright. */
export const Behaviors = { optimistic, neverShows, consoleErrors } as const
