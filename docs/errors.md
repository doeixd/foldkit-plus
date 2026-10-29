# Errors and failures

A failure in a Foldkit Plus application is a value with one owner. What a
reader must act on lands in the Model through a Message, where the view draws
it and `update` answers it; nothing throws into a view. What a package meets
and keeps going past, a reader can do nothing about, so it goes to one
channel for whoever runs the application: `Diagnostics`.

This guide maps both across the packages: who owns each failure, what the
reader sees, and what the application does about it. Each package's README
has the details; this page links to them.

## Who owns each failure

| Failure | Owner | What the reader sees | What the application does |
| --- | --- | --- | --- |
| A read failed: the network, the server, a decode | `foldkit-remote` | `Failed`, with the value it showed kept as `previous` | `Data.refresh(model, actives, { failed: true })` |
| A field the server will not answer | `foldkit-remote-server` decides; Remote records it | `Failed` with an `Unavailable` error | select without it |
| A write failed or was refused | `foldkit-remote` (client), the server (refusal) | the optimistic change goes; `Data.failedWrites` lists it, with a typed `refusal` | `Data.retry`, `Data.dismiss`, or show the refusal |
| Who is asking was refused | `foldkit-auth`, `foldkit-remote-server` | `Failed`, or a failed write, that `RemoteData.denied` reads as `Unauthenticated` or `Forbidden` | sign in again, or say no |
| A draft does not validate | `foldkit-form` | an error beside the field; after a submit, the fields to fix | nothing: the person edits |
| The server refuses one key of a form | the server, mapped by `foldkit-crud` | the key reads invalid with the server's words | nothing: the person edits |
| A durable edit is rejected | `foldkit-sync` (the journal decides) | the edit reverts; `status.rejected` says why | explain the revert |
| An exchange fails (offline) | `foldkit-sync` | nothing changes; `pending` grows | nothing: it retries |
| A lazy chunk does not load | `foldkit-bundle` | what the Command's failure Message draws | the next `Resource.get` tries again |
| A defect on the server | `foldkit-remote-server` | `Internal error`, as a failed read or write | read the `ServerDefect` diagnostic |
| A fallback, a swallowed failure, a misused API | the package that met it | nothing, by design | read the diagnostic; fix the cause |

## The mental model

```text
a failure the reader can act on
  └─▶ a typed value ──Message──▶ update ──▶ Model ──▶ view draws it ──▶ the reader acts ──▶ Message

a failure only a developer can fix
  └─▶ a Diagnostic ──Diagnostics.report──▶ Diagnostics.Reporter ──▶ Effect's log, or your sink
```

Three rules follow from it.

- **A value once shown stays on screen.** A refresh that fails keeps the value
  it was refreshing; a list keeps the rows it can draw. A reader keeps working
  with what they had, told that it may be stale. One case breaks it: a field
  that only a write's optimistic layer showed, and that its answer left out,
  reads `Loading` until it is fetched again. The answer carries what the
  Surfaces show of every row it names, so this is a row the server did not
  name, or an answer whose read failed (`AnswerUnread`); `verifyPredictions`
  reports such a field as a `PredictionMismatch`'s `Gap` (see [Checking an answer
  against what was shown](../packages/remote/README.md#checking-an-answer-against-what-was-shown)).
- **Nothing a reader started is retried on its own.** A failed read waits for
  `Data.refresh`, and a failed write for `Data.retry`. A persistent error
  asked again on every unrelated change would hammer the server and hide the
  failure. Only the transports retry by themselves (a live stream, a Sync
  exchange), since asking again changes nothing the reader sees.
- **A diagnostic never changes behaviour.** A read, a write and a placement
  behave the same whether one is reported or not. The channel says why; it
  decides nothing.

## A first example: a read that fails

One read, drawn so that a failure shows, and a button that asks again:

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

// What the screen reads, as a function of the Model.
const project = (model: Model) => Data.get(ProjectName, model.projectId)
const actives = { project: Data.active('Project', model => Option.some(project(model))) }

function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  // ClickedTryAgain, the one Message left: ask again for what failed, and only that.
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
    data: (project, freshness) =>
      h.div(
        [],
        [
          h.h1([], [project.name]),
          Match.valueTags(freshness, {
            Fresh: () => h.empty,
            Refreshing: () => h.p([], ['Updating…']),
            Stale: ({ error }) => h.p([], [`Not updated: ${error.message}`]),
          }),
        ],
      ),
  })
```

`Data.subscriptions(actives)` (or `Data.wiring(actives)`) runs the read; the
[Remote README](../packages/remote/README.md#4-let-the-active-screen-drive-the-fetching)
shows that step and the client.

What each piece does, and does not do:

- **`RemoteData.render`** folds the six states of a read into the four things
  a view draws. `failed` is reached only by a failure with nothing to show. A
  refresh that fails after the project was shown reaches `data`, with a
  `Stale` freshness carrying the error, so the name stays on screen.
- **`notFound`** is not a failure. The server answered and has no such row:
  asking again would answer the same.
- **`Data.refresh(…, { failed: true })`** marks only what failed as due, and
  the read entry asks again. It performs no I/O itself. A read with nothing
  to show reads `Loading` meanwhile, and `Failed` again if it fails again.
- **Nothing here retries on a timer.** Without the button, the failure stays
  until something else writes the value: a live patch, a mutation's answer, a
  page of a list.

## Reads

A read is a `RemoteData`: `Initial`, `Loading`, `Ready`, `Refreshing`,
`Failed { error, previous }` or `NotFound`. `RemoteData.match` is the
exhaustive fold over the six; `RemoteData.render` the view's fold above.
`Initial` is not a failure but is often a mistake: nothing is fetching the
read, which a spinner hides. `Data.why(model, read, { surfaces: actives })`
says why: which list or which field of which row is missing, stale, in
flight or failed, and what restarts it.

A `RemoteError` is `{ _tag, message }`, with `reason` for a refusal of who is
asking and `refusal` for a mutation's declared refusal. Its `_tag` is open,
since a transport may report any failure. The ones Remote and its server
send:

| `_tag` | Meaning | Asking again |
| --- | --- | --- |
| `RemoteReadError`, `RemoteQueryError` | the request failed: the network, or the server's Source (its message) | may work |
| `RemoteMutationError` | a mutation failed: the network, the server's Source (its message), or the mutation's declared refusal (`refusal`, which `Data.refusal` decodes) | may work; a refusal will not, with the same input |
| `RemoteLiveError` | a live stream broke; `Data.liveStatus` carries it while the stream restarts itself | not needed |
| `RemoteProtocolError` | client and server speak different protocol versions | never: deploy one version |
| `DecodeError` | what the server sent does not decode against the Selection | never: the shapes disagree |
| `Unavailable` | the server settled a selected field without a value | never: select without it |
| `Overlaid` | a read of a row only overlays show lacks a field nothing will fetch | never: overlay what it reads |
| `Unauthenticated` | who is asking could not be told: no session, or one that ended | after signing in |
| `Forbidden` | a write refused for who is asking | never, as the same person |

A failure reaches every read that needs it: a list fails when a field of one
of its rows failed, a project when its owner's read did. One that showed a
value keeps it as `previous`. A list whose rows are still arriving reads
`Refreshing` and draws the rows it can assemble, so a row entering unread
never hides the rows already shown.

A broken live stream is not a failed read. It records a gap, keeps what the
server last said, and restarts on its own with backoff, refetching what it
covered; `Data.liveStatus(model, active)` reads `Reconnecting` with the error
meanwhile. A stream the server refuses for what it asks (`RemoteLiveRefused`,
over `maxIdsPerEntity`) is not restarted: it reads `Refused` until its
requirements change. See [When a stream breaks](../packages/remote/README.md#when-a-stream-breaks).

`Data.inspect(model).failures` lists every unsettled failed read, by
connection and by field, beside what is loading and the diagnostics Remote
recorded. The [Remote README](../packages/remote/README.md#when-a-read-fails)
lists everything that settles a failure.

## Writes

A mutation's optimistic change is a layer over the cache. When the write
fails, the layer comes off and the change disappears; Remote keeps the
failure, with the mutation and the input it was started with, until the
application answers it. A mutation can declare what the server may refuse it
with, as data. Continuing the first example, with a mutation registered:

```ts
import { Mutation, Refusal } from 'foldkit-remote'

const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
  Refusal: Schema.Union([Refusal.field('name', Schema.String), Refusal.conflict]),
})
const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [Rename] })

// The view: one notice per rename that did not land.
const notices = (model: Model): ReadonlyArray<string> =>
  Data.failedWrites(model, Rename).map(write =>
    Option.match(write.refusal, {
      onNone: () => `"${write.input.name}" was not saved: ${write.error.message}`,
      onSome: Match.valueTags({
        Field: ({ reason }) => `"${write.input.name}": ${reason}`,
        Conflict: () => 'Someone changed this project meanwhile.',
      }),
    }),
  )

// update: a notice's two buttons.
const retried = (model: Model, requestId: string): Update.Return<Model, Message, RemoteClient> =>
  Option.match(Data.retry(model, requestId), {
    onNone: () => ({ model }),
    onSome: started => ({ model: started.model, commands: [started.command] }),
  })
const dismissed = (model: Model, requestId: string): Model => Data.dismiss(model, requestId)
```

- **`Data.failedWrites(model, Rename)`** lists the failed writes of one
  mutation, oldest first, with `input` and `refusal` typed by it; without the
  mutation, every failed write. A write is listed until it is retried,
  dismissed, or `Data.forget` changes the principal. Nothing drops one on a
  timer, and the list is persisted only for a durable write (below): a reload
  forgets the rest.
- **`refusal`** is `Some` only when the server refused the write as the
  mutation declares. A network failure or a server error is `None`, with the
  `error` saying what happened.
- **`Data.retry`** sends the write again as itself (same input, request id
  and operation id, so a server that already applied it answers from its
  record) and shows its optimistic change again. It is `None` for a write
  that is not failed, so a second press does nothing.

To act on a failure in `update` (move focus, put text back), share it:
`Data.wiring(actives, { shared: ['MutationFailed'] })` hands `MutationFailed`
to the application's own update after Remote has reduced it, so the Model it
receives already lists the write. A wiring that does not share it reports a
`WriteUnheard` diagnostic for each failed write: the change went, and nothing
in the application was told.

### A write that must outlive the page

`Data.mutate(model, M, input, { durable: true })` queues the write in the
outbox (`Data.outbox`) instead of sending it: stored first, sent in order by
one tab, and kept across a reload. What changes for its failures:

| Failure | Ordinary write | Durable write |
| --- | --- | --- |
| Nothing answered (`_tag: 'Unreachable'`: offline, a gateway's error page) | `Failed`; retry by hand | stays `Waiting` and is sent again with a backoff, and when the browser is back online |
| The server refused it | `Failed`, listed by `failedWrites` | the same, and kept in the store until retried or dismissed |
| The page reloaded before the answer | lost | sent again with the same operation id and `now` |

`Data.outboxStatus(model)` says what waits (`{ waiting, failed, items }`), for
a "3 changes waiting" line. A write the server applied but whose answer never
came is answered again from the writer's record, by its operation id: a
durable Mutation needs a ledgered writer (`RemoteServer.write`, or
remote-drizzle's `writer` with a ledger).

Two diagnostics are the outbox's:

- **`OutboxUnreadable`**: a stored write this version cannot read (its
  Mutation is gone, or its input no longer decodes). It is kept, never sent,
  shown in `outboxStatus` as `Unreadable`, and the writes after it are sent.
  `Data.dismiss` removes it.
- **`OutboxUnsaved`**: the store could not be written (full, or refused). The
  writes are still sent, but a reload before their answers loses them.

A durable write is still Remote's: one write, sent once, the server's
answer final. Edits that must merge with other devices' edits while offline
belong to `foldkit-sync`; see [Remote mutation vs Sync operation](../packages/remote/README.md#remote-mutation-vs-sync-operation).

### What a declared write refuses

A `Mutation.write` over an Entity's `Write` needs no declared `Refusal`: its
type says what it may be refused with, and the server decides in this order,
so a refusal discloses nothing to someone who may not write:

| Refusal | When | What to do |
| --- | --- | --- |
| `Forbidden` (a `RemoteError`, not a `refusal`) | the row is hidden from the caller, or a guard rule does not hold; refused where it is made when the held `may` says no | show it; asking again is refused again |
| `Conflict` | the row moved past the revision the write `expect`s | read it again; let the author decide |
| `Unmet` | the row does not hold the write's `when` (only for a write with one) | show why; the state changed |
| `Invalid` | the row it would leave breaks an Entity invariant | show `message` beside each field `path` names |

An `Invalid` over a member hidden from the caller names no rule and no path.
`Refusal.isInvalidBy(refusal, invariant)` asks which invariant refused it. A
`CHECK` constraint from `checkConstraints` is a backstop for writes past the
server: one tripped by a handler's statement fails it as `Database write
failed`, and the driver's error goes only to the `StatementFailed`
diagnostic. See [Declared writes](declared-writes.md#failure-and-recovery).

## Forms

`foldkit-form` decides when a field's error shows, so a form never shouts at
someone who has not typed yet:

- **An edit** checks the key at once. Leaving a field says nothing new, so
  tabbing through a required field shows no `Required`.
- **A submit** checks every key and sets `model.attempted`. Only then does a
  `foldkit-mixins-form` view of more than one control draw the list of fields
  to fix above the submit button. That list is the one `role="alert"` for those failures; the errors
  beside the fields drop their own while it is drawn.
- **`Message.Validated({ key })`** judges one key as it stands, edited or not:
  for a stored value shown after a `fill`, which validates nothing.
- **A rule spanning keys** fails on submit, into `model.errors`. An Entity
  invariant is judged on submit when the form sets every field it reads, and
  shows beside each key its path names; one it cannot judge, the server does.

For `const RenameForm = Form.make('Rename', Entity.input(Post, RenameInput))`,
placed at `model.renameForm`:

```ts
RenameForm.attempted(model.renameForm) // a submit was asked: the fields to fix are drawn
RenameForm.Message.Validated({ key: 'title' }) // judge one key now, edited or not
RenameForm.Message.Refused({ key: 'title', error: 'That title is taken' }) // a server's word, on its key
```

`Refused` lands whatever state the key is in, and holds until the key is
edited. `foldkit-crud`'s editor sends it for you: a save refused with
`Refusal.field` shows the reason on that key, and one refused with
`Refusal.invalid` shows its message beside each key its path names. Any other
refusal is the editor's status (`SaveFailed`, `Conflict`) and `saveError`.
See [Validation](../packages/form/README.md#validation) and
[the editor's status](../packages/crud/README.md#its-status).

## The server: what a client is told

A server answers every failure; what it says is chosen so that nothing
internal leaks. Over `RemoteServer.answer` and `serveFetch`:

| On the server | The client receives |
| --- | --- |
| A Source fails with `RemoteServerError(message)` | `RemoteReadError`, `RemoteQueryError` or `RemoteMutationError` with that message: write it for the reader |
| `RemoteServer.refuse(mutation, refusal)` | a 422 with the refusal, which `Data.refusal` decodes |
| `RemoteServer.forbid(reason?)` | a 403, `_tag: 'Forbidden'`, with `reason` only when given |
| `RemoteServer.unauthenticated(reason?)` from a resolver | a 401, `_tag: 'Unauthenticated'`, with `reason` only when given |
| A mutation's input does not decode | `Invalid mutation input`, and nothing of the schema's message |
| A field `authorize` withholds | the field settled, never why; an id withheld whole reads like an id that does not exist |
| A Drizzle statement fails | `Database query failed` for a read or query, `Database write failed` for a write; the driver's error goes to `StatementFailed` |
| A defect, or a layer or resolver that breaks | a 500, `Internal error`; the cause goes to `ServerDefect` |
| A write committed and its answer's read failed | the answer without the rows; the client reads them again (`AnswerUnread`) |
| A write committed and its live publish failed | the write's answer; live subscribers do not hear it (`PublishFailed`) |

`serveFetch` takes `diagnostics: (diagnostic, request) => Effect`, used for
everything that request runs, a broken layer included; without it the
reporter in the Effect context is used. See the remote-server
[Diagnostics](../packages/remote-server/README.md#diagnostics) and
[Hardening](../packages/remote-server/README.md#hardening).

## Sync: durable edits

A Sync edit is the user's intent, stored before it is sent, so its failures
are different from a mutation's. See [When things go wrong](../packages/sync/README.md#when-things-go-wrong).

- **Offline is not a failure.** Edits keep applying and keep being saved;
  `status.pending` grows, and the exchange retries on a backoff. A failed
  exchange sets `status.lastError` (cleared by the next success) and reports
  `ExchangeFailed`.
- **A rejected edit** arrives on the next exchange, not as an error. The
  replica drops it from the outbox and replays the rest, and the field reverts.
  `status.rejected` lists it with the operation and a `reason`: the
  `authorize` rule's own words when it gave some, `Refused by the server` when
  it refused without any (a plain `false`), and `Not a valid operation` when
  the operation itself failed (`validate` refused or threw, `authorize` threw,
  or the reducer could not apply it). An error's message is never sent.
- **A persist that fails** reverts the edit and calls `onPersistenceFailure`,
  whose returned Model is what the reader sees next. The reader must redo it.
- **The outbox is user data, not a cache.** Edits not yet committed live only
  there. Deleting local storage to "fix" a replica deletes them; evicted
  storage loses them the same way.

## Signed out

A request whose session ended answers 401 with `Your session ended.`; a read
reads `Failed`, and a write is listed failed, with
`_tag: 'Unauthenticated'`. `RemoteData.denied(error)` reads either as a typed
`Denied`:

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

Asking again as the same caller is refused again, so show it rather than
retry. When the signed-in person changes, `Data.forget(model)` drops every
server-derived fact, failures and failed writes included. A live stream
refused this way restarts on its backoff like any break, and is refused
until the page has a session again. See [Refusals](../packages/auth/README.md#refusals)
and [Who the client believes it is](../packages/auth/README.md#who-the-client-believes-it-is).

## Lazy resources

A service whose code loads on first use (`Resource.lazy`) fails its
`Resource.get` with `LoadError` (`_tag: 'ResourceLoadError'`) when the import
fails, a dropped connection for instance. The failed load is forgotten, so the
next `get` imports again: handle it in the Command, and a later ask retries.

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

A diagnostic is `{ _tag, source, level, message }` plus its facts: `source`
names the package, `level` is `error` when something broke on this side and
`warning` when the application should change something. Every package reports
through `Diagnostics.report`, which hands it to the `Diagnostics.Reporter` in
the Effect context and never fails. By default that is Effect's log: the
browser's console, a server's log, `wrangler tail` on a Worker. With Effect's
default logger an `error` is written with `console.error` (stderr on a server)
and a `warning` with `console.log`, so DevTools draws an error red and an
end-to-end check for console errors fails on it, while an offline `warning`
does not. A server that replaced Effect's logger receives both at their level.

Replace it like any service, in a runtime's resources or a server's layer:

```ts
import { Effect, Layer } from 'effect'
import { Diagnostics, Remote } from 'foldkit-remote'

const resources = Layer.mergeAll(
  Remote.clientLayer(Remote.http('/remote')),
  // Logged as by default, and sent on to the server.
  Layer.succeed(Diagnostics.Reporter, diagnostic =>
    Effect.andThen(
      Diagnostics.log(diagnostic),
      Effect.sync(() => navigator.sendBeacon('/diagnostics', diagnostic.message)),
    ),
  ),
)
```

`Diagnostics` is `foldkit-surface`'s, re-exported by `foldkit-remote`. Each
package's variants:

| Package | `_tag`s |
| --- | --- |
| `foldkit-remote` | `WriteUnheard`, `LiveRefused`, `OutboxUnreadable`, `OutboxUnsaved`; `PredictionMismatch` under `verifyPredictions` |
| `foldkit-remote-server` | `ServerDefect`, `AnswerUnread`, `PublishFailed` |
| `foldkit-remote-drizzle` | `StatementFailed`, `ServerOnlyRules` |
| `foldkit-guard` | `ComputeRefused`, `UnpinnedWrites` |
| `foldkit-sync` | `ExchangeFailed`, `HistoryRebuilt`, `HostDefect`, `ListenerFailed` |
| `foldkit-mirror` | `StoreUnread`, `StoreUnwritten`, `StoreMalformed` |
| `foldkit-ssr` | `PageContained`, `StaticRegionMissing`, `BundleUnloaded`, `PageFailed`, `HandlerUnnamed` |
| `foldkit-media` | `StoreFailed`, `AdmissionFailed`, `ImageFailed`, `FactsUnanswered`, `RequestDefect` |
| `foldkit-mixins` | `MountFailed` |
| `foldkit-agent-mcp` | `AuthenticateDefect`, `CapabilityDefect`, `RequestDefect`, `ToolListDefect`, `TransportEndDefect` |

Remote's client also records its diagnostics in the Model
(`Data.inspect(model).diagnostics`, the newest 256), since its reducer is
pure: `Data.wiring` and `Remote.fold` report what each update recorded. An
`update` that calls `Data.reduce` by hand keeps them in the Model and reports
nothing.

**Development and production report the same.** No diagnostic is switched off
in production. What development adds is checks you opt into:
`Remote.make({ verifyPredictions: true })`, which costs a comparison per
answer and a fetch per placed list. `GuardServer.validate`
throws at startup for a guard a server does not apply, and reports
`UnpinnedWrites` for a write a change can come between.

## Testing failures

A failure path is a path like any other: drive it, and assert what the reader
sees.

- **Without a browser**, `Trace.run` from `foldkit-remote/testing` runs the
  real `update` and Subscriptions and holds every request; each `Respond`
  takes `{ fail }` to answer with an error. `Trace.regressions` names every
  step where a read that showed a value stopped showing it.

  ```ts
  import { RemoteReadError } from 'foldkit-remote'
  import { Respond, Trace } from 'foldkit-remote/testing'

  const trace = await Trace.run(Data, {
    start: loaded, // a Model showing the project
    update,
    active: actives,
    client: server, // a fake RemoteClient, or the server's in-process one
    steps: [
      Message.ClickedTryAgain(),
      Respond.read(Project, 'p1', { fail: new RemoteReadError({ message: 'The server is down' }) }),
    ],
  })
  expect(Trace.regressions(trace, { project: Data.get(ProjectName, 'p1') })).toEqual([])
  ```

- **Diagnostics** are asserted with `Diagnostics.collect()`: provide its
  `report` to the Effect under test (here `program`), then assert on
  `reported`, `[]` included.

  ```ts
  const { report, reported } = Diagnostics.collect()
  await Effect.runPromise(Effect.provideService(program, Diagnostics.Reporter, report))
  expect(reported).toEqual([])
  ```

- **On a running page**, `foldkit-plus/testing/playwright`'s `Behaviors`
  watches the page as drawn:

  ```ts
  import { Behaviors } from 'foldkit-plus/testing/playwright'

  const errors = Behaviors.consoleErrors(page) // console.error and uncaught exceptions, from now on
  await Behaviors.neverShows(page, {
    text: 'Could not load',
    during: async () => {
      await page.reload()
      await page.getByRole('heading').waitFor()
    },
  })
  expect(errors()).toEqual([])
  ```

  `consoleErrors` lists every `error` diagnostic the default reporter logs,
  so this test also fails on a `MountFailed` or a `PageContained`. A warning
  is logged with `console.log` and is not listed: to fail on warnings too,
  give the page a reporter that calls `console.error` for them.

## Where to read more

- [Remote: when a read fails](../packages/remote/README.md#when-a-read-fails),
  [when a write fails](../packages/remote/README.md#when-a-write-fails),
  [diagnostics](../packages/remote/README.md#diagnostics)
- [Declared writes: failure and recovery](declared-writes.md#failure-and-recovery)
- [Sync: when things go wrong](../packages/sync/README.md#when-things-go-wrong)
- [Remote server: diagnostics](../packages/remote-server/README.md#diagnostics)
- [Form: validation](../packages/form/README.md#validation)
- [Auth: refusals](../packages/auth/README.md#refusals)
