# Errors and failures

When a network read times out, a form fails validation, or a session expires in another tab, letting exceptions bubble into your view blanks out what the user was already reading. Swallowing those errors leaves users clicking dead buttons with no explanation.

Foldkit Plus routes every failure to the party that can act on it:

- **User-facing failures** land in your `Model` as typed values through a `Message`, so your `update` handles them and your `view` keeps showing useful state beside a recovery action.
- **Developer-facing faults** (caught defects, statement failures, misused APIs) report through `Diagnostics` to your Effect logger or telemetry sink without altering runtime behaviour.

## A first example: a read that fails

This component renders a project name, keeps showing that name as `Stale` if a background refresh fails, and offers a "Try again" button when nothing has loaded yet:

```ts
import { Match, Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity } from 'foldkit-entity'
import { Remote, RemoteData, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectName = Entity.select(Project, { id: true, name: true })

const Model = Schema.Struct({ projectId: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ...Remote.messages, ClickedTryAgain: {} })
type Message = typeof Message.Type

const App = Surface.application({
  Model,
  Message,
  initial: { projectId: 'p1', remote: Remote.initial },
  update: (model, message) => update(model, message),
})
const Data = Remote.make({ model: App.model.remote, entities: [Project] })

const project = (model: Model) => Data.get(ProjectName, model.projectId)
const actives = { project: Data.active('Project', model => Option.some(project(model))) }

function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  return { model: Data.refresh(model, actives, { failed: true }) }
}

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  RemoteData.render(project(model).read(model), {
    loading: () => h.p([], ['Loading…']),
    notFound: () => h.p([], ['No such project.']),
    failed: error =>
      h.div(
        [],
        [
          h.p([], [`Could not load the project: ${error.message}`]),
          h.button([h.OnClick(Message.ClickedTryAgain())], ['Try again']),
        ],
      ),
    data: (row, freshness) =>
      h.div(
        [],
        [
          h.h1([], [row.name]),
          Match.valueTags(freshness, {
            Fresh: () => h.empty,
            Refreshing: () => h.p([], ['Updating…']),
            Stale: ({ error }) => h.p([], [`Not updated: ${error.message}`]),
          }),
        ],
      ),
  })
```

Pair this with `Data.subscriptions(actives)` (or `Data.wiring(actives)`); see [the Remote README](../packages/remote/README.md#4-let-the-active-screen-drive-the-fetching) for connecting the client.

What each piece does:

- **`RemoteData.render`** folds six read states into four view branches. Only a failure with no cached value enters `failed`; a refresh failure after data has rendered reaches `data` with `Stale` freshness so the project name stays visible.
- **`notFound`** handles a server answer confirming no such record exists, rather than a transient error.
- **`Data.refresh(model, actives, { failed: true })`** marks failed reads as due so the active subscription re-fetches them.
- **Explicit retries:** User-initiated reads and writes stay failed until the user triggers `Data.refresh` or `Data.retry`, avoiding automatic retry storms on persistent errors. Transports that recover connection drops (live streams, Sync exchanges, durable outbox writes) retry automatically with backoff.

## How failures reach the screen vs. your logs

Every failure follows one of two paths:

1. **Actionable failures:** A typed error arrives via `Message`, updates `Model`, and renders in the view with a retry, dismiss, edit, or sign-in control.
2. **Diagnostics:** A package calls `Diagnostics.report`, delivering `{ _tag, source, level, message }` to `Diagnostics.Reporter` in your Effect context while execution continues safely.

Three rules govern both paths:

- **Shown data stays on screen.** A failed refresh retains its `previous` value and a list renders every row it can assemble. If an optimistic write left out a field needed by a view, the answer reports `AnswerUnread` and `verifyPredictions` emits a `PredictionMismatch` diagnostic (see [Checking an answer against what was shown](../packages/remote/README.md#checking-an-answer-against-what-was-shown)).
- **User actions retry on user command.** Failed reads wait for `Data.refresh` and failed writes wait for `Data.retry`, while background transports (live streams, Sync exchanges, durable outboxes) handle transient drops automatically.
- **Diagnostics only observe.** Reporting a diagnostic logs context for developers and keeps control flow identical whether a reporter is attached or quiet.

## Who owns each failure

| Failure | Owner | User sees | App response |
| --- | --- | --- | --- |
| Read timed out or errored | `foldkit-remote` | `Failed` (or `Stale` if cached) | `Data.refresh(..., { failed: true })` |
| Field withheld by server | `foldkit-remote-server` | `Failed` with `Unavailable` | Remove field from Selection |
| Mutation failed or refused | Server + `foldkit-remote` | `Data.failedWrites` entry | `Data.retry`, `Data.dismiss`, or show |
| Mutation got no response | `foldkit-remote` | `Unreachable` (or `Waiting` if durable) | `Data.retry` (automatic if durable) |
| Client catches invalid write | `foldkit-remote` | `Data.failedWrites` entry immediately | Show refusal without round trip |
| Auth or permission denied | `foldkit-auth`, `foldkit-guard` | `Unauthenticated` or `Forbidden` | Sign in again or hide action |
| Form field invalid | `foldkit-form` | Inline field error or submit summary | User edits draft |
| Server rejects one form key | Server + `foldkit-crud` | Field marked invalid with server text | User edits field |
| Sync operation rejected | `foldkit-sync` (journal) | Reverted edit + `status.rejected` | Explain revert to user |
| Sync offline exchange error | `foldkit-sync` | `pending` count grows | Automatic backoff retry |
| Lazy resource chunk failed | `foldkit-bundle` | Command failure `Message` | Next `Resource.get` retries |
| Unhandled server exception | `foldkit-remote-server` | `Internal error` + incident ID | Inspect `ServerDefect` diagnostic |
| Package misuse or fallback | Reporting package | Unchanged UI | Fix diagnostic cause |

## Read failures

A read produces a `RemoteData` state: `Initial`, `Loading`, `Ready`, `Refreshing`, `Failed { error, previous }`, or `NotFound`. Use `RemoteData.match` for exhaustive handling or `RemoteData.render` for views. If a read stays `Initial` behind a spinner, call `why(Data, model, read, { surfaces: actives })` to inspect which field or list is missing or blocked.

Every `RemoteError` has `{ _tag, message }`, plus `reason` on auth/guard denials and `refusal` on declared write refusals:

| `_tag` | Cause | Retry? |
| --- | --- | --- |
| `RemoteReadError`, `RemoteQueryError` | Server Source failed or payload too big | Retry transient errors; shrink oversized ones |
| `RemoteMutationError` | Server failed, refused, or 413 payload | Retry transient errors; fix refusals |
| `Unreachable` | Network drop, timeout, or gateway 502 | `Data.retry` (automatic for durable writes) |
| `RemoteLiveError` | Live stream disconnected | Reconnects automatically; check `liveStatus` |
| `RemoteProtocolError` | Client and server protocol mismatch | Deploy matching versions |
| `DecodeError` | Response shape disagrees with Selection | Align Selection and server schema |
| `Unavailable` | Server omitted a selected field | Drop field from Selection |
| `Overlaid` | Overlay lacks an unfetched field | Overlay every field read |
| `Unauthenticated` | Missing or expired session | Retry after signing in |
| `Forbidden` | Caller lacks permission | Retry only under a different principal |

Failures propagate to every dependent read: a list fails when any row's required field fails, while rows still loading keep `Refreshing` so partial results stay visible.

A broken live stream keeps showing cached data, records a gap, and reconnects with backoff (`liveStatus` reads `Reconnecting`). If the server rejects the subscription query itself (`RemoteLiveRefused`, such as exceeding `maxIdsPerEntity`), `liveStatus` reads `Refused` until requirements change; see [When a stream breaks](../packages/remote/README.md#when-a-stream-breaks).

Call `Data.inspect(model).failures` to view all active read failures alongside recorded diagnostics; see [When a read fails](../packages/remote/README.md#when-a-read-fails) for everything that clears a failure.

## Write failures and typed refusals

When a mutation fails, Remote removes its optimistic layer and records the failed input in `Data.failedWrites` until retried, dismissed, or cleared by `Data.forget`. Continuing the project example with a declared `Rename` mutation:

```ts
import { Mutation, Refusal } from 'foldkit-remote'

const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
  Refusal: Schema.Union([Refusal.field('name', Schema.String), Refusal.conflict]),
})
const WriteData = Remote.make({ model: App.model.remote, entities: [Project], mutations: [Rename] })

const notices = (model: Model): ReadonlyArray<string> =>
  WriteData.failedWrites(model, Rename).map(write =>
    Option.match(write.refusal, {
      onNone: () => `"${write.input.name}" was not saved: ${write.error.message}`,
      onSome: Match.valueTags({
        Field: ({ reason }) => `"${write.input.name}": ${reason}`,
        Conflict: () => 'Someone changed this project meanwhile.',
      }),
    }),
  )

const retried = (model: Model, requestId: string): Update.Return<Model, Message, RemoteClient> =>
  Option.match(WriteData.retry(model, requestId), {
    onNone: () => ({ model }),
    onSome: started => ({ model: started.model, commands: [started.command] }),
  })
const dismissed = (model: Model, requestId: string): Model => WriteData.dismiss(model, requestId)
```

- **`Data.failedWrites(model, Rename)`** returns failed writes oldest-first with typed `input` and `refusal`. Non-durable writes clear on page reload.
- **`write.refusal`** holds `Option.some` for declared business refusals and `Option.none` for network or unexpected server errors.
- **`Data.retry`** re-sends the write with the same request ID and operation ID (so a ledgered server returns the previous outcome instead of re-applying) and restores its optimistic overlay.

To react to a failure in `update` (such as restoring focus), share `MutationFailed` in `Data.wiring(actives, { shared: ['MutationFailed'] })`. Unshared failed writes emit a `WriteUnheard` diagnostic.

### Durable writes that outlive a reload

Using `Data.mutate(model, M, input, { durable: true })` with `outbox(Data, ...)` stores the mutation in `KeyValueStore` before sending:

| Failure | Ordinary mutation | Durable mutation |
| --- | --- | --- |
| `Unreachable` (offline or timeout) | `Failed`; manual `Data.retry` | Stays `Waiting`; retries with backoff |
| Declared server refusal | `Failed` in `failedWrites` | Same; persisted until dismissed or retried |
| Reload before response arrives | Lost | Re-sent on load with same operation ID |

Use `outboxStatus(Data, model)` (`{ waiting, failed, items }`) to render indicators such as "3 changes waiting" when `attempt > 0`. Durable mutations require a ledgered writer (`RemoteServer.write` or `foldkit-remote-drizzle`'s `writer` with a ledger) so retries of already-applied writes return cleanly.

The outbox emits two diagnostics when local persistence has trouble:

- **`OutboxUnreadable`:** A stored entry cannot be decoded by the current schema; `outboxStatus` surfaces it as `Unreadable`, later items proceed, and `Data.dismiss` clears it.
- **`OutboxUnsaved`:** Writing to storage failed; current writes still send, but a reload loses them.

For multi-device offline editing that merges concurrent changes, use `foldkit-sync`; see [Remote mutation vs Sync operation](../packages/remote/README.md#remote-mutation-vs-sync-operation).

### Refusals from declared writes

A `Mutation.write` over an Entity's `Write` evaluates rules in a fixed order so unauthorized callers learn nothing about row state:

| Refusal | Cause | Response |
| --- | --- | --- |
| `Forbidden` (`RemoteError`) | Guard rule fails or row is hidden | Show denial; retrying changes nothing |
| `Conflict` | Row revision passed `expect` | Re-read row and let user decide |
| `Unmet` | Row fails `when` or `from` predicate | Show state change message |
| `Invalid` | Row after write breaks an invariant | Show `message` at each `path` field |
| `Taken` | Insert ID already exists | Pick a new ID (retries hit ledger) |

An `Invalid` over a hidden member omits the rule ID and path. Use `Refusal.isInvalidBy(refusal, invariant)` to match a specific Entity invariant. When the client holds the required fields or `may` flag, it computes `Forbidden` and `Invalid` locally using the exact same rules before sending; see [Refused where it is made](../packages/remote/README.md#refused-where-it-is-made).

Database `CHECK` constraints (`checkConstraints` or `entityChecks`) act as a final safety net: tripping one directly returns `Internal error` with an incident ID and logs `StatementFailed` and `ServerDefect`. See [Declared writes](./declared-writes.md#failure-and-recovery).

## Forms

`foldkit-form` controls when validation errors appear so users aren't interrupted before typing:

- **On edit:** Validates the edited field immediately; tabbing through an untouched required field stays quiet.
- **On submit:** Validates all fields and sets `attempted`. Multi-field `foldkit-mixins-form` views render a single `role="alert"` summary above submit while hiding duplicate field alerts.
- **`Message.Validated({ key })`:** Forces validation on a single field (useful after `fill` populates stored values).
- **Cross-field and invariant rules:** Run on submit into `model.errors`; Entity invariants display next to their `path` keys whenever the form holds every field the rule reads.

For `RenameForm = Form.make('Rename', Entity.input(Post, RenameInput))` stored at `model.renameForm`:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })
const RenameForm = Form.make('Rename', Entity.input(Post, RenameInput))
declare const model: { renameForm: typeof RenameForm.initial }
-->

```ts
RenameForm.attempted(model.renameForm)
RenameForm.Message.Validated({ key: 'title' })
RenameForm.Message.Refused({ key: 'title', error: 'That title is taken', value: 'Hello' })
```

`Refused` attaches a server message to the field only while its value matches `'Hello'` and clears on the next edit. `foldkit-crud` dispatches `Refused` automatically for `Refusal.field` and `Refusal.invalid`, mapping other failures to editor status (`SaveFailed`, `Conflict`) and `saveError`. See [Form validation](../packages/form/README.md#validation) and [CRUD status](../packages/crud/README.md#its-status).

## Server responses and error hiding

`RemoteServer.answer` and `serveFetch` scrub internal causes before responding:

| Server condition | Client receives | Diagnostic logged |
| --- | --- | --- |
| Source fails (`RemoteServerError`) or throws | `Internal error` + incident ID | `ServerDefect` with cause |
| Source calls `RemoteServer.tell(msg)` | Typed Remote error with `msg` | None |
| `RemoteServer.refuse(mutation, refusal)` | `422` (`409` for `Taken`) with refusal | None |
| `RemoteServer.taken()` on insert | `409` `Taken` naming Entity + ID | None |
| `RemoteServer.forbid(reason?)` | `403` `Forbidden` | None |
| `RemoteServer.unauthenticated(reason?)` | `401` `Unauthenticated` | None |
| Mutation input fails schema decode | `Invalid mutation input` | None |
| Field withheld by `authorize` | Field omitted (ID omitted if whole row) | None |
| Drizzle query or write statement fails | `Internal error` + incident ID | `StatementFailed` + `ServerDefect` |
| Layer or principal resolver breaks | `500` `Internal error` + incident ID | `ServerDefect` |
| Write commits; answer read fails | Write succeeds; rows re-fetched | `AnswerUnread` |
| Write commits; live publish fails | Write succeeds; live skips notice | `PublishFailed` |

Read the incident ID on the client with `RemoteData.incident(error)` to correlate user reports with server logs. Pass `diagnostics: (diagnostic, request) => Effect` to `serveFetch` to capture every diagnostic for a request, including broken layers. See [Diagnostics](../packages/remote-server/README.md#diagnostics) and [Hardening](../packages/remote-server/README.md#hardening).

## Sync failures and rejected edits

Because Sync stores user intent locally before talking to a server, its failure states differ from Remote mutations (see [When things go wrong](../packages/sync/README.md#when-things-go-wrong)):

- **Offline mode:** Local edits keep saving to the outbox while `status.pending` counts up and exchanges retry with backoff. Failed exchanges set `status.lastError` and emit `ExchangeFailed`.
- **Rejected operations:** When the server rejects an operation, the replica removes it from the outbox, replays remaining edits, and appends the rejection to `status.rejected`. `authorize` denials produce `Forbidden`; `validate` errors or reducer failures produce `Invalid` (`Not a valid operation`) without leaking server exception messages.
- **Storage write failure:** If persisting to local storage fails, the edit reverts and `onPersistenceFailure` returns the fallback `Model`.
- **Outbox durability:** Unsynced operations live only in browser storage; clearing local storage discards unsent work.

## Signed out

### Refusals

When a session expires or middleware returns `401`, Remote reads enter `Failed` and writes land in `failedWrites` with `_tag: 'Unauthenticated'`. Durable writes refused with `401` settle immediately instead of retrying. Match refusals with `RemoteData.denied(error)`:

```ts
import { Option } from 'effect'
import { Denied, RemoteData, type RemoteError } from 'foldkit-remote'

const failure = (error: RemoteError): string =>
  Option.match(RemoteData.denied(error), {
    onNone: () => `Could not load: ${error.message}`,
    onSome: Denied.match({
      Unauthenticated: () => 'Your session ended. Sign in again.',
      Forbidden: () => 'You may not read this.',
    }),
  })
```

Prompt the user to sign in rather than retrying as the same caller. Whenever the signed-in user changes, call `Data.forget(model)` to clear cached rows, failures, and pending writes. See [Auth refusals](../packages/auth/README.md#refusals) and [Who the client believes it is](../packages/auth/README.md#who-the-client-believes-it-is).

## Lazy resources

When a `Resource.lazy` chunk fails to import (for example, offline), `Resource.get` fails with `ResourceLoadError`. The failed import cache is cleared so the next `Resource.get` tries importing again:

```ts
import { Context, Effect } from 'effect'
import { Resource } from 'foldkit-bundle'

class Charts extends Context.Service<Charts, { readonly draw: Effect.Effect<void> }>()('Charts') {}

const drawn = Resource.get(Charts).pipe(
  Effect.flatMap(charts => charts.draw),
  Effect.catchTag('ResourceLoadError', () => Effect.succeed('not loaded')),
)
```

## Diagnostics

A diagnostic is `{ _tag, source, level, message }` plus structured fields. `level` is `'error'` when something broke internally and `'warning'` when application code needs an adjustment. `Diagnostics.report` sends entries to `Diagnostics.Reporter` in Effect context—defaulting to `console.error` for errors and `console.log` for warnings.

Provide a custom reporter in your runtime's `resources` layer using `Diagnostics.layer`:

```ts
import { Effect, Layer } from 'effect'
import { Diagnostics, Remote } from 'foldkit-remote'

const resources = Layer.mergeAll(
  Remote.clientLayer(Remote.http('/remote')),
  Diagnostics.layer(diagnostic =>
    Effect.andThen(
      Diagnostics.log(diagnostic),
      Effect.sync(() => navigator.sendBeacon('/diagnostics', diagnostic.message)),
    ),
  ),
)
```

Use `Diagnostics.layer` (rather than `Layer.succeed`) in the browser so Mounts outside the main runtime share the reporter. Use `Diagnostics.quiet` to suppress warnings in production, or `DevOverlay` from `foldkit-mixins` to view them during development.

Diagnostic tags by package:

| Package | Diagnostic `_tag` values |
| --- | --- |
| `foldkit-remote` | `WriteUnheard`, `LiveRefused`, `OutboxUnreadable`, `OutboxUnsaved`, `PredictionMismatch` |
| `foldkit-remote-server` | `ServerDefect`, `AnswerUnread`, `PublishFailed`, `ClockSkewed` |
| `foldkit-remote-drizzle` | `StatementFailed`, `ServerOnlyRules` |
| `foldkit-guard` | `ComputeRefused`, `UnpinnedWrites` |
| `foldkit-sync` | `ExchangeFailed`, `ExchangeDefect`, `HistoryRebuilt`, `HostDefect`, `ListenerFailed` |
| `foldkit-mirror` | `StoreUnread`, `StoreUnwritten`, `StoreMalformed` |
| `foldkit-ssr` | `PageContained`, `StaticRegionMissing`, `BundleUnloaded`, `PageFailed`, `HandlerUnnamed` |
| `foldkit-media` | `StoreFailed`, `AdmissionFailed`, `ImageFailed`, `FactsUnanswered`, `RequestDefect` |
| `foldkit-mixins` | `MountFailed` |
| `foldkit-agent-mcp` | `AuthenticateDefect`, `CapabilityDefect`, `RequestDefect`, `ToolListDefect`, `TransportEndDefect` |

Remote also stores the newest 256 diagnostics in `Data.inspect(model).diagnostics`, which `Data.wiring` and `Remote.fold` forward to `Diagnostics.report` automatically.

Opt-in checks during development catch configuration mistakes early:

- `Remote.make({ verifyPredictions: import.meta.env?.DEV === true })` compares server answers against optimistic predictions and emits `PredictionMismatch`.
- `GuardServer.validate` throws at startup if a Source omits guard rules, and reports `UnpinnedWrites` when a write lacks revision pinning.
- Invalid static configs (`Theme.make`, `Theme.set`, `Knobs.withValue`) throw `Diagnostics.DiagnosticError` immediately when defined.

## Testing failures

Test failure states with the same deterministic tools you use for happy paths:

- **In-memory trace (`Trace.run`):** Drive `update` and subscriptions against mock failures (`Respond.read(..., { fail })`) and assert `Trace.regressions` stays empty so loaded screens keep their data:

  <!-- docs-check standalone
  import { Effect } from 'effect'
  declare const expect: (value: unknown) => { toEqual(expected: unknown): void }
  declare const loaded: any
  declare const server: any
  declare const update: any
  declare const actives: any
  declare const Data: any
  declare const Project: any
  declare const ProjectName: any
  declare const Message: any
  declare const program: Effect.Effect<void>
  declare const page: any
  -->
  ```ts
  import { RemoteReadError } from 'foldkit-remote'
  import { Respond, Trace } from 'foldkit-remote/testing'

  const trace = await Trace.run(Data, {
    start: loaded,
    update,
    active: actives,
    client: server,
    steps: [
      Message.ClickedTryAgain(),
      Respond.read(Project, 'p1', { fail: new RemoteReadError({ message: 'The server is down' }) }),
    ],
  })
  expect(Trace.regressions(trace, { project: Data.get(ProjectName, 'p1') })).toEqual([])
  ```

- **Prediction parity (`Law.check`):** Verify client pre-checks and server refusals agree; see [Testing that a prediction is the truth](../packages/remote/README.md#testing-that-a-prediction-is-the-truth-law).
- **Diagnostic assertions (`Diagnostics.collect`):** Collect and assert emitted diagnostics around any Effect:

  ```ts
  import { Diagnostics } from 'foldkit-remote'

  const { report, reported } = Diagnostics.collect()
  await Effect.runPromise(Effect.provideService(program, Diagnostics.Reporter, report))
  expect(reported).toEqual([])
  ```

- **Running pages (`Behaviors.consoleErrors`):** Monitor browser `error` diagnostics and assert error banners stay absent:

  ```ts
  import { Behaviors } from 'foldkit-plus/testing/playwright'

  const errors = Behaviors.consoleErrors(page)
  await Behaviors.neverShows(page, {
    text: 'Could not load',
    during: async () => {
      await page.reload()
      await page.getByRole('heading').waitFor()
    },
  })
  expect(errors()).toEqual([])
  ```

## Next

- See how declared writes handle preconditions, invariants, and retries in [Declared writes](./declared-writes.md#failure-and-recovery).
- Read [Remote: when a read fails](../packages/remote/README.md#when-a-read-fails) and [when a write fails](../packages/remote/README.md#when-a-write-fails).
- Learn how Sync handles offline rejections in [When things go wrong](../packages/sync/README.md#when-things-go-wrong).
