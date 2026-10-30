/**
 * The one channel for what a package met and did not fail on: a fallback, a
 * refusal it answered generically, a failure it swallowed, a check run in
 * development. Each package names its own variants; every one is reported
 * through the `Diagnostics.Reporter` in the Effect context, which logs by
 * default.
 */
import { Cause, Context, Effect, Layer, Logger, type Scope } from 'effect'

/**
 * A fallback, refusal or swallowed failure, as the package that met it
 * reports it. A package's own variants extend this with a literal `_tag` and
 * the typed facts behind `message`.
 */
export interface Diagnostic {
  readonly _tag: string
  /** The package that met it, as published: `foldkit-remote`. */
  readonly source: string
  /** `error` when something broke on this side; `warning` when the application should change something. */
  readonly level: 'warning' | 'error'
  /** What happened and what to do about it, for a log. */
  readonly message: string
}

/** Where diagnostics go. It should not fail; when it does, `Diagnostics.report` logs that it did. */
export type ReportDiagnostic = (diagnostic: Diagnostic) => Effect.Effect<void>

/**
 * Effect's default logger writes every level with `console.log` unless
 * `LogToStderr` is set, so an error would never reach `console.error`, where a
 * browser, an end-to-end check and a Worker's tail look for one (#272). A
 * replaced logger gets the entry at its level and decides for itself.
 */
const logError = (text: string): Effect.Effect<void> =>
  Effect.provideService(Effect.logError(text), Logger.LogToStderr, true)

/**
 * Effect's log at the diagnostic's level. With Effect's default logger an
 * error goes to `console.error` (stderr on a server) and a warning to
 * `console.log`.
 */
const log: ReportDiagnostic = diagnostic => {
  const text = `[${diagnostic.source}] ${diagnostic.message}`
  return diagnostic.level === 'error' ? logError(text) : Effect.logWarning(text)
}

/**
 * The reporter in effect. Provide another with `Layer.succeed(Diagnostics.Reporter, report)`
 * (a Foldkit runtime's resources, a server's layer) or `Effect.provideService`.
 */
const Reporter = Context.Reference<ReportDiagnostic>('foldkit-surface/Diagnostics', {
  defaultValue: () => log,
})

/** Reports one diagnostic. Never fails: a reporter that breaks is logged, with what it was given. */
const report = (diagnostic: Diagnostic): Effect.Effect<void> =>
  Effect.flatMap(Effect.service(Reporter), reporter => reporter(diagnostic)).pipe(
    Effect.catchCause(cause =>
      logError(
        `[foldkit-surface] the diagnostics reporter broke on: [${diagnostic.source}] ${diagnostic.message}\n${Cause.pretty(cause)}`,
      ),
    ),
  )

/** Errors as `log` writes them; warnings, which ask a developer to change something, dropped. */
const quiet: ReportDiagnostic = diagnostic =>
  diagnostic.level === 'error' ? log(diagnostic) : Effect.void

const eventType = 'foldkit-diagnostic'

/**
 * A diagnostic handed to the document by code the application's context does
 * not reach, for `Diagnostics.layer` to claim. Only events of this class are
 * claimed: any script can dispatch an event named `foldkit-diagnostic`.
 */
class DiagnosticEvent extends Event {
  readonly diagnostic: Diagnostic
  constructor(diagnostic: Diagnostic) {
    super(eventType, { bubbles: true, composed: true, cancelable: true })
    this.diagnostic = diagnostic
  }
}

/**
 * Reports `diagnostic` from code the application's context does not reach (a
 * Mount, which Foldkit runs outside `resources`): a `DiagnosticEvent` at
 * `element`, or at its document once the element has left it, where nothing
 * would hear it. Unclaimed, it goes to the reporter in context.
 */
const dispatch = (element: Element, diagnostic: Diagnostic): Effect.Effect<void> =>
  Effect.suspend(() => {
    const target = element.isConnected ? element : element.ownerDocument
    return target.dispatchEvent(new DiagnosticEvent(diagnostic)) ? report(diagnostic) : Effect.void
  })

/** While its scope is open, claims each unclaimed `DiagnosticEvent` in the document for `reporter`. */
const claim = (reporter: ReportDiagnostic): Effect.Effect<void, never, Scope.Scope> =>
  typeof document === 'undefined'
    ? Effect.void
    : Effect.asVoid(
        Effect.acquireRelease(
          Effect.sync(() => {
            const listener = (event: Event) => {
              if (!(event instanceof DiagnosticEvent) || event.defaultPrevented) return
              event.preventDefault()
              Effect.runFork(Effect.provideService(report(event.diagnostic), Reporter, reporter))
            }
            document.addEventListener(eventType, listener)
            return listener
          }),
          listener => Effect.sync(() => document.removeEventListener(eventType, listener)),
        ),
      )

export const Diagnostics = {
  Reporter,
  report,
  /**
   * `reporter` as the reporter, hearing what Mounts report too: in a document,
   * it claims each `DiagnosticEvent` while the layer is built. Give it in a
   * runtime's resources. Foldkit builds those at the first Command or
   * Subscription (before `init` with Flags); a Mount failing earlier goes to
   * the default log.
   */
  layer: (reporter: ReportDiagnostic): Layer.Layer<never> =>
    Layer.merge(Layer.succeed(Reporter, reporter), Layer.effectDiscard(claim(reporter))),
  dispatch,
  DiagnosticEvent,
  /** For a production page: errors as `log` writes them, warnings dropped. */
  quiet,
  /** The default reporter, to compose with another: `d => Effect.andThen(Diagnostics.log(d), send(d))`. */
  log,
  /**
   * A reporter that keeps what it is given, for a test: provide `report`, then
   * assert on `reported`, `[]` included.
   */
  collect: (): {
    readonly report: ReportDiagnostic
    readonly reported: ReadonlyArray<Diagnostic>
  } => {
    const reported: Array<Diagnostic> = []
    return {
      reported,
      report: diagnostic =>
        Effect.sync(() => {
          reported.push(diagnostic)
        }),
    }
  },
}
