# One typed channel for what fails quietly (#237)

Status: first slice built (2026-10-27). The channel is `Diagnostics` in
`foldkit-surface`; `foldkit-remote` and `foldkit-remote-server` report into
it. SSR, Sync, Mirror, Media, the remote-drizzle startup report and the rest
are deferred, each listed below.

## The problem

The costliest bugs in Chirp were fallbacks that said nothing (#210, #221),
and the packages already disagree on how to say something:

- `foldkit-remote` kept `placementMismatches` and `answerGaps` as two Model
  fields, read only by a test that knew to look, and logged nothing.
- A failed write released its layer with no word unless the application
  shared `MutationFailed` (#260 deferred the warning to this channel).
- `foldkit-remote-server` had `logDefect`, `answer`'s `onDefect`,
  `serveFetch`'s `onError(cause, request)`, and two bare
  `Effect.logWarning`s for a committed write whose answer read or live
  publish failed: four mechanisms for one fact, "this side met something and
  kept going".
- SSR, Sync, Mirror, Media, Guard and the mixins resolver each call
  `console.error`, `console.warn` or `Effect.logWarning` in their own words.

## Decision

```text
package code ── Diagnostics.report(d) ──▶ Diagnostics.Reporter (Effect context)
                                              │ default: Effect's log at d.level
pure reducer ── records d in its Model ──▶ wiring / fold returns a Command
                                              └─ Diagnostics.report(each new d)
                                                 then CompletedReportDiagnostics (no-op)
```

### Where it lives

`foldkit-surface`, beside `Wiring` and `Module`: every package that would
report already depends on it (Remote, SSR, Sync, Mirror, Site through SSR),
it is the composition root that already describes how integrations join an
application, and it adds no package. `foldkit-remote` re-exports it, as
Surface re-exports `Metadata`, so a server that uses Remote alone needs no
new dependency.

### Its type

```ts
interface Diagnostic {
  readonly _tag: string           // the package's own variant
  readonly source: string         // 'foldkit-remote'
  readonly level: 'warning' | 'error'
  readonly message: string        // what happened and what to do, for a log
}
type ReportDiagnostic = (diagnostic: Diagnostic) => Effect.Effect<void>

Diagnostics.Reporter   // Context.Reference<ReportDiagnostic>, default Diagnostics.log
Diagnostics.report(d)  // never fails; a reporter that breaks is logged with what it was given
Diagnostics.log        // the default, to compose with another
Diagnostics.collect()  // { report, reported } for a test
```

Each package declares its own variants as interfaces extending `Diagnostic`
with a literal `_tag` and the typed facts (`RemoteDiagnostic`,
`RemoteServerDiagnostic`), and builds them in one constructor per variant,
so the `message` is written once. The channel's base type is open by design:
a reporter prints or ships what any package sends, and code that branches
narrows on that package's union.

Rejected: the issue's single closed union in one module. It would make
Surface name every package's facts (`Refusal`, `RemoteError`, `Cause`) and
change with each, and a package added later could not report.

### How a package reports

- **Effect code** (servers, Commands, Subscriptions) calls
  `Diagnostics.report(d)`. The reporter is a `Context.Reference`, so it needs
  no requirement in any signature, and a host replaces it the way it
  replaces any service.
- **A pure reducer** cannot run an Effect. It records the diagnostic in the
  state it owns (`RemoteModel.diagnostics`, the newest 256). Whatever returns
  Commands for that reducer (the Remote wiring's `route`, `Remote.fold`)
  compares the diagnostics before and after by identity and returns one
  Command reporting what is new, which answers `CompletedReportDiagnostics`.
  That Message changes nothing and returns the Model it was given. This is
  Foldkit's prescribed path for an effect a Model change causes: a Command
  from the update that caused it, not a Subscription that would need a
  "reported up to" cursor of its own.
- **One owner per fact.** The Model owns what was recorded; the reporter owns
  where it goes. A failed write stays the ledger's (`Data.failedWrites`);
  `WriteUnheard` records the separate fact that the application's update was
  not wired to hear it.

### How an application reads it

- **Development.** Nothing to do: the default reporter is Effect's log, the
  browser's console or a Worker's `wrangler tail`.
- **Production.** The same default. A browser application that wants it
  quieter, or sent somewhere, provides `Layer.succeed(Diagnostics.Reporter,
  report)` in its runtime's resources; a server, in its layer, or
  `serveFetch({ diagnostics: (d, request) => … })`, which gives the request
  too and covers a broken layer, whose services never exist.
- **Tests.** Assert on the Model: `Data.inspect(model).diagnostics` is `[]`,
  or holds the expected `AnswerGap`. For Effect code, provide
  `Diagnostics.collect().report` and assert on `reported`.

### Zero cost, no behaviour

A reduction that records nothing returns no Command, and the diagnostics
array keeps its identity. The checks that record most (`verifyAnswers`,
`verifyPlacement`) stay opt-in. Nothing a diagnostic records changes what a
read, write or answer does; reporting runs after the Model is settled.

## What moved

| Before | Now |
| --- | --- |
| `RemoteModel.placementMismatches`, `Data.inspect(...).placementMismatches` | `PlacementMismatch` in `RemoteModel.diagnostics`, `Data.inspect(...).diagnostics` |
| `RemoteModel.answerGaps`, `Data.inspect(...).answerGaps` | `AnswerGap` in `diagnostics`, now naming its mutation (#249) |
| A failed write unheard said nothing (#260's deferred warning) | `WriteUnheard`, recorded by the wiring when it does not share `MutationFailed` |
| `logDefect`, `RemoteServer.answer`'s `onDefect` | `ServerDefect`, through `Diagnostics.report` |
| `serveFetch({ onError(cause, request) })` | `serveFetch({ diagnostics(diagnostic, request) })` |
| `Effect.logWarning` on a failed answer read / live publish | `AnswerUnread` / `PublishFailed` |

## Deferred

- **SSR** (#210): `SSR.hydrate`'s fallbacks and `console.error`s become
  `ResumeRefused { reason }`; the client's are Effect-free, so they report
  through `Effect.runFork(Diagnostics.report(...))` with the runtime's layer,
  or a Command at start.
- **`serverOnly` at startup** (#259): `bind` is synchronous; the server's
  startup Effect should report each rule no CHECK holds.
- **Sync, Mirror, Media, Guard, the mixins resolver's `OnMount` failures, the
  agent MCP host**: each `console.*` / `Effect.logWarning` above is a
  variant waiting for its package.
- **Prediction laws** (#257): a disagreement found when an answer lands is
  one more Remote variant.
- **A harness that fails on any diagnostic** (#239, #250's `Trace`), a
  development overlay, and a quieter browser default in production builds.
- **Configuration refusals that name the option** (the Theme knob comment on
  #237): they throw, which is already loud; naming the knob is the fix there.
- **`Data.reduce` by hand** records but reports nothing: only the wiring and
  `Remote.fold` return Commands. An application on that path reads the Model.
- **The name.** `foldkit-mixins` exports a `Diagnostics` namespace of thrown
  resolver errors; a file importing both aliases one.

## Tests

- `packages/surface/test/diagnostics.test.ts`, `diagnostics.mutations.ts` (6,
  all killed): the default log and its level, the reporter in context, a
  reporter that breaks, `collect`.
- `packages/remote/test/diagnostics.test.ts`, `diagnostics.mutations.ts` (12,
  all killed): the wiring reports only what an update recorded and the
  answer is a no-op; `WriteUnheard` only when unshared and pending; the
  window; `forget`; `Remote.fold` reports, wrapped, and hears every failure.
  `verifyAnswers` and `verifyPlacement` tests read their variants from
  `diagnostics`.
- `packages/remote-server`: `answer`, `fetch`, `fetchLive`, `liveHub` and
  `mutationAnswer` tests assert `ServerDefect` (with the request through
  `serveFetch`), `PublishFailed` and `AnswerUnread`; their mutation specs
  were re-anchored and extended.
