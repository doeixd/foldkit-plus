/**
 * What SSR meets and keeps going past: a page the browser contains rather
 * than resumes, a static region or lazy bundle it draws without, a request
 * answered 500, and a handler that keeps a page from answering before boot.
 * Each is reported through `Diagnostics.report`, by default to the log.
 */
import { Cause, Effect } from 'effect'
import { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'
import type { ResumeRefused } from './shared.js'

const source = 'foldkit-ssr'

/** A served page the browser contained instead of resuming: it stays in view, inert, and no runtime starts. */
export interface PageContained extends Diagnostic {
  readonly _tag: 'PageContained'
  /** `NoBuildId` when `SSR.hydrate` was given none; otherwise why the envelope was refused. */
  readonly reason: 'NoBuildId' | ResumeRefused['reason']
}

/** A static region the browser asked for that the server's page did not hold, rendered in the browser. */
export interface StaticRegionMissing extends Diagnostic {
  readonly _tag: 'StaticRegionMissing'
  readonly region: string
}

/** A lazy bundle whose bodies did not load; the runtime boots without them. */
export interface BundleUnloaded extends Diagnostic {
  readonly _tag: 'BundleUnloaded'
  readonly error: unknown
}

/** A request answered 500: its `headers` threw, or its page could not be rendered. */
export interface PageFailed extends Diagnostic {
  readonly _tag: 'PageFailed'
  readonly url: string
  readonly cause: Cause.Cause<unknown>
}

/** A handler the page cannot name, so its event waits for the live runtime. Reported once per process. */
export interface HandlerUnnamed extends Diagnostic {
  readonly _tag: 'HandlerUnnamed'
  readonly plan: string
  readonly element: string
  readonly event: string
}

/** Every diagnostic SSR reports. */
export type SsrDiagnostic =
  | PageContained
  | StaticRegionMissing
  | BundleUnloaded
  | PageFailed
  | HandlerUnnamed

export const pageContained = (reason: PageContained['reason'], detail: string): PageContained => ({
  _tag: 'PageContained',
  source,
  level: 'error',
  message: `the page cannot resume, so it is contained: ${detail}`,
  reason,
})

export const noBuildId: PageContained = pageContained(
  'NoBuildId',
  "SSR.hydrate was given no build id, so it cannot tell this page from another deployment's. Pass the id the server stamped: with @foldkit/vite-plugin, set FOLDKIT_BUILD_ID (or `foldkit({ buildId })`) so that `import.meta.env.FOLDKIT_BUILD_ID` is defined in the client too.",
)

export const staticRegionMissing = (region: string): StaticRegionMissing => ({
  _tag: 'StaticRegionMissing',
  source,
  level: 'error',
  message: `the static region "${region}" is not in the server's page, so it is rendered in the browser`,
  region,
})

export const bundleUnloaded = (error: unknown): BundleUnloaded => ({
  _tag: 'BundleUnloaded',
  source,
  level: 'error',
  message: `a bundle's bodies did not load, and the page boots without them: ${String(error)}`,
  error,
})

export const pageFailed = (url: string, cause: Cause.Cause<unknown>): PageFailed => ({
  _tag: 'PageFailed',
  source,
  level: 'error',
  message: `${url} was answered 500: ${Cause.pretty(cause)}`,
  url,
  cause,
})

export const handlerUnnamed = (plan: string, element: string, event: string): HandlerUnnamed => ({
  _tag: 'HandlerUnnamed',
  source,
  level: 'warning',
  message: `plan "${plan}": ${element} handles ${event} with a function, which the page cannot name, so that event waits for the live runtime. Give the handler a Message, or, for OnInput, OnChange, OnKeyDown or OnKeyUp, the Message's constructor with the field the event fills left out.`,
  plan,
  element,
  event,
})

/** `effect` reporting to `report` when one is given, else to the reporter in its context. */
export const reportingTo =
  (report: ReportDiagnostic | undefined) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    report === undefined ? effect : Effect.provideService(effect, Diagnostics.Reporter, report)
