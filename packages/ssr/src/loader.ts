/**
 * `foldkit-ssr/loader`: a served page's entry script when the runtime's chunk
 * should not run at load. It imports only modules that import nothing, so
 * the page loads it without `effect`, Foldkit or the application.
 *
 * It follows the plan's `start`, which the server writes into the envelope:
 * `'now'` runs the chunk at once; `'idle'` fetches it at once and runs it when
 * the page is idle after load and the chunk has arrived; `'on-interaction'`
 * fetches it at once and runs it on the first intent, a pointer over or down, focus or
 * a key on an element the server marked (a binding or a kept field), or a
 * scroll. Until `SSR.hydrate` in the chunk takes over, it holds each event a
 * marker names, a form's submission prevented, and hands them over to be
 * answered from the markers once. A held event the runtime has not taken
 * `UNTIL_LIMIT_MS` after it happened is released: a submission goes to the
 * browser (`requestSubmit`), anything else is dropped. A chunk that fails to
 * load releases everything at once, and the loader holds nothing after.
 */
import { offer, type HeldEvent } from './handoff.js'
import { UNBUILT, runtimeUrl } from './runtimeUrl.js'
import {
  BINDING_ATTRIBUTE,
  FOLDKIT_APP_ATTRIBUTE,
  KEEP_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  UNTIL_LIMIT_MS,
  pathOf,
} from './marks.js'
// A type alone, which the build erases: `shared.ts` imports `effect`.
import type { Start } from './shared.js'

export interface LoaderOptions {
  /**
   * Runs the runtime's chunk: a dynamic import of the module that calls
   * `SSR.hydrate`, such as `() => import('./entry.js')`. Called once. With
   * `runtimeChunk` from `foldkit-ssr/vite` naming the same module, a build
   * also fetches the chunk as the loader starts, without running it
   * (`<link rel="modulepreload">`); without it, the chunk is fetched as it runs.
   */
  readonly runtime: () => Promise<unknown>
}

/** The events that say a person is about to use the page. */
const INTENT = ['pointerover', 'pointerdown', 'focusin', 'keydown'] as const

/** What the loader reads of the envelope: when to start, and the events the markers name. */
const envelopeOf = (
  root: Element,
): { readonly start: Start; readonly events: ReadonlyArray<string> } | undefined => {
  const carried = root.getAttribute(RESUME_ATTRIBUTE)
  if (carried === null) return undefined
  try {
    const parsed: unknown = JSON.parse(carried)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { start, events } = parsed as { readonly start?: unknown; readonly events?: unknown }
    return {
      start: start === 'idle' || start === 'on-interaction' ? start : 'now',
      events: Array.isArray(events) ? events.filter(event => typeof event === 'string') : [],
    }
  } catch {
    return undefined
  }
}

/** A held event and the deadline that releases it. */
type Holding = HeldEvent & { readonly deadline: ReturnType<typeof setTimeout> }

/** Whether the server marked `node`: a binding of any event, or a kept field. */
const marked = (node: EventTarget): boolean =>
  node instanceof Element &&
  node
    .getAttributeNames()
    .some(name => name.startsWith(BINDING_ATTRIBUTE) || name === KEEP_ATTRIBUTE)

const whenIdle = (run: () => void): void => {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run)
  else setTimeout(run, 0)
}

/** Runs `run` when the page is idle after its `load` event. */
const afterLoad = (run: () => void): void => {
  if (document.readyState === 'complete') whenIdle(run)
  else window.addEventListener('load', () => whenIdle(run), { once: true })
}

/**
 * Asks for the runtime's chunk now, without running it, and settles when it
 * has arrived or failed (a failure is the import's to report). With no built
 * address there is nothing to ask for and it settles at once.
 */
const fetchChunk = (): Promise<void> =>
  runtimeUrl === UNBUILT
    ? Promise.resolve()
    : new Promise(settle => {
        const link = document.createElement('link')
        link.rel = 'modulepreload'
        link.href = runtimeUrl
        link.addEventListener('load', () => settle(), { once: true })
        link.addEventListener('error', () => settle(), { once: true })
        document.head.append(link)
      })

/** Starts the page's runtime as its plan says, holding what it must answer until it runs. */
export const load = (options: LoaderOptions): void => {
  const root = document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  const envelope = root === null ? undefined : envelopeOf(root)
  // No served page to hold for: `SSR.hydrate` renders afresh or refuses.
  if (root === null || envelope === undefined) {
    void options.runtime()
    return
  }
  let ran = false
  // Set while a release resubmits a form, so its new submission passes.
  let releasing = false
  const held: Array<Holding> = []

  const releaseEach = (entry: HeldEvent): void => {
    const { event } = entry
    if (event.type !== 'submit' || !(event.target instanceof HTMLFormElement)) return
    const form = event.target
    if (!form.isConnected) return
    const submitter = (event as SubmitEvent).submitter
    releasing = true
    try {
      if (
        submitter !== null &&
        submitter.isConnected &&
        'form' in submitter &&
        submitter.form === form
      ) {
        form.requestSubmit(submitter as HTMLButtonElement)
      } else form.requestSubmit()
    } finally {
      releasing = false
    }
  }

  const hold = (event: Event): void => {
    if (releasing) return
    // A kept field carries what happened to it in its own state, which
    // `SSR.hydrate` reads: held as well, it would be answered twice.
    if (event.target instanceof Element && event.target.hasAttribute(KEEP_ATTRIBUTE)) return
    const path = pathOf(event)
    const name = `${BINDING_ATTRIBUTE}${event.type}`
    if (!path.some(node => node instanceof Element && node.hasAttribute(name))) return
    if (event.type === 'submit') event.preventDefault()
    const entry: Holding = {
      event,
      path,
      deadline: setTimeout(() => {
        const at = held.indexOf(entry)
        if (at === -1) return
        held.splice(at, 1)
        releaseEach(entry)
      }, UNTIL_LIMIT_MS),
    }
    held.push(entry)
    run()
  }

  const intent = (event: Event): void => {
    if (pathOf(event).some(marked)) run()
  }
  const scrolled = (): void => run()

  // Until `SSR.hydrate` takes the events or the loader lets go of them.
  const stop = (): void => {
    for (const type of envelope.events) root.removeEventListener(type, hold, true)
    for (const type of INTENT) root.removeEventListener(type, intent, true)
    window.removeEventListener('scroll', scrolled)
  }
  const releaseAll = (): void => {
    stop()
    for (const entry of held.splice(0)) {
      clearTimeout(entry.deadline)
      releaseEach(entry)
    }
  }

  function run(): void {
    if (ran) return
    ran = true
    offer({
      take: () => {
        stop()
        return held.splice(0).map(({ event, path, deadline }) => {
          clearTimeout(deadline)
          return { event, path }
        })
      },
      release: releaseAll,
    })
    options.runtime().catch(releaseAll)
  }

  for (const type of envelope.events) root.addEventListener(type, hold, true)
  if (envelope.start === 'now') {
    run()
    return
  }
  for (const type of INTENT) root.addEventListener(type, intent, true)
  if (envelope.start === 'on-interaction') {
    window.addEventListener('scroll', scrolled, { passive: true, once: true })
  }
  const fetched = fetchChunk()
  if (envelope.start === 'idle') afterLoad(() => void fetched.then(() => whenIdle(run)))
}
