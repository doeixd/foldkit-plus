/**
 * `foldkit-ssr/client`: what a browser page needs to take a server render
 * over, and nothing that renders one. It never imports
 * `foldkit/experimental/server`, whose renderer and HTML parser a hydrating
 * page would otherwise carry; `foldkit-ssr` is this and the server side.
 */
import { Effect, Option, Result, Schema, Stream } from 'effect'
import { hydrate as adopt, makeApplication, run } from 'foldkit/runtime'
import * as Render from 'foldkit/render'
import { Diagnostics, type ReportDiagnostic } from 'foldkit-surface'
import { withContext, type RenderContext } from './context.js'
import {
  bundleUnloaded,
  headNotMoved,
  noBuildId,
  otherBuild,
  pageContained,
  reportingTo,
  type SsrDiagnostic,
} from './diagnostics.js'
import { claim, type HeldEvent } from './handoff.js'
import { UNTIL_LIMIT_MS } from './marks.js'
import { hold, keptFields, restore, typedMessages, type Held, type KeptField } from './keep.js'
import { listen, listening, type DecodedBinding } from './listen.js'
import {
  BINDING_ATTRIBUTE,
  FALLBACK_DEPTH_FIELD,
  FALLBACK_FIELD,
  KEEP_ATTRIBUTE,
  SLOT_ATTRIBUTE,
  builder,
  view,
} from './resumable.js'
import {
  FOLDKIT_APP_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  STATIC_ATTRIBUTE,
  HEAD_END_MARKER,
  HEAD_MARKER,
  STYLES_MARKER,
  arrival,
  bindings,
  bindingsAndEvents,
  metaEntry,
  plan,
  resume,
  routeOf,
  serving,
  startingFrom,
  staticRegion,
  unbound,
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
 * by Foldkit's own refusal, and the reason is reported (`options.diagnostics`). A server page is never
 * rendered again on the client. A page with no server render at all, no
 * stamped root, is rendered on the client as usual.
 *
 * Run by `foldkit-ssr/loader`, it starts now, whatever the plan's `start`
 * (the loader followed it), and answers each event the loader held from the
 * markers, once. A page that does not resume releases them to the browser.
 */
const hydrate = <Model, Fields extends Schema.Struct.Fields, Message = any>(
  config: ResumableConfig<Model, Message>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    /**
     * Whether this page is taken over: asked before anything is adopted, so
     * a page showing another reader's data never becomes live facts. Omitted
     * adopts as before. Must not throw: a throwing predicate propagates out
     * of `hydrate` with no runtime booted and nothing contained.
     */
    readonly when?: ((page: Document) => boolean) | undefined
    /**
     * What a declined or stale page does: `render` runs the application
     * afresh where the rendered page is, replacing its markup in place (the
     * config's container with no served page). Omitted contains the page the
     * way a resume failure does.
     */
    readonly otherwise?: 'render' | undefined
    /**
     * With `otherwise: 'render'`, when the fresh application is ready to be
     * seen: until a Model it has drawn satisfies this, it draws out of view
     * and the served page stays, so a page is not swapped for its loading
     * state and back. Omitted, the fresh application replaces the page at
     * once. The served page stays no longer than `UNTIL_LIMIT_MS`.
     */
    readonly until?: ((model: Model) => boolean) | undefined
    /**
     * Whether the plan's data version is still current: asked once, with
     * `plan.version`, before anything is adopted. Omitted never asks. A plan
     * with no version still asks, with `undefined` (a check shaped like
     * `version === expected` then marks every such page stale). Must not
     * throw, as `when`.
     */
    readonly fresh?: ((version: unknown) => boolean) | undefined
    /**
     * What only this browser adds to the resumed Model before it is adopted,
     * and the view does not draw: a session minted for this page load (an
     * outbox's `session`). Run once, for a page that resumes; the runtime
     * starts when it succeeds. What the view draws, such as a queue read from
     * storage, arrives after, as a Message: here it would make the first
     * client view differ from the served page. Must not fail, as `when` must
     * not throw.
     */
    readonly prepare?: ((model: Model) => Effect.Effect<Model>) | undefined
    /**
     * Where what the page met goes: a page contained rather than resumed, a
     * static region the server's page lacked, a lazy bundle that did not
     * load. Each is reported before or apart from the runtime, so its
     * resources' reporter is not in effect. Omitted, Effect's log: the
     * browser's console.
     */
    readonly diagnostics?: ReportDiagnostic | undefined
  },
): void => {
  const report = (diagnostic: SsrDiagnostic): void => {
    Effect.runFork(reportingTo(options.diagnostics)(Diagnostics.report(diagnostic)))
  }
  const loader = Option.fromNullishOr(claim())
  // Every path below that does not resume the page lets the browser have what
  // the loader held: a held submission posts.
  const release = (): void => Option.match(loader, { onNone: () => {}, onSome: it => it.release() })
  const planMeta = plan.meta
  if (planMeta !== undefined) {
    config = {
      ...config,
      subscriptions: { ...config.subscriptions, 'foldkit-ssr.meta': metaEntry(planMeta) },
    }
  }
  const root = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  if (root !== null) {
    if (dropUnmovedHead(root)) report(headNotMoved)
    keepStyles(root)
  }
  // A page that is declined or stale never adopts. `render` draws afresh at
  // the root's place, replacing it; anything else contains the served page.
  // With no served page the application renders afresh regardless.
  const declined = options.when !== undefined && !options.when(document)
  const stale = options.fresh !== undefined && !options.fresh(plan.version)
  if (root === null) {
    release()
    run(makeApplication(config as never))
    return
  }
  const program = (start: { readonly model: Model; readonly commands?: ReadonlyArray<unknown> }) =>
    makeApplication({ ...startingFrom(config, start), container: root } as never)
  // Contain the served page the way Foldkit refuses one: adopt the baseline
  // with an empty build id, with nothing copied here.
  const contain = () => adopt(program({ model: plan.baseline }), { buildId: '' })
  if (declined || stale) {
    release()
    if (options.otherwise !== 'render') contain()
    else if (options.until === undefined)
      run(makeApplication({ ...config, container: root } as never))
    else renderBeside(config, root, options.until)
    return
  }
  // The type says a string, but `import.meta.env` is `any`: with the variable
  // unset the id arrives undefined, and Foldkit, given none, takes its own
  // compiled id, which matches the page, so the baseline was adopted in silence.
  if (typeof options.buildId !== 'string') {
    report(noBuildId)
    release()
    contain()
    return
  }
  const served = root.getAttribute(BUILD_ATTRIBUTE)
  if (served !== options.buildId) {
    report(otherBuild(Option.fromNullOr(served), options.buildId))
    release()
    adopt(program({ model: plan.baseline }), { buildId: options.buildId })
    return
  }
  const resumed = resume(plan, document, { route: routeOf(window.location.href) })
  if (Result.isFailure(resumed)) {
    report(pageContained(resumed.failure.reason, resumed.failure.message))
    release()
    contain()
    return
  }
  const adoptFrom = (model: Model): void => {
    // A page recorded for its path, opened at a query: the application learns
    // the URL, as from a navigation, and the page starts now, since what it
    // shows is not yet the address.
    const arrived = arrival(config, document, window.location.href)
    const bootCommands = (started: Model): ReadonlyArray<unknown> =>
      (plan.boot?.(started) as ReadonlyArray<unknown> | undefined) ?? []
    const resuming: RenderContext = {
      mode: 'resume',
      snapshots: snapshotsOf(root),
      reported: new Set(),
      report,
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
    // The URL goes into the Model the runtime starts from, not into `answered`:
    // Subscriptions start from that Model before any Message lands, and a URL
    // mirror among them would write the served address back over the real one.
    // The first render then differs from the served page where the URL does, and
    // Foldkit rebuilds that part, as a navigation would redraw it. Applied at
    // boot, once any lazy bundle's `update` has loaded. The boot Commands are
    // planned from the Model the runtime actually starts with, so one derived
    // from the route or query sees the address the page arrived at.
    const startOf = () =>
      Option.match(arrived, {
        onNone: () => ({ model, commands: bootCommands(model) }),
        onSome: message => {
          const step = apply(model, message) as {
            readonly model: Model
            readonly commands?: ReadonlyArray<unknown> | undefined
          }
          return {
            model: step.model,
            commands: [...bootCommands(step.model), ...(step.commands ?? [])],
          }
        },
      })
    const boot = (entries: Readonly<Record<string, unknown>> = {}) => {
      unmark(root)
      return adopt(
        makeApplication({
          ...withContext(startingFrom({ ...config, update }, startOf()), resuming),
          container: root,
          subscriptions: { ...config.subscriptions, ...entries },
        } as never),
        { buildId: options.buildId },
      )
    }
    const pending = (config.lazy ?? []).filter(bundle => !bundle.isLoaded())
    // A loader ran this chunk when the plan's `start` said to.
    const start = Option.isSome(arrived) || Option.isSome(loader) ? 'now' : plan.start
    const eager = start === 'now' && pending.length === 0
    // With a loader, the page reads its bindings first: the loader may hold
    // events for them.
    if (eager && Option.isNone(loader) && root.querySelector(`[${KEEP_ATTRIBUTE}]`) === null) {
      boot()
      return
    }
    const decoded = bindingsAndEvents(plan, document, root, model)
    if (Result.isFailure(decoded)) {
      report(pageContained(decoded.failure.reason, decoded.failure.message))
      release()
      contain()
      return
    }
    const kept = keptFields(root, decoded.success.bindings)
    if (Result.isFailure(kept)) {
      report(pageContained('Invalid', kept.failure))
      release()
      contain()
      return
    }
    // What was typed before this script ran, first in the queue: everything the
    // page answers from here on happened after it.
    answered.push(...typedMessages(kept.success))
    const held = Option.match(loader, { onNone: () => [], onSome: it => it.take() })
    if (eager && answered.length === 0 && held.length === 0) {
      boot()
      return
    }
    // Typing is an interaction, whenever it happened: a page that waits for
    // one starts now, so what was typed is answered as soon as the script runs.
    const typed = answered.length > 0 ? 'now' : start
    deferBoot(root, decoded.success, typed, { boot, answered }, pending, report, kept.success, held)
  }
  const prepare = options.prepare
  let startingModel: Model
  try {
    startingModel = plan.restore === undefined ? resumed.success : plan.restore(resumed.success)
  } catch (error) {
    report(pageContained('Invalid', error instanceof Error ? error.message : String(error)))
    release()
    contain()
    return
  }
  if (prepare === undefined) adoptFrom(startingModel)
  else void Effect.runPromise(prepare(startingModel)).then(adoptFrom)
}

/**
 * Takes out of the served page what the server wrote for this script to read
 * and no view draws: the envelope, each binding's and kept field's marker,
 * each placement's slot, and each form's fallback (its `method` and hidden
 * fields). Left in, each is in what Foldkit records of the served page and
 * gone after its first patch, so Foldkit reconciles every such element, and
 * a development build reports that the server's markup and the view
 * disagree. Run as the page boots, so a form submitted before then still
 * posts.
 */
const unmark = (root: Element): void => {
  root.removeAttribute(RESUME_ATTRIBUTE)
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const name of element.getAttributeNames()) {
      if (name.startsWith(BINDING_ATTRIBUTE) || name === KEEP_ATTRIBUTE || name === SLOT_ATTRIBUTE)
        element.removeAttribute(name)
    }
  }
  for (const field of root.querySelectorAll(`input[type="hidden"][name="${FALLBACK_FIELD}"]`)) {
    const form = field.parentElement
    form?.removeAttribute('method')
    form?.querySelector(`:scope > input[type="hidden"][name="${FALLBACK_DEPTH_FIELD}"]`)?.remove()
    field.remove()
  }
}

/**
 * Removes head markup `SSR.headed` should have moved out of the root (a plan's
 * `meta`), saying whether there was any: the view does not draw it, and the
 * plan's meta entry writes the head once the page runs.
 */
const dropUnmovedHead = (root: Element): boolean => {
  const nodes = Array.from(root.childNodes)
  const marks = (value: string) => (node: ChildNode) =>
    node.nodeType === Node.COMMENT_NODE && node.nodeValue === value
  const open = nodes.findIndex(marks(HEAD_MARKER))
  if (open === -1) return false
  const close = nodes.findIndex((node, at) => at > open && marks(HEAD_END_MARKER)(node))
  for (const node of nodes.slice(open, close === -1 ? undefined : close + 1)) node.remove()
  return true
}

/**
 * Moves what a render's `styles` put in the root into the head, before
 * anything adopts the page: the view does not draw it, so hydration would
 * remove it, and a page that never renders again would lose the rules its
 * classes need. Whatever adopts the page next finds them in the head.
 */
const keepStyles = (root: Element): void => {
  const marker = Array.from(root.childNodes).find(
    node => node.nodeType === Node.COMMENT_NODE && node.nodeValue === STYLES_MARKER,
  )
  if (marker === undefined) return
  for (let next = marker.nextSibling; next !== null; next = marker.nextSibling) {
    if (next instanceof Element) document.head.append(next)
    else next.remove()
  }
  marker.remove()
}

/** The longest a served page stays in view while a fresh application waits for `until`. */
export { UNTIL_LIMIT_MS }

/**
 * Runs the application afresh out of view, beside the served page, and puts
 * it in the page's place once a Model it drew satisfies `until`, or after
 * `UNTIL_LIMIT_MS`. It draws in a hidden element, not a detached one, so its
 * Mounts start in the document as they would in place.
 */
const renderBeside = <Model, Message>(
  config: ResumableConfig<Model, Message>,
  served: HTMLElement,
  until: (model: Model) => boolean,
): void => {
  const holder = document.createElement('div')
  holder.hidden = true
  const container = document.createElement('div')
  // The runtime refuses a container without an id; the served page gives its own up.
  container.id = served.id === '' ? 'foldkit-ssr-app' : served.id
  served.removeAttribute('id')
  // Nor does it boot beside a page stamped as a server render, which this one,
  // never adopted, no longer is.
  served.removeAttribute(FOLDKIT_APP_ATTRIBUTE)
  holder.append(container)
  served.after(holder)
  let shown = false
  const show = () => {
    if (shown) return
    shown = true
    clearTimeout(limit)
    holder.replaceWith(...holder.childNodes)
    served.remove()
  }
  const limit = setTimeout(show, UNTIL_LIMIT_MS)
  const view: ResumableConfig<Model, Message>['view'] = (model, h) => {
    const drawn = config.view(model, h)
    // Shown once the drawing this view returns is patched in, which the
    // runtime does in the same task.
    if (!shown && until(model)) queueMicrotask(show)
    return drawn
  }
  run(makeApplication({ ...config, view, container } as never))
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
 * Each kept field the person changed is put back, value and selection, as
 * the first render commits, since that render re-asserts the served value.
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
  report: (diagnostic: SsrDiagnostic) => void,
  kept: ReadonlyArray<KeptField>,
  loaded: ReadonlyArray<HeldEvent>,
): void => {
  // Events only the live page can answer, met before it listened.
  const unanswered: Array<{ readonly event: Event; readonly element: Element }> = []
  // `waiting` for an interaction or idle, `loading` bodies, `starting` the
  // runtime until its first render commits, then `live`.
  let phase: 'waiting' | 'loading' | 'starting' | 'live' = 'waiting'
  // The kept fields as the person left them, which the first render resets.
  let held: ReadonlyArray<Held> = []
  const { stop, answer } = listening(root, {
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
    // Before the queue runs, so its Messages find the fields holding their values.
    restore(held)
    stop()
    for (const { event, element } of unanswered.splice(0)) {
      const Ctor = event.constructor as new (type: string, init: Event) => Event
      element.dispatchEvent(new Ctor(event.type, event))
    }
  }
  const commit = () => {
    phase = 'starting'
    held = hold(kept)
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
      report(bundleUnloaded(error))
      commit()
    })
  }
  // What the loader held, answered as if the page had listened then.
  for (const { event, path } of loaded) answer(event, path)
  if (start === 'now') startNow()
  else if (start === 'idle') {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(startNow)
    else setTimeout(startNow, 0)
  }
}

/** The resumable track: bindings the server's markup names, so a page can answer before it boots. */
export const Resume = { builder, view, bindings, listen }

/** The browser's part of `SSR`: the same functions, without the server's. */
export const SSR = { plan, resume, hydrate, static: staticRegion, unbound, serving }

export {
  META_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  STATIC_ATTRIBUTE,
  ResumeRefused,
  metaMarkup,
  type Loadable,
  type Meta,
  type PlanSurface,
  type ResumableConfig,
  type ResumePart,
  type ResumePlan,
  type Start,
} from './shared.js'
export {
  BINDING_ATTRIBUTE,
  FALLBACK_FIELD,
  KEEP_ATTRIBUTE,
  SLOT_ATTRIBUTE,
  type ResumableBuilder,
} from './resumable.js'
export type { DecodedBinding } from './listen.js'
export type { UnnamedHandler } from './context.js'
/** The diagnostics channel `hydrate` reports into, re-exported so a page needs no other import. */
export { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'
export type {
  BundleUnloaded,
  CachedPageDiffers,
  HandlerUnnamed,
  HeadNotMoved,
  PageContained,
  PageFailed,
  SsrDiagnostic,
  StaticRegionMissing,
} from './diagnostics.js'
