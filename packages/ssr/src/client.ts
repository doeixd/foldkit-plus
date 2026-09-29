/**
 * `foldkit-ssr/client`: what a browser page needs to take a server render
 * over, and nothing that renders one. It never imports
 * `foldkit/experimental/server`, whose renderer and HTML parser a hydrating
 * page would otherwise carry; `foldkit-ssr` is this and the server side.
 */
import { Effect, Result, Schema, Stream } from 'effect'
import { hydrate as adopt, makeApplication, run } from 'foldkit/runtime'
import * as Render from 'foldkit/render'
import { withContext, type RenderContext } from './context.js'
import { listen, type DecodedBinding } from './listen.js'
import { builder, view } from './resumable.js'
import {
  FOLDKIT_APP_ATTRIBUTE,
  STATIC_ATTRIBUTE,
  bindings,
  bindingsAndEvents,
  metaEntry,
  plan,
  resume,
  routeOf,
  serving,
  startingFrom,
  staticRegion,
  type Loadable,
  type ResumableConfig,
  type ResumePlan,
  type Start,
} from './shared.js'

/** Foldkit's root stamp, defined beside the envelope that rides on the same root. */
export { FOLDKIT_APP_ATTRIBUTE } from './shared.js'

/** Each static region's markup in the page, read before hydration touches it. */
const snapshotsOf = (root: Element): ReadonlyMap<string, string> =>
  new Map(
    Array.from(root.querySelectorAll(`[${STATIC_ATTRIBUTE}]`), element => [
      element.getAttribute(STATIC_ATTRIBUTE) ?? '',
      element.innerHTML,
    ]),
  )

/**
 * The build attribute on Foldkit's hydration root. Foldkit does not export it,
 * as it does the app and Flags attributes; a test pins it to what Foldkit's
 * server stamps.
 */
const BUILD_ATTRIBUTE = 'data-foldkit-build'

/**
 * Starts the browser from the page's resumed Model, without running `init`.
 *
 * In the order Foldkit checks a page: the build id first, before the payload
 * is read, then the envelope and its route. A page from another build is
 * refused by Foldkit itself. A page that cannot resume is refused and contained
 * by Foldkit's own refusal, and the reason is logged. A server page is never
 * rendered again on the client. A page with no server render at all, no
 * stamped root, is rendered on the client as usual.
 */
const hydrate = <Model, Fields extends Schema.Struct.Fields, Message = any>(
  config: ResumableConfig<Model, Message>,
  plan: ResumePlan<Model, Fields>,
  options: { readonly buildId: string },
): void => {
  const planMeta = plan.meta
  if (planMeta !== undefined) {
    config = {
      ...config,
      subscriptions: { ...config.subscriptions, 'foldkit-ssr.meta': metaEntry(planMeta) },
    }
  }
  const root = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  if (root === null) {
    run(makeApplication(config as never))
    return
  }
  const program = (start: { readonly model: Model; readonly commands?: ReadonlyArray<unknown> }) =>
    makeApplication({ ...startingFrom(config, start), container: root } as never)
  if (root.getAttribute(BUILD_ATTRIBUTE) !== options.buildId) {
    adopt(program({ model: plan.baseline }), { buildId: options.buildId })
    return
  }
  const resumed = resume(plan, document, { route: routeOf(window.location.href) })
  if (Result.isFailure(resumed)) {
    console.error(`[foldkit-ssr] the page cannot resume: ${resumed.failure.message}`)
    // Foldkit refuses an empty build id and contains the page, so the page is
    // refused the way Foldkit refuses one, with nothing copied here.
    adopt(program({ model: plan.baseline }), { buildId: '' })
    return
  }
  const model = resumed.success
  const commands = (plan.boot?.(model) as ReadonlyArray<unknown> | undefined) ?? []
  const resuming: RenderContext = {
    mode: 'resume',
    snapshots: snapshotsOf(root),
    reported: new Set(),
  }
  // The runtime starts from the resumed Model, so its first render is the
  // served markup and Foldkit adopts every node. The Messages the page
  // answered before the live page listened wait in `answered`, and the first
  // Message the runtime processes, whatever it is, runs them through `update`
  // ahead of itself: they reach the Model before anything the live page
  // answers, an event dispatched in the task that boots it included.
  const answered: Array<unknown> = []
  // Each answered Message was decoded through the plan's Message Schema.
  const apply: ResumableConfig<Model>['update'] = config.update
  const update = (current: Model, message: unknown) => {
    const handingOver = message === HANDOVER
    if (answered.length === 0) return handingOver ? { model: current } : apply(current, message)
    const returned: Array<unknown> = []
    for (const next of [...answered.splice(0), ...(handingOver ? [] : [message])]) {
      const step = apply(current, next) as {
        readonly model: Model
        readonly commands?: ReadonlyArray<unknown> | undefined
      }
      current = step.model
      returned.push(...(step.commands ?? []))
    }
    return { model: current, commands: returned }
  }
  const boot = (entries: Readonly<Record<string, unknown>> = {}) =>
    adopt(
      makeApplication({
        ...withContext(startingFrom({ ...config, update }, { model, commands }), resuming),
        container: root,
        subscriptions: { ...config.subscriptions, ...entries },
      } as never),
      { buildId: options.buildId },
    )
  const pending = (config.lazy ?? []).filter(bundle => !bundle.isLoaded())
  if (plan.start === 'now' && pending.length === 0) {
    boot()
    return
  }
  const decoded = bindingsAndEvents(plan, document, root, model)
  if (Result.isFailure(decoded)) {
    console.error(`[foldkit-ssr] the page cannot resume: ${decoded.failure.message}`)
    adopt(program({ model: plan.baseline }), { buildId: '' })
    return
  }
  deferBoot(root, decoded.success, plan.start, { boot, answered }, pending)
}

/**
 * The Message the handover entry sends so the runtime takes the answered
 * Messages when nothing else has asked it to. The wrapped `update` consumes
 * it; the application never sees it.
 */
const HANDOVER: unknown = Object.freeze({ _tag: 'foldkit-ssr/Handover' })

/**
 * Lets the page answer from its bindings until something asks for the
 * runtime, then boots it and hands over to the live page.
 *
 * Every Message the page answers goes to `answered`, which the runtime takes
 * before its first Message. An event only the live page can answer is kept
 * and sent again to where it first went once the live page listens. The page
 * stops listening as soon as the runtime's first render has committed: when
 * `hydrate` returns, which Foldkit does today, or else when a handover
 * Subscription entry starts, after `Render.afterCommit`. When lazy bundles
 * must load first, the boot waits for them and the page keeps answering.
 */
const deferBoot = (
  root: HTMLElement,
  decoded: {
    readonly bindings: ReadonlyArray<DecodedBinding>
    readonly events: ReadonlyArray<string> | undefined
  },
  start: Start,
  runtime: {
    readonly boot: (entries: Readonly<Record<string, unknown>>) => void
    readonly answered: Array<unknown>
  },
  pending: ReadonlyArray<Loadable>,
): void => {
  // Events only the live page can answer, met before it listened.
  const unanswered: Array<{ readonly event: Event; readonly element: Element }> = []
  // `waiting` for an interaction or idle, `loading` bodies, `starting` the
  // runtime until its first render commits, then `live`.
  let phase: 'waiting' | 'loading' | 'starting' | 'live' = 'waiting'
  const stop = listen(root, {
    bindings: decoded.bindings,
    ...(decoded.events === undefined ? {} : { events: decoded.events }),
    onAnswer: ({ event, messages, unnamed }) => {
      // An answer the markers could not complete is left to the live page.
      if (unnamed !== undefined) {
        startNow()
        // Once the live page listens, this event reaches it in the rest of
        // its own dispatch; until then it is kept for the handover.
        if (phase !== 'live' && event.target instanceof Element) {
          unanswered.push({ event, element: event.target })
        }
        return
      }
      // Nothing answered it: it goes on to the page, a plain link to the
      // router, as it would have.
      if (messages.length === 0) {
        startNow()
        return
      }
      // Taken by the runtime before anything else. The live page must not
      // answer this one as well.
      runtime.answered.push(...messages)
      event.stopPropagation()
      startNow()
    },
  })
  const handOver = () => {
    if (phase === 'live') return
    phase = 'live'
    stop()
    for (const { event, element } of unanswered.splice(0)) {
      const Ctor = event.constructor as new (type: string, init: Event) => Event
      element.dispatchEvent(new Ctor(event.type, event))
    }
  }
  const commit = () => {
    phase = 'starting'
    runtime.boot({
      'foldkit-ssr.handover': {
        dependenciesSchema: Schema.Null,
        modelToDependencies: () => null,
        // Foldkit strips the root's stamp just before its first patch, so a
        // stamped root still has a render to wait for.
        dependenciesToStream: () =>
          Stream.fromEffect(
            Effect.as(
              Effect.andThen(
                root.hasAttribute(FOLDKIT_APP_ATTRIBUTE) ? Render.afterCommit : Effect.void,
                Effect.sync(handOver),
              ),
              HANDOVER,
            ),
          ),
      },
    })
    if (!root.hasAttribute(FOLDKIT_APP_ATTRIBUTE)) handOver()
  }
  const startNow = () => {
    if (phase !== 'waiting') return
    phase = 'loading'
    if (pending.length === 0) {
      commit()
      return
    }
    void Promise.all(pending.map(bundle => bundle.load())).then(commit, (error: unknown) => {
      console.error(`[foldkit-ssr] a bundle's bodies did not load: ${String(error)}`)
      commit()
    })
  }
  if (start === 'now') startNow()
  else if (start === 'idle') {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(startNow)
    else setTimeout(startNow, 0)
  }
}

/** The resumable track: bindings the server's markup names, so a page can answer before it boots. */
export const Resume = { builder, view, bindings, listen }

/** The browser's part of `SSR`: the same functions, without the server's. */
export const SSR = { plan, resume, hydrate, static: staticRegion, serving }

export {
  META_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  STATIC_ATTRIBUTE,
  ResumeRefused,
  metaMarkup,
  type Loadable,
  type Meta,
  type ResumableConfig,
  type ResumePart,
  type ResumePlan,
  type Start,
} from './shared.js'
export {
  BINDING_ATTRIBUTE,
  FALLBACK_FIELD,
  SLOT_ATTRIBUTE,
  type ResumableBuilder,
} from './resumable.js'
export type { DecodedBinding } from './listen.js'
export type { UnnamedHandler } from './context.js'
