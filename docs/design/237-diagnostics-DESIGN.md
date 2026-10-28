# One typed channel for what fails quietly (#237)

Status: built (2026-10-28). The channel is `Diagnostics` in
`foldkit-surface`. Remote and its server report into it (first slice), and
so do SSR, Sync, Mirror, Media, Guard, remote-drizzle, agent-mcp and the
mixins resolver (second slice). What is still deferred is listed below.

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

- **Code outside any Effect context** (a Promise-based host, a function
  that runs before any runtime exists) takes the reporter as an option:
  `diagnostics?: ReportDiagnostic`, or `(diagnostic, request) => Effect`
  where there is a request. `serveFetch`, `SSR.entry`, Sync's
  `documentHost` and `defineDocumentHost` take the request form;
  `SSR.hydrate`, `serveJournal`, agent-mcp's hosts and `GuardServer.validate`
  take the plain one. `SSR.hydrate` needs it because a refused page never
  starts a runtime, so the reporter in the runtime's `resources` is never in
  effect.
- **One exception.** Foldkit runs a Mount with the runtime's own context,
  not the application's `resources`, so the mixins resolver's `MountFailed`
  always goes to the default log.

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

Second slice, by package:

| Package | Before | Now |
| --- | --- | --- |
| SSR | `console.error` when `SSR.hydrate` has no build id, or the page cannot resume (state, route, bindings) | `PageContained { reason }`: `NoBuildId` or the `ResumeRefused` reason |
| SSR | `console.error` for a static region missing from the server's page | `StaticRegionMissing` |
| SSR | `console.error` "a bundle's bodies did not load" | `BundleUnloaded` |
| SSR | `console.error` when `headers` threw, or a page was answered 500 | `PageFailed { url, cause }` |
| SSR | `console.warn` for a handler the page cannot name | `HandlerUnnamed` (still once per process) |
| Sync | `Effect.logWarning` "sync exchange failed" / "history changed; rebuilding" | `ExchangeFailed` / `HistoryRebuilt` |
| Sync | `console.error`s in `do.ts` and the journal's upgrade, `.catch(() => undefined)` on the resolver and the journal, a revalidation defect's dropped cause, a swallowed notice failure | `HostDefect { stage, cause }`, stage `Upgrade`, `Exchange`, `Resolve`, `Journal`, `Revalidate` or `Notice` |
| Sync | A presence subscriber or socket listener that threw, swallowed | `ListenerFailed` |
| Mirror | `Effect.logWarning` could not read / write | `StoreUnread` / `StoreUnwritten` |
| Mirror | A stored document no mirror writes, discarded silently; its failed removal, swallowed | `StoreMalformed`; `StoreUnwritten` |
| Media | `Effect.logWarning` on a variant or edge store; the facts cache's swallowed read and ignored write | `StoreFailed { store, operation, key, cause }` |
| Media | `Effect.logWarning` "rate limiter failed; admitting" | `AdmissionFailed` |
| Media | `Effect.logWarning` "Media.transform / Media.inspect failed" | `ImageFailed { step }` |
| Media | The facts route's `Unavailable`, its reason dropped | `FactsUnanswered` |
| Media | A defect `serveFetch` answered 500, logged nowhere | `RequestDefect` |
| Guard | `Effect.logError` when an operator refuses a computed value | `ComputeRefused` |
| Guard | `GuardServer.validate`'s `console.warn` of writes with no revision | `UnpinnedWrites`, through `validate({ diagnostics })` |
| remote-drizzle | `Effect.logError` in `runStatement` and the ledger | `StatementFailed` (the caller gets only `RemoteServerError`) |
| remote-drizzle | `serverOnly` rules (#259), reported nowhere | `ServerOnlyRules`, once per binding, on its first write through `writer` |
| agent-mcp | `console.error` "authenticate broke" | `AuthenticateDefect` |
| agent-mcp | Capability, request and tool-list defects and a transport's `end` that threw, swallowed | `CapabilityDefect`, `RequestDefect`, `ToolListDefect`, `TransportEndDefect` |
| mixins | The resolver's `console.error('[OnMount …] unhandled failure')` | `MountFailed` |

Each variant is reported where it happens, and the fallback it reports is
unchanged. One exception: Media's `serveFetch` now merges its images and
uploads layers into the router's context with `Layer.provideMerge`, which
`Layer.provide` hid. A reporter given in `layer(env)` would not otherwise
reach the middleware that reports `RequestDefect`.

`serverOnly` is reported on a binding's first write, not at startup. `bind`
is synchronous and runs before any Effect, and the first write is the
earliest Effect the binding writes in, where the server's reporter applies.
`stdio` (agent-mcp) reports to stderr by default, because Effect's default
logger writes every level to stdout in Node, which carries the MCP protocol
there.

## Deferred

- **#210's compiled build id**: `SSR.hydrate` reading the id when `buildId`
  is omitted needs Foldkit to export it.
- **Left quiet on purpose**, each judged and named in its commit:
  - refusals answered to the caller with their reason (SSR's
    `FallbackRefused`, malformed Sync frames, agent-mcp's unparseable body,
    Media's typed refusals);
  - Sync's `logDebug` "checkpoint adopted", which is not a failure;
  - a mirror URL key that does not decode, which `mirror.decode(keys).issues`
    exposes.
- **Sync's `journalChanges`**: if its subscribe fiber fails, notices stop
  with no report. Its type says it fails only by defect.
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
- Second slice: each package's tests assert its variants with
  `Diagnostics.collect()` in place of console spies, and its
  `test/diagnostics.mutations.ts` proves each report can fail: SSR 17, Sync
  18 (and `do.mutations.ts` re-anchored, 28), Mirror 6, Media 19, Guard 5,
  remote-drizzle 7, agent-mcp 9 (and `http.mutations.ts`, 5), mixins
  `mountRuntime.mutations.ts` 5. All killed.
