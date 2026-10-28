/**
 * The one channel for what a package met and did not fail on: a fallback, a
 * refusal it answered generically, a failure it swallowed, a check run in
 * development. Each package names its own variants; every one is reported
 * through the `Diagnostics.Reporter` in the Effect context, which logs by
 * default.
 */
import { Cause, Context, Effect } from 'effect'

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

/** Effect's log at the diagnostic's level: the console in a browser, the log on a server or Worker. */
const log: ReportDiagnostic = diagnostic =>
  (diagnostic.level === 'error' ? Effect.logError : Effect.logWarning)(
    `[${diagnostic.source}] ${diagnostic.message}`,
  )

/**
 * The reporter in effect. Provide another with `Layer.succeed(Diagnostics.Reporter, report)`
 * (a Foldkit runtime's resources, a server's layer) or `Effect.provideService`.
 */
const Reporter = Context.Reference<ReportDiagnostic>('foldkit-surface/Diagnostics', {
  defaultValue: () => log,
})

export const Diagnostics = {
  Reporter,
  /** Reports one diagnostic. Never fails: a reporter that breaks is logged, with what it was given. */
  report: (diagnostic: Diagnostic): Effect.Effect<void> =>
    Effect.flatMap(Effect.service(Reporter), report => report(diagnostic)).pipe(
      Effect.catchCause(cause =>
        Effect.logError(
          `[foldkit-surface] the diagnostics reporter broke on: [${diagnostic.source}] ${diagnostic.message}\n${Cause.pretty(cause)}`,
        ),
      ),
    ),
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
