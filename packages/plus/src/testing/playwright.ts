/**
 * `foldkit-plus/testing/playwright`: what a user sees, asserted on a running
 * page. A write shows before the server answers and stays after it; a step
 * never shows a given text, at any moment; the page logs no error.
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
import type { Locator, Page, Request, Route } from 'playwright'

const decodeRequest = Schema.decodeUnknownOption(Schema.fromJsonString(RemoteJsonRequest))

/** A Remote mutation over HTTP, by the JSON request `Remote.http` sends. */
const isRemoteMutation = (request: Request): boolean => {
  const body = request.postData()
  return (
    request.method() === 'POST' &&
    body !== null &&
    Option.exists(decodeRequest(body), sent => sent.operation === 'mutate')
  )
}

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

export interface OptimisticOptions {
  /** The user's action that writes: a click, a key. */
  readonly act: () => Promise<unknown>
  /** What the page shows once the write is made. */
  readonly shows: Locator
  /** How long each Remote mutation is held at the network. `'3 seconds'` unless given. */
  readonly hold?: Duration.Input
  /** How soon after `act` begins `shows` must show, while every write is held. `'1 second'` unless given. */
  readonly within?: Duration.Input
}

/**
 * The write shows before the server answers, and still shows once it has.
 * Every Remote mutation the page sends is held at the network for `hold`;
 * `shows` must be visible within `within` of `act` while they are held, and
 * again after every answer has landed and been drawn. Throws otherwise, and
 * when `act` sent no Remote mutation, since nothing was then held.
 */
const optimistic = async (page: Page, options: OptimisticOptions): Promise<void> => {
  const hold = millis(options.hold ?? '3 seconds')
  const within = millis(options.within ?? '1 second')
  if (within >= hold)
    throw new Error(
      `optimistic: within (${within} ms) must be shorter than hold (${hold} ms), ` +
        'or what shows could be the answer',
    )
  const held: Array<Promise<void>> = []
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
    if (!isRemoteMutation(request)) return route.fallback()
    held.push(answered(request))
    return letThrough(route)
  })
  const shows = String(options.shows)
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
    if (held.length === 0)
      throw new Error(`optimistic: ${shows} showed, but the action sent no Remote mutation`)
    await Promise.all(held)
    await quiet(page)
    if (!(await options.shows.isVisible()))
      throw new Error(
        `optimistic: ${shows} showed while the write was held, but not after its answer`,
      )
  } finally {
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
