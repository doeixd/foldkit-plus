# Changelog

All notable changes to this project are recorded here. The project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) per package and is
released from a version tag (`vX.Y.Z`). A release only republishes packages whose
version changed; `pnpm` skips versions already in the registry.

## Unreleased

Writes the client can judge, and failures it can see. Guard rules and query
bodies read other rows (`Expr.path`, `Expr.exists`) and the write's context
(`Expr.viewer`, `Expr.now`), compiled to SQL and judged by the client in three
values; a declared write the client can tell is invalid or forbidden is
refused before it is sent, and `Law.check` holds the client's prediction to
the server's answer. `Entity.sets` declares the members a write's context
fills. Writes may be durable (`Data.mutate(…, { durable: true })` and
`Data.outbox`), and a list may be read live (`Data.query(…, { live: true })`,
served on Workers by remote-drizzle's `pollLive`). Every package reports its
fallbacks and refusals through one typed `Diagnostics` channel, and
`Data.why` says, as data, why a read is loading. `examples/reference` is the
recommended stack end to end, `foldkit-plus/testing/workers` runs a Worker
from its own Wrangler config, and the shipped theme is new. A security review
(#284 and others) bounds live subscriptions and collection reads, stops
caches keeping an answer, and closes several write-rule gaps.

Breaking, under Changed: `Remote.patch` takes a ref for a relation;
`Data.why` returns a `ReadWhy`; a mutation nothing
answered fails with `RemoteUnreachable`; `verifyPlacement` is
`verifyPredictions`; `Data.mutate`'s `now` is a number; the wire protocol is
version 5 and `LiveSource.subscribe` takes `queries`; a `QuerySource` names
its Entity; `MutationSource.run` is given `read`, `now` and `viewer`;
`GuardServer.writer` loses `presets`; `Operation` has four more members;
`invariantChecks` is `checkConstraints`; SSR, agent-mcp and guard report
diagnostics instead of writing to `console`; leaving a form field no longer
validates it, and `Message.Refused` takes `value`;
the net and device primitives' `lastError` and `coords` are `Option`s;
`RemotePersistence.hydrate` returns an `Option`; a socket transport's
shared socket is `TransportSocket`;
a made replica's `submit` takes only durable Messages; the shipped theme's
defaults changed. Under Security: `GuardServer.validate` refuses a served
write no rule governs under `'allow'`, `EntityWriter.insert` takes
`operation`, `LiveHub.subscribe` takes no `maxIdsPerEntity`, and a collection
read whole is bounded. Under Fixed: a write ledger needs a `request` column,
`Expr.givesNul` is `Expr.givesUnportable`, `LawsVerdict` has an `Unanswered`
variant, the CMS `EditorDomain` needs `plan`, and `TagsInput`'s `Typed`
carries `drawn`.

### Added

- **`Form.controlsByKey`**: a form's controls by key, each typed by its own
  key, for a view that places each field itself
  (`form.controlsByKey.email.label`). Reading `controls` by key took a cast.
- **`RemoteData.isUnreachable(error)`**: whether nothing answered a request
  (`RemoteUnreachable`), so a write may or may not have run. A view compared
  the open `_tag` string itself.
- **Write rules and query bodies read other rows: three-valued `Expr`, paths
  and exists** (#242). `Expr.path` follows `one` relations (at most four) and
  `Expr.exists` names a pointing edge; remote-drizzle compiles them to
  subqueries under each reached table's `visible` rule, and refuses to compile
  one without the reader's visibility. `Judge.predicate` and `Judge.query`
  read a `HeldRow` and answer `Known(truth)` or `Unknown { reason }`: a field
  or row the holder lacks or may not see, or an operator or filter only the
  server runs. SQL's null stays apart from unknown, so lists over nullable
  fields stay placeable. `evaluate` and its two-valued kin refuse a path
  rather than read unknown as false. `GuardServer.validate` refuses a body
  that reaches a member with a Read rule through another row ("query ByTag
  reaches Todo's tag, which has a Read rule"), since SQL reads a reached row
  under its `visible` rule alone.
- **A `one` relation is an `Expr` operand.** `Expr.eq(Like.relations.user,
  Expr.viewer(User))` compares the id the link points at, typed as the
  target's id and null where an optional one points nowhere. A row given to an
  interpreter holds the relation under its key as that id, as `Held.rows`
  takes it, and the key is listed among the fields an expression reads. A
  `many` relation is refused as an operand, and no list orders by a link.
  remote-drizzle compiles it to the column the relation is stored on (one
  stored on the other table is refused where the body is registered); the
  Remote client, the memory server and Guard's rules read their ref-keyed rows
  through `Held.fromRefs`.
- **The write's context as `Expr` terms.** `Expr.viewer(Entity)` (who asks, as
  that Entity's id; null for a visitor) and `Expr.now` (the time in
  milliseconds). Query bodies over them compile to SQL with the server's
  viewer and `Clock`, and client list judgements read `Remote.make`'s viewer.
  A body that reads a term with no context is refused (`ContextMissingError`),
  never read as null. `RemoteServer.make({ viewer })` is the server's one
  declaration of the viewer; a Source with a per-reader member (`perViewer`)
  mounted in a server without one is refused at `make`, naming it (#232).
- **A path from the viewer in query bodies.** `Expr.path(Expr.viewer(Member),
  …)` is an operand, so `Expr.eq(Note.fields.orgId, orgOfViewer)` is a body.
  remote-drizzle compiles it to subqueries started at the viewer's id, each
  table under its `visible` rule (a visitor, or a viewer the reader may not
  see, reads null), on SQLite and Postgres. `Judge` reads it from the rows a
  holder has (its `rows` option, `HeldRows.find`), unknown where it lacks the
  viewer's row; `evaluate` refuses it as it refuses a path. No list orders by
  one. The relational conformance suite runs cases over it, with
  `relationalContext`.
- **`Entity.sets`: members whose value is the write's context, declared once
  on the Entity** (#232, #202). `Entity.sets({ author: Expr.viewer(User),
  createdAt: Expr.now }, { on: 'create' })` sets them on every insert, and
  `{ on: 'write' }` on every insert and update (an `editedAt`). A relation
  takes `Expr.viewer` of its target, a text field the viewer's id, a number
  field the time, and a field a path from the viewer
  (`Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team,
  Team.fields.orgId))`), which the server reads through its own sources and
  the client from the rows it holds. A write whose input sets, links, moves or
  computes one is refused where it is declared. `RemoteServer.write` fills
  them from `RemoteServer.make({ viewer })` and the write's time (a value that
  comes to null where the member holds none, as a visitor's, is forbidden, and
  a set field counts as set for invariants); `Data.mutate` predicts them from
  `Remote.make({ viewer })` and its `now`, and `Write.contextValues` is what
  both read. `bind` refuses an Entity that sets from the context only one of a
  field and a relation stored on the same column. It replaces
  `GuardServer.writer`'s `presets` (see Changed).
- **`RemoteServer.make({ clockSkew })`** bounds how far the time a client
  sends with a write (`Data.mutate`'s `now`) may be from the server's clock
  (default 60 seconds; `0` never takes the client's time). Past it the server
  writes its own time and reports `ClockSkewed`. `Remote.now(toMessage)` is
  the Command that reads the time where the reader acts, since `update` reads
  no clock (#232).
- **Guard rules read who asks.** `Guards.declare(…, { viewer: User })` names
  the Entity each principal is a row of, by `key`, so a rule compares with
  `Expr.viewer(User)`, on the server in memory and in SQL;
  `Policy.viewer(principal)` is that ref, for `RemoteServer.make({ viewer:
  Policy.viewer })`. A row's `Read` rule may reach other rows (a path, an
  exists, a path from the viewer), compiled to SQL over the rows as stored;
  `Guards.attach` refuses such a rule on every surface but `Read`, `Update`
  and `Delete`. A rule over `Expr.viewer` without a set's `viewer`, or over
  `Expr.now`, is refused where declared. remote-drizzle exports
  `bodyOperations`.
- **Write rules over paths, judged in the write's statement.** A row's
  `Update` and `Delete` rules may read another row (a path, an exists, a path
  from the viewer). `GuardServer.writer` judges what the row alone decides and
  hands the rest to its writer as `requires` (`RowRequirement`,
  `WriteRequirement` in `foldkit-remote-server`; an `EntityWriter` with
  `requires: true` holds the row to it); remote-drizzle's `writer` compiles it
  into the UPDATE or DELETE that writes, and refuses a row that fails it with
  `Forbidden`, so the rule reads the other row as the write lands, on SQLite
  and Postgres. A write that would change what such a rule reads of its own
  row is refused, whether the path ends in a field or an exists (a member of
  one team cannot move a note into a team they have no seat on), and a path
  from the viewer where the row written is the viewer's own (a member cannot
  move their own team out of the organisation their rule reads; #294);
  `Condition.reachedFrom` takes the row written for it. The server's
  `may` leaves such an interaction out; `GuardServer.writer` throws for such
  rules over a writer without `requires`. `Create`, members, relations, named
  interactions and `always` still refuse such a rule at `Guards.attach`.
- **`may` foreseen for a row the client writes** (#242).
  `Derived.make(schema, { predict })` says how a client foresees a supplied
  member: `predict({ entity, row, rows, context })` over the row a write
  leaves, held over the store (a field the write moves unknown), none where it
  cannot know. `predictionOfWrite` runs it for an insert and an update.
  `Guards.may` declares one: every rule judged over the store with `Judge`,
  principal guards, the principal's fields and what the store lacks unknown;
  `may` is foreseen only where it comes out the same however those turn out
  (`Condition.judge`). The server's `may` is assembled by the same code.
  Chirp's rules compare with `Expr.viewer`, its server's viewer is
  `Policy.viewer`, and a chirp you post is drawn in the timeline, with its
  Edit, before the answer.
- **A declared write the client can tell is invalid or forbidden is refused
  where it is made.** `Data.mutate`, for a declared write called without
  `optimistic`, judges the Entity's invariants over the row the write would
  leave, as the store holds it, and asks each supplied member that declares
  `forbids` (`Derived.make(schema, { forbids })`, which `Guards.may` declares;
  `WriteSurface`: `kind`, `members`, `relations`) whether its held value
  refuses the write. Where one is definitely broken or forbidden it shows and
  sends nothing, and its Command answers `MutationFailed` with the refusal the
  server would send (`Refusal.invalid`, or `Forbidden` with the `explain` as
  `reason`). Undecided refuses nothing; the server still decides.
- **`Law.check`, the law between the client and the server** (#257, #265).
  `foldkit-remote/testing` runs one declared write through `Data.mutate`, over
  a Model holding what the server sends the principal, and through the server
  (`RemoteServer.handlers`), with the same `now`, and compares every part the
  client predicted (each field, whether a row is there, each list's order)
  with what the server then holds, both as the Model showed the write and once
  the answer is reduced into it (`LawPart.when`: `'pending'` or
  `'answered'`). A write the client refuses as invalid is sent to the server
  too, which must refuse it alike, and a local refusal is compared with the
  server's by `refusal`, by `_tag` where none is declared. What the client left
  unknown is not compared; a check that compared nothing throws.
  remote-drizzle's `law.test.ts` runs it over a test domain on SQLite, PGlite
  and the locale Postgres job, and checks that a row its CHECKs refuse is one
  the client judges invalid; Chirp's and the reference app's run it over every
  write they declare.
- **A list over a path is judged by the client.** `matching`,
  `belongsEncoded` and so placement judge a body over a path or a path from
  the viewer with `Judge` over the whole store: a row whose path the store can
  follow is placed, filtered or taken out, and one reaching what the store
  lacks is skipped and left to the server. A held list re-judges when what a
  path reaches changes: a member relinked, a reached row renamed, a row an
  exists counts deleted, or the viewer's own link moved.
- **A pending insert joins the lists its body admits,** where each loaded
  list's order puts it, and the answer keeps it there; a list over the viewer
  places it with the viewer its operation was predicted for
  (`MutationStarted.viewer`). A list with no body, or one filtered by a read
  rule the client does not run, is the server's to place (#266).
- **The durable outbox** (#247, #260). `Data.mutate(model, M, input, {
  durable: true })` queues a write rather than sending it, and `Data.outbox({
  key, scope, retry })`, assembled beside `Data.wiring`, stores the queue in a
  `KeyValueStore` and sends it: stored before sent, oldest first, one at a
  time, by one tab (a Web Lock), with the same operation id (the request id)
  and `now` again after a reload, and again after a send nothing answered
  (`RemoteUnreachable`, with a backoff and on `online`). A refusal settles as
  for any write; `Data.retry` queues it again and `Data.dismiss` removes it
  from the store. `outbox.restore(model)`, resolved as the runtime's `flags`,
  shows what a reload left and mints the page's session. Tabs share the store
  and hear each other over a `BroadcastChannel`. The queue is held for its
  `key` and `scope`, so a change of principal neither sends the last one's
  writes as the new one's nor writes over them. `Data.outboxStatus(model)`
  lists what waits, failed, or cannot be read after a deploy
  (`OutboxUnreadable`, kept and skipped); a store that cannot be written
  reports `OutboxUnsaved`. New Messages: `MutationQueued`, `OutboxRead` (with
  its `scope`), `OutboxDelayed`. `Trace.run` takes the `outbox`. Chirp posts
  durably: `?offline` makes its sandbox refuse writes, a chirp then waits ("1
  chirp waiting to send"), survives a reload, and is sent by a reload without
  `?offline`.
- **Failed writes are kept, typed, until dealt with** (#260). The mutation
  ledger keeps what each write was: `Data.failedWrites(model, mutation?)`
  lists them with input and refusal typed by the mutation,
  `Data.retry(model, requestId)` sends one again as itself (its optimistic
  change shown again), and `Data.dismiss` forgets one; a failure that lands
  after `dismiss` does not list it again. `Data.wiring(actives, { shared:
  ['MutationFailed'] })` hands the application's own update Remote's Messages
  after Remote has reduced them (`RemoteWiring` has a `shared` field), and an
  applied retry leaves the ledger's `failed`.
- **A list read live** (#270). `Data.query(Q, input, { select, first, live:
  true })` follows the rows that join, change or leave the list while a
  Surface reads it, with no row of its own to subscribe to; `Crud.list` takes
  `live`. The live entry sends each list as its read sends it
  (`LiveRequirement.queries`, at most 32, refused at decode); the handler
  admits it (a registered query, an input that decodes, a `select` of the
  Entity the query lists, and a `first` counted toward `maxIdsPerEntity`, else
  `RemoteLiveRefused`) and hands the live source of its Entity a `LiveQuery`
  (`identity`, `select`, and `edges`, the query run as the subscriber with the
  page's window). A row that leaves while it is still there to the subscriber
  is removed from the list, not deleted from the client's store. The reference
  app and `examples/cloudflare` read their lists live.
- **`pollLive`, `rowChangeLog` and `rowLog` in `foldkit-remote-drizzle`: live
  data on Workers** (#206, #264, #274, #279). `pollLive({ every, changes })`
  is a polling `LiveSource`: each tick it reads every subscribed row in one
  read, through `RemoteServer.readAs` (the read the handlers make: the
  declared fields `authorize` allows, through `filter`), and sends each row's
  fields whose values changed (`Equal.equals`), every changed field a list or a
  subscription selects. It diffs each list a subscriber reads live, invalidating
  it as the stream opens and running its window again each tick that may have
  moved it, so a row joins and leaves by the query's filter and window; a row
  in the window the subscriber can no longer read is removed. A failed read is
  asked again from the same log entry next tick. `rowChangeLog(binding)`
  returns the SQLite statements for a trigger-kept log of the rows each write
  touched, and `rowLog(binding)` reads it, so a quiet tick reads no rows; a
  log trimmed while it reads answers `ids: None`. `LiveSource.reads` names the
  Source a live source reads through, so `GuardServer.validate` accepts a
  `pollLive` over the guarded Source it checks and refuses any other live
  Source over a guarded Entity. `RemoteServer.readAs` and
  `RemoteServer.allowedFields` (which fields a read answers without reading)
  are exported. `examples/cloudflare` uses them; its migration `0004`
  replaces its log table with `todos_row_changes`.
- **`foldkit-plus/testing/workers` and `foldkit-plus/testing/playwright`**
  (#239, #253, #269, #274). `Stack.start` runs a Worker on a local workerd
  from its own Wrangler config, read with Wrangler's own reader (bindings,
  compatibility date and flags, `.dev.vars`, a migrated D1 per stack), and
  swaps it in place on change, keeping D1, R2 and Durable Object storage; it
  refuses a date the installed workerd does not support, a config without
  `no_bundle`, and `[env.*]` sections. A rebuild that bundles to no code (an
  editor emptying the file before writing it) is reported through
  `onBuildError`, and the running Worker keeps answering. It prints each line
  the Worker writes to its console, prefixed `[worker]`, unless `console:
  'quiet'`; `stack.logs()` takes the lines (`WorkerLog`) since the last call.
  `vars` may be a function of the origin the stack answers at. `Stack.stop`
  stops workerd and removes the bundle's directory even after a failed watch,
  and a second `stop` returns the first's promise. `Stack.writeBundle` writes
  the same bundle where `main` says. `Behaviors.optimistic` checks a write
  shows while every Remote mutation is held and after its answer,
  `Behaviors.neverShows` that a text never shows during some steps, and
  `Behaviors.consoleErrors` collects errors. `wrangler`, `esbuild` and
  `playwright` are optional peers, and a missing one says what to install. It
  moved from `examples/cloudflare`, whose `pnpm dev` now serves the page and
  swaps the Worker on every change.
- **`Diagnostics`: one typed channel for fallbacks, refusals and swallowed
  failures** (#237, #272). In `foldkit-surface`, re-exported by
  `foldkit-remote`: each package declares its own variants on a base `{ _tag,
  source, level, message }`; reports go to the `Diagnostics.Reporter` service
  (`Layer.succeed(Diagnostics.Reporter, report)` replaces it), and
  `Diagnostics.collect()` gathers them for a test. By default an `error` goes
  to `console.error` in a browser and stderr on a server, and a `warning` to
  the log. Each package's variants:
  - `foldkit-remote`: `PredictionMismatch`, `LiveRefused`, `OutboxUnreadable`,
    `OutboxUnsaved`, and `WriteUnheard` for a failed write when the wiring
    does not share `MutationFailed`; the wiring and `Remote.fold` report what
    the reducer recorded.
  - `foldkit-remote-server`: `ServerDefect` for every failure `serveFetch` or
    `RemoteServer.answer` answers with a generic 500 or a live stream's error
    frame (the caller is still told nothing, #221), `AnswerUnread`,
    `PublishFailed` and `ClockSkewed`; `serveFetch` takes
    `diagnostics(diagnostic, request)`.
  - `foldkit-remote-drizzle`: `StatementFailed`, and `ServerOnlyRules` once
    per binding on its first write (#259).
  - `foldkit-guard`: `UnpinnedWrites` and `ComputeRefused`.
  - `foldkit-ssr`: `PageContained` (with a `reason`, `NoBuildId` and
    `OtherBuild` among them), `StaticRegionMissing`, `BundleUnloaded`,
    `PageFailed`, `HandlerUnnamed`; `SSR.hydrate` takes `diagnostics`,
    `SSR.entry` takes `diagnostics(diagnostic, request)` (#210).
  - `foldkit-sync`: `ExchangeFailed`, `HistoryRebuilt`, `HostDefect { stage }`
    for every 500, 1011 close or unsent notice, and `ListenerFailed`;
    `documentHost` and `defineDocumentHost` take `diagnostics(diagnostic,
    request)`, `serveJournal` takes `diagnostics`.
  - `foldkit-agent-mcp`: `CapabilityDefect`, `RequestDefect`,
    `ToolListDefect`, `TransportEndDefect` and `AuthenticateDefect`; its
    `handler`, `httpHandler`, `httpApp` and `stdio` take `diagnostics` (stderr
    under `stdio`).
  - `foldkit-mirror`: `StoreUnread`, `StoreUnwritten`, `StoreMalformed`.
  - `foldkit-media/server`: `StoreFailed`, `AdmissionFailed`, `ImageFailed`,
    `FactsUnanswered`, `RequestDefect`, with a reporter in `serveFetch`'s
    `layer(env)`.
  - `foldkit-mixins`: a composed Mount that fails reports `MountFailed` (a
    `foldkit-surface` diagnostic, apart from `foldkit-mixins`' own
    attachment `Diagnostics`).

  Several of these (a malformed mirror document, `factsOf`'s cache failures,
  Sync's swallowed listener and host failures, agent-mcp's capability and
  transport defects) were silent before.
- **`Data.timeline` and `Trace`: when a read went back to `Loading`** (#234,
  #248, #250). `foldkit-remote/testing`'s `Trace.run(Data, { start, update,
  active, client, steps })` runs the application's `update` and the domain's
  own Subscriptions from a Model, holding every request; `Respond.query`,
  `Respond.read`, `Respond.mutation` (each with `{ fail }`) and `Respond.all`
  let held requests go on, and every Model between is recorded.
  `Trace.regressions` names each time a shown read went to `Loading`,
  `Initial` or `Failed` without its value, with the step, the Message and its
  `ReadWhy` (`why`), so a list that blinks for one frame is tested without a
  browser. `Data.timeline(start, history, reads)` takes recorded (Message,
  Model) pairs, as Foldkit's devtools records them, and gives each change of
  each read's tag with the Message, `why` and `regression`. Foldkit's
  devtools offers no panel for another package, so the timeline is the data a
  panel would draw.
- **A mutation's answer carries what the page shows of every row it names**
  (#243, #245, #265). `Data.mutate` sends what the active Surfaces read of each
  entity, and every field its own optimistic layer shows (`shown`, bounded),
  and `RemoteServer.handlers` reads those fields of each row the answer names,
  through the Sources, `authorize` and `filter`, after the write
  (`MutationResult.read`). The client writes it in the reduction that releases
  the optimistic layer, so a created or edited row no longer leaves its lists
  for a frame, lists place it by every value it carries, and a count predicted
  on a row no Surface reads keeps its new value. Nothing to configure. A
  handler names a row it changed with `Remote.patch(Entity, id, {})`; a failed
  read reports `AnswerUnread` and the mutation still succeeds.
- **`Remote.tombstone(entity, id)`, a pending delete** (#246). In a
  mutation's `optimistic` list or `Data.overlay`, the row reads `NotFound` and
  leaves every list and every relation that lists it until the request
  settles, as an answer's `deleted` does, so no `ConnectionChange.remove` per
  list is needed. A failure brings it back everywhere; `Data.confirmed` still
  reads it; it wins over every pending patch of its row. A `Mutation.write`
  over `Write.delete` shows its row deleted the same way while pending.
- **`Derived.count(Other.relations.pointer)`: a derived member that says what
  it counts** (#233, #245), the rows whose `one` relation points at this one.
  `bind` compiles it from the pointing relation's column under that table's
  `visible` rule (and refuses a `derived` entry for it); a declared write
  predicts the counts it moves (an insert adds one where it points, a delete
  or relink moves it); and a declared write that wrote names every row its row
  points at, before and after, read as the asker may see it (stored links only
  for a writer with no `read`), so a like's answer carries its post's count. A
  delete that deleted nothing answers the same whether the row was hidden or
  never there. Each derived member carries `derives` (`Supplied`, `Count` or
  `Exists`); `MutationSource.run` may return `pointed`;
  `RemoteDescriptor.registry.derived` (`DerivedBy`: `Count` | `Exists`) and
  `derivedOfWrite` list them. Chirp's profile shows `postCount`.
- **`Derived.exists(Like.relations.post, { viewer: Like.relations.user })`:
  "liked by me"** (#233, #216). The id of a row pointing here and at whoever
  reads it, or none (`Option<string>`), so an unlike knows what to delete.
  `bind` compiles it with no entry, under the pointing table's `visible` rule;
  a server answers it for the viewer `RemoteServer.make({ viewer })` declares
  (a live hub re-reads it once per viewer, whatever its `key` shares), and
  listing it as `shared` is refused. `Remote.make({ viewer })` lets a declared
  write predict the `Derived.exists` it finds or loses, and the count it moves.
  Chirp's like is a `Like` Entity with `LikePost` and `Unlike` declared writes,
  accepted only under the id derived from its post and its liker.
- **CHECK constraints come from the Entity** (#259). `entityChecks(Entity, t)`
  puts the CHECKs an Entity implies into a Drizzle table, for `drizzle-kit`;
  `checkConstraints(binding)` gives them as SQL clauses, with `serverOnly`
  listing each rule only the server holds. A rule compiles only where SQL says
  it exactly (lengths in code points, non-empty, a single-bracket ASCII
  pattern, numeric bounds, literals, state invariants), and agrees with the
  Schema on NaN, NUL and `real`: on Postgres a numeric bound decides NaN as
  Effect does; on SQLite, which stores NaN as NULL, a bound compiles only over
  a finite field; a pattern's CHECK refuses NUL; every number rule over a
  Postgres `real` column is `serverOnly`, as are rules inside a
  `Schema.Record` or a suspended schema. `bind` refuses a table whose own
  Drizzle `check()`s say another rule or miss one beside the others, matching
  a check that names its columns without the table, as `drizzle-kit pull`
  writes them; it compares the Drizzle definition, never the migrated
  database. Chirp's tables use them.
- **A write ledger on Cloudflare D1** (#285). D1 refuses a transaction's
  `BEGIN`, so the ledger reads the record first, then writes the row and its
  record in one `batch`, the record only where the write changed a row
  (`changes() > 0`). It keeps the idempotent retry, `request` refusal,
  retention and pruning of SQLite and Postgres, and a copy that loses a race is
  answered from the winner's record. A column the answer holds may not be a
  `blob`. Before, a ledger on D1 refused every write it would record.
  `examples/reference`'s notes writer keeps one.
- **A server-rendered page reads its data in process, as its reader** (#212).
  `SSR.requestContext<C>(name)` is a value a host attaches to a request
  (`attach`) for `renderPage` to read (`of`, an `Option`), across separately
  bundled copies. `pageReader(config)` in `foldkit-remote-server/fetch` is a
  page render's in-process, read-only `RemoteClient` layer from `serveFetch`'s
  own config: no HTTP, and a mutation or live open fails.
  `AuthServer.resolver({ requests: 'navigation' })` reads a `GET` or `HEAD`
  page request's cookie without the `Origin` and CSRF checks a script must
  pass; it refuses a protocol upgrade and a request whose `Sec-Fetch-Mode` is
  not `navigate`. `examples/auth` serves pages, `/remote` and `/auth` from one
  fetch handler this way.
- **`Resource.lazy(Tag, load)` in `foldkit-bundle`: a service whose code is its
  own chunk** (#244). An entry of `resources` that imports nothing until a
  Command's `yield* Resource.get(Tag)`, which imports and builds it into the
  runtime's scope once, shared by Commands asking while it loads. A failed
  import is a typed `Resource.LoadError`, retried by the next `get`; a `get`
  after the runtime closed is interrupted. `Resource.prefetch` starts it early;
  Commands require `Resource.Lazy<Tag>`. The auth example loads Yielded's
  client this way: its entry chunk fell from 248.0 kB to 235.0 kB gzipped.
- **`Agent.host(config)` and `Agent.headless(config)`** (#258, #274). `host`
  wraps a Foldkit application's config (for `run`, `hydrate`, `embed` or
  `SSR.hydrate`) and returns the config to start and a host that reads the
  Model the runtime committed and queues Messages into it, so an agent's
  Message runs its Commands and Remote as a click does; `dispatch` resolves
  once `update` applied it. It hosts the first of two runtimes started in one
  tick and refuses the second. `headless` runs the same `init`, `update`,
  Commands and Subscriptions with no view, for tests and servers, one per
  session. The kitchen-sink agent runs on a headless app.
- **`Site.routing` preloads a link's page on intent** (#227). `preload: {
  links, intended, read }` subscribes to `links` (`pointedLinks()`), sends and
  claims the application's `intended` Message, skips addresses the tree does
  not hold and the route shown, and hands `read` (`there =>
  Data.preload(there, actives)`) the Model with the route set there; the Model
  is unchanged, and the reads land as Remote's `Preloaded`.
- **A Site node's Surface may read the signed-in viewer** (#219). `surface: {
  surface, viewer: model => Option<Viewer>, params: (route, viewer) => params
  }` is active on its route only once `viewer` gives one, and inactive again
  when it gives none, so a viewer-keyed Surface (a home feed) needs no
  hand-written `Surface.at` gating. Without `viewer`, reading a second
  `params` argument is a type error.
- **`npx foldkit-plus docs <query>` answers from the docs installed in the
  project** (#250, #252): the best sections of each installed Foldkit Plus
  package's README and of the `foldkit-plus` skill if installed, and for a
  symbol (`Data.preload`) its declaration, each naming its package version,
  file and line. `--list [topic]` prints an outline and `--json` is for
  programs; a folder with no project, nothing installed, or no match exits 1
  with a reason. `foldkit-plus/remote/testing` re-exports `Trace`.
- **`npx foldkit-plus setup` gives a `.gitattributes` that keeps LF** (#254).
  When none applies to the project (in its folder or above it, up to the
  repository's root), step 1 tells the agent to write one with `* text=auto
  eol=lf` and `*.wasm binary`; one the project has is left as it is. For an
  existing project, step 3 points at the skill's `AGENTS.md` block (#256).
- **The skill has a recommended `AGENTS.md` block for applications**
  (`references/agents-md.md`, #256): use what the packages provide, prefer
  Effect, read the installed types, which skills to load, house rules, and
  one-line traps per package. `SKILL.md` and `greenfield.md` point to it.
- **The skill has an Alchemy guide** (`references/alchemy.md`, #207), and the
  greenfield guide's CAFE stack (Cloudflare, Alchemy, Foldkit, Effect) points
  at it. Its `alchemy.run.ts` deploys `examples/cloudflare`'s Worker as one
  `Cloudflare.Website.Foldkit`; against `alchemy@2.0.0-beta.84` it
  type-checks and plans, but has not been deployed. Wrangler, which
  `examples/cloudflare` publishes with, is the fallback.
- **"Errors and failures", one guide to how failure works across the
  packages** (`docs/errors.md`): who owns each kind of failure, what the
  reader sees, and what the application does, for reads, writes and refusals,
  forms, what a server tells a client, Sync, a lost session, lazy resources,
  `Diagnostics`, and testing failures. Published under Learn on the site, and
  linked from the remote, remote-server, form and sync READMEs and the skill.
- **`examples/reference`: the recommended stack, end to end** (#228; findings
  #264 to #271). One Worker over D1 serves the page's assets, Yielded's
  routes, Remote and every page, the pages rendered in process as the reader
  (`pageReader`, `SSR.requestContext`, `requests: 'navigation'`) into Vite's
  `index.html`. A notebook with sign-up, a list and a detail page, optimistic
  declared writes through the guarded writer (author and time set from the
  context by `Entity.sets`), `Derived.count`, a live list over `pollLive`,
  CHECKs derived from the domain, and a validated server, `live` included.
  Every request is checked against its configured `ORIGIN`. Its tests run it
  from `wrangler.toml` on workerd and in Chromium with `Behaviors`.
- **`examples/cloudflare` signs people in with Yielded Auth on D1** (#208). The
  Worker serves Yielded's routes (`/auth/…`) and `/me` beside Remote, built
  once per isolate over `@yielded/auth-persistence-drizzle/D1`, whose commits
  are D1 batches; sign-up writes the application's `accounts` row in the batch
  that binds the email. Migration `0005` creates the tables, and a miniflare
  test signs up, in, and out. The Worker runs with `nodejs_compat` and needs
  `AUTH_ORIGIN` set.

### Changed

- **A theme refusal names the call and the knob (#237).** `Theme.make`,
  `Theme.set` and `Knobs.withValue` threw a bare `SchemaError` for a value
  out of range (`Expected a value between 6 and 36 at ["dark"]`), naming
  neither, and a plain `Error` for an unknown knob. Both are now
  `Diagnostics.DiagnosticError`s: `theme:knob-value` (`Theme.make:
  surface.lightness refuses its value: …`) and `theme:unknown-knob`, with the
  knob path in `details`.
- **Breaking: `Remote.patch` takes a ref for a relation** (#238).
  `owner: Remote.ref(User, 'u1')`, an array of refs for a `many`, a page of
  refs, or `null` where it is optional; the patch holds the ref key the store
  keeps. A ref key typed by hand was checked only up to its prefix, and not
  at all from untyped code; it, and a ref to another entity, are now refused
  by the type and when the patch is made. Write `author: 'User:u1'` as
  `author: Remote.ref(User, 'u1')`. The descriptor's own `patch` and
  `Entity.patch` stay wire-shaped.
- **`Data.active` and a placed Crud piece's `active` keep the read's type.**
  `projectionOf(model)` gave a `Projection` of `unknown`, so code reading
  it cast; it now gives the read itself, and an editor's reads a
  `RemoteData` of the members its form writes.
- **Breaking: the net and device primitives hold what is absent as an
  `Option`.** `lastError` in `websocket`, `sse`, `Geolocation`,
  `mediaDevices`, `mediaStream` and `permissions`, and Geolocation's
  `coords`, were `null` when absent; they are `Option`s, stored as `null` in
  JSON (`Schema.OptionFromNullOr`). Read them with `Option.match`, or
  `Option.getOrElse(model.chat.lastError, () => '')` where a view wrote
  `?? ''`. A failure repeated with the same text still leaves the Model as
  it was.
- **`Freshness` is a tagged union with its own `match`.** What
  `RemoteData.render` tells its `data` branch was a bare type, so a view
  folded it with Effect's `Match.valueTags`; `Freshness.match` folds it
  exhaustively, and `Freshness.Fresh()`, `.Refreshing()` and
  `.Stale({ error })` make one.
- **Breaking: `RemotePersistence.hydrate` returns an `Option`.** It gave
  `undefined` for a text it refused (another scope or version, oversized,
  corrupt), so a caller wrote `?? emptySnapshot` or a `!`; it gives none.
  Read it with `Option.getOrElse(hydrate(text, { scope }), () =>
  RemotePersistence.emptySnapshot)`.
- **Breaking: a socket transport's shared connection is `TransportSocket`.**
  `TransportShape.socket` was optional, though `Sync.transport.socket`
  always set it, so a page sharing it with presence guarded for a socket
  that was always there. `Sync.transport.socket` now provides
  `TransportSocket` beside `Transport` (`Layer<Transport | TransportSocket>`),
  read with `Context.get(built, TransportSocket)` or `yield* TransportSocket`;
  `TransportShape` has no `socket`, and a layer without one says so in its
  type.
- **Breaking: a replica from `Sync.forApplication(App).make` takes only
  durable Messages.** Its `submit` accepted any Message of the application
  and refused a local one when run; now a local one does not compile.
  `Sync<Message, Shared, Durable>` names the subset for an annotated export
  (`Durable` defaults to `Message`, as `Sync.define` still checks at run
  time).
- **Breaking: `Data.why` returns a `ReadWhy`** (#248). It lists, in
  `because`, every fact the Model holds about what a read reads, as typed
  references (`Why`, a tagged union with an exhaustive `match`): its list or a
  row's fields `Missing` or `Stale` and whether in flight, with the relation
  path to the row; a failed list or field (which nothing retries on its own); a
  field the server settled without a value; a row deleted, and by which write;
  a live stream reconnecting or refused; a pending write's fields (`Pending`,
  with its request and mutation); and a row a pending write or an overlay put
  in a list or took out of it (`Joined`, `Left`), with each `where` term of the
  list's body judged over the row (`True`, `False`, `Null`, or `Unknown` and
  what it lacked). The reason that decides the state comes first and `message`
  says it, with what restarts it. `reason` is gone (the first `because` entry
  says it: `Why.NotObserved`, `Why.NotFetching`, `Why.NoActiveRecord` for
  `Unknown`), `surfaces` is an `Option`, and `ReadDiagnosis` is removed.
  `ReadWhy` is a Schema, so a devtools client gets JSON.
- **Breaking: a mutation nothing answered fails with `RemoteUnreachable`**
  (#282). A mutation whose request could not be sent, whose answer was not
  JSON or not `{ result }` or `{ error }` (a gateway's `{}`), or that came
  under 408, 429, 502, 503 or 504 (statuses Remote's server never answers
  with) fails with `_tag: 'Unreachable'` rather than `RemoteMutationError`,
  through `Remote.json`, `Remote.http`, `Remote.httpWithLive` and
  `Remote.clientLayer`'s RPC transport. The server may or may not have run it,
  so the durable outbox sends it again under its operation id, which a
  ledgered writer answers from its record. A mutation's own error answer is
  still `RemoteMutationError`, and a read or a query so answered still fails
  with its own error. The JSON clients are typed `RemoteJsonClient`
  (`RemoteRpcClient<never, RemoteUnreachable>`), which `Remote.clientLayer`
  accepts.
- **Breaking: `Remote.make({ verifyPredictions })` replaces `verifyPlacement`**
  (#249, #257). In development it checks every prediction against the
  answer and records a `PredictionMismatch` diagnostic (`Data.inspect(model)
  .diagnostics`, reported through `Diagnostics`), naming its `mutation`, whose
  `part` (`PredictionPart`) is a `Placement` the server's page disagrees with,
  a `Gap` (a field a pending write showed or an active Surface read that the
  answer left out and the store does not hold, so the row leaves its lists
  until it arrives), or a `Value` (a field a pending write showed that its
  answer carries another value of; a field another pending request also shows
  is not judged). `RemoteModel.placementMismatches` and that `Data.inspect`
  field are now its `diagnostics` list, and the `PlacementMismatch` record
  type is gone. Remote has a no-op `CompletedReportDiagnostics` Message.
- **Breaking: `Data.mutate`'s `now` is when the reader acted** (#232). `now`
  on `Data.mutate` and `Remote.mutateInto` was a clock (`() => number`) that
  dated the answer; it is now a number, the time the reader acted: what a time
  the write sets (`Expr.now`) is predicted as, sent with the request
  (`MutationRequest.now`, optional on the wire), kept by the outbox and sent
  again by `Data.retry`. Read it with `Remote.now`. The answer is dated by
  Effect's `Clock`.
- **Breaking: the wire protocol is version 5, and `LiveSource.subscribe` takes
  `queries`** (#270). `LiveSource.subscribe` is now a method given the lists a
  subscriber reads live, `RemoteClient.live` sends them, and
  `REMOTE_PROTOCOL_VERSION` is 5, so a server that would ignore a live list
  refuses the client instead.
- **Breaking: a `QuerySource` names the Entity it lists** (`entity`).
  `RemoteServer.query` reads it from the descriptor, whose `Result` must be a
  connection, and remote-drizzle's `query` from its binding, refusing a
  binding of another Entity than the descriptor lists. The live handler
  refuses a list whose `select` is of another Entity.
- **Breaking: `MutationSource.run` is given `read`, `now` and `viewer`**
  (#232). `read` is one row of another Entity as the asker may see it,
  through the server's own source for it; `now` the write's time; `viewer` an
  `Option` (`none` where no one asks). A caller of `run` outside a server
  passes them.
- **Breaking: `GuardServer.writer` loses `presets`** (#232, #266, #267).
  Declare server-chosen values with `Entity.sets`; guard rules see them
  already set. Chirp's like sends no user, a guard rule over the link the
  context sets keeping a like its liker's, and Chirp and the reference app
  declare an author once: `Post.authorId`, `Like.userId` and `Note.authorId`
  are gone, and the `author` and `user` links are the one member over each
  column.
- **Breaking: `Operation` gains `'viewer'`, `'now'`, `'path'` and `'exists'`.**
  A write's `when`, invariant or computed assignment over `Expr.viewer` or
  `Expr.now` is refused for now (#232).
- **Breaking: `invariantChecks` is replaced by
  `checkConstraints(binding).constraints`,** which carries the field rules
  too (#259).
- **Breaking: SSR, agent-mcp and guard no longer write to `console`** (#237).
  They report diagnostics (see Added), which the default reporter still
  shows; code that spied on `console` provides a reporter instead.
  `GuardServer.validate`'s no-revision warning is an `UnpinnedWrites`
  diagnostic through its `diagnostics` option, and remote-drizzle's failed
  statement is `StatementFailed`, not `Effect.logError`.
- **Breaking: leaving a form field no longer validates it, and an Entity
  invariant's failure is a mark** (#192, #276). An edit still validates its
  field at once, so tabbing through an untouched required field, or leaving
  the field a reset emptied, no longer shows "Required"; a submit still shows
  every failure and sets `model.attempted` (`form.attempted(model)`), which
  `Reset` and `fill` clear. `FormView` draws its "Check these fields" list
  only then, none for a form of one control, and the list is the one
  `role="alert"`. `Message.Validated({ key })` checks one field on request, as
  `Blurred` used to. Invariant failures and `Message.Refused` are marks in a
  new `model.marks`, apart from each key's own validation, so one no longer
  blocks every later submit until the key it names is edited: `form.field`
  and `control(key).field` show them on their key, any edit clears them, and
  `model.fields.<key>` no longer holds such an error. `Message.Refused` takes
  `value`, the key's value in the refused submit, and is dropped when the key
  holds something else since, so a refusal no longer lands on text typed while
  the save was in flight; `Crud.editor`'s and the CMS's refusals follow. A
  Model stored without `attempted` or `marks` decodes them as `false` and
  `{}`.
- **Breaking: the shipped theme is #255's.** `Theme.make({})` is a vivid blue
  (accent 235/0.225/55) on pure greys, radius 0.45, density 1.1, bolder
  tighter headings, fluid type, a 68ch measure, motion 0.5 on a spring, no
  resting shadows and inverted menus; a knob a theme sets keeps its value. For
  the previous look, set `Theme.make({ accent: { hue: 264, chroma: 0.17,
  lightness: 52 }, surface: { saturation: 0.015, lightness: { light: 97.5,
  dark: 22 }, contrast: 26 }, shape: { radius: 1, density: 1 }, type: {
  headingWeight: 600, headingTracking: -0.01, scale: 1, headingScale: 1,
  leading: 1, fluid: 0 }, reading: { measure: 65 }, motion: { scale: 1,
  easing: 'ease' }, shadow: { strength: 100, hue: 264, chroma: 0.03 }, menu: {
  panel: 'default' }, scales: { chroma: 1 } })`. The components' own icons are
  Heroicons' outline set (MIT) at a 2px stroke; to keep Lucide's, pass
  `tokens: Icons.tokens(pack)` with a pack of Lucide's icons by those names.
  `text.link` is the accent's ink, whose light lightness is 0.45, so links and
  accent text read at WCAG AA. `AppStyle.make`'s `theme` is optional:
  `AppStyle.make({})` is the shipped theme.
- **Every palette colour is fitted into sRGB, keeping its lightness and hue.**
  A colour beyond sRGB was clipped by the browser channel by channel, which
  moved its hue (the default accent's ink painted at 257, not 235). Each
  colour, tints and washes included, now lowers only its chroma to its hue's
  sRGB boundary at its lightness. `Theme.root` registers the values this reads
  with `@property`, and the knobs carry each hue's boundary.
- **`pointedLinks()` reads intent, not every crossing** (#227). A mouse, pen
  or keyboard focus counts after resting 50 ms on a link, leaving first
  cancels it, and a finger counts at once.
- **`Data.refresh` reads a page again.** It takes the active record or one
  entry of it (`actives.page`), with params from the Model, as well as a
  Projection; `{ failed: true }` asks again only what failed, so what loaded
  keeps its value and a list its later pages (#261).
- **A list shows the rows it can while others are read** (#234). A row whose
  fields have not arrived (a live insert, a page without its rows' fields, a
  deleted row asked about again) is left out of `Data.query`'s page until they
  do, and the list reads `Refreshing`; it read `Initial` or `Loading` as a
  whole, hiding every row already shown.
- **Going back to a page shows what it held** (#225, #234). Retention keeps
  what the Surfaces most recently left reached (up to 16 lists and 256 entity
  reads), not only what the active ones reach. A list left is held stale, so
  going back reads `Refreshing` with its rows while it refetches.
  `RemoteModel` has a `recent` field holding those roots.
- **`foldkit-mixins`, `foldkit-media` and `foldkit-agent-mcp` depend on
  `foldkit-surface`,** whose `Diagnostics` channel they report through
  (`foldkit-agent-mcp` had it as a dev dependency only).
- **The website draws the docs' Mermaid diagrams** (#201). A `mermaid` fence
  is an SVG that Pele (`pele`, Obsidian's renderer) lays out when the site is
  built, drawn in the theme's colours with the source folded beneath it; no
  page loads diagram code. A fence Pele cannot read stays a code block.
- **The examples draw on the demos' theme.** `examples/pages` is written like
  a Notion page (a slash menu, a bar of marks over selected words, a block
  handle that drags or opens a menu, callouts, tables and dividers, who else
  has it open) and says whether an edit reached the server; `examples/registry`
  is an `AppShell` with an `Alert` for each refused, replaced or held-back
  edit, and its sandbox draws each device as a `Card` with a status `Badge`;
  `examples/richtext-playground` uses `demoStyle` in `AppShell`. The CMS and
  Foldkit's sixteen ported examples load `@foldkit/vite-plugin`, so an edit
  keeps the Model.

### Security

- **The durable journal keeps an operation's `__proto__` key** (published
  since foldkit-durable 0.3.0). It stored an operation as canonical JSON
  built on a plain object, where a key named `__proto__` sets the prototype
  instead of adding a key, so that key was dropped from what was stored and
  read back, and from the bytes that tell a retry from a conflicting reuse of
  its id. The canonical form now has no prototype, so every key the encoded
  operation holds is stored and compared.
- **`serveFetch` answers every request `cache-control: no-store`** (#284).
  Each answer is read as one principal, its `may` and `Me` included, and none
  said so: a cache configured to keep POST answers could have served one
  person's to another. A `cache-control` the application's `headers` gives
  stands; a live stream's `no-cache` is now `no-store` too.
- **Breaking: `GuardServer.validate` refuses a served write no rule governs
  under `unguarded: 'allow'`** (#284). A declared write (through
  `GuardServer.writer`) whose interaction (`Create` for an insert, `Update`,
  `Delete`) has no rule of its own fell to the set's `'allow'`, so a forgotten
  rule let anyone write. Startup now names it; give the interaction a rule, or
  `[Guards.anyone]` to say anyone may. Under `'deny'` nothing changes: such a
  write refuses everyone.
- **`GuardServer.validate` refuses a Source sharing `may`** (#284). `shared`
  tells the live hub to send a declared write's value of a field to every
  subscriber as it is, and `validate` let `may` be shared on an Entity whose
  rows anyone may read, so one reader's answer could reach every other. `may`
  is each reader's own.
- **A collection relation read whole is bounded** (published since before
  0.35.0). A read naming a collection relation with no window read every
  child of every row it named, and a `pollLive` stream re-read them each
  tick, so a client could make the server read a row's millions of children
  as often as it liked. remote-drizzle's `source` now reads at most
  `maxCollection` children of one row (default 100), and refuses a read that
  finds more, naming the relation: a whole list cannot say it was cut short.
  **Breaking** for a page reading a larger collection whole: read it with a
  window (`Entity.page`), or raise `maxCollection` on its Source. The work is
  bounded too (#283): each parent is asked for its children with a `limit`
  of its own (a correlated `in`, on SQLite and Postgres alike) rather
  than all of them ranked, so with an index on the parent column and the
  relation's order a parent of a million children costs what one of 101
  does. A window's page is asked the same way. See
  `docs/design/unbounded-collection-DESIGN.md`.
- **Every live subscription is held to `maxIdsPerEntity`.**
  `RemoteServer.handlers` passed a live Source's requirements on unchecked,
  so a client could subscribe a `RemoteServer.live` Source to any number of
  ids and have every tick re-read them all; only the `liveHub` refused such a
  subscription, itself. The handler now admits a live subscription once,
  before any live Source or the hub sees it: more than `maxIdsPerEntity` ids
  of one Entity (default 1000), or more than four pages of one relation, fails
  the stream with the new wire error `RemoteLiveRefused` (over `serveFetch`,
  an `event: error` frame with `refused: true`), and nothing is read. Refused,
  not truncated. On the client a refused stream is not reconnected: it is no
  gap, `Data.liveStatus` reads the new `Refused { error }`, its
  `StreamHealth.refused` holds the refusal, and a `LiveRefused` diagnostic
  records it once; it opens again when its live requirements change.
  **Breaking:** `LiveHub.subscribe` no longer takes `maxIdsPerEntity`;
  `LiveStatus` gains `Refused` and `StreamHealth` a `refused` field.
- **Guarded writes and relation pages, after a security review:**
  - A create of an id already taken is refused with one answer, whatever the
    row there holds and whether its asker may see it; it was answered with the
    row whenever it held the same values (#203). Only a writer's ledger
    recognises a retry, by its operation, and answers it with the row; without
    a ledger a create sent again is refused. **Breaking:**
    `EntityWriter.insert` takes `operation`. Chirp's Post and Like writers keep
    a ledger, so `Data.retry` of a create is answered with its row.
  - `GuardServer.writer` answers a retried insert from its writer's ledger
    before any rule, as it already did an update (#297). It judged the create
    rules again over what the retry carried (a later `Expr.now`, a principal
    whose guards had changed since), so an insert that had landed could be
    answered `Forbidden`.
  - An update's member `Update` rules and relation `Link` rules hold over the
    row before and over the row after with that one change undone (every
    other new value and link applied, that member's old value kept, or that
    relation pointing where it did). One write cannot set together what each
    change alone would be refused, and a rule reading its own member ("change
    `status` only while it is `draft`") still allows the change it exists for.
    An increment or computed assignment to a member is that member's own
    change; `Unlink` rules hold over the row before alone. `GuardSync.admit`
    judges each changed member the same way.
  - A relation page's cursor is placed only by a row the page could show, and
    one naming a row hidden from it, by the target's Read rule or the
    relation's `policies` (#290), is refused like one naming no row.
  - A writer refuses a write that sets a member stored on the column of one
    the context sets, which in 0.35.0 could overwrite a `presets` field
    through a relation stored on its column.

### Fixed

- **Remote keeps a field named `__proto__` in `Entity.from` and in a captured
  resume.** `Entity.from` assigned each member of a `foldkit-entity` Entity
  to a plain object, so a field named `__proto__` was missing from the
  descriptor's fields and schema; and `captureRemote` assigned each held
  window the same way, so a page relation of that name was captured without
  the window it was read with. Both now define the key.
- **A write's path through the viewer reads a withheld field named like an
  `Object.prototype` member as withheld.** `RemoteServer.write` read the
  last field of an `Entity.sets` path by plain index, so a field named
  `constructor`, `toString` or `__proto__` that the asker may not read gave
  `Object`'s member (or its prototype) instead of nothing, and the write
  landed with it rather than being refused. It now reads the row's own keys.
- **Remote keeps fields named `__proto__`, `constructor` and `toString`.**
  Records keyed by a field were written by assignment, which turns
  `__proto__` into the prototype, and read by index, which finds
  `Object.prototype`'s functions: a read failed or dropped such a field, a
  window was recorded or compared that was never asked, a field was planned
  again, merged requirements lost a relation, a capture dropped the value,
  and a pending write foresaw no derived count, find, supplied member or
  invariant over it. These records are now read by own key and written by
  definition (`record.ts`).
- **`RemoteServer.memory` serves a list named `constructor`, `toString` or
  `__proto__` whole.** Read beside a list asked with a window, such a list
  took `Object.prototype`'s member as its own window and came back as a
  page. The backend now reads only the windows the request names itself.
- **A mirror keeps fields and store keys named like `Object.prototype`
  members.** A key named `constructor` or `toString` (by `keys` or a field's
  own name) read as already taken, so the mirror refused to be declared; a
  `__proto__` key or field was dropped from what it encoded, decoded,
  restored, read from the URL and wrote to the memory store; the write that
  waits for a restore read a key at its default as `Object`'s, and wrote
  over a key the store held; and a write removed keys an empty store did not
  hold. Each is now an own key.
- **`resolve` gives a slot named `constructor`, `toString` or
  `__proto__` that the base leaves out no attributes**. It read the base
  bundle through the prototype and threw "not iterable" on `Object`'s
  member; it now reads the base's own keys alone.
- **A slot, variant axis, token group or knob named `__proto__`,
  `constructor` or `toString` is read and written as its own key**.
  Recipes read such an axis from the selection through the prototype, so
  its default never applied and its compounds never matched; `extend`,
  `forCapability`, `Theme.compose`, `Theme.scoped` and `Theme.set` dropped
  a `__proto__` key; `Mixin.contributionsFor` answered `Object`'s member
  for a slot a Mixin left alone; and `Theme.variables`, `Theme.print` and
  `Knobs.valueAt` wrote or threw on `Object`'s member for an unset knob.
  Each now reads own keys alone and gathers into a record with no
  prototype.
- **`Resume.builder` fills a Message field named `constructor`,
  `toString` or `__proto__` from the event**. It counted a field as fixed
  when `in` found it, which every object answers for those names, so
  `OnInput(Message.Typed)` was refused as leaving no field. It now counts
  only the fixed object's own keys.
- **A form key named `constructor`, `toString` or `__proto__` is given
  only what the application gave it**. `Form.make` read its control, its
  nested form and its check through the prototype, so such a key without
  one got `Object`'s member: a plain key failed to build, or asked a check
  that did not exist. `fill` likewise treated the key as given when the
  value left it out. Each now reads the record's own keys alone.
- **`Virtual` keeps the height of a row keyed `__proto__`**. Restored
  `initialHeights` and a `Prune` built the heights by assignment, which for
  that key set the record's prototype and dropped the measurement, so the
  row fell back to its estimate. Both now build the record from entries.
- **`Bundle.compose` keeps a child in a field named `__proto__`**. The
  child's field was assigned into the parent's fields, which set their
  prototype instead, so the composed Model had no such field. It is now
  defined as a field of its own.
- **A Region or appearance axis named like an `Object.prototype` member draws
  as declared.** The Renderer read a node's Region by a plain index, so a
  Block declaring a Region `constructor` or `toString` that a stored node
  left out drew `Object`'s member as its children and threw; a look read a
  node's choice the same way, so such an axis never fell back to its
  default; and `Block.offeredAppearance` dropped a choice on an axis named
  `__proto__`. Each now reads and writes only own keys.
- **remote-drizzle's `bind` finds a member by its own name** (prototype-key
  sweep). It looked each field, relation and Entity up in the storage given
  by `record[key]`, so a field named `constructor` found `Object` and failed
  with a `TypeError`, and a missing one went unnamed. It reads own keys now,
  and refuses a member named `__proto__` where it is bound: Drizzle builds
  each row it reads by assignment, which would make the value the row's
  prototype.
- **Surface keeps Model fields and record keys named like `Object.prototype`
  members.** A Model field named `__proto__` got no `ModelRef` (it was
  assigned to the reference tree, setting its prototype); `Projection.pick`
  refused a field named `constructor` or `__proto__` as picked twice, and
  `Projection.of`, `pick` and `compose` dropped a `__proto__` field from what
  they read; and `at(key)` over a record read `constructor`, `toString` or
  `__proto__` as present when the record held no such key. Each is now an own
  key, and `at` reads only the record's own keys.
- **Agent keeps names that `Object.prototype` holds.** `Agent.expose`
  dropped a Message field named `__proto__` from the capability's input,
  and took `constructor` or `toString` as a variant of any union; the audit
  log dropped a nested `__proto__` key from recorded input. Payload fields
  gather on an object with no prototype, a variant is looked up among the
  union's own keys, and recorded input is copied by definition.
- **A guard's principal placeholders hold a field named `__proto__` as their
  own** (prototype-key sweep). `guard.row`'s placeholders were built by
  assignment, so such a field became their prototype rather than a key.
- **A row only a pending request holds is read once the request is
  answered.** Remote asked the server for a field a pending create's
  prediction lacked (the reference notebook's `may`); the server had no such
  row, and the create's answer, which carries no `may`, left the read's plan
  as it was, so the read entry never restarted: a note opened before its add
  was answered never drew Delete. A plan now leaves out a row the store has
  never read, or read as absent, while only a pending layer shows it, and
  asks for its missing fields once the answer lands.
- **`revisionTrigger` names each table's trigger apart** (#328). It named
  one `<table>_<column>_moves`, which `a_b`'s `c` and `a`'s `b_c` share: on
  SQLite the second migration's `create trigger if not exists` installed
  nothing, and on Postgres it replaced the first table's function with one
  reading a column that table lacks. A name where the table or the column
  holds `_` now ends with the table name's length (`a_b_c_moves_3`), and a
  Postgres name past 63 bytes is refused. A table whose names hold `_` gets a
  trigger under its new name when the migration runs again; the old one moves
  the revision to the same value and may be dropped.
- **A cursor from before keyed cursors pages after its row though its id
  begins `k:`** (#322). remote-drizzle read every cursor starting `k:` as
  key values, so an id such as `k:customer` was refused, and one such as
  `k:[1,"a"]` paged from the place those values name. A cursor that reads as
  keyed is now first looked up as an id; and a page whose keys JSON cannot
  carry ends on `idCursor` (`k:{"id":…}`), not on the bare id. `readCursor`
  reads that form as an `Id`.
- **An operator input of numeric literals is typed on Postgres** (#323).
  remote-drizzle cast an operator's parameter by its input schema only when
  that was `Schema.Number`, so one declared `Schema.Literal(1)` or
  `Schema.Literals([1, 2])` went untyped and Postgres refused `$1 + $2`
  ("operator is not unique"). A numeric literal is cast as the number it
  names: `integer` (or `bigint`) where every literal is whole, else `double
  precision`.
- **A Postgres enum ordered under a collation orders by its labels** (#300).
  remote-drizzle collated only text columns on Postgres, so an enum column
  under `Collation.asciiFold` or `binary` kept Postgres's own order, the order
  its labels were declared in, and its pages disagreed with `evaluate` and
  SQLite. An enum is now ordered and paged as its labels' text under the
  term's collation.
- **A check's answer is taken only for the form it was asked about** (#303).
  An answer was matched by key and draft alone, so one asked with `id: p1`
  could approve a slug after the id became `p2` and release a waiting submit.
  `form.Check`'s `Checked` now carries the `values` and `subject` it read
  (optional, so a hand-made answer in a test answers the form as it is), and
  one about values or a subject the form no longer holds is asked again. A
  key's check is also asked once the keys following it are written, so it
  reads the values the form ends with.
- **`locked` takes a Bundle-backed key** (#312). `FormView`'s `locked`, and
  `fields` and `submodel`'s inputs, were typed by the keys that hold a draft,
  so a key edited by a Bundle could not be named without a cast; they now
  take those keys too, inferred from the form's `control`.
- **`FieldRecipes.dateTime`'s input edits seconds and milliseconds** (#302).
  `html` drew `datetime-local` with the browser's default step of a minute,
  which offered no seconds and failed native validation for a value that
  had them, though the recipe reads them. The input steps by a millisecond.
- **`FieldRecipes.dateTime` keeps an instant in year 0** (#321). The zone's
  clocks were read without their era, and `Intl` writes ISO year 0 as 1 BC,
  so `0000-12-31T12:00:00.000Z` was shown, and submitted, as year 1. The era
  is read, the draft is `0000-12-31T12:00`, and `html` draws it as text,
  since a date-time input takes no year before 1.
- **`FieldRecipes.dateTime` shows a stored instant only as a draft that
  submits it unchanged** (#313, #314, #315). Its `format` read an instant
  with `Date.parse` and wrote the zone's reading, which three kinds of
  instant did not survive:
  - The later of a repeated hour (New York's second `01:30` on 2026-11-01)
    was shown as the reading alone, which reads as the earlier, so an
    unchanged submit moved it an hour back. Its draft now carries its
    offset, `2026-11-01T01:30-05:00`, which `html` draws as text, since a
    date-time input cannot hold it. A typed offset the zone's clocks have
    then names that occurrence; another offset is refused.
  - An instant finer than a millisecond (`…15.123456Z`) lost the rest; a
    fill now throws for it, and takes trailing zeros (`.123000Z`).
  - A date that does not exist (`2026-02-30T10:00:00Z`), an hour, minute or
    second out of range, or an offset past `±23:59` was moved by
    `Date.parse` to another date; a fill throws for it, and a list shows it
    as written. So does an instant the zone's clocks read in no four-digit
    year.
- **A locked Bundle-backed key cannot be edited through its Bundle's view**
  (#312). `FormView`'s `locked` put `disabled` on the field's `div`, which
  disables nothing inside it, so an image control's button and file input
  still took a press and a file. The Bundle's view is now drawn inside a
  disabled fieldset (`display: contents`), which disables every button and
  input in it. It is still a hint: the server checks the write.
- **`FieldRecipes.money` reads a minus written after the amount, where the
  locale writes it there** (#316). West Frisian (`fy`) writes `US$ 1.234,56-`,
  which its own field refused, so a filled negative amount could not be
  submitted unchanged. Where a locale's format writes its minus last, a minus
  last is read; a leading one is read in any locale. The amounts' round-trip
  test now runs over every language the runtime formats, which is how `fy`
  and the percentages of #317 were found.
- **`FieldRecipes.percent` reads back the grouping it writes** (#317). In
  `mr`, `ml`, `ne`, `or` and `te` a percentage groups in thousands
  (`-123,450%`) where a plain number groups in lakhs, and a typed
  percentage's whole digits were checked against the number's grouping, so a
  filled percentage past a thousand could not be submitted unchanged. They are
  checked against the percentage's own format.
- **A renderer is found only for a kind it was given for** (#307).
  `FormView` looked a control's kind up on a plain object, so a kind named
  `constructor` or `toString` found `Object`'s, which was called and drawn
  in place of the "no renderer" error; `ListView` and `DetailView` did the
  same with a display kind. The form's registry has no prototype, and the
  list and detail read the renderers given as own keys.
- **`foldkit-form-recipes/image` never sends a file it refused before
  sending** (#301). A dropped file that is no image was refused unsent, but
  Try again sent it. Such a refusal now offers no retry, and a `Retried` sent
  for it changes nothing; a refusal from the route can still be retried.
- **A `Select` or `Choices` refuses options drawn alike** (#305). Both draw
  and read an option by its text, so with `'1'` and `1` in one set the
  second could never be chosen and a choice could be stored as the other's
  type. Such a set now throws when the control is made, from a schema or
  from `Input.select` / `Input.choices`.
- **A filled numeric choice shows and submits** (#304). `fill` kept a
  `Choices` value as it was, so `[1]` became a draft the parser, which
  reads text, refused ("Choose from the options"), and a checkbox drawn
  with the value `"1"` was not shown chosen. A list draft is now filled as
  text, as an edit sends it.
- **A live stream over two entities' live sources applies both** (#286).
  Each source (two `pollLive`s, or one beside a live hub) numbered its
  changes from the `after` the client sent, and the client, which keeps one
  cursor per stream, dropped the second source's as repeats.
  `RemoteServer.handlers` now numbers the merged stream as one sequence.
- **A smaller window of a shared list loads while its rows do** (#287). A
  window with no row to show yet read `Refreshing` with no rows when any row
  of its query's connection was deleted, though the window would not show it:
  `first: 1` of a list whose third row was deleted read empty while its first
  row loaded. A window now judges a delete by the rows it would show, and
  reads `Loading` otherwise.
- **An earlier mutation answer's read leaves what a later one settled**
  (#288). Answers settle in the order their requests started, but the `read`
  an answer carries was written whole: an edit answered after a later edit
  wrote its body back, and one answered after a later delete brought the row
  back. The read now passes the patch's checks: a field or a delete a later
  request settled stays, and a row a later request wrote is not tombstoned by
  the earlier read's absence of it.
- **A stream the live ledger dropped restarts on its next event** (#289). A
  dropped stream has no cursor, and cursor `0` was taken for a stream with no
  baseline yet, so its next event was applied whatever it skipped. A stream's
  cursors now count on from the `after` it opened with, so a new stream starts
  at `1`, and a dropped stream's next event is a gap that restarts it.
  **Breaking** for a `RemoteClient.live` transport whose first event is not
  `after + 1` (`classifyLive(emptyLiveState, 42)` is now a gap): it must count
  from `after`, as `RemoteServer`'s hub and remote-drizzle's `pollLive` do.
- **What a retried update stores as its time is stated** (#291). Without a
  writer's ledger a retry is a new write: an update sent again stores that
  attempt's time, the same `now` while it lies within `clockSkew`, else the
  server's clock then. A ledger keeps the first time. The remote-server
  README says so, and `docs/design/ops-4-captured-now-DESIGN.md` records why.
  An unledgered update pinned to a revision, sent again after it landed, no
  longer conflicts with itself: remote-drizzle's writer leaves the fields
  `Entity.sets` fills from the clock out of telling such a retry, so it is
  answered with the row it wrote, at the time that landed (`EntityBinding`
  gains `clocked`, which `bind` fills).
- **The docs date a mutation answer by the clock that dates it** (#292). The
  remote README, the skill and `docs/remote.md` said `MutationSucceeded.now`
  came from `Data.mutate`'s `now` option, `Date.now` by default. It is
  Effect's `Clock`, read when the answer lands, so a test of how written rows
  age drives `TestClock`; the `now` option is the write's time sent to the
  server.
- **An `Invalid` refusal names its Entity, and `Refusal.isInvalidBy` matches
  by Entity and id** (#325). Invariant ids are unique only within an Entity,
  and `isInvalidBy` compared the id alone, so one Entity's `valid` refusal
  matched another Entity's `valid`. `Refusal.invalid` now carries `entity`
  (none from an older server, which then matches nothing); `RemoteServer.write`
  and a refusal made where the write is made set it; `Invariant` and the
  declaration `Entity.invariant` returns carry their Entity's name.
  **Breaking:** `isInvalidBy` takes `{ entity, id }`, and a declaration
  attaches to one Entity: attaching it to a second throws, and reading its
  `entity` before it is attached throws.
- **`Crud.options` reads each listed choice once** (#308). It checked every
  chosen id against a picker's whole list, so a many-picker holding N of N
  loaded choices did quadratic work on each derivation. It groups the held
  ids by picker and looks them up in a set of the listed values.
- **`Crud.options` requires every chosen row** (#309). Its `active` keyed
  each chosen row `${key}:${id}`, and keys and ids may hold colons, so key
  `a:b` holding `c` and key `a` holding `b:c` made one entry and one row went
  unread. Rows are keyed by key and id as JSON.
- **A picker keeps the choices a failed refresh left** (#310). A list whose
  refresh failed still shows its previous rows, but `choices()` and
  `choiceOf` read only `Ready` and `Refreshing`, so a network error emptied
  every picker fed from it. Both now read a `Failed` read's previous value;
  the failure stays in `page()`.
- **`Cms.Display.Moment` keeps one formatter per locale** (#306). It made an
  `Intl.DateTimeFormat` (or `RelativeTimeFormat`) for every value, so a list
  redraw made one per row; it now makes each once per locale.
- **The Builder reads a page's own nodes only** (#298). `Selected`, the
  layers' focus, an undo's kept selection and every other node lookup read
  `document.nodes[id]`, so an id such as `constructor` (from `?block=`, say)
  found `Object`'s function, was selected, and the properties panel threw.
  They read through `Composition.nodeAt`, now public and taking a Document
  or a Tree.
- **A write ledger, after review** (#277):
  - A write ledger refuses an operation id sent again with another mutation,
    keys or input, where it answered it as a retry and wrote nothing.
    **Breaking:** ledger tables need a nullable `request` column (`alter
    table write_ledger add column request text`; add `request:
    text('request')` to the Drizzle table), and `EntityWriter`'s `update` and
    `recorded` contexts carry `request` (as the ledgered `insert`'s does). A
    record without one is still answered as a retry until its retention
    passes.
  - On Postgres, a retry sent while its original is still writing waits for
    it and is answered from the ledger, where it failed as "Database write
    failed".
  - Under a ledger, an update with no record is judged by its `when` and
    transition invariants even when the row already holds what it sets, where
    it was taken for a retry and answered Success.
  - `Write.update` refuses a computed assignment into a `Schema.Int` field
    that may not come to an integer, and the Drizzle writer refuses one over
    an integer column at registration; SQLite stored the fraction, Postgres
    rounded it, and `Write.apply` predicted the fraction.
- **NaN is refused wherever values compare or order** (#242), in memory and
  in SQL, as NUL is, an operator's argument and a computed assignment's value
  included (#296): one NaN key left the whole in-memory sort unsorted, and
  Postgres and SQLite disagree on it. `evaluate` evaluates its whole `where`
  list, so a refusal no longer depends on predicate order. **Breaking:**
  `Expr.givesNul` is `Expr.givesUnportable`, and also flags NaN.
- **A law no call answered no longer holds** (#275). Two refusals still agree,
  but only cases where both sides answer a value count; a law with none
  answers the new `Unanswered` verdict and records no evidence, where an
  operator refusing every input was recorded as tested.
  `Operators.withEvidence` refuses a record of a law whose witness the table
  runs differently. `Text.startsWith` in memory compares by character (a lone
  surrogate as U+FFFD), as SQLite and Postgres do; the conformance texts hold
  `%`, `_` and `\`. A key cursor carries `Infinity`, `-Infinity` and `NaN` as
  themselves, where paging past one skipped the rows tied with it.
  **Breaking:** `LawsVerdict` has an `Unanswered` variant, and a `Tested`
  record's `cases` counts answered cases only.
- **Remote's state machine, after review** (#273):
  - Mutation answers settle in the order their requests started: an answer
    does not overwrite a field, clear a deletion, or delete a row that a
    later-started request already settled.
  - A row a settled request deleted no longer reads `Initial` while an
    earlier edit of it is pending.
  - A field only a pending patch shows is still fetched, so a failed request
    leaves the server's value, not `Initial`.
  - A repeated or late `MutationSucceeded` or `MutationFailed` returns the
    Model it was given.
  - `live`, `streams` and `gaps` keep the 256 streams most recently heard
    from, and retention forgets a `verifyPredictions` placement record whose
    list it dropped.
- **A failed read asked again reads `Loading`,** then `Failed` again if it
  fails, instead of `Initial` in between (#261).
- **A reload draws the stored list in its first frame** (#262).
  `Data.persistence(...).restore(model)` restores the stored snapshot before
  the first frame, resolved as the runtime's `flags`, so a reload no longer
  draws `Loading` first; the wiring then restores only a key the Model is not
  restored from yet. `Data.persistence` returns a `PersistenceWiring` (a
  `Wiring` plus `restore`). `Data.forget` with an unchanged persistence key
  does not restore the snapshot it forgot: the emptied cache is saved over it.
- **A shown list no longer falls back to `Loading` when its rows are deleted**
  (#263). A list whose every shown row is deleted while its other rows are
  unread reads `Refreshing` with no rows. `RefreshStarted` keeps a tombstone
  while the entity is asked about again, so a deleted row stays out of every
  list until the server answers, and a refreshed `NotFound` stays `NotFound`
  until then. **Breaking:** the CMS `EditorDomain` gains `plan` (a bound Data
  already has it), so an overwrite after a conflict waits for the server's
  copy of the draft instead of saving against the old one.
- **`Surface.read` without the params a Surface declares is a type error**
  (#268). It took `params?`, so the read compiled and threw a `TypeError`
  from inside the Surface's `model` at render. `Surface.read`,
  `Surface.contract` and `Surface.inspect` now require params unless
  `undefined` is one (a Surface without params takes none), and a caller the
  types do not reach is refused with `Surface "<name>" declares params, and
  was given none`.
- **`SSR.hydrate` reports a page it contains** (#210). With
  `FOLDKIT_BUILD_ID` unset, the documented `import.meta.env.FOLDKIT_BUILD_ID`
  is undefined in the client, and `foldkit-ssr` handed Foldkit no id, so every
  page drew from the baseline Model with nothing logged; and a page from
  another build was contained silently too. Both are now contained and
  reported as `PageContained`, with reason `NoBuildId` or `OtherBuild` (naming
  both ids and how to give the client and the server one).
- **`SSR.inspect` shows a parent shared by several families once** (#177).
- **`bind` reads a column's nullability from the field's stored side,** so an
  `Option` field may sit on a nullable column (#259).
- **A server-rendered page carries the global rules its Styles need** (#271).
  `Style.usedIn` wrote the CSS of each compiled class a page's markup carries
  but none of a Style's global rules, so a Card's `fk-raised` had no depth
  rules and its raised background was invalid until scripts ran. Each
  compiled class now registers its Style's globals (keyframes, `raise`'s depth
  rules), and `usedIn` writes them once each; in the browser, injection adds no
  global that a server-written sheet already carries.
- **A held solid or primary Button stands 1px in.** Their fills were written
  with the `background` shorthand, which resets `background-clip` to
  `border-box`, so hovered and held the fill ran under the cleared border to
  the edge. They are `backgroundColor` now; an override of a Button's fill in
  the `app` layer still wins.
- **A Menu or Menubar checkbox or radio row is chosen once.** Clicked after a
  mouse press opened the menu, it was chosen twice and flipped back: upstream's
  Menu kept the press's origin until the menu shut, so a release on the row
  more than 200ms later read as a drag from the trigger and clicked it on top
  of the browser's own click. A Menu's trigger click is now decided from the
  Model (`ClickedButton`).
- **TagsInput keeps a draft typed across a frame drawn mid-burst** (#224).
  When a frame was drawn while keys still arrived after a commit, and the
  draft it showed began like the tag just added (`react{Enter}react{Enter}`),
  the draft was stripped to nothing. **Breaking:** `TagsInput.Message.Typed`
  carries `drawn`, the commit count of the drawing that read the text, so code
  that builds `Typed` itself must pass it; the Model gains `commits`, and
  `added` is a list, so a TagsInput Model stored under 0.35.0 does not decode.
- **A slot's attributes fit `h.textarea`** (#214). `slots.x.attrs()` was
  typed with every attribute, `InnerHTML` included, which a textarea refuses,
  so a slot on one needed a cast. It is now typed as its base was, plus what a
  Mixin adds, which is never `InnerHTML`. `foldkit-mixins-form`'s field
  `state` is typed likewise.
- **AppShell and `Layout.center`** (#276). Below `md`, AppShell's side
  column, which holds a Sidebar's opener, stays in the header's row as the
  page scrolls. `Layout.center` fills to its measure inside `Layout.stack`
  (and a flex row) instead of shrinking to its content.
- **`foldkit-mixins/foundations` builds from the root Vite resolved.** A build
  compiled the sheet module from the current directory, so one started from
  elsewhere (a test, a workspace script) failed with "Failed to load url
  /src/style.ts". A `root` option still wins where given.
- **`Expr.field` given an expression says what to write** (#209). Wrapping an
  invariant's `before.x` in `Expr.field` failed with a long error about
  missing `owner`, `key` and `schema`. A second signature now refuses it with
  "before.x and after.x are expressions already, so compare them as they
  are".
- **`GuardServer.validate` warns only of a write a change can come between**
  (#223). It named every write through a writer with no `revision`, inserts
  and deletes of an Entity nothing updates included. It now names an update,
  and a delete of an Entity the server also updates.
- **A page keeps only the modules it reads of a published package** (#215,
  #241). Twenty-five packages were each linked into a few files, so
  `sideEffects: false` had nothing to drop and `export * as` namespaces became
  objects keeping every member: a page reading `Collation.binary` kept 73 kB
  of `foldkit-entity` against 1.9 kB from source, one reading
  `beginOptimistic` 350 kB of `foldkit-remote` against 1.6 kB, and an
  Avatar-only page 238.6 kB of `foldkit-mixins-ui` against 99.2 kB gzipped.
  `foldkit-mixins`, `-mixins-ui`, `-bundle`, `-media`, `-primitives`,
  `-entity`, `-crud`, `-form`, `-ssr`, `-remote`, `-surface`, `-builder`,
  `-composition`, `-data-grid`, `-durable`, `-mixins-builder`,
  `-mixins-crud`, `-mixins-data-grid`, `-mixins-richtext`, `-mixins-surface`,
  `-react`, `-remote-drizzle`, `-richtext`, `-richtext-markdown` and `-sync`
  are now published one file per source module, `.js` and `.d.ts` (the export
  map's paths changed, its subpaths did not).
- **`foldkit-media` no longer brings `node:module` into a page** (#215). Built
  for Node, the runtime chunk every entry shares opened with `import
  "node:module"`, so a browser build of `Icon.draw` warned and carried it. The
  package is built for the neutral platform.
- **`foldkit-form`'s published declarations check with `skipLibCheck:
  false`.** The emitter wrote `Form.input`'s return type out in full, through
  `foldkit-entity`'s unexported `InputMembers`, and the expansion failed on
  its own (TS2536), so an application checking its libraries could not
  compile against `foldkit-form` (0.8.1 included). `Form.input` now names its
  return type, and `foldkit-entity` exports `InputMembers`.
- **`foldkit-builder` depends on `foldkit-mixins`.** Its types import
  `foldkit-primitives/interaction`, whose declarations import
  `foldkit-mixins`, an optional peer of `foldkit-primitives`; `foldkit-builder`
  listed it only as a dev dependency, so an application installing it from npm
  could not resolve `foldkit-mixins` (TS2307, 0.3.14 included).
- **`npx foldkit-plus setup` runs, and installs one Effect** (#200, #204,
  #205, #280):
  - The CLI bundles Effect, so it imports only Node's own modules; run with
    `--legacy-peer-deps`, npx installed no peers, and an Effect 3 an ancestor
    folder held crashed it. The README, the skill and the site give the
    command with `--legacy-peer-deps`, since npx adds a newer `foldkit-plus`
    to the tree an older one left in its cache and the old tree's `foldkit`
    failed the new peers with `ERESOLVE`.
  - It installed `effect@4.0.0`, the release Foldkit names exactly, while
    `foldkit-durable`'s `@effect/sql-sqlite-node` and `foldkit-auth`'s Yielded
    need a later one. It now first prints the `package.json` fields that pin
    every Effect package to 4.0.5 (npm `overrides` beside the project's own
    Effect dependencies at that release, which npm 10 needs; pnpm `overrides`
    and `peerDependencyRules`; Yarn `resolutions`; Bun `overrides`), installs
    at exactly that release, and names each adapter's library at the version
    the adapter peers on. A pnpm workspace member's pins go to the workspace
    root (its `pnpm-workspace.yaml`, or its `package.json` where a `pnpm` field
    is already there), the only place pnpm reads them. `pnpm pack:check`
    follows every step `setup` prints, from the packed tarballs.
  - It scaffolds with `create-foldkit-app` 0.40.0, whose templates install
    Foldkit 0.169, `@foldkit/ui` 0.169 and `@foldkit/vite-plugin` 0.28; 0.39.1
    wrote 0.168, which `foldkit-mixins-ui` refused.
  - It prints the spa scaffold command with `--example counter` and the ssg or
    ssr one without, since `create-foldkit-app` refuses `--example` outside
    spa; so does the greenfield guide.
- **Documentation that was wrong or missing:**
  - The auth README says how to sign up with a password (#218): the
    contract's `register` action, `Password.make({ registration, reset })` (a
    `resetLink` needs an `https:` URL), `Persistence.Provisioning` writing the
    account row in the same commit, the services sign-up needs, and register
    then sign in on the client; and how to run on Workers with D1 (#222):
    build auth once per isolate, and give Yielded's `AuthenticationClock` a
    tolerance, since the Worker's clock and D1's differ.
  - The SSR README's `styles` recipe carries the theme's stylesheet beside
    `Style.usedIn`; without it every page `SSR.entry` served flashed unstyled
    (#211).
  - The Sync README names both rejection sentences: "Refused by the server"
    for an `authorize` that refused with no reason, "Not a valid operation"
    for one that failed.
  - The skill says to keep the root's Model, Message and `update` in
    `src/main.ts`, since the scaffold's lint refuses a root Message from
    `app.ts` (#220), and to import every package as `foldkit-plus/<package>`
    (#217).
- **`Entity.input` (and `Form.input`) read a key named as an
  `Object.prototype` member** (#311). An input key `constructor` or
  `toString` read the inherited value from the mapping and failed with
  "maps to a Field, …"; one that named no field was refused with that
  message too, and a mapping of such a name passed as a key of the input.
  `Entity.input`, `Entity.fields`, `Entity.select` and `Entity.annotateMembers`
  now read own keys only, and an evaluated row lacking a field so named reads
  it as null rather than as `Object.prototype`'s function.
- **`Conformance.operator` and `Conformance.laws` build only the cases they
  run** (#318). Both built every tuple of the samples, then chose `limit` of
  them, so an operator of six number arguments built 531,441 tuples to run
  one, and eight built 43 million. A seeded partial shuffle over the tuples'
  indices now builds only those chosen; a seed chooses other tuples than it
  did, still the same ones on every run.
- **`Law.monotonic` takes two refusals as agreeing** (#295). A pair whose
  calls both refused failed the law, where every other law counts them as
  agreeing and no case, so an operator refusing some arguments was a
  `Counterexample` though every answered pair was in order, and one refusing
  every call was a `Counterexample` rather than `Unanswered`.
- **`Conformance.operator` compares every implementation it is given**
  (#319). An implementation named `__proto__` set the prototype of the
  outcomes record instead of adding a key, so it was never compared and a
  disagreement went unreported; outcomes are now a record with no prototype.
  An implementation named `expansion` beside a defined operator was silently
  replaced by the expansion; it is now refused.
- **`evaluateEach` reads only the order the input chose** (#299). Whether an
  input refuses the whole run (a NUL or NaN no row causes) was judged over
  every alternative of an `Order.chosen`, so a NaN in an input only an
  unchosen alternative reads failed the run instead of setting the one bad
  row aside in `refused`.
- **`Order.chosen` refuses a one-relation, as `Order.asc` does** (#293). An
  alternative such as `{ author: Post.relations.author }` was accepted and
  ordered by the foreign key, an order no client could place a row in
  (`Query.placement` read `NotPlaceable`). **Breaking:** its `choices` are
  now typed as fields and calls, so such an alternative is a type error, and
  it throws where it is written.
- **`Law.monotonic` takes two equal infinities as in order** (#320). It
  ordered two results by their difference, which for `Infinity` and
  `Infinity` is NaN, so an operator answering the same infinity for two
  arguments was a `Counterexample`. Equal outcomes now agree, as under every
  other law (the change for #295); NaN beside a number is still out of order.
- **An operator whose input is `Schema.NullOr(Schema.Boolean)` takes a
  predicate** (#324), as its type said: the call refused one unless the input
  was a bare `Schema.Boolean`. A predicate is now taken wherever the input
  stores both booleans, null or another kind beside them or not, which is
  what `ArgumentOf` types.
- **A field, input key or Entity named `__proto__` or `constructor` keeps its
  place** (#329, #330). Records built by assignment lost a `__proto__` key,
  which set the prototype instead: `Write.bind` dropped such a field's value,
  link, increment or computed assignment, `Write.contextValues` its context
  value, `Write.apply` its computed value, and `Entity.judgeInput` and
  `Entity.check` judged the invariant over it `Undecided`. Lookups by such a
  name read the inherited value: an input left out read `Object.prototype`'s
  function in `evaluate` and in `Order.chosen`'s sort, a write naming a key of
  no input was refused with the wrong reason, and `Entity.relate` took
  relations for `toString`, which it does not relate. Each now reads and
  writes own keys only.
- **`Entity.check` refuses an operator its table does not run** (#327). An
  invariant calling one was `Undecided`, which the check passed, so the Schema
  check accepted every value by that invariant. **Breaking:** `Entity.check`
  now throws where it is made, naming the operators; pass the table that runs
  them as `operators`. `Entity.judge` and `Entity.judgeInput` still answer
  `Undecided`, for a form that leaves such an invariant to the server.
- **An invariant's `before` and `after` are typed as the store holds the row**
  (#326). They were typed by each field's decoded type while the judge reads
  the encoded row, so `Expr.eq(after.at, someDate)` type-checked and never
  held against the stored ISO text. **Breaking (types):** `BeforeRow` and
  `AfterRow`, and so a write's `compute` and `when` row, read each field's
  encoded type; compare such a field with its encoded value
  (`Expr.eq(after.at, '2026-01-01T00:00:00.000Z')`).

## 0.35.0

Computed writes, and demos that look like one product. A declared update can
set a field from the row and the input (`Write.update(input, { compute })`),
which the Drizzle writer compiles into its `set`, Guard judges and Remote
predicts; an operator describes itself as JSON, and its laws are evidence tied
to the implementation they were tested on. `AppShell` is an application's page
frame in `foldkit-mixins-ui`; `foldkit-mixins-crud/recipes` and
`foldkit-mixins-form/recipes` give the CRUD views and forms a look over the
theme's tokens; a placed CRUD list hands out the connection a write's
optimistic insert names. A row created in an empty list now shows, and every
published demo is audited on a phone in the e2e suite.

Breaking: a style recipe with no variants refuses a selection (a type error
where it compiled and did nothing); `Layout.stack` keeps a width a child sets;
`Operators.describeTable` names each operator `name`; an increment of a real
number expects a revision; `BoundWrite`, `EntityWriter.update` and a
hand-built `BoundRemote` gain fields (see Changed). New minors:
`foldkit-entity` 0.13.0, `foldkit-remote` 0.21.0, `foldkit-remote-server`
0.18.0, `foldkit-remote-drizzle` 0.15.0, `foldkit-guard` 0.6.0, `foldkit-crud`
0.11.0, `foldkit-mixins` 0.20.0, `foldkit-mixins-ui` 0.21.0,
`foldkit-mixins-crud` 0.9.0 and `foldkit-mixins-form` 0.10.0. Fixed:
`foldkit-media` 0.3.1 and `foldkit-mixins-data-grid` 0.2.15. Republished for
the new versions they depend on: `foldkit-auth` 0.1.5, `foldkit-builder`
0.3.14, `foldkit-cms` 0.8.1, `foldkit-cms-drizzle` 0.6.17,
`foldkit-composition` 0.3.12, `foldkit-data-grid` 0.3.2, `foldkit-form` 0.8.1,
`foldkit-form-recipes` 0.1.1, `foldkit-mixins-builder` 0.3.16,
`foldkit-mixins-richtext` 0.5.7, `foldkit-mixins-surface` 0.6.9,
`foldkit-primitives` 0.15.4, `foldkit-richtext` 0.5.3, `foldkit-richtext-code`
0.2.5, `foldkit-richtext-code-shiki` 0.2.5, `foldkit-richtext-dom` 0.6.6,
`foldkit-richtext-markdown` 0.3.4 and `foldkit-sync` 0.12.4. `foldkit-plus` is
0.17.0.

### Added

- **`foldkit-crud`: a placed list hands out its connection.**
  `AuthorList.connection(model)` is the key the list reads, for a write's
  optimistic insert or remove, so an application no longer rebuilds it from the
  list's input (the Cloudflare example spelt `AllTodos.ref({})`), where another
  input names a list nothing reads.
- **`foldkit-mixins-form/recipes`: a look for the field and the form.** `Field({})`
  (label over control, a checkbox kept its size, text, number, select and a
  picker's search box in `foldkit-mixins-ui`'s field looks, a failure in the error's
  ink) and `Form({})` (fields in a column, the list of fields to fix in the error's
  colours, the submit as wide as its words), over the theme's tokens.
- **`foldkit-mixins-crud/recipes`: a look for each view.** `List({ open })` (a quiet
  table whose rows open wherever pressed), `RowList`, `Editor`, `Confirm` and `Toolbar`, over the
  theme's tokens, for `Style.forSlots(ListSlots)(List({}))`. The views stay unstyled
  without them. The CMS example's worklist now extends `List` rather than drawing its
  own.
- **`foldkit-mixins-ui`: `AppShell`, an application's page frame.** A skip link,
  a header bar with the title, status and actions, an optional side column for a
  `Sidebar`, the main region the skip link focuses, and a footer, from
  `AppShell.view({ title, … }, main, h)`. It holds no state and draws the same on
  a server. `Recipes.AppShell({ width })` keeps the header and side column in view
  while the page scrolls and puts a Sidebar's phone opener in the header's row
  below `md`. `Patterns.AppShell` is its accessibility contract.
- **`foldkit-mixins`: a `width.page` token** (`72rem`), the widest a page's content
  runs. `AppShell`'s `width: 'contained'` reads it.
- **`examples/chirp`: a Twitter clone, published as a demo.** A timeline, a
  profile per person and a page per post; posting, editing your own posts in
  place, and likes. Posts are Entities with a guarded write (its author or an
  admin) whose `may` decides where the page shows Edit; the server stamps a
  chirp's author and time from who is asking; the compose box and the editor
  are forms over the writes' inputs, drawn with `foldkit-mixins-form/ui`; a like
  is one server handler answering the post as it now reads. The server runs in
  the browser on SQLite compiled to WebAssembly, in a SharedWorker every tab
  shares, and the demo is listed with the others.
- **Computed assignments** (Phase 6 of `expr-operations-DESIGN.md`).
  `Write.update(input, { compute: { label: ({ row, input }) => … } })` sets a
  field from the row before the write and the input, refused where declared for
  the row after, another Entity, a field another key writes or a kind it does
  not store; defined operators are expanded there. `Write.bind` carries it as
  data (`BoundWrite.assignments`, `Computation`), which `EntityWriter.update`
  receives (`assignments`, a writer saying `assignments: true`): the Drizzle
  writer compiles it into the `set` and its invariants (`computationSql`),
  Guard judges and member-rules it and `validate` refuses one computed from a
  Read-ruled member, and Remote predicts it with `Remote.make`'s `operators`
  over the row as read (`Remote.at(…, { operators })`). Without `expect` it
  lands only under a ledger, where the writer `pins` the row it read or
  `commutes` it: `op(field, amount)` with commutativity and associativity tested
  in both of the binding's tables (`DrizzleOperators.withEvidence`, from
  `Conformance.lawsBy`, which tests laws through any runner).
- **`Write.apply(row, bound, { operators })`**, the one computation of the row a
  write leaves, which Guard, the Drizzle writer and Remote's prediction now all
  use, and `Write.boundReads(bound)`, what of the row it needs.
  `applyOperator` runs an operator over stored values; tables look an operator
  up by name (`named`).
- **Operators described** (Phase 7 of `expr-operations-DESIGN.md`).
  `Operators.describe(op)` is an operator's signature as JSON, checked by the
  `OperatorDescription` Schema: its name and version, its description, each
  argument and its result as a JSON Schema of the stored side, its null and
  collation rules, its laws, and whether it is defined (never its body).
  `Query.operators(body)` names the operators a body calls. A table lists the
  versions it holds of an operator (`OperatorTable.versions`), and a call to
  another version is refused naming both (`acme.slug@2 (this table has
  acme.slug)`), where it is checked and where it runs (`missingName`).
- **An operators guide** (`docs/operators.md`, on the site under Entity): what
  an application's operators enable, from a rule named once to computed writes
  and one meaning checked across the client and the server.
- **`evaluateEach(body, input, rows, { operators })`** in `foldkit-entity`:
  the reference interpreter judging each row alone, so a row holding text with
  a NUL goes in `refused` and the others are still answered. What no one row
  causes (an operator the table lacks, an input the body reads holding a NUL,
  order keys of different kinds) still refuses the run.
- **What a table records, and of what.** `Operators.testedOn(record)` names the
  memory implementation `Conformance.laws` tested a record on, and
  `Operators.testedByRunner(record)` whether `Conformance.lawsBy` made it.
  `Law.witnessesNamed(law)` names the operators a law calls besides its own
  (`inverse`, `distributes`). `Expr.givesNul(...nodes)` says whether a constant
  written in expressions holds a NUL. A `Counterexample` names the `collation`
  its calls were made under.
- **`EntityWriter.operators`**: the memory table a writer works out the row a
  write leaves by, which a wrapping writer judges by. The Drizzle writer gives
  its binding's.

### Fixed

- **`foldkit-media/vite` reads Lucide.** An Iconify alias spelt only
  differently from the icon it names (Lucide's `arrow-down-01` for
  `arrow-down-0-1`) was taken for a second icon imported by the same name, and
  `icons({ iconify: ['lucide'] })` failed to start. Such an alias is now left
  out; two different icons under one name still fail the build.
- **The reference interpreter and the call builder agree with SQL at their
  edges.** An expression built from a field keeps its declared collation when
  passed on, so an invariant compares or orders text over `before`. A NUL in a
  value the query is given is refused before a null beside it answers, as SQL
  refuses it; a constant holding one refuses `evaluateEach`'s run, not each
  row. Order terms count toward `maxQueryNodes`. No call carries a backend's
  locale. A boolean argument is checked by its stored kind. `evaluate` checks
  an order over one row as over many. An operator that handles null is given
  null, not `undefined`, for a value never given. Building calls that share
  their arguments is linear in their depth, where it doubled per level.
- **An order by a number carries no collation.** A number-valued call inherited
  its text argument's collation, which Postgres refuses on a number; it is now
  dropped, and a collation written on a number term is refused where it is
  written. A raw order term folding a Postgres column that is not text no
  longer lowers it.
- **A computed assignment that may be null is refused for a field that stores
  none,** where it is declared: a nullable field, a null, or a strict operator
  over a nullable argument. Memory showed the null and the database refused it
  as `NOT NULL`.
- **A refusal names another declaration of an operator as such.** A table
  holding an operator of the same name and version from another
  `Expr.operator` call read `acme.slug (this table has acme.slug)`.
- **Laws are tested under every collation an operator is called with.**
  `Conformance.laws` and `lawsBy` ran an operator that compares text under
  `binary` alone, so an implementation that broke a law only under `asciiFold`
  passed. A witness that compares text (`Law.inverse`, `Law.distributes`) is
  called under it too, where it threw, and an operator comparing no text gets a
  pass under each collation when its law's witness compares text. Outcomes are
  compared as values, not as JSON, which wrote `Infinity` and `NaN` as `null`;
  a plain object by its present keys, anything else (a Date) by its JSON.
- **Evidence is tied to what was tested.** `Operators.withEvidence` refuses a
  `Tested` record `Conformance.laws` did not make of the table's own
  implementation, and `DrizzleOperators.withEvidence` one `Conformance.lawsBy`
  did not make (built by hand, copied, or tested in memory); before, a verdict
  for one implementation could be recorded for another that breaks the law.
  Replacing an operator drops the evidence of a law that called it as a
  witness. A computed assignment commutes only by laws tested over every value,
  not one narrowed by `Law.within`. `Law.describe` keeps a domain's `$defs`.
- **Operator arguments and compared values bind as each database takes
  them.** On Postgres an integer is cast to `integer` while its value fits one
  (so a function taking one, `left(text, int)`, resolves) and to `bigint` past
  32 bits, which `Schema.Int` admits and an `integer` cast failed. On SQLite a
  boolean is bound as 1 or 0, as it stores one, wherever a value is compared
  with what no column encodes (a computed value, a call), where it failed to
  bind at all.
- **A computed value compared under a collation compiles on Postgres,** on
  either side of the comparison. An invariant ordering the value an assignment
  computes wrote SQLite's `collate binary` there, which Postgres refuses.
- **An order SQLite cannot compile is refused where the query is registered,**
  each `Order.chosen` alternative too, not on every request.
- **A Read rule compiles by the tables it was checked against** in
  `GuardDrizzle.visible` (its SQL table, and the policy's for what the input
  alone decides), so a server that starts can compile it whatever table its
  bindings were given.
- **A guarded write is judged by the value its database writes.**
  `GuardServer.writer` works out the row a write leaves by its writer's table
  (`EntityWriter.operators`), so a policy whose table differed no longer judged
  one value while the database wrote another. A field it cannot work out fails
  the write, where its old value was judged and a rule over it could pass; a
  write whose computation no table it holds can run is refused where it is
  registered. A guarded writer with no `revision` is refused at registration
  for a write that moves a field and expects none, rather than on every request.
- **A rule whose operator refuses a row's value does not hold,** rather than
  ending the request: text holding a NUL in what a write supplies can deny it,
  never crash it (`Condition.holds` judges each row alone). A computed value a
  guarded write cannot work out is a server error with a fixed message, the
  implementation's own logged, never sent; and it is worked out only after the
  rules over the stored row pass, so a writer they refuse learns nothing of it.
- **Remote predicts nothing from a value an earlier pending write could not
  work out.** A later pending computation read the store's stale value under
  it, and showed a value the server would not write.
- **`Layout.stack` keeps a width a child sets.** Its child rule gave every child
  `inline-size: 100%` from the `layouts` layer, which beats `components`, so a
  checkbox in a stack drew 308 by 16; it now stretches each child
  (`align-self: stretch`), which fills one with no width of its own as before
  and leaves a set width alone. A text field no longer spills past the stack by
  its padding where no `border-box` reset applies.
- **`foldkit-mixins-data-grid`: a header's sort label and column menu button are
  finger targets**, at least 24px (the menu button each way), where they were the
  height of their words and glyph (about 21px tall and 30 by 23).
- **`foldkit-remote`: a row created in an empty list shows.** An empty, complete
  answer was stored as no segments at all, so placing a created row by the
  list's declared order found nothing that ends the list and left the row out,
  pending and confirmed: the Cloudflare example's first todo never appeared in
  the tab that added it. Such an answer is now kept as one empty segment while
  the list holds nothing else.

### Changed

- **A defined operator takes no implementation.** `Operators.implement` and
  `DrizzleOperators.implement` refuse one: SQL compiles what a defined operator
  means, and a memory implementation was a second meaning only the client ran.
- **`Expr.contains` searches for a value or an input,** in its type and where
  it is written. A field or a call as the search was answered in memory and
  refused by the SQL compiler on every request.

- **A recipe with no variants refuses a selection** (`Style.recipeFor`,
  `Style.recipe`): `Field({ tone: 'quiet' })` compiled and did nothing, since an
  empty selection type accepted any key; it is now a type error. Call such a
  recipe with `{}` or nothing. `SlotRecipeSelection` is exported.
- **`matching` skips a held row holding text with a NUL** rather than
  refusing the whole list, so one bad stored row no longer blanks a local
  filter (`filtered`). An input holding one still refuses, as the server
  does.
- **`Operators.describeTable(table)` lists each operator as `Operators.describe`
  does**, with its evidence: its name is `name`, where it was `operator`. An
  `OperatorTable` has `versions` beside `has`.
- **An increment of a real number expects a revision**, even under a ledger,
  unless its writer pins the row it read: floating-point addition does not
  associate, so two concurrent sums could land as two results. Declare an
  integer field `Schema.Int` to keep landing increments without `expect`.
- **Guard judges a null under an amount as null**, as SQL writes it, where it
  summed `Number(null) + amount`.
- **`BoundWrite.assignments`, `EntityWriter.update`'s `assignments`**, and
  `visibleStore`/`resolvedPatches`' `operators` (the kernel by default) are new
  parts of these shapes; a hand-built `BoundRemote` needs `operators`.

## 0.34.0

Fields from a schema, and operators an application defines. `foldkit-form-recipes`
is new: dates, times, money, decimals, percentages, text-shaped keys and an image
uploaded where it is chosen, each a control, a display and a renderer.
`UiForm.renderers` draws every form control through `foldkit-mixins-ui`, a form
lists the fields to fix above its submit button, and `Crud.screen` composes an
editor, a list and a delete question into one page with `EditorView`,
`ConfirmView` and `Toolbar`. `examples/fields` shows every recipe in a real form.
`Expr.operator` names an operator by an expression, and primitive operators run
by a table in memory and in SQL, through to ordering and paging by a call; an
operator's laws are checked by `Conformance.laws`.

Breaking: `foldkit-cms`'s slug and moment controls moved to `foldkit-form-recipes`;
a Drizzle order term is `{ key, … }`, not `{ column, … }`; `Query.unsupported`,
`Condition.holds` and `Dependencies` changed shape for operators (see Changed).
New: `foldkit-form-recipes` 0.1.0. New minors: `foldkit-entity` 0.12.0,
`foldkit-remote` 0.20.0, `foldkit-remote-server` 0.17.0, `foldkit-remote-drizzle`
0.14.0, `foldkit-guard` 0.5.0, `foldkit-form` 0.8.0, `foldkit-mixins-form` 0.9.0,
`foldkit-crud` 0.10.0, `foldkit-mixins-crud` 0.8.0, `foldkit-media` 0.3.0 and
`foldkit-cms` 0.8.0. Fixed: `foldkit-mixins-ui` 0.20.2, `foldkit-cms-drizzle`
0.6.16 and `foldkit-mixins-builder` 0.3.15. Republished for the new versions they
depend on: `foldkit-auth` 0.1.4, `foldkit-builder` 0.3.13, `foldkit-composition`
0.3.11, `foldkit-data-grid` 0.3.1, `foldkit-mixins-data-grid` 0.2.14,
`foldkit-mixins-richtext` 0.5.6, `foldkit-richtext` 0.5.2, `foldkit-richtext-code`
0.2.4, `foldkit-richtext-code-shiki` 0.2.4, `foldkit-richtext-dom` 0.6.5,
`foldkit-richtext-markdown` 0.3.3 and `foldkit-sync` 0.12.3. `foldkit-plus` is
0.16.0.

### Added

- **`foldkit-crud`: `Crud.remover(name, config, { returnFocus })`.** A no takes
  the delete question and its buttons away; with `returnFocus`, the selector of
  what asked, focus goes back there rather than to the page. `examples/entity`
  returns it to its Delete button.

- **`foldkit-form`: `Input.bundle`'s `busy`.** A control with work its value
  waits on (an upload) says so, and a submit made meanwhile waits for it as for a
  check: the key reads `Validating`, the submit goes out when the work lands with
  a value, and the key is validated when it ends without one.
  `foldkit-form-recipes/image` is busy while it sends.

- **`foldkit-crud`: `Crud.screen(name, { id })`.** A page's four editor Messages,
  named after the screen (`OpenedPost({ id })`, `CreatedPost()`, `ClosedPost()`,
  `AskedToRemovePost({ id })`), and an `update` that answers them through the
  editor's and the remover's placements and runs the editor's sync after every
  Message. It places nothing and holds no state. Given `pickers`, it also answers
  a picker's `AskedForMore`.
- **A relation picker asks for more.** `foldkit-crud`'s `Crud.options` gains
  `more(model)` (the pickers whose list has another page) and `ask(model, key)`
  (the page with one more page of that list), and a list gains `hasMore(model)`.
  `foldkit-mixins-form`'s view input `more` draws a "Show more" button under each
  such picker (`FieldSlots.more`, `words.more`), which sends `foldkit-form`'s new
  `AskedForMore({ key })`; the form changes nothing for it, and the page that
  owns the list answers.
- **`foldkit-mixins-crud`: `EditorView`, `ConfirmView` and `Toolbar`.** `EditorView`
  draws what a `Crud.editor` says around its form in each status (busy while
  loading or saving, a failed save as an alert that keeps the form, a conflict,
  a row moved on) with its title and a close button; `ConfirmView` asks
  `Delete {name}?` before a `Crud.remover` deletes, and cannot confirm without a
  name; `Toolbar` holds a list's search, filters, order and actions in slots. Each
  is given its state and Messages and owns neither; in a dialog, focus is the
  Dialog's.
- **`foldkit-form-recipes` 0.1.0, its first release: field recipes for
  `foldkit-form`.** A recipe is a control and a display made from the same
  options. `FieldRecipes.date()` edits a `CalendarDate` as `YYYY-MM-DD`;
  `FieldRecipes.dateTime({ stored })` keeps either the wall-clock text a
  `datetime-local` writes (`'local'`) or an ISO instant read and shown in an
  explicit IANA `zone` (`'instant'`), refusing a time the clocks skip and taking
  the earlier of one they repeat. `email`, `url` (a scheme allowlist, so no
  `javascript:`), `tel`, `password` (named for the password manager, hidden in a
  list) and `slug` (following another key until written) keep what was typed.
  `money` (in exact minor units or decimal text, with the currency's own
  decimals), `decimal` and `percent` read and show an amount as the locale writes
  it, refusing grouping other than the locale's, more decimals than the scale and
  a minus unless asked for, rather than guessing.
  `foldkit-form-recipes/html` draws each as a native input with the type, the
  autofill and the keyboard its key wants, and `foldkit-form-recipes/ui` draws the
  same inputs under `foldkit-mixins-ui`'s Input Slot. `foldkit-form-recipes/image`'s
  `image({ id, ... })` is a key holding the `HashedAsset` that `foldkit-media`'s
  upload route keeps: a Bundle control that sends a chosen file at once, shows
  its progress with Cancel (which aborts the request), and a refusal's reason
  with Try again; only a kept image is a value. `foldkit-plus` re-exports
  the four entries as `foldkit-plus/form-recipes`, `/form-recipes/html`,
  `/form-recipes/image` and `/form-recipes/ui`.
- **`foldkit-mixins-form/ui`: `UiForm.renderers(styles?)`, a renderer for every
  kind `foldkit-form` ships,** for `FormView.define(form, { renderers })`. Text,
  Number, Multiline and the selects are the plain elements under
  `foldkit-mixins-ui`'s Input, Textarea and Select Slots; Toggle, Choices and
  RelationMany are its Checkbox's `role="checkbox"` buttons, with a hidden input
  in each checked one so a post without scripts still carries the value. The
  field around each control, its name, id and accessibility state are the plain
  path's, and the same interaction sends the same Messages.
- **`foldkit-mixins-form`: the fields to fix.** While any field is invalid, the
  form view draws a `summary` above its submit button: `words.summary`, then a
  link to each invalid field's control, rows' too, worded by `words.issue`
  (`{label}: {error}`). A link's `href` is the control's `#id`, so it works
  with scripts off; with them on, a press focuses the control (a choice
  group's first box) without navigating, and sends **`foldkit-form`'s new
  `FollowedIssue({ id })`**, which changes nothing.
- **`foldkit-media/browser`: `upload(file, { url?, headers? })`,** a browser
  client for `POST /_media/upload`: a `Stream` of `Progressed` and one
  `Uploaded` with the facts, failing with `UploadFailed`, whose `reason`
  names the route's refusal, `Network` or `Unexpected`. Interrupting it
  aborts the request.
- **`foldkit-mixins-form/ui`: `UiForm.field` takes the form view's `words`,** so
  its checking line reads `words.checking` as the plain field does, rather
  than a fixed `Checking…`.

- **Operators defined by an expression: `Expr.operator`.** An application names
  a question once (`Expr.operator('acme.published', { input, output, definedAs })`)
  and calls it like a function: a boolean output makes the call a predicate
  (`Test`), any other a scalar (`Call`). `definedAs` builds what a call means from
  its arguments, and every interpreter runs that expansion, so an operator needs no
  SQL or evaluator of its own and compiles to the SQL of its body written out.
  Calls print by name, `Query.dependencies(body).operators` lists them (and Remote's
  explanations), and `Expr.expanded(predicate)` writes them out. A body that reads
  what no argument holds, a wrong argument, or a body of the wrong kind is refused
  when called. Phase 1 of `expr-operations-DESIGN.md`; the conformance suite runs
  operator cases in every interpreter.
- **Primitive operators and their tables** (Phase 2 of `expr-operations-DESIGN.md`).
  `Expr.operator` without `definedAs` declares an operator each interpreter
  implements, with a null rule (`nulls: 'strict' | 'handled'`) and a collation
  rule (`collation: 'none' | 'operands' | 'required'`); a call may be given
  `{ collation }`. `Operators` builds immutable tables of in-memory
  implementations (`memory`, `implement`, `implementHandlingNulls`, `merge`,
  `override`, `checked`, `kernel`), which `evaluate`, `decided`, `truthOver`,
  `Entity.judge`, `Entity.judgeInput` and `Entity.check(entity, { operators })`
  take. `Text.startsWith` is the kernel's first, under its text's collation.
  `Expr.unsupported(nodes, { operations, operators })` names what an interpreter
  lacks, `Collation.foldAscii` folds as `asciiFold` compares, and
  `OperatorMissingError` names an operator a table does not run. The
  conformance suite exports `primitiveCases` and `primitiveRefusals`.
- **Every in-memory site takes the table.** `G.implement(bodies, { operators })`
  gives a Guard policy one (`Policy.operators`), which `Policy.decide`,
  `Condition.holds` and every `GuardServer` memory path run row guards by;
  `GuardServer.validate` refuses a server whose rules, on any surface, call an
  operator that table does not run. `RemoteServer.memory({ operators })` checks
  every query body against its table where it is built, `Remote.make({
  operators })` matches, filters and places rows by it, and
  `Form.make(name, input, { operators })` judges invariants by it (a nested form
  given none uses it).
- **Primitive operators in SQL** (Phase 3 of `expr-operations-DESIGN.md`).
  `DrizzleOperators` builds SQL tables (`implement`, `make`, `merge`, `override`,
  `kernel`, with `Text.startsWith` as `substr`/`left` under its collation), and
  `bind(entities, storage, { operators: { memory, sql } })` and `entity(name,
  table, { operators })` give a binding both (`EntityBinding.operators`), each its
  kernel when not given. On Postgres a literal or input argument taken as a number
  or boolean is cast to its type; a call's text is compared under its collation.
  A query, an invariant or a write's `when` calling an operator either table lacks
  is refused where it is registered or its writer built (`requireOperators`,
  `operatorProblems`), and the writer judges a row in memory by the binding's
  table. `GuardDrizzle.visible(Policy, entities, { operators })` checks Read rules
  against the SQL table it is given. `SchemaShape.holdsIntegers` says whether a
  number schema holds integers. The registry finds a product by its UPC's prefix.
- **Ordering by a call** (Phase 4 of `expr-operations-DESIGN.md`). An order term,
  or an `Order.chosen` alternative, may be a call whose result orders alike
  everywhere: a number, or text under `binary` or `asciiFold` (the call's, or the
  term's); anything else is refused where it is written. `evaluate` orders by it
  per row with its table, Drizzle compiles it under its collation and pages by
  its value on SQLite and Postgres, and Remote places rows by it with
  `Remote.make`'s table, a list it cannot place being fetched instead.
  `Expr.expanded` takes a scalar too, and expands a defined operator among a
  primitive call's arguments.
- **Laws, evidence and the conformance helper** (Phase 5 of
  `expr-operations-DESIGN.md`). `Expr.operator(id, { laws })` declares `Law`s
  (`associative`, `commutative`, `idempotent`, `identity`, `absorbing`,
  `inverse`, `distributes`, `monotonic`, `preservesCollation`, narrowed with
  `Law.within`), each checked where declared: a law of two arguments on a unary
  operator, or a witness its schema does not store, is refused.
  `Conformance.laws(op, table)` tests them over seeded samples and answers
  `Holds` with `Tested` evidence or a `Counterexample`; `Operators.withEvidence`
  records evidence (and `Evidence.Proven`), `Operators.describeTable` lists it
  as JSON. `Conformance.operator(op, { implementations })` runs generated calls
  (null, NUL, mixed case under each collation, astral text) through several
  runners and reports disagreements; `foldkit-remote-drizzle`'s `compileCall`
  compiles one call for an SQL runner, and `valueOfOperand` runs one in memory.
  A primitive call refuses text holding NUL before a null argument answers, as
  SQL does where it compiles.
- **`Cms.published(entity)`**: whether a row is published, as `cms.published` over
  the Entity's `published` role. The CMS example's two public queries and three
  visitor Read rules use it in place of five hand-written `isNotNull`s.
- **`EntityWriter.refuses(write)`**: the reasons a writer cannot land a write,
  asked once by `RemoteServer.write` where the write is registered, for what only
  the store knows (a column's type). `GuardServer.writer` passes its writer's on.
  `Write`'s `increments` are `WriteIncrement`s, each saying whether its amount is
  held to an integer (`integer`).

### Changed

- **`foldkit-form-recipes`' kinds and displays are named `FieldRecipes.Date`,
  `FieldRecipes.Money`, …**, so an application's own `Date` kind no longer meets
  a recipe's renderer. The image's default `sending` words are `Sending {name}`.
- **A control backed by a Bundle is drawn in a `role="group"` named by its
  field's label**, which now has an id (`{id}-label`).
- **Breaking: `foldkit-cms`'s slug and moment controls are `foldkit-form-recipes`'.**
  `Cms.slug`, `Cms.slugify`, `Cms.dateTime`, `Cms.Input` and `Cms.controlRenderers`
  (with its `ControlContext` type) are removed: use `FieldRecipes.slug(from, {
  prefix }).control`, `FieldRecipes.slugify`, `FieldRecipes.dateTime({ stored:
  'instant', zone }).control`, `FieldRecipes.Kinds` and `foldkit-form-recipes/html`'s
  `renderers()`. The kinds are now named `Slug` and `DateTime`, not `CmsSlug` and
  `CmsDateTime`. A moment is read in the `zone` you name, where `Cms.dateTime()`
  read it in the browser's own zone (and a server's, when rendered there); pass
  `Intl.DateTimeFormat().resolvedOptions().timeZone` to keep that. A draft is no
  longer rewritten as it is drawn: a stored instant becomes the zone's local text
  when the form is filled.
- **A Drizzle order term is `{ key, direction, nulls?, collation? }`**, where it
  was `{ column, … }`: `key` is a column or a Drizzle `SQL` expression, which
  says its own collation (one given beside it is refused). `cursorSelection`
  selects each key under a positional alias (`key0`, `key1`, …), read back with
  `keysOf`.
- **`Query.placement(body, input, { operators })`** places a call only by a
  client table that runs it (none when not given), and **`compareRows(terms,
  left, right, query, { input, operators })`** runs a call by them.
- **`Query.unsupported(body, supported, operators?)` names primitive operators
  too**, so its result is `ReadonlyArray<string>`, not `Operation`s; without a
  table every primitive operator is named. **Comparing text needs a
  collation, not a field**: a call carrying one compares as a field does.
- **`Condition.holds(condition, values, input, inherit, operators)`** takes the
  table its row guards run by, as a required last argument: pass the policy's
  (`Policy.operators`).
- **An invariant's `Undecided` has `operators`** beside `fields`: the operators
  its judge's table does not run. An exact comparison with one adds
  `operators: []`.
- **`Dependencies` gains `operators`**, each operator a body calls, and Remote's
  `ExplainedDependencies` carries them as `{ id, version }`. A test comparing a
  whole `Dependencies` with `toEqual` adds `operators: []`.

### Fixed

- **A busy control in a row holds the submit.** A submit made while a row's
  upload ran went out without waiting; it now waits as a top-level one does.
  `Input.bundle` throws for `busy` without `settled`, which left a stored form
  shown again waiting for good.
- **A busy key that is already valid stays valid** when the form validates
  every key, rather than reading `Validating`.
- **A Bundle field draws no `Checking…` line** under its own busy control; it
  keeps `aria-busy`.
- **A field override is given `toggled`** beside `changed` and `blurred`.
- **A row inside a row is named through both** in the fields to fix.
- **`Crud.remover`'s `returnFocus` may be a function of the id**, and a no
  with nothing asked moves no focus.
- **The fields to fix name a row's field with its row** (`comments 2, body:
  Required`, worded by the new `words.inRow`), so two rows' links no longer read
  the same.

- **`foldkit-form-recipes`' amounts read back what they show in every locale.**
  A currency or a percentage can group and separate decimals otherwise than a
  plain number (`de-AT`, `fr-CH`, Indian currencies), and rtl locales write bidi
  marks; a filled amount there was refused. The symbols now come from the field's
  own format, and the keyboard's `¥`, `'` and full-width digits read as the format's.
  A space or a symbol inside an amount is refused, and a `decimal` or `percent` a
  JavaScript number would round is refused rather than stored rounded, while one
  it holds is taken at any scale (`0.1` at 17 decimals). Only full-width forms are
  folded, so `10²` is refused rather than read as `102`, and an override or a
  zero-width space in an amount is refused.
- **A year under 100 is that year** in `date`, `dateTime` and their displays,
  not 19xx.
- **A recipe's bad option throws when it is made**: a scale that is no whole
  number from 0 to 20, a currency code that is not three capital letters (any ISO
  4217 code is taken, `XAU` and `CLF` too), a `url` scheme without its colon.
  `email` refuses control and invisible characters; `slugify` writes `ß`, `ı`,
  `æ`, `ø`, `ł`, `ħ`, `ə` as Latin letters; an instant is read only as ISO text,
  and one past year 9999 is refused.
- **`foldkit-form-recipes/image`:** the field's label names the group the
  control is drawn in; one live region says each state once, and the progress is
  named by it; Cancel, Remove and Try again move focus on; a dropped file that
  is no image is refused before it is sent; an `id` no selector can name, a
  header a browser would refuse or drop, or a bad `url` throws when the
  recipe is made; the root carries `data-upload`. The docs no longer suggest a
  deployment's secret as a browser's header: a page's session cookie answers the
  application's `UploadPolicy`.
- **`foldkit-mixins-crud`:** Escape closes a Dialog by itself, so the README says
  to answer its `Closed` OutMessage with the editor's close; the default conflict
  words no longer offer a reload nothing does.

- **Two presses on a form's checkboxes before the next draw both count.** Each
  press sent the whole draft as drawn, so the second undid the first.
  `foldkit-form` gains `Toggled({ key, choice? })`, which flips a flag or lets go
  of or adds one choice to the draft as it stands, and both of
  `foldkit-mixins-form`'s renderer tables send it (`RenderContext.toggled`).
- **A choice group that must hold two or more no longer fails `Form.make`.**
  Its schema is tried with the first one, two, … of its options.
- **The fields-to-fix summary has no id**, so a key named `summary` no longer
  shares one with it.
- **"Show more" is drawn only under the form's own relation pickers**, and none
  while a picker is locked.

- **`foldkit-form`: a choice of literals that must hold one is a form key.** A
  `Schema.NonEmptyArray` of literals, or an `Array` of them with a length check,
  threw at `Form.make` ("its schema accepts no such value"): the wiring check
  tried `[]` and an id, and such a schema takes neither. It is now a required
  Choices key.
- **`foldkit-mixins-form`: a Choices or RelationMany group carries the field's
  validity and descriptions,** as every other control does: its `aria-invalid`
  and `aria-describedby` were missing.
- **`foldkit-mixins-form`: a locked, checked Toggle posts `on`.** The field posts a
  locked key's value through hidden inputs, and a boolean draft posted nothing.

- **`foldkit-mixins-ui`: Backspace in the Command menu deletes a character typed
  in the same frame.** It decided from the query the field was last drawn
  with, so a character typed and deleted before the next frame left it
  reading an empty field: Backspace stepped out of the page instead of
  deleting. It now reads what the field holds.

- **An integer field is no longer incremented by an amount that may be a
  fraction.** `Write.update` accepted `increment: { count: 'by' }` for a
  `count` declared `Schema.Int` (or any check holding `Schema.isInt`, such as
  `isInt32`) and a `by` declared `Schema.Number`. A fractional amount then split
  the databases: Postgres refused the statement, and SQLite stored `2.5` in the
  integer column, a value the field's schema does not admit. Such a write is now
  refused where it is declared, naming both keys; declare the amount
  `Schema.Int`.
- **Nor is an integer column, whatever its field says.** A field declared
  `Schema.Number` over an `integer` column (SQLite `integer`; Postgres
  `integer`, `smallint`, `bigint` read as a number) took a fractional amount the
  same way. `foldkit-remote-drizzle`'s `writer` now refuses such an increment
  where `RemoteServer.write` registers it, so a server with one does not start;
  give the amount `Schema.Int`. A `real` or `double precision` column takes any
  amount. Every increment in the examples and guides now declares its amount
  `Schema.Int`.


## 0.33.0

Declared writes that hold where they commit. A `Write` says what it sets, when it
makes sense (`when`), and what it adds (`increment`); `Entity.invariant` says what
every row, and every change of one, must hold; the Drizzle writer checks all of it,
and the guard's revision pin, in the one statement that lands the write, with a
ledger so a retry is never applied twice. Forms and Crud show an invariant's
refusal beside its fields. The guide is `docs/declared-writes.md`.

Breaking: `Remote.mutate`'s fourth argument is options (see Changed). New minors:
`foldkit-entity` 0.11.0, `foldkit-remote` 0.19.0, `foldkit-remote-server` 0.16.0,
`foldkit-remote-drizzle` 0.13.0, `foldkit-form` 0.7.0, `foldkit-guard` 0.4.0,
`foldkit-data-grid` 0.3.0, `foldkit-crud` 0.9.0 and `foldkit-mixins-form` 0.8.0.
Fixed: `foldkit-surface` 0.10.2, `foldkit-composition` 0.3.10 and
`foldkit-cms-drizzle` 0.6.15. Republished for the new versions they depend on:
`foldkit-agent` 0.8.3, `foldkit-auth` 0.1.3, `foldkit-builder` 0.3.12,
`foldkit-bundle-surface` 0.4.3, `foldkit-cms` 0.7.12, `foldkit-mirror` 0.6.3,
`foldkit-mixins-builder` 0.3.14, `foldkit-mixins-crud` 0.7.12,
`foldkit-mixins-data-grid` 0.2.13, `foldkit-richtext-dom` 0.6.4, `foldkit-site`
0.4.4, `foldkit-ssr` 0.8.2, `foldkit-sync` 0.12.2 and `foldkit-mixins-richtext`
0.5.5. `foldkit-plus` is 0.15.0.

### Added

- **`foldkit-entity`: invariants.** `Entity.invariant(id, ({ before, after })
  => predicate, { message, path? })` declares, on the Entity's metadata, what
  every stored row must hold (`({ after }) => Expr.lte(after.reserved,
  after.quantity)`). `after` is each field as the row after a write holds it
  (`Expr.next`, a `Next` node, which query interpreters refuse as the operation
  `next`); `before` each as the row before holds it (`Expr.field`). What it reads sets its lifecycle:
  one over `after` only is a state invariant, judged on every create and
  update; one that reads `before` too is a transition invariant (a shipped
  order stays shipped), judged on updates only (`Entity.readsBefore`). One that
  reads nothing of `after` is refused where it is declared: which rows a write
  may start from is its `when`.
  `Entity.judge(entity, { after, before? })` judges a row or a change: `Valid`,
  `Invalid` with the failures (a null fails, as SQL's unknown), or `Undecided`
  when a row lacks a field one reads. `Entity.check(entity)` is the state
  invariants as a Schema check, each failure at its path.
  `Expr.substituteNext(predicate, values)` reads the fields a write sets as
  their values, and `Dependencies` lists them as `next`. (#183, #184)
- **`foldkit-entity` and `foldkit-remote`: an invariant is matched by its
  declaration.** `Entity.invariant` returns the step that attaches it with its
  `id` (`DeclaredInvariant`); hoisted as `Entity.invariant<typeof Fields>(…)`
  it can be exported beside the Entity. `Refusal.isInvalidBy(refusal,
  invariant)` says whether a refusal is `Invalid` naming it; an unnamed one
  matches none.
- **`foldkit-remote-drizzle`: the writer enforces invariants.** `bind` keeps
  the Entity's invariants on the binding (`invariants`), and `writer` compiles
  each into the update's `WHERE` over the row it would leave (a set field as
  its new value, an incremented one as its column moved), judges an insert's
  values before writing, and refuses a row that breaks one as `Invalid`, after
  a conflict and an unmet precondition. An invariant the database cannot
  compile is refused when the writer is made, and `RemoteServer.write` refuses
  an insert that leaves a field one reads unset. On SQLite, Postgres and D1.
  `GuardServer.writer` passes them through, after its rules, and answers an
  invariant that reads a Read-ruled member as `Invalid` naming none.
- **`foldkit-form` and `foldkit-crud` show invariants.** A form judges the row
  its value describes on submit (`Entity.judgeInput`, new): a row that breaks
  an invariant does not go out, and the message shows beside each key its path
  names, or in `errors`; one over a field the form does not set is left to the
  server. `Crud.editor` shows a save's `Refusal.invalid` the same way. (#183)
- **`foldkit-remote-drizzle`: the writer judges transition invariants.** Over
  every update's change, in its statement (the row before as the columns,
  after as for a state invariant); a miss that breaks one is `Invalid`. A row
  already holding what an update sets is answered as written, as its retry
  finds it, and judged as a row rather than a change.
  `GuardServer.writer` names none over a Read-ruled member, and
  `RemoteServer.write` needs `invariants: true` of an update's writer when the
  Entity has any. (#184)
- **`foldkit-remote-drizzle`: `invariantChecks(binding)`.** Each state invariant as
  a `CHECK` constraint (`constraint "<table>_<id>" check ((…) is true)`, values
  inlined) for a migration, so a handler's write or raw SQL is held to it too;
  a null fails it, as in the writer. (#183)
- **`foldkit-form`: a control says how a value is shown, and a key can be any
  number of a fixed set.** `Input.kind` takes `format`, the text a value is shown
  as when a form is filled with it — the inverse of `parse`, called by `fill`
  only, so a caret and a composition are never disturbed while someone types.
  A key typed `Schema.Array(Schema.Literals([...]))` resolves to the new
  `Choices` kind instead of failing at `Form.make`, and `Input.choices([1, 2])`
  names the set for a key whose schema cannot spell it. `foldkit-mixins-form`
  draws a `Choices` key as a group of checkboxes, as it draws a relation picker.
  `Input.kind` also takes `parseList`, the list counterpart of `parse`, and its
  spec is discriminated on the draft a kind holds: a hook that draft can never
  reach — `parse` or `format` on a `list`, say — is a type error rather than a
  hook that is silently never called. A filled value whose control formats
  nothing still shows as `String(value)`.
- **`foldkit-data-grid`: a Shift click spans rows.** In a `'multiple'` grid
  without `cellSelection`, a Shift click focuses the cell and reports
  `Out.RowsRequested({ from, to })`, from the anchor (or the row focused
  before it) to the row clicked; `Grid.extendRows(rows, model.grid, request)`
  is the grid's Model with the rows between added, in the order they are
  drawn. A click reaches the grid through a Mount, which cannot read the rows
  the view drew, so the application answers it, as it answers `Out.Filled`.
  An exhaustive `Grid.Out.match` needs the new arm. (#144)
- **`foldkit-guard`: a guarded write lands on the row its rules were decided
  over.** `GuardServer.writer(entity, policy, writer, { revision })` names a
  field every write of the row changes; each update and delete then passes
  the revision it read as the writer's `expect`, so the check and the write
  are one compare-and-set statement. A row that moved after the check is
  decided again over what it now holds, up to three times, then the write
  fails ("changed while it was written"). An input that expects a revision
  the row is not at is a `Conflict`, decided before any rule. Without
  `revision` nothing changes, and `GuardServer.validate` warns of each write
  through such a writer. (#182)
- **A declared write can say when it makes sense: `when`.** `Write.update` and
  `Write.delete` (`foldkit-entity`) take `when: ({ input }) => Predicate`, a
  query body over the write's own Entity, read from the row before the write
  and the input. The Drizzle writer compiles it into the statement's own
  `WHERE`, so it holds of the row the write changes, and a row that does not
  hold it is refused as `Refusal.unmet` (`foldkit-remote`). `Mutation.write`'s
  `Refusal` includes `Unmet` only for a write with a `when`. `EntityWriter`
  gains `when` in its update and delete contexts, `RemoteUnmet`
  (`RemoteServer.unmet()`), and `preconditions: true`, without which
  `RemoteServer.write` refuses a write with a `when`. Through
  `GuardServer.writer`, `Forbidden` and `Conflict` come before `Unmet`, and
  a `when` or an `expect` over a member with a Read rule, which would answer
  for it, is refused by the guarded writer itself and by `GuardServer.validate`
  at startup. A guarded writer's `revision` must be
  stored as a number, and an input may expect only that field. (#182)
- **A declared update can move a number field by an amount: `increment`.**
  `Write.update(input, { id, expect, increment: { stock: 'quantity' } })` adds
  the input's unmapped `quantity` to the stored `stock`, in the statement that
  writes (`column = column + amount` in the Drizzle writer). Without a ledger
  (below) it must `expect` a revision, so a retry of a write that landed is a
  `Conflict`, never a second increment; Remote's recognition of a lost answer is off for such a
  write. `Write.bind` returns `increments` apart from `values`, and `Data.mutate`
  predicts the sum over the value the store holds (a pending layer's `adds`,
  added each time the store is read). `EntityWriter.update` receives `increments`,
  and a writer without `increments: true` is refused for such a write.
  `GuardServer.writer` requires the member's Update rule and judges the sum.
  `Write.reads` lists what a write reads from its row. (#182)
- **A mutation names its operation across clients.** `Data.mutate` sends an
  `operation` id (`crypto.randomUUID()`, or 128 bits of `getRandomValues` on a
  page served over plain HTTP; minted in the Command, so `update` stays pure) beside `requestId`; a failed request keeps it, and a retry with
  the same `requestId` sends it again. A Source (`RemoteServer.mutation`'s
  handler, an `EntityWriter`'s caller) receives it as `operation`. Record a
  write under it, never under `requestId`, which the docs had advised and which
  is a per-Model counter two clients share.
- **`foldkit-remote-drizzle`: a writer's ledger never applies a retry twice.**
  `writer(binding, { ledger: { table, scope, retention? } })` records each
  update under its operation and row (a `write_ledger` keyed by `scope`,
  `operation` and `target`), in the transaction that writes (synchronous on
  SQLite, awaited on Postgres; refused on a database without transactions, D1
  among them),
  and answers a retry from the record without writing again (read back, as any
  answer is, as the row now is). An increment over such a writer needs no
  `expect`, so concurrent increments both land; `Write` no longer requires
  `expect` for one, and `RemoteServer.write` refuses one with neither.
  `GuardServer.writer` answers a recorded retry without deciding it again, and
  refuses an increment with no revision through a writer it does not pin.
- **`foldkit-remote-drizzle`: `revisionTrigger(binding, field)`.** The SQL
  (SQLite or Postgres) that has the database move a revision on every update
  that does not set it itself, so a guarded writer's pin sees a handler's or
  raw SQL's change too. An update that sets the revision, by one or to any
  value, is left as it set it. It can be run again, and names a Postgres
  table by its `pgSchema`. Not for a table Sync writes.


### Changed

- **The `foldkit-plus` skill covers declared writes and invariants.** `entity.md`
  has a section on who owns which rule (Schema, guard, `when`, `Entity.invariant`)
  with a compiled example; `remote.md` says what the Drizzle `writer` guarantees
  and how each kind of write is retried; `greenfield.md` asks about invariants,
  transitions and concurrency, and maps each rule to its one owner.

- **`foldkit-remote`: every declared write may be refused as `Invalid`.**
  `Refusal.invalid` (`{ rule: Option<string>, message, path }`, with
  `Refusal.isInvalid`) is in every `Mutation.write`'s `Refusal` type, because
  the server's Entity may hold invariants the client's does not show. A match
  over such a refusal needs an `Invalid` arm. On the server,
  `RemoteServer.invalid(message, rule?, path?)` is a writer's `RemoteInvalid`,
  answered as that refusal; `EntityWriter.invariants: true` says a writer
  judges them, and `RemoteServer.write` refuses a write over an Entity with
  invariants through a writer that does not. (#183)
- **`foldkit-remote`: `Remote.mutate`'s fourth argument is options.**
  `Remote.mutate(mutation, input, requestId, { keys, operation })`; it was
  `keys`, positionally. A caller that passed keys passes `{ keys }`.
  `MutationFailed` carries the `operation` it was sent with.
### Fixed

- **A page node whose id is `__proto__` is read.** `SurfaceBlock.reads` and
  `QueryBlock.reads` keyed each node's read into a plain object, and
  `Projection.struct` built its value the same way, so such a node set the
  object's prototype instead: it was never fetched and showed `Initial` for
  good. Each now builds an object with no prototype, and `Renderer.render`
  hands a node only its own entry of `data`, never the record's prototype. (#177)

## 0.32.0

A dependency release. The workspace moves to Foldkit 0.169.0 and Effect 4.0.5,
with `drizzle-orm` 1.0.0-rc.5, `@yielded/auth` 0.1.0-beta.43,
`@agent-native/core` 0.214.0, `@tanstack/db` 0.15.2, `@livestore/livestore`
0.5.0, and the toolchain (Vite 8.3.5, Vitest 5.0.5, Playwright 1.64.1, jsdom
30.1.3, React 19.3.1, oxfmt 0.74.0). Every package that peers on Foldkit
republishes with the new floor so a fresh install resolves the release it was
tested against; `foldkit-mixins-ui` peers `@foldkit/ui@^0.169.0`,
`foldkit-remote-drizzle`, `foldkit-cms-drizzle` and `foldkit-guard` peer
`drizzle-orm@1.0.0-rc.5`, `foldkit-auth` peers `@yielded/auth@0.1.0-beta.43`,
and `foldkit-agent-native` peers `@agent-native/core@0.214.0`.
`foldkit-remote-drizzle` 0.12.4 also compiles a `Not` predicate through its own
`negate`. `foldkit-plus` is 0.14.0.

### Changed

- **Dependencies to the latest versions that resolve together.** `effect` and
  every `@effect/*` package move to 4.0.5 (4.0.6 of the satellites peers on an
  `effect@4.0.6` that was never published), `foldkit` and `@foldkit/ui` to
  0.169.0, `@foldkit/vite-plugin` to 0.28.0, `drizzle-orm` to `1.0.0-rc.5`,
  `@yielded/auth` and `@yielded/auth-persistence` to `0.1.0-beta.43`,
  `@agent-native/core` to 0.214.0, `@tanstack/db` to 0.15.2,
  `@livestore/livestore` to 0.5.0, plus Vite 8.3.5, Vitest 5.0.5 and
  `@vitest/browser-playwright` 5.0.5, Playwright 1.64.1, jsdom 30.1.3, React
  19.3.1, oxfmt 0.74.0, `sql.js` 1.15.1 and the rest of the patch cohort. Peer
  floors moved with them: `foldkit@^0.169.0`, `@foldkit/ui@^0.169.0`,
  `drizzle-orm@1.0.0-rc.5`, `@yielded/auth@0.1.0-beta.43`,
  `@agent-native/core@0.214.0`. The toolchain moves to Node 22.23.4, the floor
  jsdom and `@agent-native/core` already set.
- Held deliberately: `@effect/wa-sqlite` stays at 0.1.2, because
  `@effect/sql-sqlite-wasm` peers `>=0.1.2 <0.2.0`; `@types/node` stays on 22,
  the runtime the workspace and CI run; `miniflare` stays on its latest stable
  line. Foldkit 0.169.0 changes Popover, Menu and Listbox trigger clicks to
  `ClickedButton`, but `foldkit-mixins-ui` owns its own trigger messages, so no
  view here changed.
- `foldkit-remote-drizzle`: a `Not` predicate compiles through a local
  `negate`, because `drizzle-orm@1.0.0-rc.5` typed `not`'s return as optional
  for its optional argument. The emitted SQL is the same `not (…)`.

## 0.31.0

Readable type that follows the page. `foldkit-mixins` 0.19.0 adds fluid type
(`type.fluid`, `type.viewportMin`, `type.viewportMax`), a container-measured
progress, and a `reading` knob group (`measure` in `ch`, `headingWrap`,
`bodyWrap`, `align`); `Typography`'s `display`, `title` and `subtitle` grow in
size and leading while `body`, `caption` and `micro` stay on the control
ladder. `foldkit-mixins-ui` 0.20.0 uses them. `/create` draws the new knobs in
its Type pane, and the site, design-system, CMS and richtext playground use
`Theme.fluidType`. Packages that pin either republish with a patch, and
`foldkit-plus` is 0.13.0.

### Added

- `foldkit-mixins/theme`: fluid type. `type.fluid` (0 to 1), `type.viewportMin`
  and `type.viewportMax` set the range; every `size.*` token grows from its
  current value to a larger one across it, headings more than body text.
  `Theme.fluidType({ min, max })` writes the same blend for one value, and the
  `fluid` token group carries `ratio` (the viewport's place) and `progress`
  (that place at the theme's strength). The ratio is `tan(atan2())`, exact and
  below the palette's browser floor. `type.fluid` defaults to 0, so existing
  themes render unchanged.
- `/create`: the Type pane draws the three fluid knobs, and the presets, looks
  and shuffle set them.
- `examples/site`, `examples/design-system`, the CMS and the richtext
  playground use `Theme.fluidType` for their `vw` clamps.
- `Theme.containerFluidProgress()` and
  `Theme.fluidType({ min, max, container: true })` measure fluid type on the
  nearest `inline-size` container rather than the window. `/create`'s previews
  now follow their own frame, and the CMS hero uses its page container; the
  CMS's remaining `cqi` padding clamp is spacing, not type.
- `Theme.role('display', { fluid: true })` grows `display`, `title` and
  `subtitle` in both size and leading; `Typography` uses it, while `body`,
  `caption` and `micro` stay on the control ladder.
- `foldkit-mixins` / `foldkit-mixins-ui`: a `reading` knob group.
  `reading.measure` (in `ch`) caps `Prose` and the `body`, `lead` and `quote`
  levels of `Typography`; `reading.headingWrap` and `reading.bodyWrap` choose
  `balance`, `pretty` or `wrap`; `reading.align` chooses `start`, `center`,
  `end` or `justify`. `Prose.style({ align })` adds a per-container override,
  and `/create` draws the four reading controls in its Type pane, below the
  fluid knobs.

## 0.30.1

The skill's greenfield guide for a new application. Its plan settles mobile
beside performance and security; the agent tells the user that ending the
domain rounds is their call; the mapping shows how Schema, Entity, Remote, Form
and Crud stack, with Guard, Auth, Site and Composition at their seams; and
deployment prefers the CAFE stack (Cloudflare, Alchemy, Foldkit, Effect) with
Yielded Auth, asking the user first. No package changed: the skill ships from
`main`, and this tag names it.

## 0.30.0

One owner for every interactive state. `foldkit-mixins` 0.18.0 adds `surface.hoverStrength` (how
strongly a hover tints, 4% to 24% around the shipped 12%) and `state.disabledOpacity` (how far a
disabled control fades), so a theme moves every hover and every disabled control at once.
`foldkit-mixins-ui` 0.19.0 makes a press its own state: `state.press` is the hover's film at 1.75,
`hover()` lays it on a held row, tab or menu item, and `FluidHover` marks the container so a held
fluid highlight deepens too; every tinted hover — Table's, Segmented's, pill Tabs' — now follows
`surface.hover`. Packages that pin either republish with a patch, and `foldkit-plus` is 0.12.0.

### Changed

- `foldkit-mixins-ui`: every tinted hover follows the theme's `surface.hover`, fluid highlights
  included. Table's highlight and its expand toggle, a filled Segmented's highlight and pill
  Tabs' highlight painted with the text (Table) or the accent's subtle fill whatever the theme
  chose; they now paint with `unfilledHover`, as Nav, Sidebar and TreeView do. The accent's
  "trying the tab on" look is `surface: { hover: 'accent' }`. A Segmented without `fluid` tints
  its option under the pointer, as a fluid tray's highlight does. A Dialog's or Sheet's close
  button hovered with a surface step; it now hovers as every icon button does.
- `foldkit-media/server`: `UploadPolicy.admit(request, route)` is told which route it guards,
  `'Upload'` or `'DescribeUrl'` (the facts route), so a policy may admit uploads and refuse URL
  lookups. A hand-written policy gains the parameter. `UploadUnauthenticated` is a `401`, for a
  request whose session the policy cannot tell, beside `UploadForbidden`'s `403`.
- `foldkit-media/server`: `Uploads.put(hash, bytes, facts)` keeps the facts the route read
  beside the bytes; an `Uploads` of your own gains the parameter.

### Added

- `foldkit-mixins` / `foldkit-mixins-ui`: a press is its own state. `state.press` is the
  hover's film at 1.75, and `hover()` lays it while a row, tab, accordion trigger or menu item
  is held, so a press no longer looks like the hover it followed. `FluidHover` marks its
  container `data-fluid-held` while the lit item is pressed, and every fluid highlight (Table,
  Segmented, Tabs, Nav, Sidebar, TreeView) and the popups' own deepen with it. One knob,
  `surface.hoverStrength`, sets both strengths.
- `foldkit-mixins`: `state.disabledOpacity` (`Disabled`, 0.3 to 0.7, half by default), how far a
  disabled control fades. Every recipe that draws the state reads it, so a page no longer shows
  `0.4` on a calendar day and `0.5` on the button beside it, and a theme sets them all.
- `foldkit-mixins`: `surface.hoverStrength`, how strongly a hovered row or button is tinted
  (4% to 24%); the palette's `state-hover` was a fixed 12%, which stays the default, so a theme
  that does not set it draws as before.
- `examples/site`: `/create` turns the two new knobs, **Hover strength** in the Color pane beside
  Hover and **Disabled** in Shape after Outlines, so a reader sees each change beside the knob it
  belongs with; its end-to-end test hovers the canvas's Segmented preview and measures the film.
  Its Icons pane draws the chosen pack at the **Glyph stroke** the theme sets
  (`Icons.tokens(pack, { width })`), the specimen and every preview with it, and writes
  that width into the code.
- `foldkit-media/server`: `uploadPolicyAny(a, b, …)` tries upload policies in turn, the first to
  admit winning, so a deployment's secret and sessions can both upload; when every one refuses,
  the last refusal is the answer. Each is built once, with the combined layer.
- `foldkit-guard/media`: `GuardMedia.uploadPolicy(Policy, { resolve, Upload, DescribeUrl })` is
  `foldkit-media`'s `UploadPolicy` decided by principal guards per route, for who `resolve` says
  is asking (Remote's resolver; `AuthServer.resolver` has the shape). The resolver gets the
  request's URL, method and headers, never its body, so a refused upload still reads no byte. A
  route admits when any of its guards allows, a route given none admits nobody, and a row guard
  is a type error. A resolver failure is a `401`, a refusal a `403`. `foldkit-media` is a new
  optional peer of `foldkit-guard`.
- `foldkit-media/server`: `StoredFacts.get(hash)` reads back the facts the upload route read, so
  a mutation registering an upload takes a hash and never a client's facts; none for a hash
  nobody uploaded, or one kept before facts were. `storedFactsKeyValueStore()` over the
  application's store, `storedFactsR2(bucket)` on Cloudflare.

- The `foldkit-plus` skill has `references/greenfield.md`: how an agent starts a new
  application. The brief, the look (a theme the user designs at foldkit-plus.pages.dev/create,
  its code saved as the app's style module), then a scaffold with the matching
  `create-foldkit-app`, then rounds of
  domain questions recorded in `docs/domain/` until the user stops, a mapping of the domain to
  the packages agreed with them, a plan (`plan.md`) for architecture, performance budgets, SEO,
  accessibility, design, testing, CI, deployment, security, operations and milestones, and only
  then the build, in slices, CI and deployment first. `npx foldkit-plus setup`
  run where there is no `package.json` sends an agent there and prints the non-interactive
  scaffold command (`create-foldkit-app@0.39.1`, which installs Foldkit 0.168.0); in a project it
  names the guide too.

### Fixed

- The skill said it targets Foldkit 0.165; it is 0.168.
- `foldkit-media`'s README and the skill no longer promise more than the code keeps: a variant's
  URL names the variant, not its bytes, so a change to how variants are made is a revision the
  application bumps; anyone holding a variant's URL can read it; a Worker cannot coalesce two
  misses for one variant, so both transform; and `HashedAsset` checks the shape of facts, not
  that they are true, so a server stores the facts it read, not ones a client sends back.

## 0.29.0

Images with fewer ways to go wrong. `foldkit-media` 0.2.0: a provider says which facts it takes,
so an image without a content hash given `Provider.hosted` is a type error, not an empty box; the
server reads its space from that same provider; `serveFetch` is the whole Worker, with
`uploadPolicyBearer` for a deployment's secret and `variantsR2({ cache: true })`.
`foldkit-mixins-ui` 0.18.0: `Icon.view({ icon })` takes the icon itself, and `alt` takes plain
words. `foldkit-plus` is 0.11.0. Packages that pin one of them republish with a patch
(`foldkit-mixins-form`, `foldkit-mixins-builder`, `foldkit-mixins-richtext`, `foldkit-richtext`,
`foldkit-richtext-code`, `foldkit-richtext-code-shiki`, `foldkit-richtext-dom`,
`foldkit-richtext-markdown`). Code that calls `serveFetch({ layer })`, `serveUploadFetch`,
`serveFetch({ space })`, or `Icon.view({ content })` needs changing (see Changed).

### Changed

- `foldkit-media`: a `Provider` says which facts it takes (`Provider<Asset>`), and
  `Provider.hosted` takes a `HashedAsset`, facts with a content hash, since it names an original
  by it. Facts without one are a type error where the view is written (`Picture.derive`,
  `Image.view`, `Avatar.view`), where they were drawn as an unavailable image. `HashedAsset` is
  also the Schema that decodes them (an upload's answer), and `isHashed` narrows; a `?image`
  import's `asset` is one.
- `foldkit-media/server`: `serveFetch` is the whole Worker: `serveFetch({ images?, uploads?,
  otherwise? })` owns `/_image/` and `/_media/`, answers anything else under them (a preflight
  included) with a 404, and hands every other path to `otherwise`. `serveUploadFetch` is
  removed; `images: { layer }` is what `serveFetch({ layer })` was, and `images` takes no
  `coalesce`, which a Worker cannot use.
- `foldkit-media/server`: the server reads its space from the provider the pages write URLs
  with: `images: { provider: Provider.hosted({ space }) }` (and `layer({ provider })`) in place
  of `space`, so the two cannot differ. `Provider.hosted` returns a `Provider.Hosted`, which
  carries its `space`.
- `foldkit-media/cloudflare`: `variantsR2(bucket, { cache: true })` puts the Worker's
  `caches.default` in front, with no cast of the DOM's `caches`; outside a Worker it throws
  where the layer is made.
- `foldkit-mixins-ui`: `Icon.view` takes the icon itself, `Icon.view({ icon, label?, key? })`,
  and draws it with `foldkit-media`'s `Icon.draw`, so a view imports one `Icon`. `content` is
  removed: `Icon.view({ content: MediaIcon.draw(check, h) })` is `Icon.view({ icon: check })`.
- `foldkit-mixins-ui`: `Image.view`'s `alt` takes plain words, `alt: 'The finals'`, as
  `Image.described('The finals')`; ornament is still `Image.decorative`, never left out.

### Added

- `foldkit-media/server`: `uploadPolicyBearer(secret)`, the `UploadPolicy` for a deployment's
  secret: `Authorization: Bearer <secret>`, compared by digest in constant time, and nobody
  while the secret is unset or empty. The README's upload example compared with `===`.

## 0.28.0

Images and icons. `foldkit-media` 0.1.0 is its first release: an image's facts, a provider and a
layout give every attribute of its markup, a server (`/server`, `/cloudflare`, `/sharp`) or a
build (`/vite`) makes and keeps each variant, and icons are data a build reads from an Iconify set
or an SVG file. `foldkit-mixins-ui` 0.17.0 draws them (`Image`, `Figure`, `Icon.view`, an
`Avatar` picture), and `foldkit-mixins` 0.17.0 adds the theme's `icon` tokens and keeps a
reader's theme and knobs before the first paint. `foldkit-richtext` 0.5.0 lets an `Image` carry its
facts, `foldkit-primitives` 0.15.0 adds `decodeImage`, `foldkit-ssr` 0.8.0 adds `emit`,
`foldkit-mixins-richtext` 0.5.0 draws its icons from Lucide's data, and `foldkit-plus` is 0.10.0.
Packages that pin one of them republish with a patch so their ranges cover the new versions
(`foldkit-builder`, `foldkit-cms`, `foldkit-cms-drizzle`, `foldkit-composition`,
`foldkit-mixins-builder`, `foldkit-mixins-crud`, `foldkit-mixins-data-grid`,
`foldkit-mixins-form`, `foldkit-mixins-surface`, `foldkit-richtext-code`,
`foldkit-richtext-code-shiki`, `foldkit-richtext-dom`, `foldkit-richtext-markdown`,
`foldkit-site`). One change needs code: `ColorPicker.popover` now draws the whole Popover and takes
its Model and Messages (see Changed).

### Added

- `foldkit-richtext`: a standard `Image` may carry its `asset`, `foldkit-media`'s `ImageAsset` of
  what its `src` names, as stored; with it, the standard rendering writes the `img`'s `width` and
  `height` (at the drawn `width` when set), so a page holds the image's box before the file
  arrives, and `imageBox(props)` gives a rendering of its own the same. Optional: a document
  without it is as valid as before. `foldkit-media` is a new dependency.
- `examples/cms`: the site's `Image` block may carry its `asset`, the facts of the file its `src`
  names, hidden from the inspector; with them the image's box is its own shape before the file
  arrives, while the facts' key is still the `src` (an edited address falls back to 4:3).
- `foldkit-primitives`: `decodeImage(source)` fetches and decodes a picture before it is shown,
  yielding `Decoded` or `DecodeFailed`; given candidates, the one the browser would draw.
- `foldkit-ssr`: a static site's `emit(pages)` adds files made from the generated pages, written
  beside them; a path outside the output, or on a file the build or the client build writes, is
  refused. `writeEmitted` writes them without the plugin.
- `foldkit-mixins`: `Theme.knobScript({ key?, selector? })` and `Theme.chooseKnobs(theme, { base,
  key?, selector? })` keep a reader's knob values and apply them before the first paint, as
  `schemeScript` and `chooseScheme` do for the scheme: the head script applies the kept knob
  variables to one unlayered rule, and the Command rewrites that rule and keeps those that differ
  from `base`. See `docs/design/theme-robustness-DESIGN.md`.
- `foldkit-mixins`: `Themes.choose(themes, name, key?)` shows a named theme and keeps it, and
  `Themes.script(themes, key?)` is a head script that shows the kept one before the first paint,
  on the attribute `Themes.apply` writes; a name no theme has is ignored.
- `foldkit-media` 0.1.0, its first release: responsive images as URLs to write. `Picture.derive` turns
  an `ImageAsset`'s facts, a `Provider` and a `Layout` (`Fixed`, `Constrained`, `FullWidth`) into
  every attribute of an image's markup: `srcset` and a `source` per format from one `Widths`
  ladder, `sizes`, the reserved box, loading priority, and a placeholder background (a color, a
  ThumbHash, or the smallest width; none behind a transparent image). Providers: `cdnCgi`
  (Cloudflare's `/cdn-cgi/image/`), `fromFiles` (a build's variants) and `hosted` (its own server,
  whose route, `/_image/<hash>/w640.avif`, `foldkit-media/server`'s `MediaApi` declares with the same
  Schema). `Variant.space({ widths, formats, qualities, revision })` bounds every variant a server makes; a
  changed output is a new `revision`, written into the URL (`w640.r1.avif`; none at 0), and a
  server answers an earlier revision while it keeps the variant, else with a `302` to the current
  URL, kept briefly, since a rollback answers the old URL again. `Picture.preload` writes
  the page's largest image's `<link rel="preload">` for an SSR `head`. `Picture.ogImage` gives an absolute
  `og:image` URL at least 1200 wide, never AVIF.
  `foldkit-media/server` serves `Provider.hosted`'s route over three services, `Originals`,
  `Transformer` and `Variants`: a variant is made once and kept, served immutable, and a failure is
  its own status (400, 404, 413, 502, 503), never the original (only a variant is kept long; every
  refusal is kept a minute at the edge and not by a browser, since a later release in a rollout, or
  the same one configured otherwise, may answer it), with headers decided in one place
  (`headersFor`): an `ETag` and 304, a cache lifetime for each answer, CORS, `nosniff`, `Server-Timing`. `serveFetch` hosts it in a Worker,
  `layer` in an Effect `HttpRouter`. `foldkit-media/cloudflare` gives its services from a Worker's bindings:
  `originalsR2`, `transformerImages` (the Images binding) and `variantsR2` (R2 behind the Cache API).
  `examples/cloudflare` serves `/_image/` with them, and takes an upload only with its `UPLOAD_TOKEN` secret. `Originals` and `Variants` are kept in
  any Effect `KeyValueStore` (`originalsKeyValueStore`, `variantsKeyValueStore`), and
  `keyValueStoreR2` is an R2 bucket as one. `foldkit-media/sharp`'s `transformerSharp` serves a Node server: it
  refuses an original above its pixel limit with a 413 before decoding it, and runs at most
  `concurrency` transforms (`limitTransforms`); `layer` coalesces concurrent misses for a variant (`serveFetch` does not: a Worker request cannot wait on another's work), and sharp reads an original as its EXIF orientation shows it. Rate limits apply to misses only:
  `admissionRateLimiter` (Effect's `RateLimiter`) or `admissionRateLimit` (a Workers rate-limit
  binding) answers a 429 with `Retry-After`. `materialize` writes the hosted variants a static site's pages
  name, as `foldkit-ssr`'s `emit`, and `headersRule()` is the `_headers` rule they need.
  `describe` (in the core) derives an original's facts through an `Inspector` (`foldkit-media/browser`'s
  `inspectorBrowser`, the browser's own decoder, so an editor describes a file where it is chosen;
  `inspectorSharp`,
  `inspectorImages`), and `factsOf(url)` describes an image named only by URL, from allowed hosts at their default port,
  kept and revalidated with its `ETag`. `Icon` holds an icon as data (`IconData`: its `viewBox`,
  what its root paints, its drawing): `Icon.serialize` writes it as one SVG document and
  `Icon.maskUrl` as a CSS `url()` for a mask. `foldkit-media/icons`, for builds, reads an SVG file
  (`parse`) or an Iconify set's icon (`fromIconify`, through its aliases) into it, and refuses,
  naming the icon, any element or attribute outside a presentational allowlist, a link or
  `url()` outside the icon or to an id it does not define, a CSS function other than a colour, a
  transform or `url()`, an Iconify icon or alias that rotates or flips, and a CSS escape. `Icon.key(icon)` names an icon by its content, and
  `Icon.prefixIds(icon, prefix)` renames the ids it defines and every reference to them.
  `Icon.withStroke(icon, { width?, corners? })` redraws an icon's strokes, for a mask CSS cannot
  reach, and `Icon.maskUrl` escapes only what a quoted CSS `url()` cannot hold, a fifth shorter.
  `foldkit-media/vite`'s `icons({ iconify, folders, dts })` makes icons imports:
  `import { arrowLeft } from 'virtual:foldkit-icons/lucide'` reads an installed Iconify set or a
  folder of the application's SVGs, the bundle holds only what is imported, and a written
  declaration names every icon, so a misspelt one is a type error. A refused SVG in a folder fails
  the build; a refused Iconify icon is left out, and the declaration says why.
  `foldkit-media/vite`'s `images({ widths?, sources?, fallback?, quality? })` makes an image in the
  repository an import: `import hero from './hero.jpg?image'` is `{ asset, provider }`, its facts
  read once through sharp and a file written for each ladder width up to its own in each format,
  named by content and kept whole in Vite's cache by the original's hash, at most one original read
  per core at once; the development server makes
  the same variants on request. `foldkit-media/client` types the import.
  `foldkit-media/unpic`'s `detect(url, options?)` is the provider of an image on a host that resizes
  it (Shopify, Cloudinary, imgix and the rest unpic knows, an optional peer), or none: the `img`
  asks for `auto`, a format the host ignores is never offered as a `source`, and an asset on another
  host gets no URL.
  `foldkit-media/server`'s upload route (`uploadLayer`, `serveUploadFetch`): `POST /_media/upload`
  takes an `image/*` body under a byte cap, keeps it by its SHA-256 in `Uploads`
  (`uploadsKeyValueStore`, `foldkit-media/cloudflare`'s `uploadsR2`), and answers its facts as an
  `ImageAsset`; who may upload is a required `UploadPolicy`, asked before the body is read. `GET
  /_media/facts?url=`, behind the same policy, answers the facts of an image named by URL through
  `factsOf`, from the hosts `facts: { allow }` names (none by default), or a `422`.
- `foldkit-media`: `Icon.draw(icon, h, { key?, size? })` draws an `IconData` as inline SVG through
  any view builder of its shape (`SvgBuilder`; Foldkit's `h` is one), every attribute in the
  server's markup, `1em` square unless `size` is given and kept so in a squeezed flex row,
  `aria-hidden`, its ids prefixed by the
  icon's content so two icons sharing an id each paint their own; `key` sets two copies of one icon
  apart. `foldkit-mixins-ui`'s `Icon.view` fills its glyph with the drawing.
- `foldkit-mixins-richtext`: the chrome's icons are generated from `@iconify-json/lucide` (`pnpm
  icons`, from the package's `icons.json`) and drawn with `foldkit-media`'s `Icon.draw` and
  `Icon.maskUrl`, in place of hand-copied paths, so they are today's Lucide drawings. A drawn
  icon's size is now written in pixels (`width="16px"`), and its stroke sits on each path.
  `foldkit-media` is a new dependency.
- `foldkit-mixins`: the theme's `icon` tokens are the masks of the icons the components draw
  themselves (`search`, `eye`, `eye-off`, `pipette`, `rotate-ccw`, `rotate-cw`, `success`, `warning`,
  `error`, `info`, `lock`, `close`; their names are `ChromeIcon`), Lucide's by default, written by
  `pnpm icons`. Command, PasswordInput, ColorPicker, ImageCropper, Toast and the data grid draw from
  them in place of their hand-written masks, so the toast's marks are Lucide's stroked drawings now.
  `foldkit-mixins-ui`'s `Icons.tokens(pack, { width?, corners? })` is an application's own pack as
  its own tokens, a pack missing a name being a type error. Two knobs: `icon.size` multiplies every
  icon box (the `icon` rung of `ladder`), and `icon.stroke` is `border.glyph`, the stroke of the
  checks, chevrons and guides recipes draw in CSS, until now a fixed `2px`.
- `foldkit-mixins-ui`: `Image`, a `picture` drawn from `foldkit-media`: a `source` per format, the
  `img`'s candidates and `sizes`, its box held before the file arrives, lazy unless `priority`,
  and the placeholder painted behind it. `alt` is `Image.described(text)` or `Image.decorative`,
  never omitted. `Recipes.Image` has `fit` (`cover`, `contain`), `edge` (`none`, `line`), `ratio`
  (`auto`, `square`, `video`, `portrait`, cropped at the focal point) and `radius`.
  `Image.watchLoad`, beside the style, marks its load state and hides a failed image. `Image.preloadsIn`
  is a `foldkit-ssr` `Head` that preloads each image the rendered page drew with `priority`. `Image.audit`
  warns, in a development build, of a blurry or wasteful image and of two drawn with `priority`. An image with no
  variant keeps its box and its alt text. An asset's `focus` places a crop (`--fk-image-focus`), and a
  ThumbHash paints its picture for the `priority` image and its average color for the rest.
- `foldkit-mixins-ui`: `Figure`, a `figure` holding its content and a `figcaption` in the caption
  role; `Recipes.Figure` has `align` (`start`, `center`).
- `foldkit-mixins-ui`: an `Avatar`'s `src` may be an `AvatarPicture` (`{ asset, provider, width }`),
  drawn with the candidates `foldkit-media` derives for that width, so a small avatar fetches a
  small variant. `Avatar.widthOf(size)` gives that width from the recipe's own sizes.
  `foldkit-media` is a new peer dependency. See `docs/design/media-DESIGN.md`.

### Changed

- `foldkit-mixins-ui`: `ColorPicker.popover` draws the whole Popover, not a `toView` for one:
  it takes the Popover's Model and Messages (`popover`, `onPopover`, and `anchor`;
  `popoverMixins` is the old `popover` option) and requires the Popover made with
  `contentFocus: true`, throwing for one without. The panel opens on the area's thumb, and
  focus leaving it closes one the keys or a finger opened. A popover opened by touch, a pen or the keys closed at the
  first press inside it, so the area and the tracks could not be dragged.
- `foldkit-mixins-ui`: a CardGroup's highlight is a film over the card the pointer is on, the
  card's size, whatever its `surface`. Under cards with a surface it showed only as a rim in the
  gap around them, beside the card's own hover; a card in a group with a highlight now draws no
  hover of its own.

### Fixed

- `foldkit-mixins-ui`: a Card's `media` is an accent tile only around a bare icon (`svg`,
  `img`); an Avatar or anything else leads at its own size, at the card's start. The docs site's
  profile card passed its Avatar as `image`, which bleeds to the edges in a 16:9 band, and the
  avatar sat in the band's corner with the band empty beside it.
- `foldkit-mixins-ui`: a ColorPicker's hue and alpha tracks stay in their channel: a Slider is
  at least 12rem wide, which ran the tracks under the swatch in a narrow picker, as in a
  popover; a holder lays one narrower with `--fk-slider-min-length`. The popover's trigger keeps
  the width of its format's widest text, so it no longer resizes, and moves its panel, as the
  color's text changes length.
- `foldkit-mixins-ui`: a Sidebar's icon is centred in its slot, and its content on the column
  with its edge, so a rail's icons sit in its middle; an icon smaller than its slot sat at the
  slot's start, and the default variant's edge took a pixel from the content's side.
- `foldkit-mixins-ui`: a Checkbox's check is centered in its box at every size; it stood low and a
  little left, by about 8% of the box.
- `foldkit-mixins-ui`: a mixed Checkbox's dash is the check's stroke, 2px, on whole pixel rows
  across the box's middle; it was a tenth of the box, 1.4px at 16px, blurred off its rows.
- `foldkit-mixins-ui`: the AngleSlider's dial, thumb and markers stay round in a theme whose
  `radius-factor` is 0; they read the radius scale before, which squared them off.

## 0.27.0

Sheets and Drawers swipe from anywhere on their panels, as vaul's do: a finger drags the panel,
content that can still scroll its way scrolls first, and `swipe: { from, flickSpeed, closeShare }`
customizes it. `foldkit-mixins-ui` 0.16.0 and `foldkit-primitives` 0.14.0 change, and
`foldkit-plus` is 0.9.0. Packages that pin one of them republish with a patch so their ranges cover
the new versions (`foldkit-builder`, `foldkit-mixins-builder`, `foldkit-mixins-data-grid`,
`foldkit-mixins-form`, `foldkit-mixins-richtext`). Nothing written for 0.26 needs changing; a
finger on a sheet's content now drags it, which `swipe: { from: 'handle' }` turns back.

### Changed

- `foldkit-mixins-ui`: a finger swipes a Sheet or a Drawer from anywhere on its panel, not only its
  handle, as vaul's does: content that can still scroll the way the finger moves scrolls, so a
  long sheet scrolls back to its top and then goes, and a field, a slider or `data-no-swipe` starts
  no drag. Resting below its highest point a sheet's content holds still, so a swipe up raises it.
  A mouse still drags by the handle, where text stays selectable. `Sheet.init` and `Drawer.init`
  take `swipe: { from, flickSpeed, closeShare }`: `from: 'handle'` keeps every pointer on the
  handle, and the thresholds default to vaul's (0.4px/ms, a quarter of the panel).

### Added

- `foldkit-primitives`: `Swipe` takes `scrolls: 'x' | 'y'`, for an element whose content scrolls:
  it follows a touch by touch events, which can still refuse the browser's scroll, and swipes
  only where nothing under the finger can scroll further its way; a touch inside an element with
  a Swipe of its own is that one's. `touchOnly` leaves a mouse or a pen to the page. `canScroll`
  and `NO_SWIPE` are what it decides by.

## 0.26.0

Themes are typed knob values: `Theme.make({ accent: { hue: 235 }, shape: { radius: 1.8 } })` is
checked against `Knobs.standard`, every look (the relief, the fonts, the easing) is a knob that
switches at runtime, `Themes.make` installs several by name, and `/create` is drawn from the same
knobs. `Theme.oklch`, `Theme.relief` and `Theme.hardShadows` are removed for them, and
`AppStyle.make` takes `theme` in place of `palette` (below: how to move). Also new: a vertical
ButtonGroup, Calendar day details, a resizable and collapsing Sidebar, a Textarea that grows with
its text, `TreeView.fluid`, color scales and the divider and width tokens. `foldkit-mixins` 0.16.0,
`foldkit-mixins-ui` 0.15.0 and `foldkit-primitives` 0.13.0 change, and `foldkit-plus` is 0.8.0.
Packages that pin one of them, or a package that does, republish with a patch so their ranges
cover the new versions (`foldkit-builder`, `foldkit-cms`, `foldkit-cms-drizzle`,
`foldkit-composition`, `foldkit-mixins-builder`, `foldkit-mixins-crud`,
`foldkit-mixins-data-grid`, `foldkit-mixins-form`, `foldkit-mixins-richtext`,
`foldkit-mixins-surface`).

### Added

- `foldkit-mixins-ui`: a ButtonGroup takes `orientation: 'vertical'`, stacking its items joined
  top to bottom, and `separated`, a rule on every seam (a new `separator` slot) for solid buttons
  whose fills meet. A string item is drawn in a new `text` box, a count or a field's prefix. The
  recipe squares the joining corners in either orientation and on the face a wrapper holds (a
  Menu's trigger, for a split button), lifts a hovered or focused item over its neighbour, and
  gains `size` and `width: 'fill'` axes. `Recipes.Button({ shape: 'square' })` draws any variant
  as the icon variant's square, the icon alone. The site's Button group page adds icon, toolbar,
  split button, separated, input, text, vertical, sizes and pagination examples.
- `foldkit-mixins-ui`: a Calendar day can carry a detail, `toView`'s `detail: date =>
  Option<string>`, drawn in a new `dayDetail` slot under its number and describing the day's
  button (`aria-describedby`), as a price calendar or an events calendar shows. The recipe's
  `detail` axis gives each day a taller rounded cell for it (`text`) or draws it as a dot (`dot`).
  The site's Calendar page adds examples for closed and booked days with bounds, several days, a
  price on each day, events with a Today button, and a day with a time.
- `foldkit-mixins`: `outline.divider`, a line between two parts of one surface a step past
  `subtle`, which a dark page all but hid; the Command menu parts its groups with it. `width.field`
  (a text field's least width, the content-sized Textarea's) and `width.column-sm|md|lg` (the
  Card group's least columns) take what those recipes wrote as literals.
- `foldkit-mixins-ui`: `TreeView.fluid`, the fluid hover the menus, listbox, tabs and sidebar
  have: one `highlight`, a new slot drawn first in the tree, glides to the showing row nearest
  the pointer and to the row the keys focus, in place of each row's own hover. `FluidHover`
  (`foldkit-primitives`) takes `focused`, the selector of the item a focused element that is no
  item lights, since a focused `treeitem` holds its row and the rows beneath it.
- `foldkit-mixins-ui`: a Textarea grows with its text. The recipe's `resize` is `auto` (the
  default: from `rows` lines, two unless given, to the view's new `maxRows`, then it scrolls, by
  CSS `field-sizing`), `vertical` (stays `rows` lines, dragged) or `none`. `rows` had no effect
  before: the reset's `field-sizing: content` sized every textarea by its text, without a limit.
  `Textarea.view` and `Textarea.field` take a `maxLength`, and a `count` drawn in the new `count`
  slot (`Textarea.countOf`), describing the textarea and carrying `data-limit` (`under`, `near`,
  `at`), which the recipe inks; `field` counts by default with a `maxLength`. `field`'s `footer`
  draws the field as one box (`frame`) with a row of controls under the text (`footer`), and its
  count shares a row (`meta`) with the description. `view` takes `readOnly` and `name` too.
- `foldkit-mixins-ui`: `Button.view` takes an `icon`, drawn before the label in the new `icon` slot
  of `ButtonSlots` at the ladder's icon size. The recipe's `icon` variant showed nothing before:
  the view had no way to draw an icon, and the variant's zero font size hid any drawn in `em`.
- `foldkit-mixins`: a theme as typed knob values. `Theme.make({ shape: { radius: 1.8 } })` checks
  each value against `Knobs.standard` (grouped: `accent`, `surface`, `shape`, `type`, `motion`,
  `shadow`, `menu`, `feedback`, `code`, `chart`, `scales`); a misspelt knob or a choice outside
  its options is a type error, a number out of range throws. Every look is a knob, the border
  width, the fonts, the heading weight and tracking, the easing, the shadow style, the relief, the
  outlines and the hover among them: a choice writes the CSS its option holds, so each switches at
  runtime as a number does. Themes pipe (`Theme.set`, `Theme.describe`); `Theme.print` writes a
  theme's `Theme.make({ … })` source, `Theme.fonts` names the shipped font stacks,
  `Knobs.schema(knobs)` is the Schema of a theme's values, and `Knobs.paths`, `Knobs.at`,
  `Knobs.valueAt` and `Knobs.withValue` reach a knob by its typed path; each knob carries a
  `title`, a `description` and its `default`, which `/create` draws its controls from.
  `Themes.make({ iris, cobalt }, { initial: 'iris' })` installs themes by name: the root declares
  the initial one, each other writes its knobs under `:root[data-theme="name"]`, `themes.Name` is
  the Schema of the Model field that holds the active one, and `Themes.apply` is the Command's
  effect that shows it. `Theme.scope(theme, selector)` themes a subtree, declaring the derivations
  again there. `Knob.number`, `percent`, `length`, `angle`, `choice`, `font` and `schemed` make
  knobs of an application's own. The design is `docs/theme-knobs.md`.
- `foldkit-mixins`: `border.glyph` (2px), the stroke of what a recipe draws in CSS as an icon.
  Checks, chevrons and the Accordion's plus read it, so thicker borders no longer blot them.
- `foldkit-mixins-ui`: Steps' `number` slot, the figure in a marker, trimmed to its digits so it
  sits in the middle of its marker in any face; it sat low in a serif one. A complete marker's
  check grows with the marker.
- `foldkit-mixins`: the palette ships seven color scales, `red`, `orange`, `yellow`, `green`,
  `teal`, `blue` and `purple`: steps `1` (near white) to `10` (near black) on one lightness
  ladder for every hue, so a step means the same contrast in each, and `wash-1` to `wash-4`, step
  6 mixed into the page. Each hue is a knob (`red-h`); `scale-c` scales their chroma.
- `foldkit-primitives`: `Swipe` takes a `slop`, the pixels a press moves before it is a swipe.
  Until then it captures nothing and reports nothing, so a press that stays put is a click on
  what is under it.
- `foldkit-primitives`: `Measure` writes `--fk-<name>-moving`, `1` for the measure that finds the
  mark on another element and `0` while it stays on one, for an overlay to glide only to a new
  mark.

### Changed

- `foldkit-mixins`: a theme is its knob values alone. `Theme.standard(theme)` is every shipped
  token with a theme's knobs, for `Theme.root`, and `AppStyle.make({ theme })` takes one theme
  (`Theme.make({ … })`), with `tokens` for an application's own groups, in place of `palette`.
  `Theme.oklch`, its config object and `OklchKnobs` are removed. To move,
  `Theme.compose(Theme.tokens, Theme.oklch(config))` becomes `Theme.standard(Theme.make(values))`
  and `AppStyle.make({ palette: Theme.oklch(config) })` becomes `AppStyle.make({ theme:
  Theme.make(values) })`, the config's fields going to knobs: `accent: { h, c, l, dark }` to
  `accent: { hue, chroma, lightness }` (a number, or `{ light, dark }`; `l: '52%'` is `52`),
  `neutral.h` to `surface.hue`, `surfaceSaturation` to `surface.saturation`, `surfaceContrast:
  '24%'` to `surface.contrast: 24`, `contrastFactor` to `surface.textContrast`, `stateHue` to
  `surface.hover`, `secondaryHueShift` and `tertiaryHueShift` to `accent.secondaryShift` and
  `tertiaryShift`, `shadow: { h, c }` to `shadow: { hue, chroma }`, `syntaxChroma` to
  `code.chroma`, `menu: { accent, color }` to `menu: { highlight, panel }`, and `feedback` stays.
  `Theme.relief.*` and `Theme.hardShadows` are removed for the `shadow.relief` and `shadow.style`
  knobs, and a knob string for its knob: `Theme.define({ knob: { 'base-l': '100%' } })` is
  `surface: { lightness: 100 }`, `'radius-factor': '1.4'` is `shape: { radius: 1.4 }`. Tokens of an
  application's own move from the palette to `AppStyle.make`'s `tokens`. The accent's lightness reaches 5 to 98, for a black or white
  accent. A page declares `Theme.root(Theme.standard(theme))` as one rule: `omit: Theme.tokens`
  would leave out a theme's own `density`, which `Theme.tokens` names too.
- `foldkit-mixins-ui`: `Recipes.Separator` has no `orientation` axis. The view writes
  `data-orientation` on the rule and a label's frame, and the recipe reads it, so one style draws
  a separator either way and the style and the view can no longer disagree: drop `orientation`
  from the recipe call and keep it on `Separator.view`. A vertical rule stands as tall as the
  letters where nothing stretches it (running text, a block), where it was drawn with no height,
  and a vertical label's rules give way to its words in a short row.

### Fixed

- `foldkit-mixins-ui`: a top or bottom Sheet with a point below 1 is its `size`'s full height
  (`data-snaps` on the panel), so a point is a share of that. A short sheet was as tall as its
  content, so at 0.4 a sliver showed and the button at its end stood below the screen.
- `foldkit-mixins-ui`: a toast whose card holds one child the application drew (`Toast.toView`
  with an `entryToView`) has that child fill the card; it kept its own width, and a short notice
  left an empty strip before the card's end.
- `foldkit-mixins`: `Theme.scoped`'s documentation no longer offers a subtree (`.marketing`): a
  token resolves where it is declared, so a knob overridden below the root changed nothing
  derived from it there. `Theme.scope` is the subtree theme.
- `foldkit-primitives`: `Measure` measures a change of size as it is observed, in the frame it is
  drawn in; it waited a frame, and a popup whose width settled as it opened showed its marker at
  the old width for that frame, past its edge.
- `foldkit-mixins-ui`: a Popover's, Tooltip's or Hover Card's arrow stands in the middle of a
  side too short to keep clear of both corners. Beside its trigger, a one-line Tooltip with
  rounder corners drew it below the middle, on the rounded corner.
- `foldkit-mixins-ui`: a Cascade Select's column fills a panel wider than it. Drilled in, one
  11rem column stood in the panel's 14rem and left an empty strip at the end.
- `foldkit-mixins-ui`: a Card group's grid wraps. `columns` is now the most it lays, and the
  recipe's new `minColumn` (`none`, `sm`, `md` default, `lg`) the narrowest a column may be, so
  a phone shows one column where it showed two cramped ones; in a centred box the group keeps
  room for its columns. Divided cards draw their hairlines between cards wherever the row
  wraps, and items no longer carry `data-row` and `data-column`; `--fk-card-columns` is on the
  root, beside the new `data-card-fluid`. Between separated cards the highlight shows half the
  gap around the card, where under an opaque card it showed nothing; an outlined card's hover
  also darkens its border, and a plain card outside a group with a highlight tints on hover.
- `foldkit-mixins-ui`: the Command card is 32rem wide unless its parent is narrower; in a
  parent that shrinks to its content it shrank to its longest row. Its field is led by a
  magnifier (set `--icon` on the `search` slot for another), a hairline parts two groups, and a
  row's icon takes the ladder's icon size whatever size it was drawn at.
- `foldkit-mixins-ui`: a custom select (`Listbox.fluid`, `width: 'trigger'`) no longer scrolls
  sideways as it opens. The panel is 14rem wide until its anchor reads the trigger, and the
  chosen row's marker glided from that width down to the row's, wider than the panel; it now
  glides only to a new choice (the Combobox's marker too).
- `foldkit-mixins-ui`: a Sidebar's rail centres its header and footer. `header` and `footer` are
  now `{ content, mark? }`; a rail shows the `mark` (a logo, an avatar) centred over the icons,
  in the new `mark` slot, and hides the `content`, in `detail`. It showed the start of the words,
  clipped (`Acm`).
- `foldkit-mixins-ui`: Sidebar actions and variants, after shadcn's sidebar blocks. A link and
  a titled group take an `action` (`SidebarAction`: `{ label, icon, message }`), a button drawn
  in the new `action` slot: a link's beside it, taking its badge's place while the row is hovered
  or holds focus (a touch screen shows both), a group's at its heading's end. The recipe's
  `variant` axis draws the column flush with the page's edge (`sidebar`, the default), lifted off
  it as a card (`floating`), or with no edge on the surface it stands on (`inset`), for a page
  drawn as a card beside it. On a phone a sidebar with a Sheet is its opener alone, where it was
  a full-height strip of the column's surface. `SidebarLink`, `SidebarRow` and `SidebarGroup`
  take the Message their actions send (default `never`).
- `foldkit-mixins-ui`: a resizable Sidebar collapses. Drawn as a Resizable's `first` panel with
  `width: 'fill'`, a collapsed sidebar emptied its navigation and left the panel at its dragged
  width, an empty 192px column that every later drag kept, since the split and the sidebar each
  held a width. The width is the sidebar's own now:
  `Sidebar.init({ width: { size?, min?, max? } })` draws a `resize` handle (a `separator`) on
  the column's edge, dragged, stepped by the arrows, Home and End, and collapsed by Enter or a
  double-click; dragged below half `min` it collapses (to its rail with `collapse: 'icons'`),
  and expanding brings back the width the drag began at. The Model holds it (`width`, `drag`;
  Messages `ResizeStarted`, `Resized`, `ResizeEnded`, `SetWidth`). The recipe's `width: 'fill'`
  is gone.
- `foldkit-mixins-ui`: a dismissed Toast fades in place while the cards behind it come forward
  at once; they waited until it had gone, then moved, about a third of a second in all. A
  card's `--fk-toast-index` is its place among the toasts staying. The stack restacks on the
  `moderate` duration and `settle` curve, and a card enters on the `slow` `spring`; every
  movement was `slow` and `ease-out`.
- `foldkit-mixins-ui`: a vertical Marquee is no taller than a container with a height; it kept
  its 16rem and stood out past a shorter one. Its fade takes at most a quarter of each end, so a
  short one keeps its middle in full.
- `foldkit-mixins`: the bevelled relief draws a raised control's outer ring outside its border.
  A button's border carries its fill, and the ring lay inside it, so its darkest edge sat within
  a line of the button's own color.
- `foldkit-mixins-ui`: a Thinking Indicator held by a still theme or reduced motion still reads
  as at work, its dots a fading trail and its band resting across the words; a zero-length loop
  showed three faint dots and plain words.
- `foldkit-mixins-ui`: a ring Progress and a ring or orbit Spinner stay round in a square
  theme (radius factor 0); they spun as squares.
- `foldkit-mixins-ui`: a Skeleton's bones are the palette's `state.tint`, the text's film at the
  scheme's own `state-tint` knob; they used the light scheme's in both, and stood barely off a
  dark page.
- `foldkit-mixins-ui`: a scrolling Tabs row shows a mouse a thin bar whose thumb appears while
  the row is hovered or focused, and a `line` row's rule meets the chosen tab's over it.
- `foldkit-mixins-ui`: a row of Steps narrower than 32rem keeps its markers evenly spaced; the
  one label shown wraps inside its step's share, and a word longer than 40% of the row is cut.
  The other steps no longer shrink to nothing, which left the last marker far from the rest.
- `foldkit-mixins-ui`: a click on a control inside a Drawer's `grip` (a row of tabs) reaches it.
  The grip captured the pointer on the press, so the browser sent the click to the grip; it now
  starts a drag only once the press moves `PRESS_SLOP` pixels.

## 0.25.0

Concentric corners: buttons and fields round with the Card, Dialog, Toast or Alert holding them
(`Theme.concentric`), the Drawer gains a `grip` to drag it by, and a Calendar, a Slider and
Steps no longer spill a phone's card. `foldkit-mixins` 0.15.0 and `foldkit-mixins-ui` 0.14.0
change, and `foldkit-plus` is 0.7.0. Packages that pin one of them, or a package that does,
republish with a patch so their ranges cover the new versions (`foldkit-builder`, `foldkit-cms`,
`foldkit-cms-drizzle`, `foldkit-composition`, `foldkit-mixins-builder`, `foldkit-mixins-crud`,
`foldkit-mixins-data-grid`, `foldkit-mixins-form`, `foldkit-mixins-richtext`,
`foldkit-mixins-surface`, `foldkit-primitives`). Nothing written for 0.24 needs changing; a
control in a card is drawn with a smaller corner (below).

### Added

- `foldkit-mixins/theme`'s `Theme.concentric({ min, max })`: a control's corner, concentric with
  the nearest container that `nests` (its corner less its inset), kept between `min` and `max`,
  and `max` outside any. `Theme.nests` now also publishes `--fk-control-corner` for it.
- In `foldkit-mixins-ui`, buttons, the segmented tray and every field's chrome take
  `concentric({ min: sm, max: md })`, and the Card, Dialog panel, Toast and Alert `nests`, so the
  buttons and fields in them round with their corner (`sm` where the padding is deeper than the
  corner, as in the default theme's cards). `control-round` still makes a button a pill.

- `foldkit-mixins-ui`'s Drawer has a `grip` slot: more of the panel to drag it by, such as its
  row of tabs, where a vertical swipe drags and a sideways one still scrolls. A drag that starts
  there ends with no click to pass over, so the next press on the handle toggles it.

### Changed

- A button or a field inside a Card, Dialog, Toast or Alert is drawn with a corner concentric with
  the container's instead of `radius-md`: with the shipped scale, `radius-sm`.
- The Drawer's handle is a 44px target, drawn tight to its bar by negative margins, and the
  peek stays above a phone's home indicator (`safe-bottom`).
- A Slider's mark labels at either end sit flush with the track's ends instead of centered on
  their dots, hanging half past the track.
- A horizontal Steps row narrower than 17rem draws the current step's title and description on
  a line of their own under the markers, the lines between them even, instead of squeezing them
  beside the current marker.

### Fixed

- A Calendar's month in a container narrower than seven cells shrinks its days, which stay round,
  instead of spilling past the container.

## 0.24.0

Themes: hard shadows and a relief for buttons and fields (`Theme.hardShadows`, `Theme.relief`),
type knobs (`text-scale`, `heading-scale`, `leading`, the heading's weight and tracking), a pill
control corner, and a `Drawer` docked to the bottom of the screen. `foldkit-mixins` 0.14.0 and
`foldkit-mixins-ui` 0.13.0 change, and `foldkit-plus` is 0.6.0. Packages that pin one of them, or
peer on it, republish with a patch so their ranges cover the new versions (`foldkit-cms`,
`foldkit-cms-drizzle`, `foldkit-composition`, `foldkit-mixins-builder`, `foldkit-mixins-crud`,
`foldkit-mixins-data-grid`, `foldkit-mixins-form`, `foldkit-mixins-richtext`,
`foldkit-mixins-surface`, `foldkit-primitives`). Nothing written for 0.23 needs changing; a
Typography `display` is set a hair tighter (below).

### Added

- `foldkit-mixins/theme`'s `Theme.hardShadows`: the shadow scale drawn as solid offset copies
  with no blur, for retro and brutalist themes. Compose it over `Theme.tokens`;
  `shadow-strength` still fades it.
- A control's relief: `Theme.tokens` gains `shadow-raised`, `shadow-pressed` and
  `shadow-field`, flat by default, and `foldkit-mixins/theme`'s `Theme.relief` gives them depth
  (`soft`, `hard`, or `bevel`'s lit and shaded edges). In `foldkit-mixins-ui`, a solid, outline
  or primary Button stands out by `raised` and is pressed in by `pressed` while held or on; ghost
  and icon buttons stay flat; and every field's chrome (Input, Textarea, Select, Listbox,
  Combobox, DatePicker, NumberField, TagsInput, OtpField, CascadeSelect, InputCopy, the
  pagination's page size, Checkbox and RadioGroup) sinks by `field`.
- Type knobs in `Theme.tokens`: `text-scale` scales every size of the type scale,
  `heading-scale` how far the headings stand above the body, and `leading` the line heights;
  `weight-heading` and `tracking-heading` set what a heading is drawn in. At their shipped values
  every size, line height and weight draws as before. `foldkit-mixins-ui`'s Typography headings and interface roles, the Dialog's title and
  the Empty title now read `font-heading`, `weight-heading` and `tracking-heading`, so a theme's
  heading font reaches them.
- `foldkit-mixins-ui`'s `Drawer` and `Recipes.Drawer`: a panel docked to the bottom of the
  screen that peeks or opens beside the page, not over it, as a tool tray. Its handle drags it
  (a flick or a quarter of the way settles it) and a click or Enter toggles it; the handle's bar
  bends into a chevron pointing up as it goes down, with the finger while dragged. `dock: 'always'`,
  or `below-lg` / `below-xl`, above which it is the column it sits in.
- `radius-control` and the `control-round` knob: a Button and a Segmented tray round to a pill at
  1, whatever the radius factor, while fields keep `radius-md`.

### Changed

- `foldkit-mixins-ui`: Typography's `display` takes the heading tracking (`-0.01em` by default),
  as the other headings already did.

### Fixed

- `foldkit-composition` and `foldkit-mixins-surface` declared their `foldkit-mixins` peer as
  `^0.11.0`, which no release since 0.11 satisfies; they now peer on the version they ship with.
- `foldkit-mixins`: an element holding several Mounts no longer logs "unhandled failure" for each
  as it is removed; a Mount that ends interrupted is torn down, not failing.

## 0.23.0

Mobile and touch: hover that no longer sticks after a tap, a pressed state for every control,
44px targets on a touch screen, safe areas, the on-screen keyboard, holds and pinches, and
fixes for the Sheet's drag and the editor's caret keys. `foldkit-mixins` 0.13.0,
`foldkit-mixins-ui` 0.12.0, `foldkit-primitives` 0.12.0, `foldkit-richtext-dom` 0.6.0 and
`foldkit-mixins-form` 0.7.0 change; `foldkit-mixins-data-grid` 0.2.4 is fixes. Packages that
pin one of them republish with a patch to re-pin (`foldkit-builder`, `foldkit-cms`,
`foldkit-cms-drizzle`, `foldkit-mixins-builder`, `foldkit-mixins-crud`,
`foldkit-mixins-richtext`), and `foldkit-plus` is 0.5.0. Changes that can break code written
for 0.22: a Table without `fluid` is wrapped in its frame; the ImageCropper's zoom Mount is
`ImageCropperZoom`; the Menu's and the Toast's Models gain fields; and an editor edit that
changes nothing returns a `RichText.answer` Command, which a Scene test resolves.

### Added

- `foldkit-richtext-dom/editor`'s `answerEditor(hostId)` and the attachment's `answered()`:
  the editor bundle answers every edit its editor asks for, once drawn or refused, with a
  `RichText.answer` Command. A Scene test that sends an edit which changes nothing now
  resolves that Command, and an application that replaces the editor's `RichText.patch`
  with its own runs its patch before the editor's other Commands.
- `foldkit-primitives/dom`'s `KeyboardInset` Mount (and `keyboardInset`, `KEYBOARD_INSET`): the
  on-screen keyboard's height as `--fk-keyboard-inset` on its element, from the visual
  viewport. `foldkit-mixins-ui`'s `Dialog.keyboard` mixin runs it on a dialog's or sheet's
  panel, and the Dialog and Sheet recipes keep the panel above the keys: iOS Safari, and
  Chrome on Android, leave a fixed panel under them when a field in it takes focus.
- `foldkit-mixins-form`: `FieldAttrs` takes `autocomplete`, `inputMode`, `enterKeyHint`,
  `autocapitalize` and `spellcheck`, for text, multiline and number fields; an `email`, `tel` or
  `url` type turns capitalizing and spellchecking off by default.
- `foldkit-mixins`: a `safe` token group, `Theme.ref.safe.top` / `right` / `bottom` / `left`:
  what a notch, rounded corners or the home indicator take from each screen edge
  (`env(safe-area-inset-*)`, 0 unless the page's viewport meta says `viewport-fit=cover`).

### Changed

- `foldkit-mixins`: a rule whose selector hovers is written for a pointer that can hover
  (`@media (hover: hover)`), with a copy for one that cannot that keeps every other branch
  (`:is(:hover, :focus-within)` still shows on focus there). A touch screen keeps `:hover` on
  what was tapped last, so a hover fill stayed behind after the finger left. Class names do
  not change.
- `foldkit-mixins`: `Defaults.reset` draws no tap highlight of the browser's own, sets
  `touch-action: manipulation` on interactive elements (a second quick tap is not a zoom),
  and `text-size-adjust: 100%` in place of `none`, which also turned off the reader's own
  text size. `Defaults.links` and `Defaults.controls` hover only where the pointer can, and
  show `:active`.

### Fixed

- `foldkit-mixins`: a control's words are no text to select: `Defaults.reset` sets
  `user-select: none` on buttons, `summary`, and the button, tab, option, menu item, switch,
  checkbox and radio roles, so a long press on one no longer selects its label and offers to
  copy it on a phone, nor a double tap a word of it. A tree's rows and a grid's cells keep
  theirs.
- `foldkit-mixins-ui`: a Toast stack under a finger holds its countdown without spreading out
  (a new `touch` holder in its Model): a stack spread as a tap landed, or as a swipe began,
  moved what the finger was on, and the focus Android gives a tapped action spread it too. Its
  close and action buttons have a finger's target where the pointer is coarse.
- `foldkit-mixins-ui`: an ImageCropper zooms by two fingers, spread or pinched (`Pinched`): its
  viewport took the page's own pinch away and gave none back. Its zoom Mount is now
  `ImageCropperZoom`, for the wheel and the fingers both.
- `foldkit-primitives`: `PointerDrag` drags by touch. A finger's press is a drag once held
  still `HOLD_TO_DRAG_MS` (400ms), and one that moves `HOLD_SLOP` (8px) first is a scroll, so a
  list of draggable rows still scrolls; once the drag is on, the page is kept still and
  Android's own menu shut. Before, the browser took every finger's drag for a scroll and
  cancelled it, so the Builder's palette, layers and canvas could not be dragged on a phone.
- `foldkit-mixins-ui`: a context menu opens on a touch screen. A finger or a pen held on
  `Menu.target`'s area for `Menu.HOLD_MS` (500ms) opens it under the finger, since iOS fires
  no `contextmenu`, while a finger that moves 10px is a scroll and opens nothing; Android's
  own `contextmenu` for the hold opens it once, under the finger, as `pointTarget` now records a
  finger's press. The Menu's Model gains `holding` and `hold`.
- `foldkit-mixins-data-grid`: the fill handle takes its drag on a touch screen (`touch-action:
  none`), where a finger panned the grid instead, and it and the column resize grip have a
  finger's target there (44px and 24px) around what they draw.
- `foldkit-mixins-ui`: a Carousel's autoplay pauses while a finger is on it and goes on when
  it lifts; a tap's emulated `mouseenter` held it paused until something else was tapped.
- `foldkit-richtext-dom`: a press on a block's handle is a drag only once it moves 5px
  (`DRAG_THRESHOLD`): a tap's wander, or the page scrolling under a still finger, dropped the
  block.
- `foldkit-mixins-ui`: a Combobox's and the Command's field ask a phone's keyboard not to
  capitalize or correct what filters, and to show a search key (`autocapitalize`,
  `autocorrect`, `spellcheck`, `enterkeyhint`).
- `foldkit-mixins-ui`: a Table always stands in its `frame`, which scrolls sideways when the
  table is wider than the screen (the default static header; a sticky one keeps sticking to
  the application's scroller). Breaking for markup: a Table without `fluid` is now wrapped
  in the frame's `div`.
- `foldkit-mixins-ui`: scrolled to its end, a swipe on a Dialog or Sheet panel, a popup list,
  the Command list or the Sidebar's nav no longer moves the page behind
  (`overscroll-behavior: contain`); a popup list is at most 40% of the screen a phone's
  keyboard leaves; menu, listbox and HoverCard panels are never wider than the screen.
- `foldkit-mixins`: `user-select` is written with `-webkit-user-select` beside it, which iOS
  Safari still reads alone, so a long press on a drag surface no longer selects its text there.
  The recipes' drag surfaces (sliders' dials, the colour area, the cropper, the signature pad,
  splitters, the toast's body, the Sheet's handle, the FloatingPanel's grips) also set
  `-webkit-touch-callout: none`.
- `foldkit-mixins-ui`, `foldkit-mixins-data-grid`: the OTP input, the colour picker's fields
  and the grid's cell editor are 16px or more on a touch screen, where iOS zoomed the page into
  them.
- `foldkit-mixins-ui`: on a touch screen the recipes' controls are as large as a finger
  needs, 44px: `Defaults.reset` sets `--fk-touch-floor` where the pointer is coarse, and a
  control's height on the size ladder is at least that (buttons, icon buttons square, fields,
  selects, tabs, segmented items, menu and list rows, accordion triggers, calendar days,
  carousel, alert and chat actions). A desktop keeps the ladder's density, and a region that
  must stay dense sets the floor to `0px`.
- `foldkit-mixins-ui`: Toast stacks and Dialog panels keep clear of the notch and the home
  indicator: each edge a stack sits at is held off by the screen's inset there, and a panel's
  margins and largest size leave every inset out.
- `foldkit-mixins-ui`: a tap shows. The recipes' hover is also their pressed state
  (`:is(:hover, :active)`), as are the hover fills of menu, listbox and tree rows, nav and
  sidebar items, accordion triggers, table sort buttons, steppers, tag removers and pressable
  cards and items: with hover written only where a pointer can, a finger on one of them
  shows it, and lifting takes it away.
- `foldkit-mixins-ui`: a Sheet grabbed while its Dialog was still opening (an animation
  ending, a `SucceededShowDialog`) lost the drag, and its handle took no new press until the
  pointer was let go. A drag now ends only when the Dialog opens or closes. (#186)
- `foldkit-richtext-dom`: a caret key pressed before an edit was drawn moved the caret
  through the page as it was: three fast Enters and an ArrowUp went two lines up. Caret keys,
  and edits typed behind them, wait until the edits before them are drawn. (#187)

## 0.22.0

A component library worth building on, and a richer rich-text editor.
`foldkit-mixins-ui` 0.11.0 grows from the parity components to the whole UI
plan: the polish pass over every component (state colour, concentric corners,
the top layer, overlay scroll bars, right to left), the merges into one Alert,
Dialog, Sheet, Menu, Slider and date system, and chat (ChatMessage,
MessageScroller, Thinking Indicator, Thinking Steps, Questionnaire) and Zag's
long tail (Angle Slider, Timer, Marquee, Image Cropper, Signature Pad, QR Code,
Chart, Cascade Select, Floating Panel, Tour). `foldkit-mixins` 0.12.0 for the
state ink, `nests`/`nested()`, `surface.field`, the shadow and chart tokens;
`foldkit-primitives` 0.11.0 for `ScrollBars`, `Swipe`, `ScrollSettle`,
`PointerPosition` and `TrackBox`; `foldkit-richtext` 0.4.0,
`foldkit-richtext-dom` 0.5.0, `foldkit-mixins-richtext` 0.4.0 and
`foldkit-richtext-markdown` 0.3.0 for the editor's changes below;
`foldkit-remote-server` 0.15.0 for `RemoteServer.memory`'s entities and
optional principal; `foldkit-auth` 0.1.1 and `foldkit-ssr` 0.7.1 for Fetch
Metadata on a request with no `Origin`; `foldkit-mixins-data-grid` 0.2.3 for
the motion tiers; and `foldkit-plus` 0.4.0. Every package that pins one of
them republishes with a patch to re-pin: `foldkit-builder` 0.3.3,
`foldkit-cms` 0.7.3, `foldkit-cms-drizzle` 0.6.6, `foldkit-mixins-builder`
0.3.3, `foldkit-mixins-crud` 0.7.3, `foldkit-mixins-form` 0.6.2,
`foldkit-remote-drizzle` 0.12.3, `foldkit-richtext-code` 0.2.1,
`foldkit-richtext-code-shiki` 0.2.1 and `foldkit-site` 0.4.1.

Changes that can break code written for 0.21 are marked "Breaking" in the
entries below; most are in `foldkit-mixins-ui` and the rich-text packages.

### Added

- **`foldkit-primitives/dom`: `TrackBox`.** A Mount that follows the element
  named by its `data-target` and writes its viewport box (and, asked, its
  corner radius) as `--fk-<name>-x`, `-y`, `-w`, `-h` and `-radius`, telling
  `TrackedTarget { target, found }`; the Tour's cutout now draws with it
  (its `Spotlight` Mount is gone, its properties are `--fk-tour-w` and `-h`,
  and its ring follows the target's corner).
- **`foldkit-mixins-ui`: Calendar options, presets and a locale.** The
  fourth argument of `Calendar.toView`, `inputs` and `resolve`
  (`CalendarOptions`) takes `weekNumbers` (ISO weeks), `caption: 'label'` or
  month and year selects (`dropdowns`, answered by `Calendar.show`),
  `paging` with `Calendar.alongside` for two months side by side, and a
  range's `preview` under the pointer. Presets are `Calendar.lastDays`,
  `nextDays`, `monthOf`, `day` and `presetsView`; `Calendar.localeOf(tag)`
  reads upstream's `locale` from Intl; the recipe takes `outside: 'hidden'`.
- **`foldkit-mixins-ui`: Tabs, Segmented, Breadcrumb and a navigation menu
  with panels.** Tabs take icons and counts (`label` and `icon` slots, a
  Badge after the words), `overflow: 'scroll'` (one line, its edges
  fading), `size: 'lg'`, a vertical tablist's rule at its inline end, and
  closable tabs (`TabsContext.close`: a close button and Delete; answer with
  `Tabs.closing`). A Segmented option takes an `icon`, alone with
  `iconOnly`; the recipe adds `tray: 'underline'`, `width: 'fill'` and `size:
  'lg'`. Breadcrumb's `collapse: { max, menu }` makes the ellipsis open a
  Menu of the hidden steps (`Breadcrumb.menuRows`, `Breadcrumb.chosen`).
  `Nav.view` draws a navigation menu whose triggers open panels of link
  columns in the top layer, with the APG's disclosure-navigation keys, its
  open panel in `Nav.init`/`Nav.update`; the recipe adds `indicator: 'pill'`
  and a column.
- **`foldkit-mixins-ui`: Steps, Accordion, Table, Progress, Rating and
  Resizable grow.** Steps take `marker: 'dot'`, `connector: 'progress'` with
  the view's `progress`, and `size` on the Avatar's steps. The Accordion
  takes `variant` (`plain`, `bordered`, `separated`, `filled`, `ghost`),
  `separators`, `indicator: 'plus'`, `indicatorPosition: 'start'`, `active`
  and its own `icon`. Table sorts (`sortKey`, `sort: { by, onSort }`,
  `aria-sort`, `Table.nextSort`), chooses rows with checkboxes
  (`selection`), opens a row's detail below it (`expansion`) and stands an
  `empty` state across itself, all the application's; the recipe adds
  `rows`, `density` and `header: 'sticky'`. Progress takes `showValue`, a
  value of stacked `sections`, a `buffer` and `segments`, and the recipe
  `tone`, `stripes` and `size`. Rating takes `precision: 0.5`, a read-only
  fraction, `onClear`, `showValue`, and Home and End (`Rating.Ends`); a
  read-only rating takes no `onChange`; the recipe adds `glyph` and an
  `error` tone. Resizable collapses a panel (`collapsible`, `collapsedTo`)
  on Enter or a double-click, nests either way, and `handle: 'grip'` shows
  a pill of dots.
- **`foldkit-primitives/dom`: `ScrollSettle`,** a Mount that reports the
  item nearest a scroller's start once a scroll rests (`scrollend`, or a
  quiet scroll where it is missing), right to left from the right edge.
- **`foldkit-mixins-ui`: a custom Select, and Combobox chips, clearing and an
  empty panel.** A select drawn over Listbox: `Listbox.parts` draws an
  option's icon, label, description and check, and the trigger's value (or
  its placeholder, muted) and chevron; `Recipes.Listbox` gains `check`
  (`end`, `start`, `none`), `trigger` (`outline`, `filled`, `ghost`) and size
  `lg`. The Combobox takes `chips` (each chosen value a chip in the field,
  its remove button choosing it again, which a multiple combobox toggles
  off), `clearContent` and `clearLabel` (a clear button while the field has
  text) and `empty` (a polite panel in the list's place with nothing to list,
  a loading line too); `Combobox.parts` draws an option with the typed text
  marked. `ComboboxChipRender` and `ComboboxExtraInputs` are exported.
- **`foldkit-mixins-ui`: TagsInput's `max` and refusals, PasswordInput's
  strength and rules, InputCopy's reset.** `TagsInput.init({ max })` holds at
  most `max` tags; a commit that adds nothing, or not all of the draft, is a
  `Refusal` (`Repeat`, `Empty`, `Full`), said in a polite `message` slot
  (`refusalText` words it) with a one-time shake that `travel` stills.
  `PasswordInput` takes `strength` (a `Meter`), `requirements`
  (`PasswordRequirement`s listed under the field, each read as met or not)
  and `capsLock: { on, onKey }`, a polite hint while Caps Lock is on, read
  from each key by `capsLockOf`. `InputCopy` gains a `Model` (`init({
  resetAfter })`, default 2000ms) and `update`: `Copied` shows the value as
  copied and starts `Reset`, which sets it back to "Copy" unless a later copy
  came first.
- **`foldkit-mixins/theme`: shadows tinted by `shadow-h` and `shadow-c`.**
  `Theme.oklch({ shadow: { h, c } })` sets two knobs every shadow reads,
  defaulting to the neutrals' hue at twice their chroma, so shadows take the
  page's hue rather than a neutral black.
- **`foldkit-mixins-ui`: Card, Avatar, Separator, Skeleton, Spinner, Item and
  Empty grow their looks.** Card takes `elevation` (`0` to `3`, a step of
  the surface ladder: lighter in a dark scheme, a contact and an ambient
  shadow in a light one) and `lift: 'hover'` (a lift under the pointer,
  times `travel`); `Card.overlay` is the one stretched press control a
  pressable card or Item draws. Avatar takes `src`, `initials`, `status`
  and `statusLabel`; `Avatar.group({ people, max, label, moreLabel })` draws
  overlapping avatars and counts the rest as one more (`AvatarGroupSlots`,
  `Recipes.AvatarGroup({ overlap: 'tight' | 'loose' | 'none' })`), and
  `Recipes.Avatar` gains sizes `xs` and `xl`, `shape` (`circle`, `rounded`,
  `square`), `color: 'name'` (a hue from the name) and `ring`. Separator
  takes `label` and `decorative`, and the recipe `line` (`solid`, `dashed`,
  `dotted`), `thickness`, `spacing` and `inset`. Skeleton gains `lines`,
  `avatarRow`, `card` and `tableRow({ columns })`, and `animation` (`pulse`,
  `shimmer`, `none`). Spinner takes `showLabel`, and the recipe `kind`
  (`ring`, `dots`, `bars`, `pulse`, `orbit`), `size` and `tone` (`accent`,
  `neutral`, `current`). Item is the row primitive: `press`, `label`,
  `selected` and `disabled`, `Item.group` for a list (`ItemGroupSlots`,
  `Recipes.ItemGroup({ layout: 'divided' | 'separated' })`), and the recipe's
  `variant` (`plain`, `outline`, `muted`) and `media` (`plain`, `icon`,
  `image`). Empty takes `media` (`icon`, `illustration`), `frame` (`none`,
  `dashed`, `filled`), `tone` (`neutral`, `danger`) and `size`.
- **`foldkit-mixins-ui`: menu check rows, groups and shortcuts; Command pages
  and hints; a Toast component.** A Menu row may be a `CheckRow` (`check:
  'checkbox' | 'radio'`, `checked`): choosing it sends `Selected` and leaves
  the menu open, the application keeping `checked`. Any row may name a
  `group` (a heading, and a separator between groups), a `shortcut` (keys
  drawn as Kbd with `kbd`, named in `aria-keyshortcuts`) and `tone:
  'destructive'`. A Menubar's menus take the same rows, and `Menubar.init(ids,
  { isAnimated, isModal })` passes both to every menu. A Command row takes
  `icon`, `description` (matched by the query) and `opensPage`; the view
  takes `page: { trail, onBack }` (Backspace in an empty field goes back),
  `loading`, `hints` for a footer of keys and `kbd`; `Command.hotkey(message)`
  is ⌘K or Ctrl+K anywhere, and `Recipes.Command({ frame: 'bare' })` sits in
  a dialog. `Toast` is now a component: `init`, `show`, `settle`, `dismiss`,
  `update` and `view`. Toasts stack after Sonner's, spread out when held,
  pause while the pointer or focus is on the stack or the page is hidden
  (keeping the time left), show three at most, swipe away toward their
  edge, and are spoken in a polite or, for an error, an assertive region.
  `settle` turns a `loading` toast into its outcome, a promise toast; an
  `action` sends `Acted` with its value. `Recipes.Toast({ tone: 'rich' })`
  tints each type. `ToastView` stays for toasts that carry their own payload.
- **`foldkit-mixins-ui`: popovers, tooltips and hover cards in the top layer,
  and the Sheet.** `Anchor.layer` around a panel shows it in the browser's
  top layer, above every stacking context and outside every `overflow` box,
  with upstream's anchor placing it (the new `layer` slots), and an `arrow`
  slot points at the trigger. `Popover.anchor()`, `Tooltip.anchor()` and
  `HoverIntent.anchor()` are the placements: off the trigger (the Popover
  12px, room for its larger arrow; the others 8px), 8px inside the viewport,
  flipping and shifting to stay there. A Hover Card is placed
  by `HoverIntent.toView`'s `anchored: { id, anchor? }`. The Popover and
  Tooltip recipes take `arrow: 'none'`. The Dialog gains `body`, `scroll`,
  `scrollBar`, `scrollThumb` and `footer` slots (a long body scrolls under a
  footer that stays), `Dialog.overlayBars`, sizes `xl` and `full`, `covered`
  (a dialog that another was opened from steps back) and
  `DialogContext.attributes`. `Sheet` is a component over the Dialog: its
  handle drags it between `points` and, unless `dismissible: false`, away,
  with vaul's thresholds; `Sheet.view({ scalesPage })` with
  `Recipes.sheetPage` on the page beside it steps the page back. `Swipe` is
  in `foldkit-primitives/dom`.
- **`foldkit-mixins-ui`: a visible press and a filled toggle on buttons, four
  badge looks, key combinations, richer breadcrumbs, pagination and steps.**
  A held button scales to 98% (the 2% multiplied by `travel`, so reduced
  motion holds its size); a solid or primary one also deepens to its
  family's `active` fill (a new tone, `fill-active`) and clears the 1px border
  of its own color its fill stands in, so the fill draws in by 1px a side.
  A pressed toggle rests on its tone's fill (a solid one on the `active`
  fill), keeps it hovered (an unfilled one takes the hover fill), deepens to
  the `active` fill while held, and keeps its text on the fill throughout.
  `Badge` takes `appearance`: `tinted` (default), `dot`, `outline` or
  `solid`. `Kbd.combo({ keys, joiner? })` draws several keys in one `kbd`.
  Breadcrumb steps take `icon`s, the view takes a custom `separator` and
  `collapse: { max, onExpand }` (with `collapsedOf` as the pure split), and
  the recipe takes a `separator` axis: `slash` (default), `chevron` or
  `dot`, a separator midway between its steps. Pagination takes `siblings?`,
  `boundaries?`, `numbered?`, `ends?` and `range?` (with `summaryOf` for
  `"1–10 of 97"`, and `range.choose: { sizes, onPerPage, label? }` for a
  rows-per-page select), with new `summary`, `first`, `last`, `perPage`,
  `perPageSelect` and `pageCount` slots; the current stop holds `" / 12"`,
  which the recipe's `compact` axis (`narrow`, the default, below a 30rem
  window; `always`; `never`) shows while it hides the other numbers. Steps
  take per-step `icon`s and vertical `content`, whose line reaches both
  markers.
- **`foldkit-mixins-ui`: radio cards, and a wrapping row.** `RadioGroupSlots`
  gains `card`, an option's whole row, which the application draws around
  its radio and words (`h.label(option.card, …)`) and which is
  `data-checked` while its option is; `Recipes.RadioGroup` takes `variant:
  'card'`, which frames each card and fills the chosen one. A horizontal
  group (`aria-orientation="horizontal"`) wraps. The gallery shows
  descriptions, a row, and cards.
- **`foldkit-mixins-ui`: a checkbox group in a row, with an error.**
  `CheckboxGroup` takes `error` (the group is `aria-invalid` and described by
  it) and `orientation`: `vertical` (default) or `horizontal`. The rows sit
  in an `options` slot, spaced on the ladder; a vertical `list` keeps them
  flush so checked rows stay one block. `selectAll: { label, onSet }` draws
  a first row whose checkbox is checked, `mixed` or unchecked by
  `coverage(options, checked)` (a disabled option counts for neither) and
  controls every option; a press sends `onSet` with `setEnabled(options,
  checked, on)`, every enabled option or none, a disabled option keeping the
  state `checked` gives it. The checkbox sits on the label's row, so a
  description does not pull it down.
- **`foldkit-mixins-ui`: a checkbox check that wipes in.** The mark is drawn
  clipped away and wipes on over the fast tier, travel-aware, so reduced
  motion shows it at once. The mixed dash clears the check's box, borders
  and turn. The gallery shows basic, indeterminate and a card checkbox.
- **An overlay scrollbar, after Fluid Functionalism's.** `ScrollBars` in
  `foldkit-primitives/dom`; `ScrollArea.overlayBars`, `Command.overlayBars`,
  `VirtualList.overlayBars`, `Menu.overlayBars`, `Listbox.overlayBars` and
  `Combobox.overlayBars`, each a mixin list passed beside the style;
  `Utilities.scrollDivider` and
  `scrollTimeline` for a hairline at a scrolled edge. A browser's bar is
  thick, always shown and different on every system; this thumb rests at
  4px, widens to 6px under the pointer and fades when idle, its widening
  travelling so reduced motion keeps only the fades. A coarse pointer keeps
  its native bar. The bar sits beside the scroller, not in it, so the edge
  fade does not erase it: ScrollArea, Command and VirtualList always draw
  it, a popup whenever its panel has a `scroll`, and the recipe draws it only
  once `ScrollBars` marks it scrollable. It is opt-in, since its Mount sends
  no Message for a Scene test to resolve. ScrollArea's markup gains a `root`
  around `viewport` and a bar per axis: a width set on the area goes on
  `root`.
- **`foldkit-mixins`: `Theme.nests` and `Theme.nested()`.** A container that
  pads its children spreads `Theme.nests(radius, inset, border?)`, and any
  descendant's `borderRadius: Theme.nested()` is concentric with it, without
  repeating the container's arithmetic. `Theme.nested(outer, inset, border?)`
  is unchanged.
- **`foldkit-mixins`: a `surface.field` token for filled controls.** The
  filled Input, Textarea and Select read `var(--fk-surface-field)` — the
  `default` step, so it tracks the `surface-contrast` knob — instead of the
  page-adjacent `surface.subtle`.
- **`foldkit-mixins-ui`: a `label` Slot on Segmented**, the option's words,
  which hold the `text-box` trim.
- **`foldkit-richtext-dom`: arrows stop on an image, and a checkbox keeps the
  caret.** An arrow leaving a block for an atom beside it selects the atom,
  where the browser stepped over it, and a press on an adornment no longer
  takes the caret away from the text.
- **`foldkit-richtext-dom`: a triple click selects its block's text, and Ctrl+A
  in code selects the code.** The browser's triple-click selection ran on to the
  start of the next block, so typing over it swallowed that block's first line
  too. In code, a second Ctrl+A selects the document.
- **`foldkit-richtext`: a paste joins the line it lands in.** The first pasted
  block joins the text before the caret and the last the text after it, so a
  copied word lands inside the sentence instead of splitting it onto a line of
  its own; an image or table stands between the halves, and a paste into code
  is its text. Breaking: `Paste` no longer puts content above a block at its
  start or below it at its end as separate blocks.
- **`foldkit-richtext-dom`: a press below the last block writes after it.** The
  caret goes to the end of a last paragraph or heading; after a table, code or
  an image a new paragraph opens, where no caret could get below them.
- **`foldkit-richtext`: Backspace and Delete beside a list, a quote, a table or
  code.** They reach the nearest line on that side: a list's or a quote's last or
  first line joins the caret's, and Delete at the end of a list item reaches the
  next item; a table or code is stepped into, and an empty line beside one is
  removed. All were refused, so an empty line after a table could not be
  removed. Backspace at the start of a heading now makes it a paragraph before a
  second press joins it.
- **`foldkit-richtext-dom`: a placement's `keymap`, and Mod+Shift+S.** `editorAt`
  takes chords beside the built-in ones, and Strikethrough has a chord of its
  own. The playground binds Ctrl+U (underline), Ctrl+Shift+H (highlight) and
  Ctrl+K (the link editor), and its toolbar names them.
- **`foldkit-richtext`: `node(…, { indents })`, split from `lineBreaks`.** A kind
  can keep line breaks (Enter breaks the line, Enter on an empty last line
  leaves it) without Tab indenting it, as a callout of several lines does in
  the playground, where Enter used to start a second callout. Breaking: Tab and
  a broken line's indentation now follow `indents`, which the standard
  `CodeBlock` declares beside `lineBreaks`; declare it on a code kind of your own.
- **`foldkit-richtext-dom`: Escape closes the slash menu.** `Message.DismissedSlash`
  keeps `EditorState.slashDismissed`, the slash of the query it closed, so the
  menu stays shut while that query is typed on and Enter splits the line; it
  ends with the query. `menuTextOf(view)` is what a menu reads, so a view and
  Enter agree. `EditorState` and `EditorView` gain the field.
- **`foldkit-richtext`: an atom is selected whole.** A press on an image or a
  divider selects it (outlined through `data-selected`), as does Backspace from
  the block after it or Delete from the block before; a second press deletes
  it, Enter opens a paragraph after it, typing replaces it, and an arrow leaves
  it for the text beside it. `isAtom(nodes, block)` is the test. Deleting a
  block now lands the caret where the block was even when it held no text,
  where it went to the top of the document.
- **`foldkit-mixins-ui`: `Carousel`, the APG carousel.** A scroll-snap track
  of slides named "N of M", previous and next buttons, dots and a polite
  status. Its slide and rotation are a Model (`Carousel.init({ id, slide?,
  autoplay?, delay? })`) folded with `Carousel.update({ count, perView?,
  loop? })`, which returns `Carousel.ShowSlide`, the Command that scrolls the
  track, smoothly only without reduced motion; a swipe comes back through
  `ScrollSettle`, so the dots follow the finger. With `autoplay` it moves on
  every `delay` (4s), pauses under the pointer, stops when focus arrives by
  the keys, quiets its status while it rotates and draws the APG's rotation
  button first; the current dot is Fluid's pill, filling over the delay.
  `thumbnails` stand in for the dots, and `perView` shows several slides at
  once, a dot per place the track can rest. Recipe axis `peek`.
  `Recipes.Carousel`, `Patterns.Carousel` and a gallery page.
- **`foldkit-mixins-ui`: `TreeView`, the APG tree view.** Nested rows with
  one tab stop: the arrows move through the rows showing and open, shut,
  enter or leave a row; Home and End; a character moves to the next row it
  starts; Enter, Space or a click chooses a row. Its Model (`current`,
  `open`, `selected`, `checked`) is folded with `TreeView.update(nodes)`,
  which decides each key from its own Model, so keys faster than a frame
  still move on. It reuses `TreeNavigation`'s `shown`, `move` and `tabStop`
  and `Typeahead.match`. Each item carries its depth as `--fk-tree-level`.
  A node takes an `icon` and an `openIcon`; `Recipes.TreeView({ guides:
  'lines' })` draws a guide down each open branch; `checkable` (on the view
  and `update`) gives every row a tri-state box, the Model's `checked`
  holding the leaves and a branch reading checked, mixed or not from them
  (`TreeView.checksOf`), Space checking in `update`. `Recipes.TreeView`,
  `Patterns.TreeView` and a gallery page.
- **`foldkit-mixins-ui`: `ColorPicker`, after ReUI's:** a saturation and
  brightness area (the pointer and the keys), hue and alpha Sliders painted
  from the color (`Recipes.Slider({ track: 'paint', label: 'hidden' })`), the
  browser's `EyeDropper` where there is one (`ColorPicker.Eyedrop`,
  `canEyedrop`), text in hex, rgb, hsl or oklch that parses to an `Option`
  (`format`, `parse`, and `color('#3b82f6')` for a literal in code), and
  presets as a radio group of swatches. The color, its format and a draft
  being typed are `ColorPicker.Model` (`init({ id, color?, format? })`),
  folded with `ColorPicker.update`, so fast keys each step from the last
  color; `toOklch` reads a color for a theme. `ColorPicker.popover` draws it
  as a Popover's `toView`. `Patterns.ColorPicker` and a gallery page.
- **`foldkit-mixins-ui`: `Recipes.Sheet`, the Dialog from an edge.**
  shadcn's Sheet and vaul's Drawer as one recipe over `DialogSlots`: the
  panel stands on the edge its `data-side` names (`top`, `right`, `bottom`,
  `left`, written by `Sheet.view` from `Sheet.init({ side })`) and slides in
  from there, the fade kept under reduced motion. `handle: 'bar'`, the
  default, shows the handle, a Slot (`handle` on `DialogSlots`, `aria-hidden`,
  drawn as `h.div(dialog.handle)` in the panel), and rounds the inner
  corners: from the top or bottom it is the panel's last or first row, and
  from the left or right a bar standing on the edge facing the page, so a
  bottom sheet with its handle is a drawer as on a phone. One gallery
  page.
- **`foldkit-mixins-ui`: `InputCopy`, a value with a copy button.** A
  read-only field and a button named after its label; `InputCopy.Copy` is
  the Command that writes the clipboard and reports `Copied` or `CopyFailed`
  as `foldkit-primitives/dom`'s `ClipboardMessage`. The `copied` flag is the
  application's; copied, the button reads "Copied" and a status region
  announces it. `Recipes.InputCopy`, `Patterns.InputCopy` and a gallery page.
- **`foldkit-mixins-ui`: `TagsInput`,** Zag's tags input: the tags as a
  list of chips named by the field's label, each with a `Remove <tag>`
  button, and a text input. Enter or the delimiter adds the draft, split at
  the delimiter and trimmed, refusing empty and repeated parts; Backspace on
  an empty draft removes the last tag; a removal sends focus back to the
  input. The tags and the draft are its own small Model (`init`, `Message`,
  `update`), and the keys reach `update`, so it decides from the current
  draft, not the last frame's. A recipe, a pattern and a gallery page.
- **`foldkit-mixins-ui`: `PasswordInput`,** a password field whose toggle
  (`aria-pressed`, `aria-controls`) shows it as text, `autocomplete` kept as
  `current-password` or `new-password`. `Recipes.PasswordInput` reuses
  Input's pieces in InputGroup's box, draws the eye with `Icons.glyph` and
  hides the browser's own reveal button. `Patterns.PasswordInput` and a
  gallery page.
- **`foldkit-mixins-ui`: `Rating`,** a row of stars as the APG's radio group
  of native radios: the application keeps `value` (an `Option`, none before
  anyone rates) and receives `onChange` with the star chosen. The arrows move
  the choice natively, `readOnly` draws one `img` that names the rating, and
  `disabled` stills it. The recipe cuts each star with `clip-path` on the
  radio's `::before`, keeping its focus ring whole, and previews the rating
  under the pointer in CSS alone. `Patterns.Rating` and a gallery page.
- **`foldkit-mixins-ui`: `Steps`, a stepper.** A named ordered list whose
  step at `current` is `aria-current="step"`, those before it complete (a
  check in the marker) and those after upcoming, as `data-state`, joined by
  a connector. The application owns `current`; given `onSelect`, completed
  steps are buttons that go back. Recipe axis `orientation`. `Recipes.Steps`,
  `Patterns.Steps` and a gallery page.
- **`foldkit-mixins-ui`: `VirtualList`, `@foldkit/ui`'s virtual list
  adapted.** It draws only the rows in view; its Model stays upstream's,
  folded with that module's `update`. The `root` slot is the box it scrolls
  within and `row` each row's content; the box fills its container's width
  and, where the container takes its width from the box, offers 20rem, so
  the rows drawn as it scrolls never resize it. `Recipes.VirtualList`,
  `Patterns.VirtualList` and a gallery page of ten thousand rows.
- **`foldkit-mixins-ui`: `Meter`, `@foldkit/ui`'s Meter adapted.** A
  measurement within a range, its root's `data-level` (`good`, `fair`,
  `poor`) the HTML meter's judgment of the value against `low`, `high` and
  `optimum` (`Meter.levelOf`), which the recipe colours success, warning or
  error. `Recipes.Meter`, `Patterns.Meter` and a gallery page.
- **`foldkit-mixins-ui`: `Progress`, `@foldkit/ui`'s Progress adapted,**
  with Circular Progress as its recipe's `shape: 'ring'`. `value` is an
  `Option`, none for work whose end is not known, which the bar shows
  sliding and the ring turning, still under reduced motion. The root carries
  the share done as `--fk-progress`. `Recipes.Progress`, `Patterns.Progress`
  and a gallery page.
- **`foldkit-mixins-ui`: `Menubar`, a row of `@foldkit/ui` Menus.** Its
  Model holds the menus and the bar's one tab stop, folded with
  `Menubar.update`, whose `Selected` OutMessage names the menu and the row.
  The arrows move the stop while the menus are shut and open the next menu
  while one is open; pointing at another trigger while one is open opens it,
  and opening any menu shuts the rest without sending focus back to its
  button. `Recipes.Menubar`, `Recipes.MenubarMenu`, `Patterns.Menubar` and a
  gallery page.
- **`foldkit-mixins-ui`: `Nav`, `@foldkit/ui`'s Nav adapted,** and with it
  the navigation menu: `Nav.toView` draws the landmark's links in a list,
  the current one `aria-current="page"`, and `Nav.fluid` glides a line to
  the current link and a faint pill to the one the pointer nears, as Tabs'
  do. The keys stay the browser's (no roving tab stop for a landmark).
  `Recipes.Nav`, `Patterns.Nav` and a gallery page. shadcn's dropdown
  panels in a navigation menu are not here yet.
- **`foldkit-mixins-ui`: `Sidebar`,** from the widgets island into the
  package: shadcn's sidebar with Fluid Functionalism's collapse. A named
  navigation landmark with a header and a footer, groups with or without a
  heading that open on the accordion's grid row (several at once), rows with
  icons and counts, branches of nested links, the current page marked
  `aria-current` with a marker that glides to it (`Sidebar.fluid`), and a
  toggle that collapses it off the page (`collapse: 'offcanvas'`) or to a
  rail of icons named in Tooltips (`'icons'`); on a phone an opener shows it
  in a Sheet. Its Model (`Sidebar.init({ id, rows, open?, collapsed? })`,
  `Sidebar.update`) holds what is open and collapsed, the rail's Tooltips
  and the Sheet. `width: 'fill'` sizes it to a Resizable's panel. A recipe,
  a pattern and a gallery page.
- **`foldkit-mixins-ui`: `Resizable`,** from the widgets island into the
  package: shadcn's Resizable and the APG's window splitter, two panels with
  a handle that is a `separator` with its value, stepped by the arrows and
  sent to the bounds by Home and End, and dragged, following the `Move`
  Mount from where the drag began over the group the `Resize` Mount
  measured. The split is a small Model of its own (`init`, `Message`,
  `update`) the application keeps; side by side or one over the other. A
  recipe, a pattern and a gallery page.
- **`foldkit-mixins-ui`: `Command`,** the widgets island's command palette as
  shadcn's Command with Fluid Functionalism's CommandMenu behaviour: a field
  that points at the highlighted row through `aria-activedescendant`, ↑ and
  ↓ wrapping through enabled rows, Enter running the highlighted one, rows
  in groups with shortcuts, and an empty state. The filter (`filtered`)
  matches every query word against a row's label and keywords and never
  re-sorts; a highlight filtered away moves to the first enabled row. The
  query and highlight are the application's. A shortcut reads left to right
  on a right-to-left page. A recipe, a pattern and a page.
- **`foldkit-mixins-ui`: `Recipes.HoverCard`,** the widgets island's hover
  card as `@foldkit/ui`'s HoverIntent with a look: a trigger read as a link
  and a raised panel that fades in as it is drawn (`@starting-style`),
  placed against its trigger in the top layer by `HoverIntent.toView`'s
  `anchored`. The delays stay HoverIntent's. A gallery
  page draws it.
- **`foldkit-mixins-ui`: `OtpField`, Input OTP,** after shadcn's input-otp
  rather than the widgets island's cell per input: one real `<input>` over
  cells that only mirror it, so paste, Backspace, the caret and a phone's
  `one-time-code` autofill are the browser's and no Command moves focus.
  The code is the application's, kept to its pattern and length
  (`OtpField.kept`); `groups` draws runs with a separator, and the next cell
  draws a blinking caret while the field has focus. A recipe, a pattern and
  a gallery page.
- **`foldkit-mixins-ui`: `NumberField`,** from the widgets island into the
  package: the APG's editable spinbutton and Zag's number input. The arrows,
  PageUp and PageDown, Home and End step it through `SpinValue`'s `spin`, a
  typed number commits on change (text that is no number leaves the value),
  and steppers out of the tab order disable at their bound; every value is
  clamped onto its step (`NumberField.settled`), a decimal step kept exact.
  The value is the application's. `Recipes.NumberField`,
  `Patterns.NumberField` and a gallery page.
- **`foldkit-mixins-ui`: `CheckboxGroup`,** from the widgets island into the
  package, as Zag's checkbox group with Fluid Functionalism's rows: a
  `fieldset` named by its `legend`, each option the APG's checkbox named by a
  `label` for it, the checked values the application's (`toggled` is the
  transition). Drawn as a `list`, checked rows fill and merge where they
  stand together. `Recipes.CheckboxGroup` reuses the Checkbox recipe's
  pieces; `Patterns.CheckboxGroup` and a gallery page. Accordion, Segmented
  and CheckboxGroup now share one step for a multiple choice.
- **`foldkit-mixins-ui`: an alert dialog is the Dialog with
  `role: 'alertdialog'`.** `Dialog.toView(mixins, { h, role: 'alertdialog' },
  draw)` (and `Dialog.resolve`) puts `role="alertdialog"` on the `dialog`
  bundle; `'dialog'`, the default, writes none, as the `<dialog>` element has
  it. `Dialog.isDismissal(message)` names upstream's own dismissal (Escape, a
  press on the backdrop, its close button): an application that drops those
  in `update`, draws no close button, and closes from its own buttons with
  `@foldkit/ui`'s `close` has the APG's alert dialog. One recipe and one
  gallery page, Dialog, show both.
- **`foldkit-mixins-ui`: Toggle and Toggle Group, from the widgets islands,
  as what was already here.** A toggle is a Button with `pressed`, which
  writes `aria-pressed`; every variant has its on look. A toggle group is a
  segmented control: `Segmented.view` draws the options from the
  application's pressed values, and `Segmented.toggled(pressed, value, {
  multiple, optional })` is the transition, one at a time (kept pressed
  unless `optional`) or several. The gallery's segmented control is drawn
  with `Segmented.view`.
- **`foldkit-mixins-ui`: `Accordion`,** from the `examples/widgets` island into
  the package, after the APG pattern, shadcn's and Zag's options and Fluid
  Functionalism's craft. `Accordion.view` draws the application's open ids,
  each trigger a button in a heading naming its region; `Accordion.toggled`
  is the transition, single or `multiple`, `collapsible` by default. A panel
  opens on a `0fr`-`1fr` grid row (no measured height), clipped on its
  container, a shut one stays drawn and `inert`, the chevron turns 90°, and
  the open title turns semibold in its own width. `Recipes.Accordion`,
  `Patterns.Accordion` and a gallery page.
- **`foldkit-mixins-ui`: a table under fluid hover.** `Table.view({ …, fluid:
  true })` stands the table in a `frame` with one `highlight` behind the body
  rows, following the pointer to the nearest one, after Fluid
  Functionalism's: the lines above and below the lit row clear over 80ms, the
  header's too when the first row is lit, and the lit row's text lifts.
  `FluidHover` marks the item it is shown on `data-fluid-lit` for this.
- **`foldkit-mixins-ui`: merged choices.** In a multiple listbox or
  combobox, chosen rows next to each other square the corners between them,
  so a run reads as one block.
- **`foldkit-mixins-ui`: popups and dialogs enter and leave.** Drawn with
  `@foldkit/ui`'s `isAnimated`, a menu, listbox or combobox panel fades in
  on the fast tier from a little smaller, sliding 4px from the side the
  anchor placed it on, and a dialog and its veil on the slow tier from 0.97;
  each leaves on its tier's quicker exit, and reduced motion keeps the fade
  alone. The Menu component passes it with `Menu.init(id, rows, {
  isAnimated: true })`. The gallery's widgets animate.
- **`foldkit-mixins/utilities`: `steady(weight)`, weight without reflow.**
  The element's `data-label` holds its text, which a hidden, zero-height
  `::after` sets at `weight`, so a label that turns heavier when chosen
  moves nothing beside it; the element stays a block, so a `text-box` trim
  still works on it. A pressed segmented option and a chosen card title use
  it, and the card writes its title into `data-label` itself.
- **`foldkit-mixins/theme`: a surface ladder that nests by itself.**
  `Theme.raise(offset)` sets an element `offset` levels above the raised
  element holding it, or the page (capped at 8), and `Theme.raisedSurface()`
  paints it for its level, after Fluid Functionalism's ladder: in a light
  scheme two steps toward white and then flat, so shadow carries elevation,
  and in a dark scheme an even step lighter per level (`knob.raise-dark`).
  Popups, popovers, date picker panels and toasts raise by 2 and dialogs by
  4, so a popover opened in a dialog lands above it instead of melting into
  a surface it shares. A popup keeps its menu look (`popup.inverted`, new,
  and the translucency) over its level.
- **`foldkit-mixins/utilities`: `scrollFade(axis)`**, after shadcn's and Fluid
  Functionalism's `scroll-fade`: a scroller's content dissolves toward an edge
  with more to scroll, its true start and end crisp until something is past
  them, by a mask a scroll timeline moves; no JavaScript, and no fade where
  scroll timelines are missing. ScrollArea and the popups' lists use it.
- **`foldkit-primitives/dom`: `FluidHover`'s `gapReach`,** the farthest a
  click in a gap may land from the highlighted item and still press it;
  `Card.group` uses 16px, after Fluid Functionalism's card grid. An item with
  no layout box yet keeps the highlight's last place and is measured again
  for three frames, rather than drawing the highlight at zero.
- **`foldkit-richtext`: `InsertBlock` and `DeleteBlock`.** `InsertBlock` puts a
  block beside another under fresh identities (without a place, beside the
  caret's block); `DeleteBlock` deletes one with any container it empties and
  moves a caret inside it to the nearest text that stays. The editor sends them
  as `InsertedBlock` and `DeletedBlock`, and `SetProps` as `ChangedProps`.
- **`foldkit-richtext`: a rendering entry's `adornments`**, elements drawn
  before a block's content that are not content (a checkbox, a figure's picture
  and caption, an icon). They hold no position and an HTML import drops them; a
  click on one with `toggles` flips that boolean prop through the document.
- **`foldkit-richtext`: the standard `Image` takes `caption`, `width` and
  `align`**, all optional; the standard rendering still draws the `img` alone.
- **`foldkit-richtext`: deleting a selection across kinds of block.** Select
  all and Delete did nothing, and so did any range over an image, a table, a
  list or a quote: the command refused a range it could not join. Such a range
  is now cleared (blocks wholly inside go, the ends are trimmed and joined where
  they can be, emptied containers go), and typing, Enter or pasting over it
  clears it first. A range that leaves a table cell only loses its text.
- **`foldkit-richtext-dom`: `blockAnchor`'s `side: 'inside-end'`.** A block's
  toolbar inside its top right corner, covering nothing around the block.
- **`foldkit-mixins-richtext`: `linkEdit`, and Enter that keeps up with typing.**
  The link editor's Enter sent the edit its last drawing decided, a frame
  behind fast keys, so Enter straight after typing applied the address before
  the last character, or nothing. Its new optional `submitted` is sent instead,
  for `update` to apply `linkEdit(document, selection, draft)` to the Model's
  own draft.
- **`foldkit-mixins-richtext`: the link editor asks for a link and closes on
  Escape.** Its field says "Paste or type a link", Escape in it sends the new
  optional `closed`, and its button reads Apply rather than Link.
- **`foldkit-mixins-richtext`: the find bar's Previous, Next, Match case and
  Close are icons**, named by `aria-label` and `title`.
- **`foldkit-richtext-dom`: a floating element follows its own size.** A
  toolbar measured before its styles settled was placed below the selection
  for good, covering the next line; `selectionAnchor` and `blockAnchor` now
  place it again when its size changes, as a slash menu's does while a query
  narrows it.
- **`foldkit-mixins-richtext`: `blockStyleMenu`.** The block styles as one
  trigger naming the current style and a menu of them, the current one
  checked, for a toolbar with other things to hold.
- **A slash menu worth reading, and an icon set.** `foldkit-richtext-dom`'s
  `SlashEntry` gains `description`, `group` and `icon`, and the editor's entries
  have all three; `matchingEntries` groups the catalogue under `/` and ranks a
  query's matches, best first. `foldkit-mixins-richtext`'s `slashMenuView` draws
  group headings, each entry's icon, label and description, and "No matches",
  through new slots, and `richTextIcon`/`richTextIconUrl` are the chrome's icons
  (after Lucide, ISC).
- **`foldkit-richtext`: video, audio and attachments.** `mediaNodes`
  (`Video`, `Audio`, `Attachment`) are opt-in vocabulary, `mediaRendering`
  draws them with the browser's controls and a download link, and
  `mediaBlock(file)` makes the block a file's type calls for. A `data:` source
  is accepted only of the kind's own family, and an attachment's never as HTML,
  SVG or XML.
- **`foldkit-richtext-markdown`: footnotes.** `parse(markdown, { footnotes: true })`
  reads `[^label]` and `[^label]: …` as `FootnoteRef` and `FootnoteDefinition`,
  and `print` writes them back; without the option they are reported and
  skipped, as before.
- **`foldkit-richtext`: typing at a block's edge leaves a mark that does not
  extend.** Text typed after a link, inline code or footnote reference that ends
  a paragraph (or before one that starts it) used to join it, since there was
  no neighbouring run to move to; it now gets a run with only the marks that
  extend. `resolveInsertion` also reaches nested blocks, where it found nothing
  before, so a list item or table cell kept extending such marks.
- **Footnotes.** `foldkit-richtext` declares `FootnoteRef` and
  `FootnoteDefinition` for a kit to opt into, reads them with `footnotesOf`,
  `footnoteAt` and `nextFootnoteLabel`, and inserts and renames them with
  `InsertFootnote` and `RenameFootnote` (the editor's `InsertedFootnote`,
  `RenamedFootnote`); `foldkit-mixins-richtext`'s `footnotePreview` is the card
  at a reference.
- **`foldkit-richtext-dom`: a hint on the empty line.** `lineHint` ("Type /
  for blocks") marks the empty paragraph the caret is in with `data-hint`, for
  a stylesheet to draw as it draws the placeholder. **Changed:** the host
  registry's `placePlaceholder`/`placeholderFor` are `placePlaceholders` and
  `placeholdersFor`, holding both strings.
- **A table of contents.** `foldkit-richtext`'s `outlineOf` lists a document's
  headings and `sectionAt` the section a selection is in;
  `foldkit-mixins-richtext`'s `tableOfContents` draws them; and
  `foldkit-richtext-dom`'s `focus(hostId, selection)` Command sends the reader
  into the text with that selection, scrolled into view.
- **Find and replace.** `foldkit-richtext`'s `findMatches` lists a query's
  matches (case not counting unless asked), `searchDecorations` takes a
  `current` match drawn as `search-current`, and `Replace` replaces one match or
  every one as a single undo step; the editor sends it as `ReplacedText`, and
  `foldkit-mixins-richtext`'s `findReplace` is the bar. **Changed:** search
  ignores case by default; pass `caseSensitive: true` for the old exact match.
- **`foldkit-richtext-markdown`: inline markers close as they are typed.**
  `**bold**`, `*italic*`, `_italic_`, `` `code` `` and `~~struck~~` become
  marked text when the closing marker is typed, and typing on is plain
  (`markdownInlineRules`, part of `markdownInputRules`). An input rule can say
  what the next text carries (`InputMatch.storedMarks`, read by
  `resolveInputRules`), which the editor keeps.
- **`foldkit-mixins-richtext`: `tableToolbar` and `codeToolbar`.** The table
  toolbar adds and deletes rows and columns around the caret's cell, switches
  the header row and deletes the table; the code toolbar picks a code block's
  language and sends the caller's Copy Message. Both draw through slots.
- **`foldkit-richtext-dom`: Tab, table Messages, adornment actions, a toolbar's
  place.** Tab and Shift+Tab send `Indented` and `Outdented` where
  `RichText.takesTab` says they mean something, and move focus elsewhere;
  `InsertedRow`, `InsertedColumn`, `DeletedRow` and `DeletedColumn` carry the
  table commands. An adornment with an `action` is reported as
  `ActivatedAdornment`, which edits nothing. `blockAnchor({ side: 'above' })`
  places a block's toolbar.
- **`foldkit-richtext`: tables as a grid, and Tab.** `InsertRow`, `InsertColumn`,
  `DeleteRow` and `DeleteColumn` edit the table around the caret's cell, each as
  one undo step (`tableAt` reads where the caret is). `Indent` and `Outdent` are
  Tab and Shift+Tab: indentation in code (and Enter keeps a line's), the next or
  previous cell in a table, a new row after the last, and in a list item, nesting
  it under the item before it or moving it back out. `takesTab` says where Tab
  means something.
- **`foldkit-richtext-dom`: an empty line can be reached.** It holds a
  `<br data-richtext-filler>`, where the caret stands, so it has a line's height
  and the arrow keys and a click land on it; before, a new line made with Enter
  had no height and the caret could not get to it. A caret restored onto an
  element, not only into text, is put back.
- **`foldkit-richtext-dom`: a drag shows itself and scrolls the page.** The
  dragged block carries `data-richtext-dragging` once the pointer moves (and the
  page's root `data-richtext-drag`, for a `grabbing` cursor), and a
  pointer held near the window's top or bottom scrolls the page, so a block can
  be dragged past what the window shows.
- **`foldkit-richtext`: `node(…, { lineBreaks: true })`**, a kind whose text
  keeps line breaks: Enter inserts a newline instead of splitting the block,
  and Enter on an empty last line leaves it for a paragraph after. The
  standard `CodeBlock` declares it, so Enter in code no longer makes a second
  code block.
- **`foldkit-richtext`: `ClearMark` takes a mark value**, clearing only the
  runs carrying exactly it, so one discussion's highlight goes without
  another's inside it; the editor's `ClearedMark` carries either. `eachBlock`
  and `siblingsOf` are exported, for an application walking its document.
- **`foldkit-richtext-dom`: `selectionAnchor({ caret: true })`** follows a
  caret too, opening under it, which is where a slash menu goes.
- **`foldkit-richtext-dom`: `editorAt(hostId, { slashEntries })`**, the slash
  catalogue Enter in a query resolves against, so an application's own entries
  (an image, a table) choose as the editor's do.

- **`foldkit-remote-server`: `RemoteServer.memory` takes `entities`,** Sources
  for entities no row backs (`foldkit-guard`'s `GuardServer.me`), served
  beside the rows. One naming an entity the rows' domain declares, or a second
  for the same entity, is refused when the backend is made.

- **`foldkit-primitives/dom`: `FluidHover`**, a Mount that moves one highlight
  across a container's items: the item nearest the pointer, gaps included, on
  the `x`, `y` or `xy` axis, skipping disabled items and following keyboard
  focus. It writes the item's place as custom properties and sends no Message;
  with `gapClick`, a click in a gap presses the highlighted item. `follows`
  lights the item a menu's keys marked, and `from` names the item a fresh
  highlight grows out of and returns to.
- **`foldkit-mixins/theme`: `Theme.oklch({ neutral: { h } })`**, a hue for the
  neutrals (surfaces, text, outlines, the shadow) apart from the accent's, as
  shadcn's base colors are; without it they take the accent's and follow its
  knob, as before. The hue is the `neutral-h` knob.
- **`foldkit-mixins/theme`: a menu's look, `Theme.oklch({ menu: { accent, color } })`**,
  as shadcn's menu options: the lit row in a tint of the text or the
  accent's fill (`bold`), and the panel in the page's surface, the other
  scheme's (`inverted`), or either over a blur (`translucent`). The `popup`
  tokens carry it, and the menu, listbox and combobox recipes read them.
- **`foldkit-mixins/theme`: `motion.settle` and `motion.spring`**, easings
  sampled from springs, for CSS transitions that spring with no JavaScript:
  `settle` critically damped, landing exactly, and `spring` at a damping ratio
  of 0.88 for large surfaces.
- **`foldkit-mixins-ui`: `Card.group` and `Recipes.CardGroup`**, cards as one
  keyed list in one column or a grid, divided or apart, with one highlight that
  follows the pointer to the nearest card (`FluidHover`); a press in a gap
  presses the highlighted card.
- **`foldkit-mixins-ui`: `Recipes.Calendar`**, the month grid in every mode,
  sized `sm` or `md` on the size ladder, for a calendar alone or in a date
  picker's panel. The design-system example uses it in place of its own.
- **`foldkit-mixins-ui`: `Menu`, `Listbox` and `Combobox` draw themselves.**
  Their `toView` takes `draw` optionally; without it, upstream's markup is
  drawn from the styled bundles, so a styled menu is
  `Menu.toView([MenuStyle.mixin], { h })` instead of forty lines of panel and
  option groups. The forks' default views share the same drawing.
- **`foldkit-mixins-ui`: `Calendar` draws itself too.** `CalendarSlots` gains
  `header`, the row of the heading and its paging buttons, which no upstream
  bundle holds; `Calendar.toView(selection, mixins, { h })` draws every mode
  through the slots, and `Calendar.draw` is that drawing for a `toView` of
  your own.
  `DatePicker.toView`'s `draw` is optional the same way.
- **`foldkit-mixins-ui`: tabs glide.** `TabsSlots` gains `indicator` and
  `highlight`, and `Tabs.fluid` measures the chosen tab and moves one hover
  to the tab nearest the pointer, born at the chosen tab; drawn, the recipe's
  rule or pill springs to a new choice. Until it runs, each tab marks itself.
  `FluidHover` sets `data-fluid-hover` on its container while it runs, which
  a recipe reads to draw a highlight in place of each item's own hover.
- **`foldkit-mixins-ui`: menus, listboxes and comboboxes glide.** `Menu.fluid`,
  `Listbox.fluid` and `Combobox.fluid` move one highlight over the open
  panel's rows, for the pointer and the keys alike, and a listbox's or
  combobox's chosen-row marker glides to a new choice. Their slots gain
  `rows`, `highlight` and (listbox, combobox) `indicator`, which the default
  draw places. `Segmented.fluid` does the same for a segmented control's
  pressed pill, through its new `indicator` and `highlight` slots.
- **`foldkit-mixins-ui`: `Item`'s `content` is optional**, for a row its
  title and description say all of, such as a notification.
- **`foldkit-mixins-ui`: `ChatMessage` and `MessageScroller`.** A chat
  message with an author, avatar, time, a sending/sent/failed status with a
  retry and named actions, the user's at the end in a bubble;
  `ChatMessage.group` draws a sender's following messages as continued. Its
  body wraps with `text-wrap: wrap`, so a streamed answer never moves a word
  off an earlier line, and a streaming message is `aria-busy`. Recipe axes
  `layout` (`chat`, `thread`), `bubble` and `content` (`text`, `markdown`,
  spaced as Prose). `MessageScroller` is a `role="log"` in a `ScrollArea`
  that follows the newest message while the reader is at the end, stops when
  they scroll up, offers a jump button counting what arrived (`Appended`),
  and holds the message in view as older ones load above; its `FollowEnd`
  Mount is exported for Scene tests.
- **`foldkit-mixins-ui`: `ThinkingIndicator`, `ThinkingSteps` and
  `Questionnaire`.** The indicator is an assistant at work: dots, a pulse or
  the view's icon beside words a band of light sweeps, and a detail line, in
  a polite status drawn always (`active: false` draws it empty); recipe axes
  `mark`, `label`, `tone`. Thinking Steps is a trace of reasoning and tool
  calls under a button saying the running step or "Thought for 4s", each step
  pending, running, done or failed, in words too, with a duration, detail
  and steps of its own (`onToggleStep`); its openness is an `Option` the
  application keeps, none following the work. `ThinkingSteps.stateOf`,
  `shown`, `elapsed`; axes `variant`, `connector`. The Questionnaire asks
  single choice, multiple choice and free text questions, with an "Other"
  field, all at once or one at a time; `update` says what is missing and
  focuses it, and returns `OutMessage.Answered` once all are answered.
  `Question` is a Schema, so an assistant's tool input decodes into it; axes
  `variant`, `actions`.
- **`foldkit-mixins-ui`: `AngleSlider`, `Timer` and `Marquee`, after Zag's.**
  A dial in degrees dragged round or stepped by the APG's slider keys, which
  go round past 0, with `step`, `largeStep`, labelled `marks`,
  `restrictToMarks`, read-only, invalid and a hidden input (recipe `tone`,
  `track`, `value`, `size`). A countdown or stopwatch started, paused,
  resumed, reset and restarted, its clock read by Commands on Effect's
  `Clock` so TestClock drives a run, a `role="timer"` with each unit in a
  Slot; `Timer.phase`, `Timer.partsOf` (recipe `tone`, `look`, `progress`,
  `size`). Content that scrolls on without a seam: measured copies filling
  the viewport, a speed in pixels a second, four sides, a delay and a round
  count, held by a pointer, by focus or by its pause press (WCAG 2.2.2), its
  copies `inert`, and still under reduced motion (recipe `spacing`,
  `edges`).
- **`foldkit-mixins-ui`: `ImageCropper` and `SignaturePad`, after Zag's.** A
  crop of an image that a drag moves and eight handles resize, zoomed by a
  Slider, the wheel and `+`/`-` with the selection kept on screen, panned,
  turned by quarters, locked to an aspect or round; the crop is the Model's
  in the turned image's pixels (`ImageCropper.crop`), and `RequestedExport`
  returns the `Export` Command answering `Exported({ url, width, height })`
  or `FailedExport` (recipe `guides`, `handles`, `viewport`). Strokes drawn
  by one pointer, a pen's pressure used and a mouse's simulated from speed,
  kept as data and drawn as smoothed variable-width outlines (`pathOf`),
  with undo, clear, "Sign here" and a typed name instead; `toSvg` is pure
  and `RequestedPng` returns `ExportPng` (recipe `surface`, `size`).
- **`foldkit-mixins`: a `chart` group in `Theme.oklch`.** `chart-1` to
  `chart-5`, as shadcn names them: the dataviz reference palette's first five
  slots in its order, each a fixed turn from the `chart-h` knob at a
  lightness and chroma set per hue and per scheme.
- **`foldkit-mixins-ui`: `QrCode` and `Chart`.** `QrCode.view` draws text as
  one SVG path in a quiet zone, one image named by what it encodes, with an
  overlay (a logo) that raises the level from M to H; `QrCode.encode` and
  `pathOf` are pure, `QrCode.Download` saves the drawn code as PNG or SVG
  in its colors, and the recipe draws it dark on light on any page
  (`scheme`, `size`). Encoded by `uqr`, now a dependency. `Chart.view` draws
  bars, a line, an area or a donut with round ticks, gridlines, a legend and
  a tooltip, in percentages, so it fills any width with nothing measured and
  renders the same on a server; `Chart.Model` holds the lit point, the
  arrows, Home and End step through the points while a status says each,
  and the data is a table, hidden unless `table: 'shown'`. Series take
  `chart-1` to `chart-5`; recipe axes `height`, `grid`, `indicator`.
- **`foldkit-mixins-ui`: `CascadeSelect`, `FloatingPanel` and `Tour`.** One
  value chosen as a path through nested options (`CascadeSelect.update({
  nodes })`) from a top-layer APG tree with a column per level or one level
  at a time (`layout: 'drill'`), the arrows within and between levels,
  Home, End and a letter, `expandOn: 'hover'`, `parents`, `clearable`,
  `levels` and a hidden input (recipe `size`, `trigger`, `width`). A
  non-modal window whose rect and stage are its Model: dragged, resized
  from eight edges within the viewport, `min`, `max` and a `grid`, moved and
  resized by the arrows, minimized, maximized, restored and closed, stacked
  by an `order` its `Raised` OutMessage updates (`FloatingPanel.raise`;
  recipe `header`). A tour of steps beside their targets in the top layer,
  over a dim with a cutout the target's presses reach, the target scrolled
  into view, Next, Back, the arrows, Skip and Escape, focus back to the
  opener and `Ended { completed }` at the end; a step without a target, or
  with a missing one, stands in the middle.
- **`foldkit-mixins-ui`: `Anchor.layerBox`**, the top-layer box `layer`
  draws, without its `TopLayer` Mount, for a box whose own Mount shows it
  through `topLayer`.
- **`foldkit-primitives/dom`: `PointerPosition({ focus? })`**, a Mount
  reporting one pointer's press, moves (with coalesced points and pressure)
  and release in the element's padding box, captured, with move listeners
  only during a press; `paddingBoxOf({ rect, border })` and
  `measurePaddingBox(element)`. In `foldkit-mixins-ui` the color picker's
  area, the angle slider's dial and the signature pad read the pointer
  through it (no API change).
- **Site: pages for every component above.**

### Changed

- **`foldkit-mixins-ui`: the Calendar's resolved days and a Segmented tray
  (breaking).** `ResolvedDays`' paging buttons are `Option`s and its heading
  is a `caption` (`Grid`, `Label` or `Dropdowns`); `toView`, `inputs` and
  `resolve` take an options object fourth, `render` among them. A Segmented
  `tray` is as wide as its options, not its container (`width: 'fill'` for
  the old strip). A tab is a flex row: draw its words in the `label` slot to
  keep their trim.
- **`foldkit-mixins-ui`: the Tooltip takes its id; the Toast recipe drops its
  accent edge (breaking).** `Tooltip.toView` and `Tooltip.resolve` take the
  Tooltip's `id`, which the arrow points from.
- **`foldkit-mixins-ui`: Select's chevron and the display slots (breaking
  for hand-drawn slots).** The native Select draws its own chevron and
  mutes a chosen placeholder. `AvatarSlots` gains `status`, and the
  avatar's root is one `role="img"` named by the person, its picture's alt
  empty. `SeparatorSlots` gains `root` and `label`, the line a border in
  `outline.default`. `SkeletonSlots` gains `group`, a bar a film of the
  text. `SpinnerSlots` gains `part`, `root` and `text`, a turn about 720ms
  times `travel`. `ItemSlots` gains `overlay`. Empty's title takes the
  `subtitle` role and its icon is `aria-hidden`.
- **`foldkit-mixins`, `foldkit-mixins-ui`: hovers take their surface’s paint,
  not grey.** `unfilledHover` films the state ink instead of the text: the
  theme's `--fk-state-ink` (`state.ink`), unless a surface painted in a hue
  writes its paint in the local `--_fk-state-ink`, so a hover on a painted
  surface deepens the paint. The accent and danger tones name their fills, a
  subtle alert band its ink (its tint would film the band over itself) and a
  bold one its fill; the neutral and ink tones name the theme's ink back, so
  a neutral control on a band keeps the theme's hover. New
  `OklchKnobs.stateHue` sets the theme's ink, and one override reaches every
  component, neutral ghost and outline buttons, radios, sliders and toggles
  included: `neutral` (today: the text, with painted surfaces naming the text
  too through the derived `surface-ink` knob, which a scoped override also
  switches at runtime), `surface` (the default: the text, and surfaces name
  their paint), `accent` (the accent's ink, so hovers lean on the accent). A
  `var()` substitutes where the token is declared, so the state tokens
  themselves stay text-based; the ink travels as its own property, read where
  the film is drawn.
- **`foldkit-mixins-ui`: in-place menu, listbox and combobox panels draw in the
  top layer.** `Anchor.topLayer` wraps an upstream anchor Mount when its config
  says `portal: false`: it shows the panel as a manual popover around the
  Mount’s own acquire and hides it once that Mount releases, keeping the
  Mount’s name, args and Messages, and does nothing on an element without the
  `popover` attribute or where the popover API is missing. Those panels carry
  `popover="manual"` and `inset: auto` (the anchor writes only `left` and
  `top`, and the browser's `inset: 0` opened them at the viewport's far edge
  right to left); no stacking context or ancestor `overflow` reaches them,
  and the anchor positions them as before. The Menu's submenus and the
  Menubar's menus are drawn this way too. An unstyled panel keeps the
  browser's popover border, padding and `Canvas` fill, which every recipe
  replaces. Panels that relocate through an upstream portal keep upstream’s
  behavior, since moving a shown popover hides it again. The popup recipes
  take a `width` axis: `trigger` replaces the panel's 14rem minimum with its
  trigger's width (`min-inline-size: var(--button-width, 14rem)`), the
  default for Combobox, and `auto` keeps it, Listbox's default. Popover,
  Tooltip, Hover Card and DatePicker panels, modal `<dialog>` and arrows stay
  where upstream draws them until upstream owns top-layer mounting (their
  Mounts attach inside upstream views).
- **`foldkit-mixins-ui`: a `Menu` component, by a button, at a point, or
  down a submenu, over the Menu adapter.** `Menu.init(id, rows, {
  isAnimated?, isModal? })` (a row with `items` hosts a submenu, one level
  deep; `isAnimated` marks the menu's and its submenus' panels for the
  recipe's fade), folded with `Menu.update`, drawn with `Menu.view({ model,
  rows, buttonContent, onMessage, opensAt?, direction?, isRowDisabled?,
  mixins, submenuMixins? }, h)`, the style one of its `mixins`. `opensAt:
  'point'` with `Menu.target(onMessage, h)` on the area is the context menu:
  a right press records its point and the `contextmenu` after it opens the
  menu there. `Selected` names the value and the submenu it came from.
  `Menu.fluid` glides the highlight; `Menu.overlayBars` draws the overlay
  bar. The panel adapter (`Menu.toView`, `Menu.resolve`) stays for a
  `@foldkit/ui` Menu the application folds itself, for typed items or
  groups, and `Menu.drawAtPoint(point, h)` as its `draw` with
  `Menu.pointTarget({ onPress, onOpen }, h)` on the area opens one at a
  point (give its anchor `gap: 0`). `MenuSlots` gains `label`, `sub` and
  `chevron`, and `scrollBar` and `scrollThumb` drawn while a panel has a
  `scroll`. One recipe, one pattern, one gallery page.
- **`foldkit-mixins-ui`: one date system: `Calendar.Selection`.**
  `Single`, `Range` or `Multiple`, owned by the application
  (`Calendar.empty(mode)`; fold each `SelectedDate` through
  `Calendar.picked`, which orders a range's ends; `Calendar.isComplete`
  says when a picker may close). Draw inline by spreading
  `Calendar.inputs(selection, mixins, { h })` into upstream's view inputs:
  its `toView` (`Calendar.toView(selection, mixins, { h })`) marks each
  chosen day (`data-range-start`, `data-range-end`, `data-in-range` on a
  range's band), the grid of a Range or Multiple selection is
  `aria-multiselectable`, and its `maybeSelectedDate` agrees with the marks.
  In a popover, `DatePicker.update(selection)` keeps the panel open while
  the day leaves the selection unfinished, and `DatePickerView.view` takes
  `selection` and `triggerContent(selection)` in place of
  `maybeSelectedDate`; under `name` each chosen day is a hidden input of its
  own, so `FormData.getAll(name)` reads a range's `[start, end]`. The
  gallery's Calendar and Date picker pages show one day and a range.
  Breaking: `Calendar.toView` takes the selection first.
- **`foldkit-mixins-ui`: one `Slider`, for a number or a `{ low, high }`
  range.** `Slider.view({ id, label, value, onChange, … }, h)` takes either
  kind, and `onChange` is handed the same kind. Both are native
  `input type="range"` thumbs, so the drag, the keys, right to left and the
  form value are the browser's: one number is a thumb across the whole
  track, named by the label; a range is two thumbs in a group, each bounded
  by the other (`Slider.moved` snaps, bounds and orders a range, as the APG's
  multi-thumb slider). `marks` dot values on the track (`data-filled` where
  the fill covers them) and `showValue` draws each value, both hidden from
  assistive technology. `Recipes.Slider` serves both, in Fluid
  Functionalism's look: `track: 'thick'` (the default, the fill reaching
  each thumb's far edge) or `'thin'`, and `value: 'above'` or `'inside'` (a
  pill thumb). `Patterns.Slider` is the pattern. Breaking: `@foldkit/ui`'s
  Slider is no longer adapted (`Slider.resolve`, `Slider.toView` and
  `ResolvedSlider` are gone, and `SliderSlots` is the new view's, with slots
  `root`, `label`, `control`, `track`, `fill`, `mark`, `value` and
  `thumb`); an application hosting that Submodel draws it with Slots of its
  own. `orientation: 'vertical'`, `ticks`, labelled `marks` (`{ value, label
  }`) and the recipe's `value: 'end'`, `track: 'paint'` and `label: 'hidden'`
  are the view's too; upstream's Escape-to-cancel and read-only mode are
  lost.
- **`foldkit-mixins-ui`: one `Alert`, inline or a banner.** `Alert.view` takes
  `layout: 'inline'` (a live region for something that just happened:
  `role="alert"` when `assertive`, `role="status"` otherwise) or
  `layout: 'banner'` (a full-width strip there on load: a `section` landmark
  named by `label`, never a live region). Both take an optional icon, now
  `aria-hidden`, a title and description, `actions` (each a link or a button
  that sends a Message) and a dismiss button (`onDismiss`, `dismissLabel`).
  The root writes `data-layout` and `data-dismissible`, and the banner keeps
  room for the dismiss button only when it has one. `Recipes.Alert` gains
  an `emphasis` axis (`subtle`, the default, or `bold`) and the slots
  `actions`, `action` and `dismiss`; `Patterns.Alert` is the pattern, and
  the gallery's Alert page shows both layouts. Breaking: `layout` is
  required (write `layout: 'inline'` where an alert stood alone).
- **`foldkit-mixins-ui`: Menubar, Menu, TreeView, Resizable and a
  horizontal Listbox take `direction?: 'ltr' | 'rtl'`, and under `'rtl'`
  ArrowLeft and ArrowRight swap.** A view cannot read the page's direction,
  so these components moved the wrong way right to left: a submenu opened on
  ArrowRight away from where it was drawn, and a split's handle grew the
  panel the arrow pointed away from. Each view now translates the two arrows
  before building its Message (as Zag's `getEventKey` does), so Messages and
  `update` stay in reading order, and draws the direction as its root's
  `dir`, so the CSS reads what the keys read; the Menu's submenu opens on
  the left with its chevron pointing there, and Resizable reverses a drag's
  horizontal movement. Tabs, RadioGroup and Calendar, whose arrows upstream
  bundles handle, take `Tabs.readingKeys`, `RadioGroup.readingKeys` and
  `Calendar.readingKeys` beside the style: a Mount that reads each arrow by
  the element's `:dir()` before upstream's handler does, opt-in because a
  Scene test must resolve every Mount with a Message. `Segmented.fluid`,
  `Tabs.fluid` and `Nav.fluid` measure their indicator again when a `dir`
  changes.
- **`foldkit-auth`, `foldkit-ssr`: a request with no `Origin` is taken by
  Fetch Metadata.** `AuthServer.resolver` and `SSR.entry`'s `origins` read
  `Sec-Fetch-Site: same-origin` in place of a missing `Origin` (a
  same-origin `GET`), as they already did for `Origin: null`, and still
  refuse a request with neither. The auth README says why the check rests on
  the origin rather than on `SameSite` or a token.
- **`foldkit-mixins-ui`: toggles on the ladder, and Fluid's switch.** A
  checkbox, radio or switch with no size stands on the ladder's icon rung
  (16px, 14px compact) instead of defaulting to `md`. The switch is a 34×20
  track with a 16px thumb (its height a quarter over the toggle's edge, its
  track 1.7 of that), and its thumb stretches 2px into a pill under the
  pointer, growing back from the far end when on. Breaking: an unsized toggle
  no longer means `md`, and the switch is larger than its old 29×16.
- **`foldkit-mixins-ui`: an icon, a dialog and a tooltip on the systems.** An
  Icon with no size stands on the size ladder (16px, 14px compact) instead of
  defaulting to `md`; a dialog is one notch narrower in a compact region (10%,
  as Fluid Functionalism's 400px to 360px); and a tooltip drawn with
  `isAnimated` fades in on the fast tier, sliding 4px toward its trigger from
  the side it opens on. Breaking: `Recipes.Icon({})` no longer means `md`.
- **`foldkit-mixins/theme`, `foldkit-mixins-ui`: states as tints, and
  concentric corners.** `Theme.oklch` gains a `state` group, what a state lays
  over the surface under it as a mix of the element's own text color
  (`hover`, the see-through `tint` and `tint-hover`, and `edge`, a hairline
  inside an image), with its amounts as knobs; and `Theme.nested(outer,
  inset, border?)` gives the radius of a surface inset in another. The menu,
  popover, pagination and calendar hovers read `state.hover` instead of the
  muted surface, which vanished on a page of that surface; the neutral button
  is see-through; avatar and card images carry the edge; and a popup's rows,
  a segmented option and a pill tab round concentrically inside their
  container. Breaking: a popup's panel has the `xl` radius, and the recipes
  read `state.*`, which a palette made without `Theme.oklch` must define.
- **`foldkit-mixins/theme`, `foldkit-mixins-ui`: six type roles.** A `type`
  token group and `Theme.role(name)`: `display`, `title`, `subtitle`, `body`,
  `caption` and `micro`, each a size and a whole-pixel leading that step with
  the size ladder, after Fluid Functionalism's (body at 14px on 20). The
  recipes set text by role (controls `body`, badges and tooltips `caption`,
  keycaps `micro`, dialog titles `title`), tab and segmented labels are
  trimmed to their capitals, a field's text is 16px on a coarse pointer
  so iOS does not zoom into it, and Typography takes the roles as levels.
  Breaking: `control.text` is gone (read `Theme.role('body')`), and dialog,
  empty-state and card titles are smaller.
- **`foldkit-mixins/theme`, `foldkit-mixins-ui`: one size ladder.** After
  Fluid Functionalism's: a `control` token group holds the two ends (36px and
  28px controls, with their padding, gap, inset and icon), a `step` knob
  chooses between them, and `Theme.ladder(name)` writes the blend, read on the
  element that uses it, so `--fk-knob-step: 1` on a toolbar makes everything
  in it compact, a menu it opens included while the panel stays in the page
  (`portal: false`). Buttons, fields, selects, tabs,
  segmented controls, table rows, calendar cells and the rows of a menu,
  listbox or combobox all stand one rung tall, so a popup's row lines up with
  its trigger. Breaking: a recipe's `size` only sets the step on its own
  element (`sm` compact, `md` default, `lg` a half step up at 40px), and no
  recipe defaults it any more, so an unset size follows the region. The
  popups' `size` sets it on their `wrapper` and their panel (which upstream
  portals by default), Tabs' on the `tablist`.
  Segmented's sizes are `md`, `sm` and `xs` (24px).
- **`foldkit-mixins/theme`: three motion tiers, and reduced motion keeps the
  fades.** `motion.fast`, `moderate` and `slow` are 80, 160 and 240ms, each with
  an exit a tier quicker (`fast-exit`, `moderate-exit`, `slow-exit`, eased by
  `ease-exit`), after Fluid Functionalism's springs. A `travel` knob multiplies
  the durations of what moves or resizes, and `Defaults.reset` sets it to 0
  under `prefers-reduced-motion` instead of zeroing every transition, so a
  highlight snaps to its row while its fade still plays. The recipes' gliding
  overlays share one transition (hover on `fast`, a chosen marker on
  `moderate`), and the switch's thumb travels on `moderate`. Breaking:
  `motion.normal` is gone (read `moderate`, or `slow` for a loop's period), and
  a transition of a transform written outside the recipes no longer snaps
  under reduced motion unless it multiplies by `knob.travel`.
- **`foldkit-mixins/theme`: the surface contrast knob reaches 2.5 times as
  far, and defaults to 26%.** At its top it moved a muted surface four points
  of lightness, which read as doing nothing; the default look is the one 65%
  drew. Breaking: a theme that sets `surfaceContrast` divides it by 2.5 to keep
  its look (`'60%'` is `'24%'`).
- **`foldkit-mixins/theme`: `radius.full` squares off where `radius-factor` is
  0**, as a boxy theme's pills should; at any other factor it is a pill.
  `Recipes.Badge` rounds by `radius.xl`, so the radius knob reaches it, and
  `Recipes.Avatar` is a disc at the default factor, rounder squares below it.
- **`foldkit-remote-server`: `RemoteServer.memory`'s `principal` is optional
  for every principal type.** It is only who `layer` answers as: without it,
  and with a principal type that does not admit `undefined`, the backend is a
  `MemoryServed` (its store and `server`, no `layer`), for serving through
  `serveFetch` or `handlers` as each request's principal. Code that omitted it
  for such a type used to fail to compile; it now has no `layer` to call.

- **`foldkit-mixins-ui`: `Card` is pressable, selectable and dismissible.**
  `press` (`{ onClick }` or `{ href, external? }`) stretches one button or link
  over the card, named by `label` or the title; `selected`, `disabled`,
  `dismiss`, an `image` and a `media` tile are new, `content` is optional, and
  the view takes the application's Message. Breaking: `action` sits at the end
  of the header rather than the footer, so a card that put its button in
  `action` puts it in `footer`. The recipe adds `orientation` (`stacked`,
  `inline`) and `surface` (`outlined`, `elevated`, `filled`, `plain`) axes and a
  `compact` padding, and its padding is one private `--_fk-card-pad`.
- **`foldkit-mixins-ui`: `DatePicker.toView(mixins, draw)` hands `draw` the
  date picker's builder.** Breaking: it took a context with a builder, which an
  application had no way to give for the date picker's own Message;
  `DatePickerView`'s `toView` input is called with that builder too.
- **`foldkit-mixins-ui` peers on `foldkit-primitives`**, for `Card.group`'s
  highlight.
- **`foldkit-mixins-ui`'s stateless views take the application's builder.**
  `Alert`, `AspectRatio`, `Avatar`, `Badge`, `Breadcrumb`, `ButtonGroup`,
  `Empty`, `Icon`, `Item`, `Kbd`, `Label`, `ScrollArea`, `Separator`,
  `Skeleton`, `Spinner`, `Table` and `Typography` are generic in the Message,
  where they took `HtmlBuilder<never>`, so what they hold can send one: an empty
  state's button, a badge in a pressable card. A call with no Message is
  unchanged.

### Fixed

- **`foldkit-mixins-ui`: an unknown Progress holds still under reduced
  motion.** The reset runs every animation for 0.01ms there, so the ring's
  quarter arc stood at a random angle each frame, and the bar's sweeping
  fill stopped near its last frame, mostly outside the track. The ring now
  stands still, as a Spinner's does, and the bar's fill rests faint across
  the track, as it does with no `travel`. Moving stripes, which slid at
  random the same way, stand still too.
- **`foldkit-mixins-ui`: a loading Toast's ring holds still under reduced
  motion.** It breathed instead, and the reset's 0.01ms made the breath
  flicker; it now stands still, as every loading ring does.
- **`foldkit-mixins-ui`: the Questionnaire's "Other" label reads as an
  option.** The other field's label was the Input's, which a text answer's
  question also uses, so it looked like a question heading. Its words are now
  in a new `otherLabel` Slot, which the recipe draws as the options' labels.
- **`foldkit-mixins-ui`: Cascade Select's columns stay on a phone's screen.**
  At 390px the popup's columns ran past the window's edge. When the popup
  opens, `PlaceCascade` measures whether a column per level of the deepest
  path fits the window, and the columns layout drills in when it does not
  (the Model's new `cramped`, sent as `Placed({ cramped })`). The panel is
  capped to the window too, so one narrowed while open scrolls its columns.
- **`foldkit-mixins-ui`: the Angle Slider's needle clears the value in the
  middle.** It ran from the center to the thumb, straight through "45°" or
  "1 of 4"; it now stops 2em of the value's type short of the center, and
  runs to the center only when the value is drawn below the dial.
- **`foldkit-mixins-ui`: the Image Cropper shows its image.** The recipe hid
  the image under any ancestor without `data-ready`, `body` included, so it
  stayed hidden after loading; the image now carries the mark itself.
- **`foldkit-mixins-ui`: Steps and the Navigation menu at a phone's width.**
  In a narrow Steps row the current title ran over the next connector; it
  is now cut with an ellipsis, and the connectors shorten so a short word
  stays whole. A dot marker's dot sat above its connector, pushed up by the
  hidden number's row. A Navigation menu trigger's chevron, squeezed in a
  narrow row, drew as a slanted tick; it keeps its size. A panel's groups,
  a fixed row of 12rem columns, ran off a phone's screen; they wrap.
- **`foldkit-mixins-ui`: the Popover's arrow can be seen.** It was drawn,
  but as an 8px square in the panel's own fill and faint line, half of it
  showing in the gap: a nub too slight to see. The Popover's arrow is now
  `space.sm` across (`arrow`'s new `size`) and its panel 12px off the
  trigger, so the arrow crosses most of the gap.
- **`foldkit-mixins-ui`: TagsInput keeps keys typed fast out of the tag just
  added.** Keys typed before the emptied input was drawn joined the tag
  Enter had just added.
- **`foldkit-mixins-ui`: display fixes in a dark scheme.** A chosen card and
  a Card Group's highlight no longer read as sunken; a card's "New" badge
  sits on its title's line; a Separator and a Skeleton show on a dark page.
- **`foldkit-mixins-ui`: rows, pills and highlights follow their container's
  corner.** A menu's, listbox's or combobox's highlight and chosen marker,
  a Command's rows, a Menubar's triggers, a Segmented option's pill and
  hover, and a pill Tabs' chosen pill and hover kept a fixed radius that did
  not meet the panel or tray around them. Each container now publishes its
  corner with `Theme.nests`, and they read `Theme.nested()`.
- **`foldkit-mixins-ui`: InputCopy's focus rings follow the group's corners.**
  The input's and button's inset rings were square inside a rounded group
  that clips, so their outer corners were cut off; they now round those
  corners to the group's inner radius.
- **`foldkit-mixins-ui`: Steps line up, and fit a phone.** Each step's text
  was centered on its marker, so a step with a description stood its title
  higher; titles now start on the marker's middle line, and the connectors
  sit on that line too. A horizontal row takes its container's width and,
  below 32rem of it, shows only the current step's label (the others stay
  for a screen reader), where every label had overlapped the markers.
- **`foldkit-mixins-ui`: Pagination fits a narrow row.** At 390px "Previous"
  ran into the "1" beside it; the row now wraps and centers, and Previous
  and Next have room either side.
- **`foldkit-mixins-ui`: an Alert stacks its title over its description.**
  Side by side, a narrow alert squeezed its title into a column of single
  words. The icon keeps its own column beside both.
- **`foldkit-mixins-ui`: a Hover Card no longer moves its trigger.** The
  Anchor writes `top` and `left` but no `position`, so an unportaled card
  stood in the line beside its trigger and the centered row shifted; the
  anchored placement now takes the panel out of the flow.
- **`foldkit-mixins-ui`: a Segmented option's words sit centered.** The
  `text-box` trim on the option ended at the hidden semibold copy after the
  words, its last line, so only their top was trimmed and they stood 2.5px
  high. `Segmented.view` now draws the words in a new `label` Slot that
  holds the trim; an option drawn by hand with a `data-label` should do the
  same.
- **`foldkit-mixins-ui`: smaller centering fixes.** The Checkbox's check
  sits a pixel lower, on center, and is placed physically like its sides;
  a Kbd's line is trimmed to its capitals with the height given back as
  padding; a radio centers on the first line of a label beside it in a row
  aligned to its top (`calc((1lh - edge) / 2)`).
- **`foldkit-mixins-ui`: Progress's indeterminate bar sweeps right to left
  under `dir="rtl"`.** The fill starts at the inline start but moved by a
  physical `translate`, so right to left it appeared mid-track and slid off
  the wrong side; a mirrored keyframe now runs under `:dir(rtl)`, with the
  same timing, so reduced motion still holds it still.
- **`foldkit-mixins-ui`: the Switch works right to left.** Its thumb starts
  at the inline start but moved by a physical `translate`, so right to left
  it slid off the far side; it now moves left there.
- **`foldkit-mixins-ui`: the RadioGroup recipe stacks a vertical group.** The
  group was a row whatever its `aria-orientation`, and upstream's groups are
  vertical by default; it is now a column unless `aria-orientation` is
  `horizontal`. The README and the skill now say to draw each option as a
  `label` around its radio, since upstream's label bundle carries only an id
  and a bare label took no press (the gallery's did not).
- **`foldkit-mixins-ui`: a Skeleton bar shows in a container that sizes to
  its content.** Its `inline-size: 100%` resolved to nothing there (a
  centered column, a flex item), so the bar computed 0px wide and the
  gallery's skeleton showed nothing. A bar now has a `4rem` floor.
- **`foldkit-mixins-ui`: chevrons point the right way right to left.** The
  Accordion's, Sidebar's, TreeView's and Menu submenu rows' chevrons and the
  Carousel's arrows drew their two sides with logical borders, which mirror
  under `dir="rtl"`, so a shut row's chevron pointed up and the arrows
  pointed up and down. They and the Steps check now share `cornerSides`
  (physical sides), and the Sidebar gains the right-to-left turn it lacked.
- **`foldkit-mixins-ui`: a Sidebar section's links and a TreeView group's
  rows hold still while they open.** The heading row stretched into the room
  the opening grid left mid-transition, so the rows below it dropped (about
  16px in the Sidebar) and rose back.
  Sidebar and TreeView now share one `opensBelow` piece that keeps rows at
  the top (`align-content: start`).
- **`foldkit-mixins`: injected styles keep the page's layer order.** The
  `<style>` a draw injects carries the page's own `@layer` order first. It
  carried none where the page had one, so once it stood ahead of the page's
  sheet (a test's or an application's sheet put in after it), its
  `@layer components { … }` made `components` the first layer, under the
  reset, and a button's text fell back to the reset's 16px.
- **`foldkit-mixins-ui`: a badge squeezed in a row keeps its words inside it.**
  The page reset floors every element's `min-width` at 0, so a badge in a
  narrow row shrank under its unwrapped text, which ran into the next one.
- **`foldkit-mixins-ui`: `Recipes.Dialog` centers the open panel.** `@foldkit/ui`
  draws the open dialog over the whole viewport, so the panel sat at its top.
- **`foldkit-mixins-ui`: `Recipes.Slider` keeps a track wide enough to drag**
  (12rem at least) in a row or a centered box, where it shrank to its label.
- **`foldkit-mixins-ui`: a menu, listbox or combobox marks the row the keys
  are on.** The shared popup row styled only `:hover`, so moving by the keys
  showed nothing; it now reads upstream's `data-active`, and the focused panel
  draws no browser ring around itself. A row's hover is a tint of its text, which
  reads in a dark scheme, where the muted surface was all but the panel's own.

## 0.21.0

Authentication through Yielded Auth. `foldkit-auth` 0.1.0 is new;
`foldkit-remote` 0.18.0, `foldkit-remote-server` 0.14.0, `foldkit-sync`
0.12.0, `foldkit-guard` 0.3.0, `foldkit-agent-mcp` 0.7.0, `foldkit-ssr` 0.7.0,
`foldkit-site` 0.4.0 and `foldkit-plus` 0.3.0 for the changes below, and
`foldkit-primitives` 0.10.2 for a corrected doc comment; every package that
pins one of them republishes with a patch to re-pin.

Five changes can break code written for 0.20:

- `serveFetch`'s and `defineDocumentHost`'s `resolvePrincipal` returns an
  Effect, refusing with `RemoteUnauthenticated`; a resolver that throws is a
  500, where it was a 401 carrying its message.
- `foldkit-agent-mcp`'s `authenticate` returns an Effect refusing with
  `AgentMcp.unauthenticated()`, where it returned the principal or `undefined`.
- `Guards.declare` requires `unguarded: 'allow' | 'deny'`.
- `SSR.entry` throws for a plan with a server fallback and no `origins`.
- `Remote.http` reads every 401 as `Unauthenticated` and every 403 as
  `Forbidden`, whatever the body says, so a view that compared other tags for
  them sees these instead.

### Added

- **`foldkit-sync/journal`: `documentHost`, a document's Sync host for any
  runtime.** It answers an upgrade request before a socket opens: refused
  with the `Response` to send (401 for a refused principal, 500 for a
  resolver, layer or journal that broke), or accepted with `serve` for the
  opened socket and `abandon` for one that never opens, with `revalidate`,
  `opens`, `admit` and `settle` as `defineDocumentHost` has them, and
  `layer` required exactly when the resolver needs a service. `defineDocumentHost` is now built on it,
  and a runtime without `WebSocketPair` is a 500 that resolves no one.

- **`foldkit-auth`: the client repeats whom it was answered as.**
  `AuthServer.answered(config)` (the resolver's config, with its `key`) is
  `serveFetch`'s `headers`, naming each answer's principal in
  `x-foldkit-subject`; `believing()` from `foldkit-auth` is a `fetch` for
  `Remote.http`/`httpWithLive` that repeats it, so once another tab switches
  account a read is refused with `SUBJECT_CHANGED` rather than answered as
  the new account. Any 401 makes it believe no one, and an answer to a
  request sent before it (or before `forget()`, for this tab's own sign-in
  and sign-out) is not believed. The subject is URI-encoded.

- **`foldkit-remote-server`: `serveFetch` takes `headers: principal => …`,**
  added to every answer to that principal, a live stream's included.

- **`foldkit-auth` (early, 0.1.0): a Yielded Auth session as the principal.**
  `AuthServer.resolver({ auth, http, principal })` from `foldkit-auth/server`
  is a `resolvePrincipal` for `serveFetch`: it reads the session cookie Yielded
  set (named from the same `Http.make` options), verifies it with the
  application's `Auth` service, and builds the principal with the
  application's `principal`. No cookie is a visitor; a cookie on a request
  without a trusted `Origin` and Yielded's CSRF header, a cookie that no
  longer verifies, two session cookies, or an `x-foldkit-subject` header
  naming someone else is a 401 `Unauthenticated`; `http` naming something
  that is not an origin throws at once. With `requests: 'browser'` it serves
  what a browser sends on the page's behalf, `defineDocumentHost`'s upgrade
  or a posted form, where a trusted `Origin` alone vouches for the cookie,
  since neither carries a CSRF header; `SUBJECT_HEADER` and `subjectSaid`,
  from `foldkit-auth`, are what a client sends. Also re-exported as
  `foldkit-plus/auth` and `foldkit-plus/auth/server`, an optional peer.

- **`foldkit-sync`: `defineDocumentHost` takes `layer: env => Layer` for its resolver.**
  `resolvePrincipal` may need a service (a session store), which `layer`
  provides; it is required exactly when the resolver needs one, built per
  upgrade, kept while the socket is open for `revalidate`, and closed at once
  for a refused upgrade.

- **`foldkit-site`: `access`, who may be shown a page.** A node's `access:
  { allow, otherwise }` covers it and the nodes below it;
  `Site.accessOf(site, route, who)` answers `Access.Allowed`, `Pending`
  while `who` is unknown, or `Denied({ url })` with `otherwise`'s address for
  what was asked. Presentation for the client and a server's 303; the server
  guards the data regardless. An `otherwise` whose target the same rule
  covers throws (a sign-in page mounted under it would loop with a growing
  `returnTo`), and a rule in a node's options names its reader's type.

- **`examples/auth`: Yielded Auth end to end.** Password sign-in and
  sign-out through Yielded's own client and routes, a guarded notes list
  (an admin reads every note, a member their own, a visitor none), `Me` for
  "signed in as" and an admin line, and a change of principal carried to the
  other tabs; a notes page `Site.access` sends a visitor away from, server
  rendered as the request's reader; a Sync board whose socket is opened
  with the session cookie, served on Node by `documentHost`; unit, mutation
  and Chromium e2e tests, the e2e across two tabs and a server restart.

- **`foldkit-remote`: `RemoteData.denied(error)`,** the denial a failure
  was, a `Denied` (`Unauthenticated` or `Forbidden`, with the server's
  `reason`; not a mutation's `refusal`), typed,
  or none for any other failure: a `RemoteError`'s `_tag` is open, so a view
  had to compare strings to tell "sign in again" from "could not load".

- **`foldkit-guard`: `Me`, the visitor as an Entity.** `Guards.me(G, {
  interactions })` declares one row, `me`, that everyone reads and no one
  writes: `signedIn`, `key` (the principal's declared `key`) and `may` for the
  named interactions; `GuardServer.me(Me, Policy)` serves it, counts for
  `validate` as applying its rules, and refuses a Policy of another set when
  it is made. `Guards.anyone` is the rule everyone passes, a visitor
  included, for a public surface under `unguarded: 'deny'`: a surface naming
  it restricts no one, for Sync documents and shared fields too, and
  `Guards.all` now takes at least one rule. `Policy.key` is `declare`'s `key`
  (`G.key`), for a seam holding the Policy. `AuthServer.resolver` takes
  `key: Policy.key` to compare `x-foldkit-subject` with it.

- **`foldkit-ssr`: a posted form's own resources.** `SSR.entry` takes
  `resources: request => Layer` and `SSR.handle` `resources: Layer`, built
  once for the post and provided to the Commands its fallback runs beside the
  config's `resources`; where both provide a service, the post's is used, so
  a Command reads as who posted. `SSR.entry`'s `origins` names where a form
  may be posted from: any other `Origin` is a 403 before the body is read or
  `flags` and `resources` run (`Origin: null` counts as the site's own when
  `Sec-Fetch-Site` says `same-origin`), and a plan with a server fallback
  made into an entry without `origins` throws, since a post runs `flags` and
  every `resources` as whoever posted.

- **`serveFetch` and `defineDocumentHost` take `revalidate: { every, key?
  }`.** While a live stream or a socket is open, the resolver is asked again,
  of the request it opened with: a refusal ends the stream with
  `Unauthenticated` (an `event: error` frame the client reads back as it) or
  closes the socket with 4401, and a principal whose `key` (as `liveHub`'s,
  `Policy.keyOf` with guards) changed ends the
  stream as a live error, or closes the socket with 1012, to be opened again
  as the new principal. A revoked session stops being served within one
  interval; the clients do not yet tell these closes apart, so a replica
  reconnects after a 4401 too, and is refused at the upgrade.

- **`foldkit-guard`: `Policy.provide(context)`,** a Policy whose bodies have
  the services they need provided, for the read seams
  (`GuardDrizzle.visible`, `GuardServer.memory`, `GuardSync`), which take a
  Policy needing nothing more. A seam built from it counts as built from the
  Policy it came from, for `GuardServer.validate`.

- **`foldkit-remote`: `RemoteUnauthenticated`** (`_tag: 'Unauthenticated'`,
  with an optional `reason`), the refusal of a caller who could not be told,
  beside `RemoteForbidden`; `RemoteJsonAnswer` carries it as
  `unauthenticated: { reason? }`. `foldkit-remote-server`'s
  `RemoteServer.unauthenticated(reason?)` makes one.

- **`foldkit-remote`: every call kind fails with `Unauthenticated` on a
  401.** Reads, queries, mutations and live streams declare it in their RPC
  errors and `RemoteClient`'s types; `Remote.http` and `liveFetch` read a 401,
  Remote's own (with its `reason`) or one from middleware in front of it, as
  it, and `Data.mutation`, `ReadFailed` and `QueryFailed` carry
  `error._tag: 'Unauthenticated'`. `Data.satisfy` and `prefetch` can fail with
  it, for a server render to answer as it answers a lost session.
  `foldkit-remote-server`'s `answer` sends a handler's as a 401, and
  `serveFetch` ends a live stream with it as an `event: error` frame the
  client reads back.

### Changed

- **`foldkit-agent-mcp`: `authenticate` is an Effect.** `authenticate:
  request => Effect<Principal, Unauthenticated>`, so it may ask a token store;
  where it returned `Principal | undefined`. Failing with
  `AgentMcp.unauthenticated(reason?)` (or Remote's `RemoteUnauthenticated`,
  of the same shape) is a 401 carrying `reason`; a defect or a throw is a 500
  that says nothing to the caller and is logged. Wrap
  a plain lookup: `request => Option.match(lookup(request), { onNone: () =>
  Effect.fail(AgentMcp.unauthenticated()), onSome: Effect.succeed })`.

- **`foldkit-guard`: `Guards.declare` requires `unguarded`.** What a guarded
  Entity's surface with no rules decides is written down rather than
  defaulted to `'allow'`. Pass `unguarded: 'allow'` to keep what an omitted
  one did; `'deny'` refuses such a surface. Anything else, an omission from
  a caller without types included, throws at `declare`.

- **`serveFetch` and `defineDocumentHost` resolve the principal with an
  Effect.** `resolvePrincipal: (request, env) => Effect<P,
  RemoteUnauthenticated, RP>`, where `serveFetch`'s `layer` provides `RP` too,
  so a resolver can read a session store; the layer is built once per request.
  A refusal is a 401 (`serveFetch`'s body `{ error, unauthenticated: { reason?
  } }`); a resolver that throws or dies is a 500 that says nothing, where a
  throw used to be a 401 carrying its message. Wrap a plain value:
  `resolvePrincipal: request => Effect.succeed(actorOf(request))`.

### Fixed

- **`foldkit-primitives`' broadcast doc no longer says a tab never hears
  itself.** `postBroadcast` posts on a channel of its own, so the posting
  tab's `broadcastMessages` hears it; name the sender in `data`.

- **A Remote Message's error is a `RemoteError`.** `RemoteError.reason` is
  `string | undefined`, as the decoded `ReadFailed`/`QueryFailed` error is,
  so `RemoteData.denied(message.error)` type-checks under
  `exactOptionalPropertyTypes`.

- **`serveFetch` keeps a live stream's layer open while it streams.** The
  request's `layer` was closed as soon as the response was built, so a live
  stream's re-reads, and its `revalidate` passes, ran on released resources:
  a layer holding a connection pool failed every one. It now closes when the
  answer is sent, or, for a live stream, when the stream ends or the client
  leaves. A defect while a stream runs ends it with an `Internal error`
  frame rather than a broken body, and `revalidate.every` must be longer
  than zero.

- **`Remote.http` reads every 401 as `Unauthenticated` and every 403 as
  `Forbidden`.** A body with an `unauthenticated` or `forbidden` key in a
  shape other than Remote's (`true`, a number for `reason`) was decoded as
  an answer and failed as a broken one. Remote's own refusal is taken as it
  is; anything else is the status, with no reason.

- **`defineDocumentHost` stops serving a socket before it closes it for
  `revalidate`.** A worker's socket fires its own close only when the
  replica answers, and exchanges in flight until then were still appended as
  the principal just refused. A resolver that throws, rather than fails or
  dies, is a 500 too, and `revalidate.every` must be longer than zero.

## 0.20.0

`foldkit-entity` 0.10.0, `foldkit-form` 0.6.0, `foldkit-bundle` 0.8.0,
`foldkit-surface` 0.10.0 and `foldkit-remote` 0.17.0 for the changes below;
every package that depends on one of them republishes with a patch to re-pin.
`foldkit-metadata` and the three rich-text model packages are unchanged.

Three changes can break code written for 0.19:

- A predicate or ordering term over another Entity than the query's no longer
  compiles.
- An `own` update in an assembly with `Data.wiring` no longer receives Remote's
  Messages, so arms that handled them are excess.
- A test that matched a form's check as an instance by `args: { key }` matches
  `form.Check` instead.

### Added

- **`foldkit-entity`: a predicate over another Entity is a compile error.**
  Each `Expr` constructor's result carries the names of the Entities its
  fields belong to (`Reads<Names>`, type-only), and `Query.where` refuses a
  query from another: `a predicate reads Comment, but the query is from Post`.
  `Order.asc`, `desc` and `chosen` do the same for `Query.orderBy`. The
  run-time check stays for a predicate typed plainly as `Predicate`. New
  public types: `Reads`, `ReadsOf`, and `Invalid`, which declarations naming
  these steps reach.
- **`foldkit-form`: `form.Check`, the Command a key's check runs as.** A
  definition (`Command.define('<form>.check', …)`) rather than an inline
  Command, so a test resolves it with `Command.resolve(form.Check, …)` instead
  of hand-building `{ name: '<form>.check', args: { key }, effect }`. Its args
  now carry the draft, the values and the subject too, so a test that matched
  the old Command as an instance by `args: { key }` matches it no longer: match
  `form.Check`, which compares by name.
- **`foldkit-form`: `Form.input(schema)`, a plain form's input.** A form that
  writes no Entity (a sign-up, a search, a login) took `Entity.define` and
  `Entity.input` over the same schema; `Form.make('Search', Form.input(Search))`
  is that in one call. The ports of Foldkit's form, auth and job-application
  examples use it.

### Changed

- **`foldkit-bundle`: a wiring's own tags leave the parent's own update.**
  `Wiring` takes a `Claims` parameter typing `handles`, and
  `assembly.update(own)` hands `own` a Message without the tags a wiring claims
  and does not share. Remote's wiring claims every `RemoteMessage` tag, so an
  `own` no longer needs `if (Remote.reduces(message))` to narrow them away, and
  one that matches exhaustively fails to compile when `Data.wiring` is removed
  from `assemble`. An `own` that handled Remote's tags itself now gets none.
- **`foldkit-entity`: `Expr.eq` with a plain value on the left says to put the
  field there.** The right side is typed from the left, so `Expr.eq(3, field)`
  was refused with `'number' is not assignable to 'Operand<any>'`; it now
  reads `Expr.eq takes the field on the left and the value on the right`.

### Fixed

- **`foldkit-form`: a filled optional key not checked yet is refused, not left
  out.** `engine.value` counted an optional key whose draft was filled by
  `fill` but not yet validated as valid, and gave the value without it. Such a
  draft must now pass its own check. A submit was never affected: it validates
  every unchecked key first.

## 0.19.0

Every package with a Foldkit peer now asks for Foldkit 0.168, so each of them
takes a minor version, as do `foldkit-entity` 0.9.0 (`and`, `or`, `not` and
comparisons), `foldkit-remote-drizzle` 0.12.0 (compiling them),
`foldkit-guard` 0.2.0, `foldkit-durable` 0.9.0 and `foldkit-react-codegen`
0.3.0 (TypeScript 6 as well as 5). Republished to re-pin: `foldkit-cms-drizzle`
0.6.3 and `foldkit-remote-server` 0.13.3; `foldkit-richtext-markdown` 0.2.1
widens a dependency. `foldkit-metadata`, `foldkit-richtext`,
`foldkit-richtext-code` and `foldkit-richtext-code-shiki` are unchanged.

Three changes can break code written for 0.18:

- Foldkit 0.168 itself: an application moves with it, renaming what 0.166 and
  0.167 renamed (`read` for `toChildModel`, `persistentEntry`, the `Dom`
  stream helpers).
- `GuardServer.validate` refuses at startup a query body that filters or orders
  by a member with a Read rule.
- A Behavior whose Mount fails no longer takes the element's other Behaviors
  with it; it is reported and the rest go on.

### Added

- **`foldkit-mixins`: a reader's light or dark, before the first paint.**
  `Theme.schemeScript(key?)` is a head script that applies the scheme kept in
  `localStorage`; `Theme.chooseScheme(scheme, key?)` applies and keeps one
  (`'system'` removes it); `Theme.currentScheme()` reads it back. The docs site
  has an Auto/Light/Dark choice built on them.

- **`foldkit-sync`: the browser asks before leaving while an edit is unsaved.**
  `Sync.mount` shows a durable edit before it is stored; a reload in between
  lost it. From the first such edit until the last is stored, `beforeunload`
  asks the reader first.

- **Public types a dependent's declarations need.** A library built on these
  packages could not emit declarations under TypeScript 7 for a value whose
  inferred type reaches a type it cannot name. The package indexes now export
  them: `foldkit-mixins` `AttributeName`, `EventName`, `RequirementName`,
  `HiddenOf` and `SlotRecipe`; `foldkit-bundle` `PlacedBy`, `CollectionBy`,
  `WithoutResources` and `RuntimeResult`; `foldkit-agent` `CapabilitiesByName`,
  `CapabilitiesByTag`, their `Any` forms, `DefinitionOf` and `AnyCompletion`;
  `foldkit-data-grid` `EditableId`. An interface that shares its namespace's
  name is exported as a shape: `CapabilityShape`, `SlotViewShape`,
  `BundleShape`, `JournalShape`.

- **`foldkit-guard`: `GuardServer.validate` refuses a query body that filters
  or orders by a member with a Read rule.** The row comes back without the
  member, but which rows match, and in what order, still tells what it holds;
  with comparisons a client could bisect it (`cost < $max`).

- **`foldkit-entity`: `Expr.and`, `Expr.or` and `Expr.not`.** The connectives,
  with SQL's three-valued meaning: `or` takes true over unknown, `and` false,
  and `not` of an unknown stays unknown, so a null matches neither a
  comparison nor its `not`. `and` and `or` need an operand and flatten one of
  the same kind. `Expr.whenGiven(input, given => predicate)` is a filter that
  applies only when a nullable input is given. `evaluate` runs them, and
  `decided(predicate, input)` is a predicate's truth from the input alone,
  when it reads no field. The conformance suite covers them.
- **`foldkit-entity`: comparisons, `Expr.lt`, `lte`, `gt` and `gte`.** Numbers
  compare as numbers; text only under `Collation.binary` or `asciiFold`
  (declared on the field or passed) and against a field, refused where it is
  written otherwise, since backends order text by different defaults. A value
  compares in its encoded form, so a date stored as an ISO string is text. The
  evaluator compares as `orderBy` does, and the conformance suite covers them.
- **`foldkit-remote-drizzle`: comparisons compiled,** the column first however
  the body wrote it, and text under its collation as keyset paging applies one
  (`collate "C"` on Postgres, `collate binary` or `nocase` on SQLite).
- **`foldkit-remote-drizzle`: `and`, `or` and `not` compiled,** and an operand
  that reads no field decided per request, so `whenGiven` compiles to `true`
  when its input is null and to the predicate alone when it is given, with no
  parameter for the check.

### Changed

- **TypeScript 7.** The workspace typechecks and builds with TypeScript 7.0.2,
  the native compiler (a forced typecheck takes under a minute). Its DOM
  library declares the Navigation API, so `foldkit-primitives` no longer
  declares its own. `foldkit-react-codegen` peers on `typescript@>=5.7.2 <7`
  rather than exactly 5.9.3: it reads source through the compiler API, which
  TypeScript 7 does not ship.
- **Foldkit 0.168.** Each package with a Foldkit peer asks for `foldkit@^0.168.0` (and
  `foldkit-mixins-ui` on `@foldkit/ui@^0.168.0`), since they use what 0.166 and
  0.167 renamed: a lifted child is read as an `Option` (`read`, not
  `toChildModel`), the entry factories end in `Entry`
  (`Subscription.persistentEntry`, `Port.subscriptionEntry`), and the DOM
  Stream helpers are `Dom`'s (`Dom.streamFromEventFilterMap`,
  `Dom.streamFromKeyBindings`; `KeyBinding` and `KeySequence` come from
  `foldkit/dom`). The examples build with Vite 8 and `@foldkit/vite-plugin`
  0.27.
- **Effect 4.0.4.** The workspace builds and tests against `effect@4.0.4` and
  its `@effect/*` packages at the same version. Published packages still peer on
  `effect@^4.0.0`, and `foldkit-durable` now depends on
  `@effect/sql-sqlite-node@^4.0.0` rather than exactly `4.0.0`, so an
  application chooses its 4.x. `examples/livestore` moves to
  `@livestore/livestore` 0.5.0-dev.1, which peers on `effect@^4.0.3`, so the
  workspace holds one Effect.
- **`foldkit-mixins`: one Behavior's failing Mount no longer stops the others
  on its element.** The resolver merges an element's Mounts into one, and from
  Effect 4.0.2 a merge ends when any stream in it fails, so a `Measure` without
  a `ResizeObserver` took the canvas's `Targets` with it. Each fails alone now,
  reported as Foldkit reports a Mount (`[OnMount Name] unhandled failure`).

### Fixed

- **`foldkit-remote` depends on `foldkit-metadata`,** which its declarations
  name (`import("foldkit-metadata").MetadataKey`). Without the dependency the
  declaration build copied metadata's types into remote's; TypeScript 7
  refuses that, and the copy was a second set of the same types.
- **`foldkit-sync`: `foldkit-remote` is an optional peer again.** The manifest
  declared `peerDependenciesMeta` twice, and the second, naming only
  `foldkit-durable`, replaced the first.
- **`foldkit-durable`: a database it cannot open fails as a `JournalError`.**
  From `@effect/sql-sqlite-node` 4.0.1 opening the file can fail with a
  `SqlError`, which escaped the journal's declared errors.
- **`foldkit-mixins`: `Theme.oklch`'s doc said a knob overridden on any
  subtree re-derives the palette.** A custom property resolves where it is
  declared, so tokens on `:root` reach a subtree already resolved; the knob
  re-derives them only on the element that declares them (`:root`, a
  `Theme.scoped` selector, or a subtree that declares the theme itself).

## 0.18.0

`foldkit-site` 0.2.0, `foldkit-remote` 0.15.0, `foldkit-primitives` 0.9.0,
`foldkit-mixins` 0.10.0, `foldkit-mixins-ui` 0.9.0, and `foldkit-builder` and
`foldkit-mixins-builder` 0.2.0 for the changes below, and `foldkit-plus` 0.1.0,
published for the first time. Republished to re-pin: `foldkit-cms` and
`foldkit-cms-drizzle` 0.6.2, `foldkit-crud` 0.7.2, `foldkit-data-grid` and
`foldkit-mixins-data-grid` 0.1.4, `foldkit-mixins-crud` 0.6.6,
`foldkit-mixins-form` 0.5.2, `foldkit-mixins-richtext` 0.2.4,
`foldkit-remote-drizzle` 0.11.2, `foldkit-remote-server` 0.13.2 and
`foldkit-sync` 0.10.2, each of which pins a bumped package. Every other
package is unchanged.

Two changes break code written for 0.17 (under Changed): a Site node's
`shortcut` is now a `KeySequence`, and a Builder's keys go through
`keyPressed`.

### Added

- **`foldkit-remote`: `Data.preload`, prefetch from `update`.** `satisfy` as a
  Command for a destination the reader has not reached (a hover over a link):
  it reads what the given Surfaces read in the Model you give it and yields one
  new Message, `Preloaded`, carrying the Messages that wrote it, so they reduce
  into the live Model as it is by then. It never fails, and refuses a Surface
  of another application when the Command is made. `Remote.fold` lifts it.

- **`foldkit-site`: head metadata from the tree.** A node's `meta` (a function
  of its route and the Model, returning `foldkit-ssr`'s `Meta`) and `indexed`
  flag, on `Site.route` or the `Site.node` builder. `Site.metaOf(site, route,
  model)` merges the route's chain root first, a deeper node's field replacing
  its ancestor's, the preview title falling back to the node's `title`, and an
  unindexed route `noindex`; it is an SSR plan's `meta` as it stands.
  `Site.indexedOf` reads the flag, which a node inherits from the nearest
  ancestor that declares it. `foldkit-ssr` is now a dependency, for the type.
- **`foldkit-site`: every address, and both directions, from the tree.**
  `Site.paths(node, list)` lists a node's addresses from an Effect (with when
  each last changed), and `Site.targets(site, paths)` lists the whole site in
  tree order for a build, a sitemap or prefetch, refusing a node with params
  left unsaid. A tree's type now carries its routes: `Site.parse(site,
  NotFound)` is the application's URL parser and `Site.hrefOf(site, route)`
  builds an address back, refusing a route no node holds.
  `Site.routeAt(site, url)` is the route at an address, or `None` where no
  node takes it.
- **`foldkit-site`: `Site.shortcuts`, key bindings from the tree.**
  `Site.shortcuts(site, toMessage)` is every node's shortcut as a
  `Subscription.keyBindings` binding sending the Message made of its
  landing target, refusing a shortcut with no landing or keys used twice.
- **`foldkit-primitives`: `pointedLinks()`** in `foldkit-primitives/dom`, the
  address of each same-origin link the reader points at or tabs to, once
  while they stay on it: the trigger for reading a page ahead.
- **`foldkit-site`: `Site.routing`'s `arrived`.** What the application does
  once a new route is set and its routed pages are told, such as moving
  focus to what it drew; an echo of the shown address runs nothing.

- **`foldkit-plus`: every package in one install, and `npx foldkit-plus setup`.**
  Each package's entry points are re-exported by subpath (`foldkit-remote/port`
  is `foldkit-plus/remote/port`), the namespaces most applications use from the
  root, and an adapter that needs a library of its own (React, Drizzle, Shiki,
  `@foldkit/ui`, Agent Native) is an optional peer, so none of those libraries
  is installed with it. `setup` prints, for the project it runs in, how to
  install Effect, Foldkit and Foldkit Plus with that project's package manager,
  which `effect` or `foldkit` version is wrong or missing, the agent skill, and
  which package does which job, written for a coding agent to follow.

- **`foldkit-mixins`: code colors in `Theme.oklch`.** A `syntax` group colors
  each kind `foldkit-richtext-code` and `foldkit-richtext-code-shiki` name
  (`syntax-keyword` reads `--fk-syntax-keyword`), in hues the palette already
  has, readable in both schemes; `syntaxChroma` sets how colorful.
- **`foldkit-mixins-ui`: `CodeBlock`.** Code with a title or language, line
  numbers and a copy button, its tokens (a `foldkit-richtext-code` tokenizer's
  `{ from, to, kind }`) drawn by kind and colored by `Recipes.CodeBlock` from
  the theme's `syntax` group. The block's text is the code exactly.

### Changed

- **`foldkit-builder`: a shortcut is judged in `update`.** The layers and the
  canvas send `KeyPressed` for every key a command binds
  (`PageBuilder.keyPressed`), and `update` runs `keyCommand` against the Model
  as it is: a key pressed before the frame that drew a new selection deleted
  nothing, or the node selected before it. A bound key with nothing to do
  now has its default held back on those two. A view drawing a Builder by hand
  attaches `keyPressed` where it attached `keyCommand`, and a Builder handed
  to `foldkit-mixins-builder`'s views must offer `keyPressed` too.
- **`foldkit-site`: `Site.routing` loads a link its tree does not hold.** A
  tree is one application's document, so a click on an address of this
  origin that no node takes is a full load, where it was a Navigate Command
  that could only draw the application's NotFound.
- **`foldkit-site`: a node's `shortcut` is a Foldkit `KeySequence`.** Write
  a sequence as an array (`['G', 'H']`, where it was `'GH'`) and one press as
  a string (`'/'`, `'Mod+K'`), as `Subscription.keyBindings` names keys.

## 0.17.1

`foldkit-entity` 0.8.1, `foldkit-remote-drizzle` 0.11.1 and
`foldkit-mixins-form` 0.5.1 for the fixes below. Republished to re-pin:
`foldkit-builder` and `foldkit-mixins-builder` 0.1.2, `foldkit-cms` and
`foldkit-cms-drizzle` 0.6.1, `foldkit-crud` 0.7.1, `foldkit-data-grid` and
`foldkit-mixins-data-grid` 0.1.3, `foldkit-form` 0.4.3, `foldkit-guard` 0.1.1,
`foldkit-mixins-crud` 0.6.5, `foldkit-remote` 0.14.1, `foldkit-remote-server`
0.13.1 and `foldkit-sync` 0.10.1, each of which pins a bumped package. Every
other package is unchanged.

### Fixed

- **`foldkit-mixins-form`: a locked key is posted with scripts off.** It was
  drawn `disabled`, and a browser leaves a disabled control out of a form post,
  so a locked required key was missing and the save failed to decode; its
  value is also drawn as a hidden input.
- **`foldkit-entity`, `foldkit-remote-drizzle`: NUL is refused in `eq` and
  `in`, as in `contains`.** Given text holding one, the evaluator and SQLite
  answered while Postgres failed the request; every interpreter now refuses it
  as the query's own error.

## 0.17.0

`foldkit-agent` 0.7.0; `foldkit-bundle` 0.6.0; `foldkit-cms` 0.6.0;
`foldkit-cms-drizzle` 0.6.0; `foldkit-composition` 0.2.0; `foldkit-crud` 0.7.0;
`foldkit-durable` 0.8.0; `foldkit-entity` 0.8.0; `foldkit-mixins` 0.9.0;
`foldkit-mixins-form` 0.5.0; `foldkit-mixins-ui` 0.8.0; `foldkit-primitives`
0.8.0; `foldkit-remote` 0.14.0; `foldkit-remote-server` 0.13.0;
`foldkit-remote-drizzle` 0.11.0; `foldkit-ssr` 0.5.0; `foldkit-surface` 0.8.0;
`foldkit-sync` 0.10.0; `foldkit-data-grid` and `foldkit-mixins-data-grid` 0.1.2.
New: `foldkit-guard` and `foldkit-site` 0.1.0. Republished to re-pin:
`foldkit-agent-a2a`, `foldkit-agent-mcp` and `foldkit-agent-native` 0.5.2,
`foldkit-agent-webmcp` 0.6.1, `foldkit-builder` and `foldkit-mixins-builder`
0.1.1, `foldkit-bundle-surface` 0.3.2, `foldkit-form` 0.4.2, `foldkit-mirror`
0.5.2, `foldkit-mixins-crud` 0.6.4, `foldkit-mixins-richtext` 0.2.3,
`foldkit-mixins-surface` 0.5.3 and `foldkit-richtext-dom` 0.3.1, each of which
pins a bumped package. Every other package is unchanged.

**Who may do what is declared once, and Remote places rows instead of
refetching them.** `foldkit-guard` declares guards on the shared domain and
enforces them on every seam: reads compiled into SQL, declared writes and
handlers checked before they land and answered as their writer may see the
row, Sync's cell edits, live updates and agents, with a startup check that
refuses a Source left unguarded. A write is declared as data (`Write.update`,
`insert`, `delete`) and served with no handler. A list whose query body
declares its order has a change placed in it with no request, checked against
the server under `verifyPlacement`. `foldkit-site` states a routed site's
topology once. And a review of this release's work fixed the ways a write or a
read could get past its rules, lose another author's edit, or send the server's
SQL to a client.

### Upgrading from 0.16

- **`journalExchange`'s `refuse` is `admit`** (`foldkit-sync`), which answers as
  `authorize` does and may be an `Effect`; `opens` refuses a connection whole.
  `defineDocumentHost` takes both as functions of the principal, and its
  `settle` is `(env, journal) => Effect`.
- **`foldkit-sync/entity`'s overlay helpers are gone** (`overlay`, `held`,
  `newlyHeld`, `settled`, `shows`): `RemoteEdits` from `foldkit-sync/remote`
  shows the edits through Remote.
- **`Remote.visibleItems` is `Data.visibleItems(remote, connection)`**
  (`foldkit-remote`), which draws a list as its reads do.
- **An `OrderTerm` is tagged `Term`, and a body's `orderBy` holds `Ordering`s**
  (`foldkit-entity`): an interpreter resolves `Query.orderFor(body, input)`
  first. `foldkit-remote-drizzle` refuses an `orderBy` beside a body that
  declares its order.
- **`Cms.slugTaken` and the `CmsConflict: ` / `CmsSlugTaken: ` message prefixes
  are gone** (`foldkit-cms`): read a refusal with `Data.refusal`
  (`Cms.refusal.field`, `Cms.refusal.conflict`).
- **`CmsServer.make` takes a guard set** (`foldkit-cms-drizzle`): `policy` and
  `authors` for `isAuthor`, `transitions` beside `allow`, and each `content`
  entry its guarded `entity`; `published(column, isAuthor)` is gone, bind with
  `GuardDrizzle.visible`. `Transaction` may fail with a `RemoteServerError`.
- **`LiveHub.deleted` may fail and needs the Sources' services**
  (`foldkit-remote-server`), as `changed` does; it re-reads each subscriber's
  selection rather than deleting for all.
- **`returning.row` fails with a `RemoteServerError`** (`foldkit-remote-drizzle`)
  when the database refuses it; run a handler's own statements through
  `runStatement`.

### Added

- **`foldkit-remote-server`: fields every principal reads alike skip the live
  hub's re-read.** A Source declares `shared` (`RemoteServer.entity`,
  `RemoteServer.memory` per entity, `foldkit-remote-drizzle`'s `source`);
  `hub.changed(ref, fields, values)` sends a shared field's given value to
  each subscriber as it is and re-reads the rest, and the handlers give it a
  declared write's answer, the row as stored (a handler's answer is still
  re-read). A shared field the Source does not serve is refused when it is
  made. `foldkit-guard`: `GuardServer.validate` refuses a shared field a Read
  rule could tell readers apart by.
- **One editor for create and edit.** `foldkit-entity`: an `Option`-typed
  input key maps itself to the field its value fits, as a nullable one does,
  so an input's id may be `Schema.OptionFromNullOr(PostId)`. `foldkit-crud`'s
  editor then saves a blank form with `Option.none()` and an opened one with
  its id. `foldkit-guard`: `GuardServer.mutation`'s `id` may answer an
  `Option`, and `none` is a create, checked against the row's `Create` rule.
- **`foldkit-agent`: `authorize` may refuse with a reason.** It answers
  `{ allowed: false, reason }` (an `AuthorizationDecision`) beside a boolean,
  and the reason is the `AgentAuthorizationError`'s message.
  **`foldkit-guard`: `may` carries explained refusals.** Its answer gains
  `reasons`, the sentence an `explain` gave each row interaction it refused,
  read with `May.reason`; `GuardAgent.authorize` refuses with it, so an
  agent learns why as a client's write would.
- **`foldkit-entity`, `foldkit-remote`: a list is fetched, not placed, when
  a row changes what the server's read rule filters on.** `ReadFilter.of(members)`
  is Entity metadata naming the members a server filters rows by under a rule
  the client does not run; `foldkit-guard`'s `attach` declares it from the
  row's Read rules. Remote gathers it per Entity name when the domain is
  defined (`registry.filtered`), so a query declared over the Entity before
  the rule was attached still sees it, and a row a list does not hold that
  changes one invalidates the list. A row it holds is judged by the body as
  before.
- **`foldkit-remote-drizzle`: a `visible` rule may answer with an `Effect`,
  and is given its own binding.** `(principal, self) => SQL | undefined |
  Effect<SQL | undefined, RemoteServerError>`, so a rule that must ask
  something first (a guard's body) can, and one written before `bind` names
  columns through `self.columns`. Every path a table is read by applies it as
  before.
- **`foldkit-remote-drizzle`: `source(binding, { filter })`**, the
  per-record read plan `RemoteServer.entity` takes, passed through. A source
  and a `query` carry their binding's `visible`, for a startup check.
- **`foldkit-agent`: `withPrincipal(key)`**, the principal's type taken from
  the Context key a server reads it from (`G.Principal`), so the agent's and
  the server's are one type. `withPrincipal<P>()` stays.
- **`foldkit-crud`: an editor locks the keys its row's reader may not set.**
  `Crud.editor(name, { form, mutation, locks })` loads the members `locks`
  selects beside the form's, and `editor.at(...).locked(model)` names the
  form's keys whose member (or relation) `locks.locked` refuses, for
  `foldkit-mixins-form`'s `locked`. Nothing is locked for a new one, or
  before the row is loaded. `foldkit-guard`'s `May.locks` is one.
- **`foldkit-mixins-form`: keys drawn but not editable.** The view input
  `locked: ['ownerId']` draws those keys `disabled`, every control kind (a
  many picker's choices included), for a key the person may not set. A key in
  a nested row is not locked by it, and a Bundle-backed key draws as its
  Bundle does.
- **`foldkit-remote`, `foldkit-remote-server`: a refusal of who is asking,
  end to end.** A mutation Source fails with `RemoteServer.forbid(reason?)`;
  the wire carries it as `RemoteForbidden` (`_tag: 'Forbidden'`, `reason`
  only when given), `RemoteServer.answer` sends it as a 403 with
  `{ error, forbidden: { reason? } }`, and `Remote.json` reads it back. A 403
  whose body is not Remote's answer, from middleware in front of the server,
  fails a mutation as `Forbidden` and any other call with the status.
  `Data.mutation` is `Failed` with the `Forbidden` error, and `RemoteError`
  carries `reason`.
- **`foldkit-remote-server`: a principal read from Context on each call, and
  a live hub keyed by person.** `RemoteServer.handlers(server, principal)`
  takes a Context key for `principal` as well as a value, read by every read,
  query, mutation and live subscription, so one handler set (one RPC layer)
  answers every request and authentication provides the key per request; the
  key is added to what the handlers require. `RemoteServer.liveHub(sources,
  { key })` shares a re-read between subscribers whose principals have one
  key, read as the first of them; without one, only the same value shares.
- **`foldkit-remote-server`, `foldkit-remote-drizzle`: a write answered as its
  writer may now see the row.** `EntityWriter.read`, when a writer has one,
  reads a row as a principal may see it; `RemoteServer.write` answers through
  it, and a row the write hid from its writer answers in `deleted`. A Drizzle
  `writer` over a binding with a `visible` rule reads through it. A writer may
  fail with `RemoteForbidden`. A declared write's Source carries `writes`,
  the Entity and the writer, for a startup check.
- **`foldkit-remote-server`: `EntitySource.visible` and
  `QuerySource.visible`**, the rule that decides which rows a source returns,
  as it was given one. The server never runs it; a startup check such as
  `GuardServer.validate` reads it. `RemoteServer.memory`'s sources carry its
  `readable`.
- **`foldkit-remote-server`: what a principal sees, per record and per row.**
  `EntitySource.filter(principal, fields)` returns a read plan: the fields to
  read (the allowed ones, and any the decision needs) and `apply`, one record
  as the principal sees it; a member it drops is settled like one the Source
  did not return. It runs for reads by id and live patches. `RemoteServer.memory`
  takes `filter` per entity, as it takes `authorize`, and `readable` (given a
  lookup of another row by id), which
  hides a row the principal may not read from reads by id, from every query,
  and from relations (a `one` ref reads `null`), as a binding's `visible` does.
- **`foldkit-guard`: a guard set declared once, decided on the server, and
  enforced on every seam.** `Guards.declare(name, PrincipalSchema, guard => ({ … }), { key })`
  names principal guards (bodies only on the server, through `G.implement`,
  which must cover each one) and row guards (an `Expr` over one Entity's
  fields, the principal's fields as `principal.*` inputs). `Policy.decide` is
  an `Effect` of `true`, `false` or `{ allowed: false, reason }`; a visitor is
  `Option.none()`. `G.Principal` is the server's Context key for who is asking.
  `Guards.attach(G, { row, interactions, members, relations, always })`
  attaches guards to an Entity per surface and interaction (`Write` for all
  three writes; one the application names, `Interaction.make('Archive')`,
  under `interactions: { [Archive.key]: … }`), as metadata:
  a list is a disjunction, `Guards.all` a conjunction, `always` is ANDed
  after every surface, and `Guards.on` with `redact` or `explain` chooses a
  refusal other than the surface's default. A member the Entity lacks, a row
  guard over another Entity, a guard of another set, or a redacted value of
  the wrong type is a type error. `Guards.matrix` prints every surface and
  `Guards.guardFields` names what a row interaction's guards read.
  A visitor passes no row guard that reads a principal's fields, and does
  pass one over the row alone (`isPublished`).
  `Policy.readable(entity, principal)` decides a principal's read rules into a
  `Condition` over the row, every principal guard asked once; `Condition.holds`
  runs it over stored values, and `Policy.readMembers` decides each member's
  own Read rule with its refusal. `foldkit-guard/server` enforces them:
  `GuardServer.memory(Policy, entities)` gives `RemoteServer.memory` its
  `readable` and `filter`, so a refused row is absent from reads, queries and
  relations (an inherited Read decided by the related row's own rules) and a
  refused member is withheld or redacted; `GuardServer.filter` is a Source's
  `filter`. `foldkit-guard/drizzle`'s `GuardDrizzle.visible(Policy, entities)`
  compiles the row's Read rules into each binding's `visible`, an inherited
  Read as a subquery over the related table's own rule, checked when built
  (the inherited Entity listed and ruled, no loop). A relation's Read rules
  are decided over its parent row, as a member's are, and withhold the
  relation where they refuse; over Drizzle, member and relation Reads are the
  Source's `filter` (`source(binding, { filter })`).
  `GuardServer.validate(Policy, { entities, domain, server })` checks at
  startup that every guarded Entity's Source, and each query listing it,
  applies the rule and filter those seams built for it from that Policy, and
  throws naming each that does not. `RemoteServer.handlers(server,
  G.Principal)` reads who is asking per call, and `Policy.keyOf(principal)`
  names a principal by every field its rules may read, a visitor included,
  for a live hub's `key`. `Policy.writable(entity, principal, interaction)`,
  `Policy.writeMembers` and `Policy.linkable` decide write rules the same way,
  a body told which interaction it is asked about.
  `GuardServer.writer(entity, Policy, writer)` checks them on a declared
  write before it lands: an update or a delete reads the row first as its
  writer may see it (a hidden row's update is refused, its delete changes
  nothing), the row's rule must hold over the row and, for an update, over it
  as it would be after; each member set needs its own rule, each relation
  pointed elsewhere its `Unlink` and `Link`; a create is checked over what it
  proposes, an unset field matching no guard. A refusal is `Forbidden`, with
  an `explain`'s sentence. `presets` (`{ ownerId: user => user.id }`) sets a
  field from who is asking on every create, before the rules are checked;
  an input that sets one is refused, and a visitor has none to give.
  `GuardServer.validate` also refuses a declared write of a guarded Entity
  that does not land through the `GuardServer.writer` built for it.
  `GuardServer.mutation(M, { entity, policy, interaction, id, source }, run)`
  is a handler's Source with the row's rule for `interaction` (a named one
  such as `Archive.key` included) checked over the row `id` names, read
  through the guarded `source`, before `run` is given it; with no `id`, of
  who is asking alone. Each row of the Entity its answer carries is read
  back through `source`, one the handler hid from its writer answered as
  deleted. `Guards.may` adds a derived member, `may`, which
  `GuardServer.filter` answers per row as its reader sees it: the row's
  `Update`, `Delete` and named interactions, each member's own `Update`, each
  relation's `Link` and `Unlink`. `May.can`, `May.canSet` and `May.canLink`
  read it on the client, a member or relation following the row's `Update`.
  It is a hint read with the row; the write is checked when it is made.
  `May.locks(entity)` is `foldkit-crud`'s `locks` for it.
  `foldkit-guard/agent`'s `GuardAgent.authorize` and `GuardAgent.available`
  gate a `foldkit-agent` capability on the `may` of a row the Model holds,
  refusing until it is answered.
  `foldkit-guard/sync` rules `foldkit-sync/entity`'s cell edits:
  `GuardSync.document(edits, { readers })` is a document's audience, refused
  where it is declared when an edit could reach a reader its rows hide it
  from; `GuardSync.authorize` is a journal `authorize` of the principal's own
  guards, under its lock; `GuardSync.admit` and `GuardSync.opens` are an
  exchange's `admit` and `opens`, reading each edited row through the
  Entity's guarded Source.
- **`foldkit-entity`: `Expr.in(value, among)`, whether a value is one of a
  list**, written out or given as an input. SQL's `in` in every interpreter:
  a null value is unknown, so is no match against a list holding a null, and
  an empty list matches no row. The reference evaluator runs it (and is
  checked against SQLite's own `in`), `foldkit-remote-drizzle` compiles it for
  SQLite and Postgres (an empty list as `false`, which Postgres needs), and
  the TanStack example runs it. The conformance suite gains eight cases. The
  first slice of `guard-DESIGN.md`, whose membership rules need it.
- **`foldkit-remote`: `verifyPlacement`, a placement checked against the
  server.** `Remote.make({ verifyPlacement: true })` places as usual, fetches
  each list it placed an answer, a read or a live patch in too, and keeps any
  disagreement between the order placed and the server's first page in
  `remote.placementMismatches` and `Data.inspect`. Pending edits are not
  checked.
- **`foldkit-remote`: `placeIn`, where a row falls in a loaded list.** By the
  body's declared order: before an edge, at a segment's end that closes the
  list, `Outside` what is loaded, or `Unknown` with why. A list whose body is
  placeable reads the fields its body filters and orders by, for it.
  `foldkit-entity` exports `compareRows`, the evaluator's comparison of two
  rows under an order.
- **`foldkit-entity`: `Order.chosen`, a sort the input picks, declared in the
  body.** `Order.chosen(input.sort, { title: Post.fields.title })` maps each
  name a `{ by, direction } | null` sort can hold to a field, and a name
  without one does not compile. `Query.orderFor(query, input)` resolves it to
  fixed terms; the evaluator, `foldkit-remote-drizzle`'s compiler and the
  in-memory server sort by it, and impact judges a list by the field its own
  input chose. The conformance suite has chosen-order cases.
- **`foldkit-entity`: a text field declares how it orders, and a query says
  whether a client can order as the server does.** `Collation.binary`,
  `.asciiFold` and `.locale(name)`, attached with `Collation.of` or on a term
  (`Order.asc(field, { collation })`); an id is `binary` by default. The
  reference evaluator compares text by code point (it compared UTF-16 code
  units), folds ASCII under `asciiFold` and refuses a locale;
  `foldkit-remote-drizzle` compiles each, in the order and the keyset; TanStack
  and LiveStore honour `binary` and refuse what they cannot say.
  `Query.placement(query, input)` is `Placeable` or `NotPlaceable` with why.
  The conformance suite orders text under `binary` and `asciiFold`.
- **Where rows without a value go is said, and agreed.** An `OrderTerm` has
  `nulls: 'first' | 'last'`, last ascending and first descending by default
  (`Order.asc(field, { nulls })` to change it). The reference evaluator places
  nulls by it instead of refusing them; `foldkit-remote-drizzle` compiles it as
  `NULLS FIRST`/`NULLS LAST` and pages by it. That fixes paging over a nullable
  column on SQLite, whose `ORDER BY` put nulls first while the keyset predicate
  assumed last.
- **`foldkit-entity`: every resolved order is total.** `Query.orderFor` ends
  it on the Entity's id unless the terms already read it, so ties break the
  same way on every interpreter; the evaluator used to leave them in row
  order while SQL broke them by id.
- **`foldkit-sync/remote`: a replica's cell edits as Remote overlays.**
  `RemoteEdits.make(Data, Edits).reconcile(model, edits, replica)` shows each
  edit its row has not reached, holds one the journal absorbed while the
  cached row is below it, and lifts it once a read reaches it, returning the
  newly `held` and the `replaced`. `shown` lists them for a cell's marks;
  `clear` lifts them for a reset. `foldkit-remote` is an optional peer.
- **`foldkit-sync`: `Sync.mount`'s `afterUpdate`** runs after every live
  update, durable and reinstall included, and never in replay, for local state
  derived from the shared slice.
- **`foldkit-remote`: `Data.overlays(model)`**, the ids `overlay` shows now, in
  drawing order.
- **`foldkit-remote`: a broken live stream restarts itself.** A transport
  failure or a gap restarts the live entry after Sync's backoff (50 ms,
  doubling to 5 s, ±20% jitter; `retryBase` and `maxRetryDelay` in the
  subscriptions options). It resubscribes from its cursor and refetches what
  the stream covers, since no server replays what it missed.
  `Data.liveStatus(model, active)` is `Idle`, `Live` or
  `Reconnecting { attempt, error }`, for a view.
- **`foldkit-remote`: `Data.persistence` keeps the cache across reloads as one
  wiring.** It restores the snapshot stored under `key(model)` from a
  `KeyValueStore`, keeping what the Model already holds, and saves the cache
  under that key after each change (debounced, bounded by `maxBytes`). It saves
  only once that key's own snapshot is in, so startup never writes the empty
  store over it. `Hydrated` takes an optional `from`, the key it came from, and
  `RemoteModel.restoredFrom` records it.
- **`foldkit-remote-drizzle`: `applyEdits(binding, { live })` publishes what
  the journal applies.** Each edit it wrote is told to the hub (the member and
  the revision); one the row had passed is not.
- **`foldkit-remote-drizzle`: a retried guarded write does not conflict with
  itself.** When a write's guard misses, the writer reads the row: one
  revision past the expected one with exactly these values means it landed,
  and the row answers. A guarded delete of a row already gone succeeds.
  `EntityWriter.delete` answers `'deleted' | 'absent' | 'moved'`.
- **`foldkit-crud`: an editor over a write that `expect`s a revision follows
  it.** After its own save is applied, the form takes the revision the save
  moved the row to, so its next save is not a conflict with itself; a revision
  moved by another client reads as the new status `Moved`, the draft kept.
- **Declared inserts and deletes.** `Write.insert(input, { id })` writes a row
  under an id the client chose and `Write.delete(input, { id, expect? })`
  deletes one; `Mutation.write` takes any kind (it was `Mutation.update`, and
  `RemoteServer.update` is now `RemoteServer.write`). An insert retried finds
  its row and answers it; a delete of a row already gone succeeds; a delete
  from a moved revision is a conflict. `EntityWriter` gains `insert` and
  `delete`, and remote-drizzle's `writer` implements both.
- **A declared write points a `one` relation.** `Write.update` takes a key
  mapped with `Relation.input` to a `one` relation; `Write.bind` returns it in
  `links` as a ref (or none). Remote patches it as the ref key
  (`patchOfWrite`), and remote-drizzle's `writer` sets the foreign key.
- **`foldkit-remote-drizzle`: `applyEdits(binding)`, a journal's `apply`.** One
  committed cell edit written to the member's column with its sequence as the
  revision, never moving a row back. The registry example's hand-written SQL
  and column list go; its `ProductTable.apply` returns an Effect.
- **`foldkit-crud`: an editor over a declared write sends only what changed.**
  With a `Mutation.write` mutation, a save names the input keys whose value
  differs, by each key's schema, from what the form was filled with; Remote
  shows them until the server answers. `EditorModel` gains `filledWith`, and
  `DomainLike.mutate` an options argument.
- **`foldkit-remote-server`, `foldkit-remote-drizzle`: a declared write needs
  no handler.** `RemoteServer.write(mutation, writer)` serves a
  `Mutation.write`: the input bound to its write, only the keys the client
  named, written through an `EntityWriter` and answered as the row's patch.
  `writer(binding)` is one `update ... returning` on the binding's table; a
  write that `expect`s a revision is guarded by it and moves it on in the same
  statement, so the second of two writes from one revision is refused as a
  conflict. `MutationSource.run` receives the request's `keys`.
  `foldkit-entity`'s `Write.expected(write, value)` is that revision, encoded;
  `Write.expect` now holds its field as well as its key.
- **`foldkit-remote`: `Mutation.write(name, write)`, a mutation that is a
  declared `Write`.** `Data.mutate` shows the write bound to the input until
  the server answers, unless given its own `optimistic` list. The new
  `keys` option narrows that to the input keys an author changed, and travels
  on `MutationRequest.keys`. `MutationDescriptor` gains an optional `write`.
- **`foldkit-entity`: `Write.update` declares what an input writes.** Over an
  `Entity.input`, it names the key holding the row's id (and optionally the
  key holding the revision it was read at) and sets every other key mapped to
  a field. `Write.writes` is what it may change; `Write.bind(write, value,
  keys?)` the row and its new values, encoded as the store holds them.
- **`foldkit-crud`: the editor shows a server's refusal.** A save refused with
  `Refusal.field(key, reason)` for one of the form's keys marks that key
  invalid with the reason, once per save; one refused with `Refusal.conflict`
  reads as the new status `Conflict`. `EditableForm` gains `controls` and
  `Message.Refused`, `EditorModel` `refusedFor`, and `DomainLike` `refusal`;
  `foldkit-remote` adds the guards `Refusal.isField` and `Refusal.isConflict`.
- **`foldkit-remote`, `foldkit-remote-server`: a mutation refuses with data.**
  `Mutation.make` takes `Refusal`, a codec of what the server may refuse with
  (`Refusal.field(key, reason)`, `Refusal.conflict`). A Source fails with
  `RemoteServer.refuse(mutation, value)`; the server checks the refusal is
  that mutation's, encodes it, and sends it on `RemoteMutationError.refusal`
  (a 422 over JSON). `Data.refusal(model, requestId, mutation)` reads it
  decoded. `MutationDescriptor` gains a fourth parameter, `Refused`, and a
  `Refusal` field; `MutationSource` a `Refusal` codec.
- **`foldkit-entity`: `Query.where` refuses predicates that expand past
  `maxQueryNodes` (1,000) nodes.** A shared node (`Expr.eq(n, n)`) is counted
  on each path that reaches it, because `evaluate` and the SQL compiler read a
  predicate as a tree: thirty nested levels were thirty-one objects and a
  billion nodes of work at every row.
- **`foldkit-entity`: `Query.dependencies` names each field's role.** Beside
  `fields`, it returns `predicate` (fields that can change which rows match)
  and `order` (fields that can change where a row sits), typed
  `QueryDependencies`. A field that filters and orders is in both.
- **`foldkit-primitives`: place a popup on a viewport point.**
  `Placing.placeAtPoint` is that point in the offset parent's coordinates.
  `placeAtTrigger` takes `at`: a point wins, and none places under the
  trigger. `OnContextMenu` carries no coordinates, so a right-click records
  its own.

- **`foldkit-data-grid`: a date column edits in a date field.** A schema
  that decodes to a date (`Schema.DateFromString`) is `CellEditor.Date`.
  The draft the field opens on is the local calendar day, `YYYY-MM-DD`.
  `toISOString` is the UTC day, so a local midnight used to open the field
  on the wrong one.

- **`foldkit-mixins-ui`: AspectRatio and Icon.** Both are a slot and a
  recipe, like Separator. `AspectRatio` holds content in a square, a 16:9
  frame, or a portrait. `Icon` hides a decorative glyph and names one that
  means something; `Icons.glyph` stays the mask for an element that already
  exists.

- **`foldkit-primitives`: place a popup once under its trigger.**
  `Placing.placeAt` is the offset under the trigger's left edge;
  `Placing.placeAtTrigger` writes `left` and `--fk-placed-top` on insert
  and clears them on release. The panel reads the variable as `top`, so
  `keepWithin` can still flip. `ListNavigation` takes `typeahead: false`
  so a search field keeps its letters while arrows still move the pointer,
  and an optional `commit` so Enter activates the current item from that
  same handler.

- **`examples/cloudflare`: the whole stack in one deployable worker.** Reads
  are Remote over D1 through `foldkit-remote-drizzle`; writes are Sync through a
  Durable Object's D1 journal, whose `settle` applies each committed operation
  (create, rename, toggle, delete) to the table Remote reads back; live is a
  polling `LiveSource` that re-reads D1 from inside the subscriber's own
  request. `pages/` is a Pages site that serves the list. It forwards
  `/remote` to that Worker and calls the Worker's Durable Object for `/sync`
  (a service binding drops the socket's replies). `pnpm demo` prints the loop
  against real workerd and
  `pnpm test` asserts it, both on miniflare over real HTTP.

- **`foldkit-sync/do`: serve one document's exchange from a Durable Object.**
  `defineDocumentHost(DurableObject, { sync, openJournal, resolvePrincipal })`
  defines the single-writer class: each accepted socket exchanges against the
  same journal, opened once on the first upgrade over D1 or object storage.
  `Sync.transport.workerSocket` wraps an accepted `WebSocketPair` end anywhere
  else. Proven in-process and, bundled, against workerd with D1.

- **`foldkit-remote-drizzle`: proven over Cloudflare D1.**
  The same reads run through `drizzle-orm/d1` with no adapter changes
  (`databaseLayer(drizzle(env.DB))`); `test/d1.test.ts` covers refs,
  collections, windowed pages, keyset queries, compiled `contains`, and
  typed writes against a miniflare binding.

- **`foldkit-durable`: the journal over Cloudflare D1 (`d1: true`).**
  D1 refuses transactions, `PRAGMA user_version`, and `VACUUM`, so the
  journal adapts when the options say so: the schema version lives in a
  `durable_meta` table (migrations are the same steps, each safe to rerun),
  commits retry on uniqueness conflicts instead of holding a write lock
  (concurrent appends still land gap-free), `appendAll` commits each
  operation on its own, snapshots replay only the prefix their cursor
  names, a tail a compaction cut short mid-read is refused rather than
  returned short, and `vacuum` succeeds without doing anything (D1
  auto-vacuums). Route appends through one writer: `Journal.make` (the
  `node:sqlite` file entry) refuses `d1: true`. Proven against a miniflare
  binding, which rejects what production D1 rejects.

- **`foldkit-mixins` theme: deeper shadows and a strength knob.** The shadow
  scale gains a `2xl` modal step (the Dialog recipe moved onto it), `lg`/`xl`
  diffuse wider instead of ringing, and every layer mixes toward transparent
  by the new `shadow-strength` knob (`100%` keeps today's look), so one
  override dims the whole elevation system. The design-system demo exposes
  the knob as Faint/Soft/Full presets in its header.

- **`foldkit-remote-server/fetch`: Remote over the Fetch API.**
  `serveFetch({ server, resolvePrincipal, layer })` is a Worker's `fetch`
  (or any `Request`/`Response` runtime): reads, queries, and mutations ride
  one `POST` each, as `Remote.http` sends them, and a live open rides one
  `POST` answered with a `text/event-stream` of `LiveChange` frames (one
  `data:` frame per change, a terminal `event: error` frame on failure).
  The principal is resolved per request and the Sources' requirements are
  provided per request from the environment
  (`layer: env => databaseLayer(drizzle(env.DB))`).
  Non-`POST`s and other paths are 404; a body that is not JSON, or not a
  request, is a 400 that reaches no handler; a throwing principal
  resolution is a 401; anything else this side breaks is a 500 that says
  nothing of it. Disconnecting interrupts the subscription.

- **`foldkit-remote`: `Remote.httpWithLive`.**
  Reads, queries, and mutations as `Remote.http` sends them, live as the
  event stream above, for `Remote.clientLayer`; abandoning the stream
  aborts the request. `Remote.http` also takes an optional `fetch`
  implementation for tests.

- **`foldkit-mixins-ui`: recipes for every remaining slot contract.**
  `Recipes.Menu`, `Listbox`, `Combobox` (one shared popup panel, rows, and
  density), `Select` (the Input control's size and variant axes),
  `RadioGroup` (checked circle in a tone), `Slider` (toned fill and thumb),
  `Toast` (bottom-right stack, accented entries), `FileDrop` (dashed zone
  that tints on drag-over), `DatePicker` (trigger and panel), `Popover`
  (trigger and sized panel), and `Tooltip` (dark pill). The popup trio share
  an internal base; the file input hides off the root because a mixin class
  beside the component's own class does not reach the element.

- **`foldkit-primitives`: viewport placing for floating panels.**
  `Placing.placeFor(rect, viewport)` (pure shift/flip geometry) plus the
  `KeepWithin` mount and `keepWithin` behavior, proven by five showcase
  islands. No timers, observers, or node relocation — inert without layout.
  Named apart from `dom`'s `KeepInView` (scrolls content into view).

- **`foldkit-mixins`: motion knob on the shared durations.**
  `knob.motion` (default `'1'`) multiplies `motion.fast`/`normal`, so a
  still theme is one scoped override and every recipe transition follows;
  `prefers-reduced-motion` still wins through the reset. The control-size
  knob stays unbuilt: no height scale exists for it to multiply.

- **`examples/widgets`: Wave A showcase, eight thin compositions, live page.**
  Toolbar (RovingTabindex + Collection), Toggle (ToggleState, no Bundle),
  ToggleGroup (single Selection), Accordion (Collection + per-item
  disclosure), NumberField (SpinValue + FieldAssociation), CheckboxGroup
  (multiple Selection over native boxes), Meter (stateless value/max), and
  Command (Collection + inline filter + ListNavigation + single Selection).
  Each with tests beside a mutation spec; one `makeElement` island per
  widget in `src/entry.ts` (`pnpm dev`, `vite build` clean); a jsdom test
  boots that same entry and answers one interaction per island. 44 tests.
  Notable finds: no `Filter.text` helper exists in source (the filter stays
  a three-line function of the Model); `Disclosure` names one pair, so N
  sections derive its attributes per item; `embed` replaces its container,
  so the test queries the drawn page.

- **Wave B (`examples/widgets`): alert-dialog, autocomplete, otp-field,
  hover-card, context-menu, menubar, navigation-menu.** Seven more thin
  compositions: explicit-response and `nonModal` Overlay policies get their
  first consumers; right-click (`OnContextMenu`) and hover (`OnMouseEnter` /
  `OnPointerLeave`) arrive as triggers; roving cells carry an OTP with a
  Backspace handoff. Pointer-exact positioning stays open. 96 tests.

- **`foldkit-primitives`: Overlay policy over the existing pieces.**
  `Overlay.modal` / `Overlay.nonModal` (or an explicit `Policy`) into
  `Overlay.behaviors(...)`, spread into the view's pipe: `DismissLayer`
  marking, `FocusScope`, and the scroll/inert mounts the policy keeps —
  nothing reimplemented. Positioning stays per-widget, presence stays CSS.
  Proved by `examples/drawer` (modal settings panel: Escape/outside-press
  dismiss through the stack, focus contained and restored).
- **`foldkit-mixins-ui`: DatePicker adapter over a view fork with a `toView`
  seam.** `DatePickerView.view` keeps upstream's Popover+Calendar composition
  (trigger face via `triggerContent`, grid via `toCalendarView`) and seams
  only the popover assembly (pinned `@foldkit/ui@0.165.0`, attributed):
  state, Messages, update, Commands stay upstream, and a parity battery draws
  both views over the same models (incl. ISO hidden inputs and a full
  day-select through the fork). `DatePicker` adapts the fork (`trigger`/
  `panel`/`backdrop` slots; the adapter is concrete over the date picker's
  own Message since the bundles mix pre-bound popover groups with plain
  attributes) with a `DatePicker` A11y pattern and catalog entry.
- **`foldkit-mixins-ui`: Combobox adapter over a view fork with a `toView`
  seam.** `ComboboxView.create`/`Multi.create` bind the upstream bundles and
  swap in transcribed markup assembly (pinned `@foldkit/ui@0.165.0`,
  attributed): single and multi share one transcription, proved by a
  three-view parity battery (incl. typing through the input, disabled
  handlers dropped, and multi staying open on select). `Combobox` adapts the
  fork (11 slots: wrapper/inputWrapper/input/toggleButton/backdrop/items/
  scroll/item/group/heading/separator) with a `Combobox` A11y pattern and
  catalog entry.
- **`foldkit-mixins-ui`: Listbox adapter over a view fork with a `toView`
  seam.** `ListboxView.create`/`Multi.create` bind the upstream bundles and
  swap in transcribed markup assembly (pinned `@foldkit/ui@0.165.0`,
  attributed): single and multi share one transcription (their Models are
  structurally identical), proved by a three-view parity battery (upstream
  single/multi plus the forks, incl. selection display, readonly, hidden
  form inputs, and multi staying open on select). `Listbox` adapts the fork
  with a `Listbox` A11y pattern and catalog entry.
- **`foldkit-mixins-ui`: Toast adapter over a view fork with a `toView` seam.**
  `ToastView.make` binds upstream's `Toast.make` for the payload and swaps in
  transcribed markup assembly (pinned `@foldkit/ui@0.165.0`, attributed):
  state, Messages, update, Commands, and Mounts stay upstream, and a parity
  battery draws both views over the same models (empty/entries/classes plus a
  full dismiss lifecycle through the fork). `Toast` adapts the fork
  (`ToastSlots`: container/entry; the dismiss control stays inside the
  consumer's `entryToView`), with a `Toast` A11y pattern and catalog entry.
- **`foldkit-mixins-ui`: FileDrop adapter, no fork needed.** `FileDropSlots`
  (`root`, `input`) with `FileDrop.resolve`/`FileDrop.toView` over
  upstream's own `FileDropAttributes` seam, plus a `FileDrop` A11y pattern
  and catalog entry. The root's drag handlers have no Event tokens, but the
  resolver still refuses a second owner by event name (proved by a test).
- **`foldkit-mixins-ui`: Menu adapter over a view fork with a `toView` seam.**
  `@foldkit/ui/menu` builds its markup internally, so `MenuView` transcribes
  its markup assembly from the pinned `@foldkit/ui@0.165.0` source
  (attributed in the module) with the missing `toView` added: state,
  Messages, update, Commands, and Mounts stay upstream, and a parity battery
  draws both views over the same models (closed/open/disabled/grouped/scroll
  plus a pointer-open click-select through the fork). `Menu` adapts the fork
  (`MenuSlots`: wrapper/button/backdrop/items/scroll/item/group/heading/
  separator; `Menu.resolve`/`Menu.toView` in the established nested-adapter
  shape), with a `Menu` A11y pattern and catalog entry. If upstream gains a
  seam, the fork goes away.
- **`foldkit-site`: incremental node building.** `Site.node(router, case)`
  returns a builder (`.title(...)`, `.section(...)`, ..., `.node`) for nodes
  annotated in steps or annotation bundles shared across nodes. Methods, not
  pipeable fragments: each stage of a pipe is a separate generic call and
  cannot infer the route, while a method already knows its node's. Named
  bundles compose through the builder's `.pipe` (or free `pipe`) with no
  annotation. Every
  step freezes, so intermediates are usable nodes too. `Site.route`'s options
  are sugar over the builder — one implementation, proved by behavioral
  parity tests.
- **`foldkit-site`: `Site.sourcesFor`, the route-level Sources for one
  destination.** `sourcesFor(site, owner, place, target.route)` is the same
  entries as `Site.sources` but only the target's chain — what a prefetch or
  SSR preparation reads, prepared caller-side with `Data.satisfy({ ...model,
  route: target.route }, active)`. Unknown tags resolve to no Sources.
  Deliberately no `SitePlan` object yet: the chain is already `Site.chainOf`,
  and head/access metadata arrive with their real consumers. Hover or
  programmatic prefetch adoption in an app is the next slice.
- **`foldkit-site`: the SSR connection, proved by composition, no new API.**
  URL → route → target Model → `Site.sourcesFor` → `Data.satisfy` → an SSR
  plan over those Sources with Remote's resume part renders the destination
  carrying its data (`packages/site/test/ssr.test.ts`): the route determines
  the route-level SurfaceSources, preparation fills them, and the envelope
  captures what they resolved. The browser takeover stays proved in
  `foldkit-ssr`.
- **`foldkit-bundle`: `Bundle.follow`, an ask that waits for its owner.**
  `follow(placed, { pending, release, ready, toMessages })` wraps an update
  result: while a pending ask waits and its owner is ready, the ask goes
  through the owner's own Messages (Commands merged after the result's own)
  and is let go. Otherwise the result passes untouched, pending kept — an
  address can ask something of a child with no Model yet, once it has one.
- **`foldkit-site` (new, 0.1.0): the deployed route topology as data.**
  `Site.route(router, case, options?)` declares one location from its Foldkit
  Router; `Site.mount`/`Site.make` freeze the hierarchy; `Site.target` builds
  the route value and URL from one declaration; `Site.chainOf`/`nodeOf` and
  `parentOf`/`ancestorsOf`/`depthOf` inspect it; `title`/`section` annotate
  once with `titleOf`/`sectionOf` readers, `landing` gives each section its
  nav address (`Site.landing`), and `shortcut` names the keys that go there;
  `Site.historyOf` declares push-vs-replace once; and `Site.sources` lowers
  surfaced nodes to `Surface.when` values for Remote, SSR, and retention. `Site.routing` is the
  link-click and URL-change lifecycle as one wiring: internal clicks navigate
  per `Site.historyOf`, external links load, URL changes set the route field
  (or touch nothing on an echo), and the application's own update guards with
  `Routing.reduces`. `Site.placement` states one routed page once — its link
  drives `placed.update` and `placed.view`, and `Site.routing` informs it
  through `changed` when its route arrives. Per-route Bundle placement stays
  per-application until the next cut.
- **`foldkit-composition`: `SurfaceBlock.families`, one family per
  Surface Block.** `SurfaceBlock.families(catalog, { from, document })` is
  every Surface Block on the page as one `Surface.each` family per Block,
  keyed by Block name with each instance keyed by its node id — for
  `Data.wiring`, `Data.subscriptions`, `Data.satisfy`, and SSR plans, wherever
  per-node requirements, retention, and coverage matter rather than one
  combined read. Fetching follows the Document, draft edits included.
- **`foldkit-ssr`: plans take `SurfaceSource`s, and coverage inspects each
  instance.** A `Surface.each` family is one entry of a plan's `surfaces`;
  the envelope carries its parent's reads with its instances', and
  `SSR.inspect` covers the parent once and each instance by key (`Member[u1]`
  with its `via` parent), so a gap names the instance. Preparation stays
  caller-composed: `Data.satisfy` the Model, then render it.
- **`foldkit-remote`: subscriptions, satisfy, and diagnostics follow
  `SurfaceSource`s.** The active record taken by `Data.subscriptions`,
  `Data.wiring`, and `Data.satisfy` accepts `Surface.each` families beside
  `Surface.at`/`Surface.when` values. A family is one record entry whose read
  unions its parent's requirements with its instances', so the parent is
  fetched before what it reveals and `Data.satisfy` reaches the instances in
  a later pass. `RemoteUnsatisfied`, `Data.explain`, and `Data.why` name a
  still-reading instance as `Child[key]`.
- **`foldkit-surface`: `Surface.each`, one Surface as many keyed instances.**
  `Surface.each(child, { from, instances })` instantiates a child Surface per
  item of a parent Surface's Model — a stored page's Blocks, say — where
  `Surface.at`/`Surface.when` give zero or one. The family keeps its `from`
  parent, so consumers can tell the requirements needed to *discover*
  instances from the requirements *of* them; it refuses empty and
  `__proto__` keys and duplicate identities. `SurfaceSource` is the shared
  shape (`at`/`when` values now resolve their lone instance through it, keyed
  by Surface name), read with `Surface.instances(source, model)`.

### Changed

- **Breaking: `foldkit-sync`: an exchange's `refuse` is `admit`, and an
  exchange may be refused whole (`opens`).** `admit(operation)` answers as the journal's
  `authorize` does (`true` admits; a refusal, with its reason, is rejected by
  id) and may answer with an `Effect`, for a rule that reads the rows an edit
  names before the journal's lock. `opens`, an `Effect` of a boolean, fails
  every exchange of a connection that may not open the document.
  `defineDocumentHost` takes both as functions of the principal, which its
  `refuse` was never given.
  `Sync.presence.serve` takes `opens` too: a connection joins the presence
  hub only once it may open the document, and one refused is relayed
  nothing, either way.
- **`foldkit-cms-drizzle`: the audience boundary is a `foldkit-guard` guard set.**
  `CmsServer.make` takes `policy` and `authors` (principal guards) in place of
  `isAuthor`, and `transitions` (principal guards per transition) beside
  `allow`, which stays for a rule about the entry; the principal is the guard
  set's `Option`. Each `content` entry names `entity`, its Entity with guards
  attached; its source carries `GuardServer.filter`, and `make` refuses a
  publishable type whose Read rule does not read its published field, or
  whose binding's `visible` is not the guard set's (`GuardServer.validate`).
  `published(column, isAuthor)` is gone: bind with `GuardDrizzle.visible`. A
  refusal of who is asking is `Forbidden`, with its sentence. The casts of an
  untyped principal are gone: one that is not the set's is a defect.
- **`foldkit-cms`: an entry's `createdAt` declares `binary`.** It is an
  ISO-8601 instant, so code-point order is time order, and `CmsEntries`
  orders by it: a saved or created entry is now placed in the worklist
  instead of refetching it. On Postgres the order compiles with
  `collate "C"`.
- **`foldkit-remote`: placement reads a row's id from its key.** Every order
  ends on the id tie-break, and a row whose Selection never stored `id` was
  unplaceable, so its list was fetched again: the entity example's post list
  was, after every create.
- **`examples/entity`: `WritePost` and `DeletePost` write in one
  transaction.** The author was inserted before the post, and the comments
  deleted before the post, each on its own, so a second statement that failed
  left the first. They use Drizzle's SQLite transaction, which is synchronous.
  `foldkit-remote-drizzle`'s README says why the adapter wraps no
  transaction: the drivers disagree on what one is.
- **`foldkit-remote`: an inserted row is drawn where its list's order puts
  it.** A `prepend`/`append` connection change and a live `ConnectionInsert`
  say a row is in a list, not where; in a list the client can place, a read
  draws it in order, or leaves it out past a `Cursor`. One it cannot place
  stays at the end its change names. **Breaking:** `Remote.visibleItems` is
  replaced by `Data.visibleItems(remote, connection)`, which draws a list as
  its reads do. `examples/cloudflare` drops `orderedPage`, its own sort of the
  page.
- **`examples/entity`, `examples/registry`: `verifyPlacement` is on in
  development and tests** (`import.meta.env.DEV`). The entity HTTP test checks
  a rename against SQLite's order, and every registry page test asserts no
  placement disagreed with the server's.
- **`foldkit-remote`: a mutation's answer places a row new to the client, and
  one that moves in from past a `Cursor`.** A row joined a list only through
  a filtered field, so a created row never joined a list that filters on
  nothing, and a row past a list's loaded rows whose order now put it among
  them stayed out. `EntityChange.Changed` gains `created`.
- **`examples/cloudflare`: `AllTodos` declares its order in its body**, and
  `title` declares `binary`. A create's answer names no list: the client
  places the row by title instead of the server's `prepend`.
- **`examples/entity`: `AuthorsQuery` declares its body too**, a name search
  by id, so an author a nested write creates joins the loaded list instead
  of refetching it. With the id fix above, the example's tests invalidate no
  list.
- **`examples/entity`: `PostsQuery` declares its body** (`Query.define`, a
  title search and `Order.chosen`), and `title` declares `binary`, in place of
  the server's `where` and `orderBy`. A rename moves a post in a list sorted by
  title with no list request; the list was refetched before.
- **`foldkit-remote`: a pending edit, a read and a live patch place the rows
  a list holds.** A pending `optimistic` patch or `Data.overlay` to an
  ordering or filtered field shows its row where the edit puts it, or out of
  the list, until it settles; the server's pages are untouched. A read or an
  `EntityPatched` with a new value moves a held row in the pages. Before, the
  row kept its old place until the list was fetched again, so a registry
  price edit stayed out of order even after the server had it. Neither brings
  a row into a list.
- **`foldkit-remote`: a mutation's answer is placed in the lists it changed,
  not refetched.** A held row that stops matching leaves a list; a row that
  joins, or a held row whose ordering field changed, goes where the body's
  order puts it among the loaded rows (`placeIn`), or out of them past a
  `Cursor`. A list is still invalidated for what cannot be placed: no body or
  no declared order, text with no collation, a row it cannot judge, or a row
  an overlay shows. `Impact` gains `Placed`, and is a `Data.taggedEnum`.
- **`examples/registry`: its text columns declare `binary`**, as its SQLite
  orders them, so its sorted page is placeable.
- **`foldkit-remote-drizzle`: a page's cursor holds the order's key values
  where it ended.** It was the last row's id, which the next page looked up:
  "load more" failed once that row was deleted or stopped matching, and
  continued from the wrong place once it moved. A cursor (`k:[...]`) is
  validated as client input; one from before keys is still read as an id.
  Relation pages keep their id cursors.
- **`foldkit-entity`: an `OrderTerm` is tagged `Term`, and a body's
  `orderBy` holds `Ordering`s (`Term | Chosen`).** An interpreter walking it
  resolves `Query.orderFor(body, input)` first.
- **`foldkit-remote-drizzle`: a body that declares its order refuses an
  `orderBy` beside it.** Overriding the body's order was allowed; it let the
  server sort one way while the client read another. A body's order is
  compiled per request now, since a chosen order depends on the input.
- **`examples/registry`: its sort is in `ProductsQuery`'s body**
  (`Order.chosen`), not a server `orderBy` function.
- **`foldkit-remote`: a list whose body declares no order is invalidated by
  any change to a row it holds.** Its order is the server's (an `orderBy`
  on the server, say), by fields the client cannot see, so a change it judged
  harmless could have moved the row. It was kept before, and the row showed
  its new value in its old place.
- **`examples/cloudflare`: a tick of the live poll reads only the rows
  written since the last.** Triggers log each row a write touches
  (`migrations/0003_row_changes.sql`, the last 1000 entries); the poll asks
  the log first, re-reads only those rows, and reads the list's window only
  when the stream opens. `pollLive` takes an options object (`interval`,
  `list`, `changes`, a `RowLog`). The local stack runs the migration files
  rather than repeating them. Apply the migrations before deploying the
  worker; until then it reads every tick.
- **`examples/registry`: the rows the grid draws follow the table live.** The
  journal's writes are told to a hub (`applyEdits(Db.Product, { live })`); the
  dev server answers through `serveFetch`, live streams included, and the
  client uses `Remote.httpWithLive`. A replacement said both by a read and by
  the slice is listed once, the slice's, which names the author.
- **`foldkit-sync/remote`: `replaced` covers an edit still in the slice.** A
  read reaching this replica's edit with another value says it, held or not,
  and this replica's landed edit is kept (showing the row's own value) until
  the slice drops it, so a later edit arriving live is seen replacing it.
- **`examples/registry`: the rows read survive a reload.** `Data.persistence`
  keeps Remote's cache in `localStorage`, so a reload with the server out of
  reach paints the last rows read, the pending edits over them.
  `mountRegistry`'s `resources` also provides a `KeyValueStore`.
- **`foldkit-sync/entity`: the overlay helpers are gone; `foldkit-sync/remote`
  shows the edits.** `overlay`, `held`, `newlyHeld`, `settled` and `shows` are
  removed: `RemoteEdits` does their work over Remote, where every read draws
  it. `EditableEntity.make`'s value also carries the `entity` it was made over.
- **`examples/registry`: the edits are Remote overlays.** The `retired` field,
  `retiredOf`, `retiresAny`, `settledOf` and the edits laid over `rowsOf` are
  gone; `RemoteEdits` reconciles in `afterUpdate`, so any read of a product,
  not only the grid's row, shows its edit.
- **`foldkit-remote`: a gap stays until its stream restarts.** An in-order
  event after a gap used to clear it, though the event that arrived ahead was
  dropped and what it said was lost. Now only the restart's `GapCleared`
  clears it. `LiveDependencies` gains `restarts` and `failures`, and
  `RemoteModel` gains `streams`.
- **`examples/cloudflare`: the stored list is `Data.persistence`.** The
  hand-written save Subscription and the boot-time `applyCache` are gone; the
  wiring restores each actor's snapshot (`snapshot: snapshotFor` keeps the
  visible edges) from `KeyValueStore.layerStorage(() => localStorage)`. The
  rows now arrive just after the first frame instead of in it.
- **`examples/entity`: the post edit is a declared write.** `EditPost` is
  `Mutation.write` over `Write.update`, its editor relation included, and the
  server serves it with `RemoteServer.write(..., writer(Db.Post))`; the Drizzle
  handler goes. The delete stays a handler: it removes the post's comments too.
- **`examples/cloudflare`: rename and toggle are declared writes.** Their
  Drizzle handlers and hand-built optimistic patches are gone:
  `Mutation.write` and `RemoteServer.write(..., writer(Db.Todo))` say the
  same, and the rename editor sends only the title it changed.
- **`foldkit-cms`, `foldkit-cms-drizzle`: refusals are data, not prefixes.**
  `SaveDraft` and `Publish` declare `Refusal`: `Cms.refusal.field(key, reason)`
  for a taken address on its key, `Cms.refusal.conflict` for work saved or
  published since. The editor reads both with `Data.refusal`. `Cms.slugTaken`
  is removed, and the `CmsConflict: ` and `CmsSlugTaken: ` message prefixes are
  gone: a message is now only for a person to read. `EditorDomain` gains
  `refusal`. `RemoteServer.refuse` takes an optional message for that person.
- **`foldkit-remote`: a mutation's answer invalidates the loaded lists it may
  have changed.** Each patch is judged against every loaded list over its
  Entity by the list's query body: a list stands when its rows and order are
  provably unchanged (a rename, a row that still matches), and is otherwise
  marked stale for its read entry to fetch again, restarting a read of it in
  flight. A list over a `Query.make` query, with no body to judge by, is
  invalidated by any change to its Entity, so such lists now refetch after a
  mutation of their rows. A live `ConnectionInvalidate` also restarts a read in
  flight now.
- **`foldkit-remote-server`: a mutation Source is given the client's
  `requestId`**, which the client already sent and which is the same on every
  retry of a request. Record a write under it to recognise a retry; nothing
  deduplicates by it yet. `foldkit-cms-drizzle` runs the application's own
  mutation, when it publishes, as `publish:<entry>:<revision>`.
- **`foldkit-remote-server`: handlers given a `live` hub publish every
  mutation's answer to it.** Each answered patch is a change of the fields it
  carries and each deletion a deletion, re-read per subscriber as before. Delete
  a `hub.changed` call that follows a mutation's write, or subscribers hear the
  change twice; keep one for writes that are not mutations. A failed publish is
  logged and the mutation still answers, since its write has happened.
- **`examples/cloudflare` page:** the Pages site is a Foldkit app. The list is
  `Crud.list` over the `AllTodos` query. The first visit says "Loading…". A
  later visit paints the rows stored in the browser at once and asks again.
  Add, rename, toggle, and delete are Remote mutations; `Data.mutate` applies
  the optimistic patch before the POST returns. Another tab hears the change
  on the live stream. Sync through the Durable Object stays for the demo and
  the tests; both writers use the same `todos` table.
- **`foldkit-sync/do`: `settle` now takes the environment and the journal.**
  `settle: (env, journal) => Effect` is called per exchange with the object's
  own environment and the journal it serves, so applying what committed to a D1
  table needs no closure over a binding captured elsewhere.

- **`foldkit-remote-server/fetch`: live streams heartbeats.** A `: ping`
  comment opens every live stream and follows every `liveHeartbeat`
  (default 15 seconds), so an idle stream is neither dropped by a proxy nor
  cancelled by a worker runtime. The heartbeat stops with the events it
  serves, so a stream with nothing to serve still ends.

- **`foldkit-mixins`: `Theme.oklch`'s families are one shape, and hold up in a
  dark scheme.** Every family has `default`, `hover`, `active`, `subtle`,
  `outline`, `on-fill` and `ink`; `outline` steps away from the page in each
  scheme, and the feedback fills are lighter in a dark one (the error fill
  keeps light text). `surface.bedrock`, a dialog's backdrop, is the deepest
  surface in a dark scheme too, where it was near-white, and `outline.focus`
  is the accent itself rather than a darker, more saturated shift of it.
- **`foldkit-mixins/defaults`:** native checkboxes, radios and sliders take
  the accent, selected text is the accent's tint, `kbd` is a raised key, `hr`
  one quiet line, and inline code sits on `surface.muted`.
- **`foldkit-mixins-ui`: recipes over the palette.** A neutral Checkbox or
  Switch that is on is in the page's ink (`tones.ink`), where the neutral
  surface drew it paler on than off; the neutral tone's fill is a quiet grey
  and an outlined control draws its tone's `line`, so a neutral outline can be
  seen; a chosen pill tab is the accent's tint and ink; the danger tone hovers
  to `error.hover`. `pnpm --filter foldkit-mixins-ui specimen` writes a page
  of every recipe in every variant and state.

### Fixed

- **`foldkit-durable`: concurrent appends over D1 commit.** A commit that lost
  a race for its sequence retried at once and at most ten times, so with a
  dozen writers on one document one could lose every round and fail with a
  `JournalError`; it retries up to 64 times, spaced and jittered.
- **`foldkit-guard`: `GuardServer.writer` refuses a writer for another
  Entity** where they meet, rather than leaving it to `validate`; the README's
  limits say a write's check and the write are two statements.
- **`foldkit-guard`: a handler's answer naming a row with no values keeps
  it.** The read-back asked for no field, which Drizzle's Source answers with
  no row, so the row was answered as deleted; it reads the id too.
- **`foldkit-remote`: a list an answer names still has its other rows
  judged.** A list the answer put a row into was skipped whole, so a second
  row of it the same answer moved was neither placed nor fetched; only the
  rows the answer itself placed are taken as the server says now.
- **`foldkit-entity`: an order over a number a row may lack is placeable.**
  `Query.placement` read `NullOr(Number)` (and `OptionFromNullOr(Number)`) as
  text with no collation, so such a list was fetched on every change; where
  nulls go is said on every term, so it is placed now.
- **`foldkit-remote-drizzle`: `asciiFold` folds only ASCII on Postgres.** It
  ordered by `lower(x) COLLATE "C"`, where `lower` still follows the column's
  collation and, under a UTF-8 one, folds `É` to `é`; the client's evaluator
  and SQLite's `NOCASE` do not, so a client placed rows where Postgres would
  not. It is `lower(x COLLATE "C")` now, the cursor's values folded alike, as
  `contains` already did.
- **`foldkit-remote`: `Data.persistence` says what keeps one reader's cache
  from the next.** A restore keeps what the Model holds, so a change of
  principal without `Data.forget` in the same `update` saved one person's rows
  under the next one's key; the README now says `forget` is required there,
  and that a snapshot is serialized on each change though its write waits.
- **`foldkit-cms-drizzle`: `authors` is asked as what the author is doing.**
  Every operation asked its guards with interaction `Read`, so a body that let
  a reviewer read drafts let them save and publish too. An operation now asks
  `Update`, and reading unpublished work `Read`.
- **`foldkit-sync`: a connection whose access went hears and speaks no more.**
  Presence asked `opens` once, at join, so a peer kept relaying presence after
  its access was taken; it is asked again with each frame, and a refused peer
  leaves. `serveJournal` sent a refused connection a notice of every commit,
  which woke it into a failing exchange and told it when the document
  changed; notices now pass `opens` too.
- **`foldkit-remote`: `Remote.http` reads a middleware's `{ error }` 403 as
  `Forbidden`.** A 403 whose body happened to be shaped as an error answer was
  taken for Remote's own, an ordinary mutation error; a 403 is now forbidden
  unless its body says so itself, as Remote's server's does.
- **`foldkit-remote`: placing a change no longer redraws or refetches what it
  left in place.** A row whose order field changed but whose place did not
  still gave its list a new identity, so every read of it was drawn again and,
  under `verifyPlacement`, the list was fetched; it is now kept as it was. Each
  list's held rows were rebuilt for every change of a read or an answer; they
  are read once per list.
- **`foldkit-guard`: `Policy.keyOf` tells every claim apart.** It keyed a
  principal by `JSON.stringify` of its rule inputs, so a set claim read as
  `{}` (an admin and a revoked admin shared a live hub's re-read) and a
  bigint threw. It keys by the principal encoded through `Schema.toCodecJson`.
  And beside `Write`, a slot of its own's refusal replaces Write's whichever
  key is written first; it hung on the order.
- **`foldkit-cms-drizzle`: a statement the database refuses no longer sends
  its SQL.** Its statements ran as defects, as `foldkit-remote-drizzle`'s
  writes did, so a refusal reached the client with the driver's error; they
  now fail as a `RemoteServerError`. `Transaction`'s type says it may fail so.
  `foldkit-remote-drizzle` exports the helper, `runStatement(statement,
  failed)`, for a handler's own statements, and its README's handler uses it.
- **`foldkit-cms-drizzle`: archiving an entry on show asks `unpublish`.**
  Archiving takes a published row off show, as unpublishing does, but asked
  only `archive`'s guards: an author `transitions` kept from unpublishing
  could archive a published post, and unarchive it as unpublished work.
- **`foldkit-remote`: placement no longer drops a row it cannot judge, and
  compares a number id as a number.** A row that was the last edge before a
  cursor (or the first after one) was left out when it sorted past its
  page's other rows, though its own old keys were the boundary and might
  still hold it: it now invalidates the list. Placement read every id from its
  key, so a number id ordered as text ('10' before '9'): the stored id is used,
  and the key's only for an id stored as text. `verifyPlacement` also records
  a row placing took out that the server's page still lists, which comparing
  the shared prefix never could; `placed` now holds `{ order, dropped }`.
- **`foldkit-entity`: a declared write binds the keys `Entity.input` lets
  map themselves.** An input key that is an `Option`, or optional, type-checked
  and then threw in `Write.bind`. A `some` now writes what it holds, and a
  `none` or a key left out writes nothing; a write whose id may be absent is
  refused where it is declared.
- **`foldkit-crud`: an editor's later saves no longer lose another author's
  change.** After its own save, the editor took any revision that came after
  as its own, so another client's later save was overwritten without a
  conflict; it compared each save with what the form was first filled with,
  so a key it had saved was sent again over another author's change; and
  typing while a save was in flight lost that save's answer, so the next save
  conflicted with itself. The editor now takes each save's answer once, as it
  lands (`edited`, `sent` and `settledFor` in its Model), and `Moved`
  outranks `Saved`. A create's form starts blank once it lands, so saving it
  again is not the same create twice.
- **`foldkit-remote-drizzle`: a keyed cursor over an id column of another
  name.** A page read each order key back by its column's SQL name, beside an
  id selected as `id`, so an id column named otherwise (`task_id`) read as
  nothing and every page fell back to an id cursor. **`foldkit-remote-server`:**
  `RemoteServer.memory` refuses a `shared` entity the domain does not declare,
  or a field it does not, as `RemoteServer.entity` and `source` already did.
- **`foldkit-guard`: `GuardServer.validate` refuses what it could not
  check.** A seam built from an Entity before its guards were attached (a
  `GuardDrizzle.visible` or `GuardServer.filter` given the base Entity)
  decided nothing yet passed as the guarded one's, since seams were recorded
  by name: they are now recorded by the Entity's attachment. A live Source of
  its own over a guarded Entity, a served query the domain does not declare,
  and a shared relation whose target is not validated are now refused.
- **`foldkit-remote-server`: the live hub sends a deletion only to whom a
  row is gone.** A write that hid a row from its writer answered it as
  deleted, and the hub sent every subscriber that deletion, readers who still
  saw it included; one who lost sight of a row was sent nothing. `deleted`
  now re-reads each subscriber's selection and `changed` sends a deletion
  where the re-read finds no row. One subscriber's failed read no longer
  stops the rest. **Breaking:** `LiveHub.deleted` may fail and needs the
  Sources' services, as `changed` does.
- **`foldkit-remote-drizzle`: a write the database refuses fails as
  `Database write failed`.** Writes, `applyEdits` and `returning.row` ran
  their statements as defects, which Effect RPC sends whole: the driver's
  error, with the SQL and its parameters, reached the client. They now fail
  as a `RemoteServerError`, the driver's error logged, as reads already did;
  `returning.row`'s error type says so.
- **`foldkit-guard`: three write checks that let a write through.** An
  update that unlinked a relation whose row is hidden from its writer read the
  link as none and skipped `Unlink`: the link is now read as stored, through
  a new `EntityWriter.linked` (`foldkit-remote-drizzle`'s `writer` has it),
  and a writer without it treats a link it sees as none as one that may be
  there. A create's guard over a field it leaves unset held for `isNotNull`
  (and died on `contains`): such a guard now never holds. A write's answer was
  read back without the Entity's member Read rules, so it could carry a field
  its writer may not read: `GuardServer.writer` and `GuardServer.mutation`
  now answer through them, with no more fields than the write named.
- **`foldkit-remote-drizzle`: an insert under an id taken by another row
  fails.** It answered with whatever row held the id, values its writer may
  not read included, and let the client think its own were stored. A retry,
  whose row holds what it writes, is still answered with that row.
- **`foldkit-guard/sync`: `admit` judges an operation's edits to a row
  together.** Each edit was checked over the row with that edit alone, so
  two that each kept a row in its editor's reach, and together moved it out,
  were admitted. An edit to a member outside the document, or a value its
  member cannot encode, is now refused by the operation's id rather than
  failing the exchange; `GuardSync.document` refuses a member that is not a
  field.
- **`foldkit-remote`: a filter or live insert the reference interpreter
  refuses no longer throws in `update`.** `Data.filtered` with such an input
  (a search holding NUL) answers no items and `complete: false`; a live
  insert into such a connection takes its declared policy.
- **`foldkit-remote-drizzle`: `contains` refuses searched text holding NUL
  when that text is an input or a literal**, as `evaluate` does. It refused a
  NUL only in the search, and answered `[]` on SQLite and Postgres for the
  rest. `foldkit-entity/conformance` now exports `refusals`, bodies every
  interpreter must refuse, and the reference, Drizzle (SQLite and Postgres)
  and Remote matching suites run them.
- **`foldkit-crud`: any authored edit after a save returns the editor to
  `Editing`.** It used to take only a typed field (`Changed`), so a nested row
  added or removed, or a Bundle-backed control's edit, left it at `Saved` or
  `SaveFailed`. The editor now asks the form (`authoredChanged`), and a
  Message that changes nothing returns its Model as it was.
- **`foldkit-primitives`: a popup placed in the same turn stays where it was placed.**
  `keepWithin` and the placement write start together, so the fit runs again
  when the write lands and judges that box. A point that would hang off the
  bottom shifts up (`Placing.shiftIntoViewport`). A trigger still flips, and
  the panel carries `data-fk-placed="above"` when it does. Enter in
  `ListNavigation` commits an enabled current item.

- **`examples/widgets`: the hover bridge follows a flip.** Navigation and the
  hover card overlap the trigger on the side the panel opened. Opening the
  context menu for the row it already shows returns the same model.

- **`examples/cloudflare` page:** a new or renamed row is drawn where the
  title order will keep it. The list sorts by title, then id, which is what
  `AllTodos` asks D1 for, so a live insert does not move it.

- **`examples/cloudflare` page:** the list is kept in the browser, one snapshot
  per actor. A later visit paints those rows immediately. A failed refetch,
  including offline, leaves them. The snapshot is the server's rows. An unsent
  edit is not kept.

- **`examples/cloudflare` page:** an update no longer refetches the list. The
  one-second refresh, and the refresh after a successful write, flashed the
  rows. The page subscribes to the live stream. A field change is a patch. A
  row joining or leaving is a connection event.

- **`examples/cloudflare` page:** saving, loading, and a field error keep the
  space they will occupy. "Saving…" and "Loading…" use `Loading.shown`, so a
  fast answer does not flash, and none of them push the form or the list.

- **`examples/widgets`: a context menu opens at the pointer.** A right-click
  records the point, and the menu opens there. The keyboard, which has no
  point, still opens under the row. Navigation and the hover card keep a
  hit target across the gap, so the pointer can move onto the panel.

- **`examples/widgets`: hover, placement, and keyboard on the showcase.**
  A click after a hover leaves that section open. A popup sits under the
  trigger that opened it, and reopening a menu keeps the chosen item
  selected. Enter in the command field runs the highlighted command. Shut
  accordion panels stay mounted. Absent values in these models are
  `Option`, and the page theme reads tokens.
- **Examples: the todo app's chosen filter is one color.** Its pill drew a grey
  line around the accent's tint, and its text went to the default color on
  hover; it is the tint and the accent's ink, hovered or not.
- **`foldkit-cms`: an entry opened from the server is `Loading` until its state
  is read too.** The editor counted as open once its entry, draft and row were
  read; the lifecycle state, a read of its own, could answer a moment later,
  and what it draws (the state badge, the history, Publish) dropped in after
  the form and pushed the screen down. Something new waits for no state.
- **`examples/cms`: the studio opens an entry whole.** Opening a page or a post
  from its list kept the list's place empty but for the editor's bar while the
  entry loaded, then drew the rest at once; the list now stays until the
  editor can draw. An image on a page keeps its room (4:3 until it loads) so
  the text around it does not move when it arrives. The studio's editor bar
  and the site's header are solid in the page's color: translucent over a
  blurred backdrop, they drew darker and more saturated than the page.

## 0.16.0

`foldkit-mixins` 0.8.0; `foldkit-mixins-ui` 0.7.0; `foldkit-primitives` 0.7.0;
`foldkit-remote` 0.13.0; `foldkit-ssr` 0.4.0; `foldkit-cms` 0.5.0;
`foldkit-agent-webmcp` 0.6.0. New: `foldkit-composition`, `foldkit-builder` and
`foldkit-mixins-builder` 0.1.0, experimental. Republished to re-pin:
`foldkit-cms-drizzle` 0.5.1, `foldkit-crud` 0.6.1, `foldkit-data-grid` 0.1.1,
`foldkit-mixins-crud` 0.6.3, `foldkit-mixins-data-grid` 0.1.1,
`foldkit-mixins-form` 0.4.3, `foldkit-mixins-richtext` 0.2.2,
`foldkit-mixins-surface` 0.5.2, `foldkit-remote-drizzle` 0.10.1 and
`foldkit-remote-server` 0.12.1, each of which pins a bumped package. Every
other package is unchanged.

**The page builder ships, and the themes hold together.** A page as Blocks in
Regions, stored and checked against a Catalog, and the Builder that edits it,
are published: drag a Block into any Region, an empty column included. The
OKLCH theme derives every surface and line from the page's own color, so a
dark scheme no longer pairs a grey page with a blue sidebar, and tints keep
their tone's hue. A page the browser draws afresh stays in view until its
reads answer, and WebMCP reaches older browsers and forms as declarative
tools.

### Upgrading from 0.15

- **`AgentWebMcp.documentModelContext()` is `pageModelContext()`**
  (`foldkit-agent-webmcp`), which also reads `navigator.modelContext`.
- **`Cms.stateBadge(badge, h, state)` takes no attribute** (`foldkit-cms`): it
  writes `Cms.stateAttribute` (`data-cms-state`), as the list does; style it
  with `Recipes.Badge({ attribute: Cms.stateAttribute, tones })`.
- **An inline shorthand beside a conditional inline longhand of it is refused**
  (`foldkit-mixins`, `mixins:inline-shorthand-conflict`): write the state as a
  rule (`Style.self`), or the whole shorthand in each state.
- **`Theme.oklch`'s surfaces carry the base's chroma, no more**
  (`foldkit-mixins`): a page that relied on panels more tinted than the page
  raises `surfaceSaturation` instead.

### Added

- **`foldkit-composition`, `foldkit-builder` and `foldkit-mixins-builder` are
  published,** at an experimental `0.1.0`: a page as Blocks in Regions, stored
  and checked against a Catalog, and the page Builder that edits it, headless
  and drawn.
- **`foldkit-mixins-ui`: `Recipes.InputGroup`,** pieces for a text field with
  a prefix or suffix drawn as one box: the group carries the border and the
  focus ring, the affix sits inside, the control goes borderless.
- **`foldkit-cms`: `Cms.stateAttribute`,** `data-cms-state`, the one attribute
  every state the CMS draws is written in.
- **`foldkit-ssr`: `SSR.hydrate`'s `until`.** With `otherwise: 'render'`, the
  fresh application draws hidden beside a declined page, which stays in view
  until a Model it drew satisfies `until`, then takes its place in one step (at
  most `UNTIL_LIMIT_MS`). The CMS site opened from the studio blinked to
  "Loading…" and back; it now waits for its reads.
- **`foldkit-remote`: `RemoteData.answered`,** whether a read has an answer
  (`Ready`, `Refreshing`, `Failed`, `NotFound`).
- **`foldkit-composition`: `QueryBlock.active(...).answered(model)`,** whether
  every Query Block read on the page has an answer. `QueryReader.query` now
  returns a `RemoteData` Projection, as Remote's does.
- **`foldkit-agent-webmcp`: forms as declarative tools.** `AgentWebMcp.formTool(definition,
  name)` writes a form's `toolname` and `tooldescription`, and each field's `name` and
  `toolparamdescription`, from the agent contract; `register({ forms })` answers an agent's
  submission of such a form as the tool call (decoded, authorized, dispatched, through
  `respondWith`), ahead of the application's own `OnSubmit`, and leaves the capability out of
  the imperative registration in a browser that draws forms as tools
  (`AgentWebMcp.declarativeTools()`). The todo example's composer is `add_todo`'s form.
- **The page Builder fills any Region by drag.** In edit mode the Renderer
  draws an empty Region as an element of its own, named and marked
  `data-composition-region` (`REGION_ATTRIBUTE`); `PointerDrag` takes a
  `part` attribute and reports such an element as `{ id, zone: 'inside', part }`;
  the Builder's new `DraggedOverRegion({ id, region })` lands a drop in that
  Region rather than the first that accepts the Block, and `drag.over` carries
  `region`. A Columns' right column could not be reached before; the CMS draws
  each empty Region as a dashed box to drop into.

### Changed

- **`foldkit-mixins`: `Theme.oklch`'s surfaces and outlines step from the
  base.** Each surface step and outline is the base at another lightness, in
  its hue and with about its chroma (an outline a little more), so a sidebar, a
  panel, a hover and a border read as the page's one color at a few
  lightnesses, in both schemes. The outlines mixed near-neutral text into the
  base, and read grey on a tinted page. The page's tint is set by
  `surfaceSaturation` alone; raise it for a more tinted page (the CMS uses
  `0.012`).
- **`foldkit-cms`: `stateBadge` writes `data-cms-state`,** as a list's state
  cell does, and takes no attribute: the badge wrote `data-state` and the cell
  `data-cms-state`, so one of them was always untoned. Style both with
  `Recipes.Badge({ attribute: Cms.stateAttribute, tones })`.
- **`foldkit-mixins-ui`: a `Segmented` pressed option is the accent's tint,**
  flat, in the `variants` layer, where an icon button's own background no
  longer hides it.

### Fixed

- **Examples: the todo list lines up.** Rows draw a rule between them only, the
  delete and Clear completed buttons end at the list's edge, and the empty list
  says so centred with room around it.

- **Examples: the pages and registry demos keep one hue in both schemes.** The
  pages demo drew its New page button as white ink in the dark and marked the open
  page in grey; both now use an accent at hue 270. The registry grid used a
  greyscale theme under tinted chrome; its palette now takes hue 270 and its
  text, lines and chips read the theme's tokens.

- **`foldkit-mixins-ui`: an unfilled button's hover reads on any ground.** An
  outline, ghost or icon button hovered onto the tone's solid wash, near-white
  under the white text a colored band gives it, so the words vanished. The
  hover is now a faint tint of the button's own text color.
- **`foldkit-mixins`: scrollbars take the theme's line color,** from the body
  defaults, rather than the browser's grey.
- **`foldkit-agent-webmcp` registers where an older browser looks.**
  `pageModelContext()`, which replaces `documentModelContext()`, reads
  `document.modelContext`, where the spec and Chromium 150 put it, or else
  `navigator.modelContext`, which earlier Chromium and agent extensions still
  expose; the todo demo registered nothing for them.
- **`foldkit-mixins`: an inline shorthand beside a conditional longhand of it
  is refused** (`mixins:inline-shorthand-conflict`). Clearing the longhand when
  the condition stopped holding cleared the shorthand's part too: the todo
  demo's filter pills and checkboxes kept a black border after a state ended.
  Its filters and checkboxes now write their states as rules.
- **`foldkit-mixins-ui`: an icon button's glyph is centered.** The hidden words
  beside it kept the button's gap, which pushed the icon aside.

- **`foldkit-mixins/theme`: a tone's `subtle` keeps the tone's hue.** The
  tint was mixed in OKLCH, which interpolates hue, so a mix mostly of a
  tinted base kept the base's hue: over a blue-grey base, the success tint
  came out blue under green text. Tints now mix in OKLab. `foldkit-mixins-ui`'s
  Badge grounds a toned pill on the tone's `subtle`, so it follows.
- **`examples/cms`:** the current section and the signed-in person are marked
  in the accent's tint rather than a surface step that barely differed from
  the sidebar, and so is the post list's chosen tab, flat, with no raised
  pill; New post is the accent's solid button, as the forms' submit is; New
  post, the search box and the tabs share one height; and the editor bar's
  state badge
  matches the attribute `Cms.stateBadge` writes, so it is toned.

## 0.15.0

`foldkit-sync` 0.9.0; `foldkit-durable` 0.7.0; `foldkit-remote` 0.12.0;
`foldkit-remote-server` 0.12.0; `foldkit-remote-drizzle` 0.10.0;
`foldkit-cms-drizzle` 0.5.0; `foldkit-crud` 0.6.0; `foldkit-mixins` 0.7.0;
`foldkit-primitives` 0.6.0; `foldkit-surface` 0.7.0; `foldkit-mixins-ui`
0.6.1. New: `foldkit-data-grid` 0.1.0 and `foldkit-mixins-data-grid` 0.1.0,
experimental. Republished to re-pin: `foldkit-agent` 0.6.1,
`foldkit-agent-a2a`, `foldkit-agent-mcp`, `foldkit-agent-native` and
`foldkit-agent-webmcp` 0.5.1, `foldkit-bundle-surface` 0.3.1, `foldkit-cms`
0.4.2, `foldkit-mirror` 0.5.1, `foldkit-mixins-crud` 0.6.2,
`foldkit-mixins-form` 0.4.2, `foldkit-mixins-richtext` 0.2.1,
`foldkit-mixins-surface` 0.5.1 and `foldkit-ssr` 0.3.1, each of which pins a
bumped package exactly. Every other package is unchanged.

**Editing server data, and a data grid to do it in.** A table a server owns
can now be edited offline as durable operations: `foldkit-sync/entity` keeps
the edits per cell and lays them over Remote's rows, and
`foldkit-sync/journal`'s `editsJournal` applies each committed edit to the
table as the journal's read model, recovering from crashes and refusing a
table ahead of its journal. The data grid that edits it is new: an
accessible, virtualized grid over 100,000 rows with focus, selection, column
state, typed editors, the clipboard, fill, and undo as the application's.
Servers also run in the browser now: `SharedHost` in `foldkit-primitives/net`
hosts one for every tab, reached over `MessagePort`s by Remote and Sync, which
is how the demos at [foldkit-plus.pages.dev](https://foldkit-plus.pages.dev/)
run.

### Upgrading from 0.14

- **`ReplicaStatus.rejected` is a list of rejections** (`foldkit-sync`):
  `ReadonlyArray<Rejection>`, each `{ opId, reason: Option<string> }`, where it
  was a list of operation ids.
- **`Sync.transport.socket` takes a `url` or a `makeSocket`, not both**
  (`foldkit-sync`), and `makeSocket` takes no argument.
- **`editsJournal` requires `tableRevision`** (`foldkit-sync/journal`), and
  fails with `TableAheadOfJournalError` while the table holds a revision past
  the journal's.
- **Install `drizzle-orm` yourself** beside `foldkit-remote-drizzle` and
  `foldkit-cms-drizzle`: it is a peer dependency now, so the application's
  copy is the one they use.
- **`contains` on Postgres folds ASCII only** (`foldkit-remote-drizzle`), as it
  already did in SQLite and in memory: `é` no longer finds `É` there.

### Added

- **`foldkit-mixins-data-grid`: Delete and Backspace clear** the range's
  editable cells, or the focused cell, as a cut does without copying, so they
  report `Out.Pasted` with empty text and a column that refuses it says so
  (#144).
- **`examples/registry` searches on the server.** A search box sets the
  Products query's input; the query is now a `Query.define` whose body,
  `Expr.contains` on the description, the Drizzle binding compiles (#144).
- **`examples/data-grid` keeps its column layout** in the browser: saved with
  a Command after any transition that changes the column state, and read
  back with `columnState.restore` as the page opens (#144).
- **`foldkit-data-grid` and `foldkit-mixins-data-grid` are published,** at
  an experimental `0.1.0`: the grid's state, geometry and keyboard, and the
  grid drawn as an accessible, virtualized WAI-ARIA grid through slots. Their
  entries below are the first release's (#158).
- **Fill in the data grid.** `foldkit-data-grid`'s `Fill` is a spreadsheet's
  fill as pure functions: `plan` (the source's box and the box beyond it
  toward a cell, along one axis), `cells` (what each lane writes there) and
  `series` (numbers a constant step apart continue it; anything else
  repeats). In the grid, Ctrl or Meta with D or R, or a drag of the range's
  fill handle (the `fillHandle` Slot, its target drawn `data-fill`; held at
  the grid's edge, the drag scrolls it), reports
  `Out.Filled({ source, to })`, so `Grid.Out.match` needs that arm; the
  application writes `Grid.fill(rows, model.grid, request)`, judged as a
  paste is. The registry undoes a fill as one step. `Columns.textOf` is a
  value as a cell shows it (#144).
- **`foldkit-data-grid`: `Grid.window(input)`,** the rows and columns a
  placed grid's view draws, worked out as the view does (the view now calls
  it), so an application can count what is drawn without estimating. The
  registry shows it in a strip under its title, beside a *How this page
  works* panel that lists the owners `Module.manifest` reads from its
  contracts and what each field holds now (#163).
- **Undo and redo in the data grid, and in the registry as new edits.** Ctrl
  or Meta with Z on a `foldkit-data-grid` grid sends `UndoRequested`, with
  Shift (or Ctrl+Y) `RedoRequested`, each reported as the OutMessage of the
  same name. They carry nothing, since the history is the application's; an
  open editor keeps the keys. `Grid.Out.match` now needs the two arms. The
  registry keeps a per-tab stack: an undo is an `EditedProducts` of what each
  cell held, so it goes through the outbox like any edit, and a cell changed
  since is left alone and said. `foldkit-sync/entity`'s `EditableEntity`
  gains `changeAt(row, member)`, a cell's value as a `Change` (#164).
- **`foldkit-remote-server`: `RemoteServer.memory` authorizes per entity.**
  It takes `authorize`, per entity name, the function `RemoteServer.entity`
  takes, and the `principal` its `layer` answers as; `server` answers as any
  principal through `handlers`. The principal's type is inferred from them, and
  `principal` is required unless that type admits `undefined`. A name the
  domain does not declare is refused when the backend is made. A memory-backed
  test or demo no longer copies the read path to try authorization (#147).
- **`foldkit-sync/journal`: `TableAheadOfJournalError`.** `editsJournal`'s
  `settle` refuses to start while the table holds a revision past the
  journal's cursor, as a table that outlived a reset of its journal does:
  every new edit would otherwise be skipped by `apply` and counted absorbed by
  the replicas, and lost with nothing said. It refuses on every exchange until
  the table is rebuilt with the journal (#176).
- **`foldkit-primitives/net`: `SharedHost`, one in-browser server for every
  tab and frame.** `SharedHost.define({ name, opening })` gives `serve`, a
  SharedWorker's entry, and `connect({ worker, inPage })`, whose `open(opening)`
  returns a `MessagePort` for one conversation. The host decodes each opening
  first and ignores one that does not decode or has no port, and its
  `signal` aborts when the page's Web Lock is released. Without SharedWorker
  the top document hosts, and same-origin frames send their openings there
  (#167).
- **`foldkit-sync`: `Sync.transport.portSocket(port, { signal? })`, a socket
  over a `MessagePort`.** Its frames are the port's strings, anything else is
  ignored, and `onClose` fires once, on `close()` or when `signal` aborts, so
  a host that serves a pane stops serving it when the pane goes. The registry
  sandbox's own copy, whose `onClose` never fired, is gone (#167).
- **`foldkit-remote/port` and `foldkit-remote-server/port`: Remote over a
  `MessagePort`.** `port(open)` is Remote's client and `servePort(handlers,
  port)` its server, over Effect's own RPC worker protocol, driven through
  `effect/workers` with no browser package: reads, queries, mutations and
  live streams cross it with their typed errors, an interrupted call
  interrupts its handler, and the serving ends when the client closes its
  end. `portProtocol(open)` is the protocol alone, for a hand-made RPC
  client (#167).
- **Docs: [Editing server data through a
  journal](docs/editing-server-data.md).** When rows are too many to
  replicate but edits to them must survive offline: who owns what, the one
  rule (a cell shows its edit while pending or committed after the row's
  revision), a one-column path through `foldkit-sync/entity` and
  `editsJournal`, conflicts, refusals, absorbing, and each failure case,
  with the registry as the worked example. Its snippets compile in
  `examples/registry/test/guide.test-d.ts`; the registry README keeps what is
  its own (#171).
- **`foldkit-sync/journal`: `editsJournal`, the table as the journal's read
  model.** Its `settle` applies each committed change through the
  application's `apply` as a recovery intent and its `absorb` records what
  the table holds and compacts behind it. Recovery starts at the journal's
  floor, so a server restarted over a compacted journal no longer fails
  every exchange asking for history that is gone; intents are keyed by the
  journal's epoch, so an operation sent again after a reset is applied
  again. The registry's journal is built on it (#166).
- **`foldkit-sync/entity`: edits to rows a server owns.** `EditableEntity.make(
  entity, { members })` keeps edits one per cell, each value typed by its
  member, committed `at` a sequence `by` an author (`{ actor, replica }`),
  and lays them over Remote's rows by each row's `revision`. Pure functions
  merge and absorb them, hold an absorbed edit while its cached row is
  behind it and settle it when a read reaches it, report a cell another
  tab's later commit replaced, and name a refusal's cells. `examples/registry`
  is built on it: a change is one cell and the server writes the one column
  it names. Another editable column is an entry in `members`, its grid
  column, its arm in `changeOf` and its table column; none of the edit rules
  is written per field any more (#166).
- **`foldkit-sync`: a reinstall says when the server was reset.**
  `ReplicaStatus.epoch` is the server history the cursor points into, and
  `Sync.mount`'s `onReinstall(next, previous, { reset })` is told when it
  changed. `examples/registry` reads its rows again on a reset: their
  revisions counted the old history, so an edit committed since at a low
  sequence looked as if the rows already held it (#166).
- **`foldkit-mixins-data-grid`: a choice is a list the grid draws.** A
  column of literals edits as a `role="combobox"` beside its `role="listbox"`
  (new `choiceList` Slot), styled with the page, opening below the cell or
  above it near the bottom of the view; arrows, Home, End and the page keys
  walk it (`EditStepped` in `foldkit-data-grid`), a letter finds an option
  (`EditTyped` on a choice), and a press chooses one (`EditChosen`) without
  the blur committing the old draft first. `choiceEditor: 'native'` keeps
  the platform's `select` (#168).
- **`foldkit-mixins-data-grid`: shared cell marks and their legend.**
  `GridMarks` names five marks (`pending`, `saved`, `refused`, `replaced`,
  `peer`); `GridMarkStyle`, attached after `GridStyle`, draws each on the
  theme's tokens with a shape of its own and an outline under forced
  colours; `GridLegend` draws what they mean beside swatches
  `GridLegendStyle` paints with the cells' rules. `examples/registry` uses
  them in place of its hex colours and hand-drawn legend (#168).
- **`foldkit-mixins/theme`: shadow tokens.** `Theme.tokens.shadow` is a
  scale (`xs`, `sm`, `md`, `lg`, `xl`, `inset`) drawn in one color,
  `--fk-shadow-color`, falling back to a faint black; `Theme.oklch` sets it,
  a near-black of the neutral hue that is denser in a dark scheme, where a
  shadow mixed from the text glowed. `GridStyle`'s editing lift and error
  bubble and the dialog and segmented recipes use the scale (#168).
- **`foldkit-data-grid`: an unchanged edit reports nothing.** The edit keeps
  the text it began from (`editing.from`); a commit of that text, or of text
  that decodes to the same value (`Equal.equals`), closes the edit and moves
  focus with no `Out.Edited`. Leaving an editor as it opened, after another
  device changed the cell beneath it, no longer sends the old value over the
  new one (#174). `EditTyped` carries `from`, the text the cell showed.
  A paste does the same per cell: `Clipboard.pasteAt` takes `{ editable,
  from }` (was a positional `editable`), each `Pasted` cell carries `from`,
  unchanged cells are dropped, and a paste or cut that changes nothing
  reports nothing. `examples/registry` drops its own `holds` check.
- **`foldkit-mixins-data-grid`: clicking away saves, and a refused draft
  says why.** Focus leaving the editor commits it, as Enter does without
  moving; a draft the column refuses stays open, its field in the error
  colour, with the column's message shown below it in a new `editorError`
  Slot (`role="alert"`, named by the field's `aria-describedby`, which
  replaces its `aria-description`). `GridStyle` draws the sort direction as
  a small chevron whose place is kept while unsorted, so sorting no longer
  wraps a narrow header or moves its label, keeps header labels on one
  line, and parts columns with a faint line that is, on a header, the
  resize handle. The registry's page is in neutral greys.
- **A mark says what it means, and an unchanged edit is none.** A cell's
  mark is also its `title`, shown on hover (the description a screen
  reader hears was there already). The registry draws a legend of its marks
  above the grid, presence in violet so it is not taken for a replacement,
  and a cell committed with the value it already shows (the same text, or
  `01.73` for 1.73) makes no edit: nothing is sent and nothing marked.
- **`foldkit-mixins-data-grid`: a column that does not edit says so.** In a
  grid where some columns edit, the others' headers and cells carry
  `aria-readonly`, and `GridStyle` draws a padlock before the header's
  label (with a Read-only title) and the cells' text muted, with the
  ordinary pointer. A grid where nothing edits marks nothing.
- **`foldkit-mixins-data-grid`: a choice opens its list.** The `select` a
  column of literals edits in opens its list as it opens (`showPicker`,
  where the browser allows), so a double-click shows the choices without
  another click. The registry's status column is wide enough for its
  longest.
- **`foldkit-mixins-data-grid`: an edit looks like one, and a pin shows.**
  A double-click opens an editable cell's editor, as Enter does. The cell
  being edited carries `data-editing`, and `GridStyle` lifts it with a
  shadow and gives the field the whole cell, outlined and with a caret in
  the focus colour, where before it was the browser's bare input inside the
  cell's padding; an editable cell carries `data-editable` and shows a text
  cursor. The pinned column next to the scrolling ones carries
  `data-pinned-edge`, drawn as a divider, so a pinned column is seen to be.
  The registry sorts every column the server can order, UPC, line and
  status too, and edits the line and the status as well (a choice of the
  Product's statuses), so a double-click on any column but the UPC edits.
- **`foldkit-durable/core`: the journal without Node.** `Journal.layer(options)`
  and `Journal.define(key).layer(options)` give the journal as a layer that
  needs a `SqlClient`, any `effect/sql` SQLite client, such as
  `@effect/sql-sqlite-wasm` in a browser, where a browser test runs append,
  retry, refusal, recovery, compaction and reset over it. Provide the driver
  to the layer, and the database opens and closes with the journal; a
  journal handed out as a value could keep a connection already closed
  (#169). Payloads are hashed with `@noble/hashes` instead of
  `node:crypto`, to the same digest, and epochs come from
  `globalThis.crypto.randomUUID`. The main entry's `Journal.make` over a
  `node:sqlite` file is unchanged (#162).
- **`examples/registry` says where each edit is.** A cell's mark shows an
  edit not yet sent, one the journal has and the table does not yet, and one
  the server refused, edged until its line (naming the cells and the
  server's reason) is dismissed. A *Work offline* switch pauses the
  transport, and switching back exchanges at once (#161).
- **`examples/registry` says when another device's edit won.** The journal
  stamps who committed each edit (`by`); a field this device last wrote that
  another device's later commit replaced is edged amber, with a line naming
  the device and the value it had, until dismissed. A connection names its
  device (`?device=` on the socket). The registry's server and journal no
  longer import Node (an SQLite seam, and `foldkit-durable/core`), so a
  sandbox can run them in the page (#162).
- **`examples/registry` runs in the browser: two devices, one page.**
  `build:sandbox` builds Device A and Device B side by side, each a page in a
  frame with its own replica, against one server in a SharedWorker: the
  products table on sql.js and the journal on SQLite compiled to WebAssembly,
  over `MessagePort`s. An e2e test builds it, serves the files, and drives a
  shared edit, a conflict the losing device is told of, and an offline edit
  that survives a reload (#162).
- **`examples/registry`: presence, and each device's status on its card.**
  A device announces the cell it has focused over Sync's presence, on the
  same socket the journal is served on, and the other draws it outlined in
  violet; a device working offline leaves. In the sandbox, each card's dot
  and badge say where that device's edits stand, from a status its frame
  posts to the page.
- **`foldkit-sync`: why an edit was refused.** An exchange may carry
  `reasons: [{ opId, reason }]` beside `rejected` (each at most 500
  characters; a reason for an operation not rejected fails the exchange),
  and `journalExchange` gives each rejection one: an `authorize` rule's own,
  now that a rule may return `{ allowed: false, reason }` as Durable's does,
  or a fixed sentence ("Not a valid operation", "This connection may not
  make changes"), never an error's message. **Breaking:**
  `ReplicaStatus.rejected` is `ReadonlyArray<Rejection>`, `{ opId, reason:
  Option<string>, operation }`, in place of the ids: the refused operation
  comes with its refusal, so what it changed is read from it rather than
  looked up while it was pending, which a page that heard late could miss. The todo-app's rules give their
  reasons (#161).

- **`foldkit-mixins-data-grid`: cell marks.** `marks: address =>
  Option.some({ name, description })` gives a cell a state of the
  application's: `data-mark` on its Slot, which the default style shows as a
  dot in the corner and an application styles by name, and the description
  as its `aria-description`. Asked only for the cells drawn (#161).

- **`foldkit-durable`: a commit stamp.** `JournalOptions.stamp(operation,
  { sequence, actorId })` writes what the commit decided into the operation,
  after `validate` and `authorize` and before `reduce`. The stamped operation
  is what is stored, read, loaded and recovered; a retry is still recognized
  by what was sent, since a retransmission is now compared by the hash of
  the operation as sent rather than by the stored text. A stamp that changes
  the `opId` is refused. For a read model that must know which commits it
  holds (#159).
- **`foldkit-sync`: commit stamps on the contract.** `make({ stamp: {
  Variant: (message, { sequence, actorId, replicaId }) => … } })` writes what the
  server's commit decided into a durable Message, per variant, and returns
  that variant (another is rejected by id; a non-durable key is a type
  error). It rides in `journalContract()` as Durable's `stamp`, so replicas
  replay the stamped Message in place of what they sent. `defineSync` takes
  the same as `stamp(message, commit)`. New types `CommitStamp` and
  `StampPolicy`. A replica exposes its `replicaId`, the one its commits
  are stamped with.

- **`foldkit-data-grid`, the grid's pure model.** Phase 0
  of [the DataGrid design](docs/design/data-grid-DESIGN.md): typed `Columns`
  by stable id, a `RowModel` with a `Known` or `Unknown` `RowCount`, a
  saveable `ColumnLayout` of start, center and end regions with hidden
  columns, and a `GridProjection` that answers moves, edges and rectangular
  ranges in display order, each as an `Option`. A cell is named by row key
  and column id, so it survives a re-sort or a reorder.
- **`foldkit-data-grid`, focus (Phase 1).** `GridFocus.make(columns)` is a
  Bundle holding the focused cell as an `Option`, stored as `null`, and
  decoded only against the grid's own column ids. `GridFocus.target` is the
  cell a key moves to (arrows, Home and End, Ctrl for the corners, PageUp and
  PageDown, RTL), `tabStop` the cell holding the one tab stop, and `cellId` a
  DOM id for `aria-activedescendant` that no two cells share.
- **`foldkit-data-grid`, virtualization (Phase 2).** `VirtualGrid.window` is
  the rows and center columns a viewport shows, with overscan and spacers;
  rows are one height, so it never walks them, and pinned columns are always
  drawn. `VirtualGrid.reveal` is the least scroll that shows a cell.
  `GridViewport` keeps the container's offsets and size in the Model, its
  `Measure` Mount reports them on mount, scroll and resize, and `scrollTo` is
  the Command that applies a reveal. A benchmark at 100,000 rows is in
  `docs/benchmarks.md`.
- **`foldkit-data-grid`, `DataGrid.make({ id, columns })`.** Focus and the
  viewport as the one Bundle a grid places. A key's `Moved` carries the
  reveal the view worked out, and the update issues the scroll for the
  container named `id`.
- **`foldkit-mixins-data-grid`, the grid drawn (Phase 3).**
  `DataGridView<Message>().define(Grid)` draws a `DataGrid` as a WAI-ARIA
  grid of the viewport's window of cells: `aria-rowcount` (or `-1` when the
  count is unknown), each cell's logical `aria-rowindex` and `aria-colindex`,
  one tab stop with `aria-activedescendant` while the focused cell is drawn,
  sticky pinned columns, a placeholder for rows not loaded, and the keyboard
  through `GridFocus.target`. Every element is a Slot; a Style that sets the
  geometry the window depends on is refused. `GridStyle` is a default look in
  the `components` layer. It renders on a server as markup a parser reads
  back the same.
- **`foldkit-data-grid`, column state (Phase 4).** A column spec takes
  `width`, `minWidth`, `maxWidth`, `resizable` and `hideable`. The
  `DataGrid` Model holds the column state, a `ColumnLayout` plus the widths
  resized, with `ColumnResized`, `ColumnHidden`, `ColumnShown` and
  `ColumnMoved` (a reorder, a pin or an unpin) to change it; each returns the
  Model it was given when it changes nothing, and the last column shown
  stays. `columnState.restore` reads a saved state back leniently and lists
  the ids it dropped. `Grid.project(rows, state)` is the projection for a
  column state, built once per rows model and state. The view takes `rows`
  in place of `projection` and `width`, and draws the column state.
- **`foldkit-mixins-data-grid`, resize handles.** Each resizable column has a
  `role="separator"` handle with its width in `aria-valuenow`: a pointer drag
  resizes from where it began (`ResizeStarted`, `ResizeMoved`,
  `ResizeEnded`; a cancelled drag puts the width back), and a focused handle
  steps with the arrow keys, mirrored in right-to-left text. The grid now
  takes only keys aimed at itself, so a handle's keys do not move focus.
- **`foldkit-data-grid`, selection (Phase 5, the state).** Opt-in with
  `rowSelection: 'single' | 'multiple'` and `cellSelection: true`. Rows are a
  `RowSelection` of `Keys` or `AllExcept`, so select-all holds rows not
  loaded; `RowSelected`, `RowsExtended`, `AllRowsSelected` and
  `RowsCleared` change it, with an anchor for Shift ranges. One rectangle of
  cells is held by its corners (`CellsSelected`, `CellsCleared`); a plain
  click or key lets it go. `GridSelection.extend` is the range a Shift key
  makes and `rowsBetween` a Shift range of rows.
- **`foldkit-mixins-data-grid`, selection drawn and driven.** Rows say
  `aria-selected` and cells in the range say it; the grid is
  `aria-multiselectable`. One click listener on the body (`CellPressed`,
  parsed and checked in the grid's update) focuses a cell, spans a range
  with Shift and toggles a row with Ctrl or Meta. Shift with a move extends
  a range and scrolls its far corner in, Space and Shift+Space select rows,
  Ctrl or Meta with A selects all, and Escape lets a range go. The per-cell
  `mousedown` handlers are gone.
- **Over Remote and CRUD (Phase 7).** `foldkit-data-grid/crud` (optional
  peers `foldkit-crud` and `foldkit-remote`): `GridCrud.columns(list, {
  columns, words })` from a `Crud.list`'s members and Displays, with the
  grid's own per-member options (pinning, widths, `edit`, a header), `rows(page, key)` a row model of a
  Remote page (unknown while there are more; the rows a failed read had),
  and `status(page)` a `RowStatus`. The view takes `status` (busy while
  loading or refreshing, a failure with `onRetry`), `onMore` while the count
  is unknown, and `sort` for `aria-sort` and a sort button, Enter on a
  header sending it too.
- **The clipboard (Phase 8).** `Clipboard.toTsv` and `parseTsv` write and
  read spreadsheet text (quoted cells, any line end); `copy` is a box's cells
  and `pasteAt` where pasted text lands. The grid's OutMessage is now a union,
  `Out.Edited | Out.Pasted`: a paste is checked cell by cell against each
  column and reported once, with what was refused. The view copies the range
  (or the focused cell), pastes from the range's corner, and cuts by copying
  and clearing, leaving the clipboard to a cell being edited.
- **`pnpm e2e`, the examples with a server end to end.** A Vitest project
  of its own (`vitest.e2e.config.ts`), kept out of `pnpm test`, and a CI job:
  each test starts the example's server and Vite and drives Chromium with
  Playwright. The registry's covers reading on scroll, a server sort, an
  edit read back from the table and kept across a reload, and the column
  menu. The todo app's covers a todo reaching a second person's page without
  a reload, written to the journal, and kept across one. The CMS's covers a
  writer's draft that the site does not show, and an editor's publish that
  it does. The entity example's covers a title saved from the form, read
  back from the table and kept across a reload; the pages example's, two
  tabs typing into one page, read back by a browser with nothing stored.
  `examples/pages` gains `startPagesServer` (run by `serverMain.ts`) and a
  Vite config: the page connects to `/sync` on its own origin, proxied to
  the server, and the workspace packages resolve to their source, so it no
  longer needs `pnpm build`.
- **Messages carry intent: the guide, and `Frames.track` to test it.**
  `docs/state-model.md` says why a Message should carry what the user did
  and `update` work out what it means, with the cases that were bugs.
  `Frames.track()` (`foldkit-mixins/testing`) tracks the page's frames:
  `hold()` keeps them back so a test's events meet the view as last drawn,
  and `settle()` waits until everything asked for is drawn, instead of a
  sleep. `Sync.mount`'s handle gains `settled()`, which waits until the Model
  has caught up with the replica (#170). `Sort.inputs`'s callback also
  gets the column clicked (`foldkit-crud`), so a sort header sends it and
  `update` toggles; the entity and registry examples do, and two clicks
  inside one frame now sort descending.
- **`App.runnable({ initial, update })` (`foldkit-surface`).** An
  application made from its Model and Messages is made runnable afterwards,
  with the same references and owner, for an update built over those
  references (a Remote domain, a placed Bundle) that Sync replays. The
  registry had two applications with two owners for this; it has one.
- **`foldkit-sync/journal`, the server's exchange over a journal.**
  `serveJournal(socket, options)` answers one socket's exchanges over a
  `foldkit-durable` journal (an optional peer) and notifies it of each
  commit; `journalExchange(options)` is the same as a `TransportClient`, and
  `journalChanges` the notice alone. An operation that does not decode,
  names another document, is refused by `authorize` or `validate`, or reuses
  an id is rejected by its id, so one bad operation no longer blocks the
  outbox; a cursor ahead of the journal's fails before anything is appended,
  and a replica of another epoch is answered from the start. `refuse`
  rejects by what the transport established, and `settle` applies commits
  elsewhere after each exchange. The todo-app, registry and kitchen-sink
  servers use it; todo-app's replicas now hear of each other's commits.
- **Remote over plain JSON (`foldkit-remote`, `foldkit-remote-server`).**
  `Remote.http(url, { headers })` is Remote's client over `POST`ed JSON,
  `Remote.json(send)` the same over any way of sending it (a worker, a
  server in the page), and `RemoteServer.answer(handlers, body)` the server's
  side: it decodes the request and payload by the protocol's own schemas
  before a handler sees them, and answers 200, 400 for a body that is not a
  request (an operation named `constructor` included), or 500, a defect
  saying only `Internal error`. `RemoteJsonRequest` and `RemoteJsonAnswer`
  are the wire. The entity, CMS and registry examples use them in place of
  their own copies.
- **Typed editing from Schema (`foldkit-data-grid`).** A column's `edit`
  takes a `schema` from the text typed to its value, in place of
  `validate`: a draft is committed only when it decodes, and the failure's
  message is the cell's error. `Grid.matchEdit(cell, handlers)` reads a
  reported cell's value back, one handler per editable column, each typed
  by its column's schema. `GridCrud.columns` keeps each member's options in
  its type, and `Columns` carries its specs type-only, so a grid infers a
  column's schema exactly. The editor is read from the schema
  (`CellEditor`, `Grid.editorFor`): a union of string literals is a `select`
  of them (new `choice` and `choiceOption` slots), a number a text field
  with `inputmode="decimal"`, anything else text.
- **`RowModel.map(rows, input, make)` (`foldkit-data-grid`).** Transforms
  each row as it is read, with the per-row function made from `input` once
  per `rows` and `input`, and the same model while both are. The registry's
  edits over Remote's rows are one call.
- **`examples/registry`, the registry over Remote and Sync.** 100,000
  products in SQLite behind a Drizzle `RemoteServer`, read a page at a time
  through a `Crud.list`, sorted on the server, loaded more on scroll. Edits
  are a Sync document kept on the device until the server's journal commits
  them; the journal applies each to the table through `recover`, and the
  grid draws a row with the replica's edits over it, so an edit survives a
  reload while offline and another device's shows on the next exchange.
- **A sorted header shows its direction (`foldkit-mixins-data-grid`).** The
  sort button carries `data-sort` (`asc` or `desc`), and `GridStyle` now
  styles the `sort` slot as the header's text with an arrow after it; it
  had been left a native button.
- **Fast typing on a grid keeps every key (`foldkit-data-grid`).** A key
  typed on the grid itself is now `EditTyped({ address, text })`: it starts
  the edit, or adds to the one open on that cell. Typing "Dowel" faster than
  a frame used to restart the edit on each key that reached the grid before
  its editor took focus, leaving "l"; Escape in that gap now cancels.
- **A column menu (`foldkit-mixins-data-grid`).** `columnMenu: true` puts a
  menu button on each header (`menuButton`) opening a `role="menu"`
  (`menu`, `menuItem`) of `Grid.menuItems`; Alt+ArrowDown, Shift+F10 or the
  menu key opens it from a focused header. It takes focus, walks with the
  arrows, Home and End, runs an item on Enter, Space or a click, and closes
  on Escape, a choice or focus leaving it. Words: `menu`, `pinStart`,
  `pinEnd`, `unpin`, `hide`, `show`.
- **A column menu's state (`foldkit-data-grid`).** `menu` in the Model
  holds the column whose menu is open and its active item; `MenuOpened`,
  `MenuMoved`, `MenuChosen` and `MenuClosed` drive it. `Grid.menuItems`
  lists pin to another region, hide, and show each hidden column, each only
  when it changes something, as `Grid.MenuItem`s; a chosen item runs the
  column Message it stands for. Hiding a column now also takes its header's
  focus and closes its menu, as it already ended its edit.
- **More rows as the end comes into view (`foldkit-mixins-data-grid`).**
  `moreOnScroll: true` beside `onMore` sends it when the More button comes
  within 200px of the grid's visible box (an IntersectionObserver rooted at
  the grid), and again after each load while the button stays in view; it
  asks nothing while `status` is busy.
- **A column header dragged to reorder it (`foldkit-data-grid`).** The grid
  holds a drag as its column and the pointer's delta (`dragging`), from
  `ColumnDragStarted` with the header's DOM id (`GridFocus.headerOf` reads
  it back), `ColumnDragged` and `ColumnDragEnded`. Let go, the column moves
  within its region past the middle of each shown neighbour it crossed,
  worked out then by `ColumnState.dropAt` from the columns as they stand; a
  cancelled drag moves nothing. `ColumnState.regionOf` says which region a
  column is in. `foldkit-mixins-data-grid` draws it: a press on a header
  moved past 4px drags it (a click, on a sort button too, stays a click),
  the header follows the pointer with `data-dragging`, the neighbour it
  would land beside has `data-drop`, and Escape lets it go back.
- **`examples/data-grid`, a 100,000-row product registry.** The UPC
  pinned, descriptions and prices edited with validation, rows and ranges
  selected, and copy and paste; the products are the application's, written
  by `onOut` from the grid's `Edited` and `Pasted`. Tested in jsdom and, at
  full size, in Chromium.
- **Editing (Phase 6).** A column with `edit: { draft?, schema? }` is
  editable as text. The `DataGrid` Model holds the session (`editing`), with
  `EditStarted`, `EditChanged`, `EditCommitted` and `EditCancelled`; a commit
  the column accepts moves focus and returns the OutMessage `Edited({ row,
  column, text })`, so every grid is now placed with `onOut`
  (`Bundle.ignore` for one that edits nothing). A refused draft stays with
  its error; a click elsewhere commits first; hiding the column ends it. The
  view opens a focused field on Enter, F2 or a typed key, commits with Enter
  and Tab, cancels with Escape, marks a refused draft `aria-invalid`, and
  hands focus back to the grid.
- **The header row by keyboard.** Focus holds a `header` beside the current
  cell (`HeaderFocused`, revealing a header scrolled away): ArrowUp from the
  first row reaches it, the arrows and Home and End walk it, and ArrowDown or
  Escape return. On a header, Shift with an arrow resizes the column and Ctrl
  or Meta with Shift and an arrow reorders it. `GridFocus.headerId` names a
  header cell.
- **`foldkit-data-grid`, `GridFocus.cellOf`** reads a cell id back into an
  address; an id from another grid, or with a malformed escape, is none.
- **`foldkit-data-grid`, `Columns.define` written inline keeps its row type.**
  Inside `DataGrid.make({ columns: Columns.define<Row>()({...}) })` every
  `row` was `unknown`; the return type is `NoInfer` now.
- **`foldkit-data-grid`, `GridViewport.scrollTo` on a container that cannot
  scroll** still reports `Revealed`: a DOM with no layout has no `scrollTo`,
  and the Command threw there.

### Changed

- **`foldkit-mixins-data-grid`: more on scroll is the `MoreOnScroll`
  Behavior, not a `GridInput` flag.** `moreOnScroll: true` is gone: attach it
  to the view, `DataGridView<Message>().define(Grid).pipe(MoreOnScroll)`. The
  More button is now keyed by the rows loaded and whether a load is in
  flight, whatever is attached (#157).
- **`foldkit-sync/journal`: `editsJournal` takes `tableRevision`,** the
  highest revision the table holds, required, for the check under Added. An edit to
  a row the table lacks is documented as the journal's `validate` to refuse,
  since recovery cannot refuse what has committed; the registry does so (#176).
- **`foldkit-sync`: `Sync.transport.socket` takes a `url` or a `makeSocket`,
  not both.** `makeSocket` takes no argument now, and a socket opened by one
  needs no placeholder `url`; passing both is a type error (#167).

### Fixed

- **`foldkit-remote-drizzle`: `contains` folds ASCII alone on Postgres too.**
  Postgres's `lower` follows the database collation, so under a UTF-8 one a
  search for `é` found `Élan`, which SQLite and the reference interpreter do
  not. The fold now runs under the `C` collation on a Postgres table, and the
  conformance suite runs against Postgres (PGlite) as well as SQLite (#145).
- **`foldkit-remote-drizzle`: a search the SQL cannot hold is the query's own
  error.** A query input holding NUL threw `QueryCompileError` from inside the
  request, which the RPC server answered as a protocol-level defect, so any
  client could turn a query into a server defect and the two backends told the
  same input apart. It now fails with `RemoteServerError`, which the client
  receives as `RemoteQueryError`, as the memory backend's does (#146).
- **`foldkit-sync`: `Sync.presence.serve` stops when its socket closes,** as
  `Sync.transport.serve` does. A peer whose socket had closed stayed in the
  hub and was sent every other peer's presence for the life of the server.
- **`foldkit-sync`: `statusChanges` and `changes` miss no change.** Each
  emitted the current value and subscribed to later changes only once that
  value was taken, so a subscriber slow to take it, and any change between
  the read and the subscription, went untold. They subscribe first now.
- **`examples/registry`: an edit lost while offline is said.** When the
  journal absorbed another device's later edit of a cell before this device
  heard of it, the page kept showing its own value as saved until some read,
  then changed it silently. A newly retired edit now asks for its rows again,
  and a read at or past an edit's revision holding another value says "a
  later edit replaced yours" (`Replacement.by` is an `Option`). The page names
  its device in the Model (`DeviceNamed`), so `replacedOf` reads it there (#173).
- **`foldkit-sync/journal` no longer reaches Node.** It imported
  `foldkit-durable`'s main entry, which brings `node:sqlite`, so a browser
  bundle of it failed; it imports `foldkit-durable/core`.
- **`foldkit-remote-drizzle` and `foldkit-cms-drizzle` take `drizzle-orm` as
  a peer.** As a dependency, an application whose Drizzle resolved with other
  optional peers got a second copy, and its tables did not type-check against
  the adapter's. Install `drizzle-orm` beside them.
- **`examples/registry`: a committed edit no longer hides the table for good.**
  Every edit a device knew of was laid over every row Remote read, with
  nothing to say when the table had it, so a row changed afterwards by any
  other commit kept showing the old edit. The table is the journal's read
  model: each row carries the `revision` it has read the journal to, written
  with the change in one statement that never moves a row back; the journal
  stamps each edit with the sequence it committed at; and a row shows an edit
  only while it is pending or committed after the row's revision. A table
  write that throws now fails its recovery intent and is retried on the next
  exchange, where it died before; an operation that says when it committed
  is refused. Every few seconds the server records, as its own operation
  (`AbsorbedEdits`, refused from a client), that the table holds every edit
  through its recovery cursor: replicas drop those edits and the log is
  compacted, so the replicated slice is what the table lacks. A page keeps an
  absorbed edit in `retired`, set by `onReinstall`, until its cached row is
  read at the edit's revision. The document is `registry-edits-2`, since
  `edits` changed shape, so a replica stored under the old one is not opened
  (#159).
- **`examples/cms` starts its studio again.** Since the studio's sections
  share one runtime, the entry drew it into a new element in place of `#app`
  that had no id, which the runtime refuses before drawing, so `pnpm dev` and
  the sandbox build showed a blank studio. The element takes `#app`'s id.
- **`examples/todo-app` adds what was typed, and keeps edits from a second
  browser.** The composer sent `RequestedTodo({ title: model.draft })`, the
  draft of the frame last drawn, so Enter pressed before the next frame
  added nothing; it sends `DraftSubmitted` and `update` reads the draft, and
  an agent's `RequestedTodo` no longer clears it. The replica was named by
  the token, so a second browser signed in as the same person restarted its
  operation ids and the journal refused each new one as reused; each tab is
  its own replica now. The end-to-end test found both.
- **`foldkit-sync`, `Mounted.dispatch` takes a Message as its type is.** It
  handed the value to a Foldkit inbound Port, which decodes what it is sent,
  so a Message with a transforming field (`Schema.OptionFromNullOr`, a
  `NumberFromString`) failed with a `SchemaError` and never reached
  `update`. It encodes the Message first now.

## 0.14.0

`foldkit-entity` 0.7.0; `foldkit-remote` 0.11.0; `foldkit-remote-server`
0.11.0; `foldkit-remote-drizzle` 0.9.1. Republished to re-pin:
`foldkit-cms` 0.4.1, `foldkit-cms-drizzle` 0.4.1, `foldkit-crud` 0.5.1,
`foldkit-form` 0.4.1, `foldkit-mixins-crud` 0.6.1 and `foldkit-mixins-form`
0.4.1, each of which pins a bumped package exactly. Every other package is
unchanged.

**Queries mean the same thing everywhere.** Nine reports from testing a second,
independent implementation against the published packages: a query is now a
frozen value, a shared node costs one visit, dependencies are reported per
Entity identity, `contains` folds the same way in memory and in SQL, and an
ordering refusal reads the same on every engine. On the server, related
entities serve their relations, field names from `Object.prototype` are
refused, and the memory backend can be served over a real transport. On the
client, `Remote.clientLayer` takes the stock `RpcClient` as it is.

### Upgrading from 0.13

- **A dependency's field names its owner.** `dependenciesOf` and
  `Query.dependencies` return `{ entity, key, owner }` per field. Code that
  compares the whole entry with `toEqual` needs the `owner` too, or compares
  `entity` and `key` alone. `Data.explain` is unchanged.
- **`Expr` nodes are frozen.** Code that changed a node after building it
  now throws in strict mode. Build a new node instead.
- **`evaluate` refuses more, the same way every time.** A null order key is
  refused wherever it is, including where an earlier term already separates
  the rows, and `contains` refuses text holding a NUL character, as the SQL
  compiler now does. `contains` folds ASCII letters only, so a search that
  relied on `É` matching `é` in memory no longer does; it never did in SQL.

### Added

- **`foldkit-remote-server`, `MemoryBackend.server`:** the server definition
  a memory backend answers through, so it can be served over a real
  transport, `RemoteRpc.toLayer(RemoteServer.handlers(backend.server,
  undefined))`, instead of copying the backend's private read and query
  closures (#140).

### Changed

- **`foldkit-entity`, a field's dependency names its owner:**
  `dependenciesOf` and `Query.dependencies` report each field as
  `{ entity, key, owner }` and keep one entry per Entity identity, so two
  Entities defined with the same name are no longer one dependency.
  `Data.explain` keeps the plain `{ entity, key }` form, which serializes and
  is unambiguous for a query reading one Entity (#139).
- **`foldkit-entity`, `evaluate` checks an ordering before sorting:** every
  term over every matched row, in row order. A refusal now names the first row
  that breaks the order, the same on every engine, rather than whichever pair
  the engine's sort compared first; and a null key is refused wherever it is,
  even where an earlier term already separates the rows. One matched row is
  never refused (#142).

### Fixed

- **`foldkit-entity`, `Expr` nodes are frozen:** a predicate could be changed
  after `Query.where` checked it, changing a built query's results or slipping
  another Entity's field past the ownership check. Every node is frozen as it
  is built (#138).
- **`foldkit-entity`, a shared expression node is visited once:** the
  ownership check and the dependency walk followed every path to a node, so
  `Expr.eq(n, n)` nested a dozen deep took thousands of visits. Each walk keeps
  the nodes it has seen (#137).
- **`foldkit-entity`, `contains` in `evaluate` folds ASCII only:** it folded
  full Unicode while the compiled SQL folds ASCII, so `É` matched `é` in one
  and not the other. It folds ASCII letters only now, as `Expr.contains`
  documents, and text holding a NUL character is refused by both
  interpreters. Two conformance cases pin the folding (#136).
- **`foldkit-remote`, `Remote.clientLayer` with the stock `RpcClient`:** it
  refused the client `RpcClient.make(RemoteRpc)` builds, whose calls can also
  fail with `RpcClientError`, so every application wrote an adapter. It takes
  that client as it is now, and a transport failure becomes the call's own
  Remote error (`RemoteReadError`, `RemoteQueryError`, `RemoteMutationError`,
  `RemoteLiveError`), which the UI shows and retries, rather than a defect.
  `RemoteRpcClient` gained a `TransportError` parameter, `never` by default,
  so in-process handlers are unchanged (#141).
- **`foldkit-remote-server`, `RemoteServer.entity` with a related Entity:** it
  declared only the Entity's scalar `fields`, so a relation such as `owner`
  was settled as withheld and a nested selection through it returned nothing.
  It declares the Entity's `members` now: fields, relations and derived
  members (#135).
- **`foldkit-remote-server`, requested fields named like `Object.prototype`
  members:** a request for `constructor` or `toString` was answered from the
  prototype by the memory source and renamed to it by the read path, so the
  field was neither answered nor settled. Field presence is an own-property
  check, renames are looked up the same way, and the alias maps have no
  prototype, so `__proto__@first=1` is an alias like any other (#143).

## 0.13.0

`foldkit-agent` 0.6.0; `foldkit-agent-a2a`, `foldkit-agent-mcp`,
`foldkit-agent-native` and `foldkit-agent-webmcp` 0.5.0; `foldkit-bundle`
0.5.0; `foldkit-bundle-surface` 0.3.0; `foldkit-cms` 0.4.0;
`foldkit-cms-drizzle` 0.4.0; `foldkit-crud` 0.5.0; `foldkit-durable` 0.6.0;
`foldkit-entity` 0.6.0; `foldkit-form` 0.4.0; `foldkit-mirror` 0.5.0;
`foldkit-mixins` 0.6.0; `foldkit-mixins-crud` 0.6.0; `foldkit-mixins-form`
0.4.0; `foldkit-mixins-richtext` 0.2.0; `foldkit-mixins-surface` 0.5.0;
`foldkit-mixins-ui` 0.6.0; `foldkit-primitives` 0.5.0; `foldkit-react` 0.3.0;
`foldkit-remote` 0.10.0; `foldkit-remote-drizzle` 0.9.0;
`foldkit-remote-server` 0.10.0; `foldkit-richtext` 0.3.0;
`foldkit-richtext-code`, `foldkit-richtext-code-shiki` and
`foldkit-richtext-markdown` 0.2.0; `foldkit-richtext-dom` 0.3.0; `foldkit-ssr`
0.3.0; `foldkit-surface` 0.6.0; `foldkit-sync` 0.8.0. `foldkit-metadata` and
`foldkit-react-codegen` are unchanged.

Every package moves a minor version, including those whose only change is
the new requirement. A `0.x` caret range accepts any patch of its minor, so a
patch that now needs Effect 4.0.0 would install itself into an application
still on the release candidate; a minor is the step an application takes on
purpose.

**On stable Effect.** Every package now requires Effect 4.0.0, the first
stable release of Effect 4, and Foldkit 0.165.0, the first Foldkit on it. The
code changes that follow from it are import paths and two type fixes; nothing
here changes behaviour on its own account.

**Smaller additions.** `form.value` reads a whole decoded form or nothing,
`Link.child` states a plain child once, `RowListView` draws a list as rows,
and the CMS history card can retry.

### Upgrading from 0.12

- **Effect 4.0.0 stable and Foldkit 0.165.0.** Every package now
  peer-depends on `effect@^4.0.0` (from `>=4.0.0-rc.116 <4.0.0-rc.118`) and
  `foldkit@^0.165.0` (from `^0.163.0`); `foldkit-mixins-ui` peers
  `@foldkit/ui@^0.165.0`. Foldkit 0.165.0 is the first release on stable
  Effect and pins it exactly, so an application moves `effect`,
  `@effect/platform-browser`, any other `@effect/*` package, `foldkit`, and
  `@foldkit/ui` together, and `@foldkit/vite-plugin` to 0.26.0.
  `foldkit-durable`'s `@effect/sql-sqlite-node@4.0.0` needs Node 22.16 or newer.
  - Effect 4.0.0 removed `effect/unstable/*`. Import `effect/http`,
    `effect/persistence`, `effect/rpc`, and `effect/sql`; `effect/unstable/httpapi`
    is now `effect/http-api`. Every import here has moved.
  - Effect 4.0.0 reversed `partition` in `Array`, `Chunk`, `Effect`, and
    `Record`, and `Option.partitionMap`: successes now come first. A call
    site written for the rc still type-checks and swaps its results. Nothing
    in this repository calls them; check your own.
  - `@foldkit/ui` 0.164.0 added a `transitionGeneration` field to
    `Animation.Model` and a `generation` to its Messages; a test fixture that
    builds an Animation Model by hand needs it.
  - `examples/livestore` keeps `effect@4.0.0-rc.112`: LiveStore's Effect 4
    build still imports the removed `effect/unstable/*` paths.

### Added

- **`foldkit-form`, `form.value(model)`:** the decoded input as `Some` when
  every key and row is valid as the form stands, `None` otherwise. All or
  nothing (unlike `partial`), so a parent that submits several forms reads one
  complete value per form without the nesting engine. Job Application composes
  its `ApplicationPayload` from it.
- **`foldkit-mixins-form/ui`, `field`:** an optional FormView override for
  Text/Multiline fields drawn through the styled UI adapters, preserving
  Changed/Blurred dispatch, names, required state, descriptions, checking and
  errors. Form and Auth adopt it while keeping their application-owned layouts
  and styled submit buttons. The main entry retains its plain-HTML renderer.
- **`foldkit-bundle`, `Link.child(link, update, view, slotId)`:** a child
  that is not a Bundle, stated once: the Link names where its Model lives
  and how its Messages wrap, and the pair yields the fold for `update` and
  the drawing for `view` (branded once, absent draws nothing). The studio's
  two sections adopt it, deleting a fold and a submodel apiece. Children
  with view inputs or OutMessages of their own stay hand-rolled.
- **`foldkit-cms`, `historyCard` retry and announced states:** an optional
  `onRetry` with `retry` words draws a retry button on a failed history
  read, on the restore slot so no new builder is required; the Failed and
  Loading states draw as an alert and a busy status instead of plain text.
  The body now branches through `Match.tagsExhaustive`.
- **`foldkit-mixins-crud`, `RowListView`:** a list drawn as `ul`/`li` rows
  over the same state contract `ListView` carries (busy, empty, failed with
  the caller's retry, a failed refresh kept above its rows). The application
  draws each row's content through `RowListInput.row`; `onOpen` makes the
  whole row a button. Both lists share one implementation, so their states
  cannot drift.

### Fixed

- **`foldkit-primitives`, the socket and SSE bundles under Foldkit 0.165:**
  the private `unlessSame` helper inferred its type from both arguments, and
  Foldkit 0.165's `match` no longer passes the declared return type into each
  arm, so `{ ...model, status: 'connecting' }` widened `status` to `string`
  and failed to type-check. It infers from the current Model alone now.
- **`foldkit-primitives`, `PointerDrag`'s drop target:** a drop named the
  place the last move reported, so a scroll or a layout change between the
  final move and the release dropped onto a stale target. The release is
  hit-tested again when it carries a position; one without keeps the last
  move's answer.
- **`foldkit-mixins-ui`, `Recipes.Dialog`:** restores the modal's
  `margin: auto`, which `Defaults.reset` zeroes, so a dialog opens centered
  rather than in the top corner.
- **`foldkit-bundle`, `Bundle.withServices` in a `compose` pipe:** it refused
  a composition whose placements were already readable (every child
  configured, or none), because its parameter typed the incoming services as
  `any` and `Composition` is invariant there. It is generic now, so
  `Bundle.compose(fields).pipe(Bundle.withServices<S>(), Bundle.withChild(…))`
  type-checks as the README says.

### Changed

- **`examples/foldkit/ui-showcase`, on `@foldkit/ui`'s own Meter, Progress
  and vertical Slider.** The showcase drew local ports of Meter and Progress
  because `@foldkit/ui` had neither, and showed "Fractional steps" where
  upstream shows a vertical Slider because the Slider had no orientation. Both
  arrived in 0.164.0: the pages now draw upstream's components through the
  page's Slots, the volume slider stands upright (`orientation: 'Vertical'`,
  styled by the `data-vertical` the Slider writes), and the ports are deleted.
  Their tests went with them; the new ones check what the page configures:
  each meter's value, label and thresholds, both progress states, and the
  slider's orientation.
- **`foldkit-primitives`, broken out into one reference per subpath.** The
  package README is onboarding and a map: which of the five forms a primitive
  takes (bundle, bundle plus Behavior, entry, Mount, Command, or function),
  one placement walked through, the three other ways in, the rules every
  primitive keeps, and a table pointing at ten subpath pages. Each subpath
  README (`media`, `net`, `time`, `state`, `motion`, `device`, `events`,
  `observers`, `dom`, and a new `interaction`) now holds its primitives'
  Model shapes, Messages, args, a placement in `Bundle.compose` form, and the
  detail that used to sit in one 1000-line page. Every snippet is type-checked
  in `test/readme.test-d.ts` and `test/readme/<subpath>.test-d.ts`, which
  caught two snippets the old page could not keep: a `SlotView.define` whose
  input was unannotated, and a `withChild` config whose `onOut` returns
  Commands (written against `Base.Model` and given through `configure`).

- **`foldkit-sync`, `foldkit-durable`, and the replicated-state guide,
  rewritten for the reader who has an application and wants it to work
  offline.** Both READMEs now lead with the normal path (declare, mount, run
  the loop; spread the contract into the journal) and keep the replica API,
  transports, presence, and LWW under an advanced section. The Sync README
  adds the three milestones an edit passes (visible, saved, committed) and
  which reader shows each, a section on testing with a memory `Storage` and
  the loopback transport, and a failure list ordered by what changes the
  design. The guide (`docs/replication.md`) is now one feature end to end
  and carries the server's exchange handler in full, which neither README
  could show: cursor check, append with deterministic rejections, paging,
  checkpoint below the floor, epoch, and `Sync.transport.serve` with a
  change notice. Every snippet is type-checked: the READMEs' in each
  package's `test/readme.test-d.ts`, the guide's in
  `examples/sync/test/guide.test-d.ts`.

## 0.12.0

`foldkit-agent` 0.5.0; `foldkit-bundle` 0.4.0; `foldkit-cms` 0.3.0;
`foldkit-cms-drizzle` 0.3.0; `foldkit-durable` 0.5.0; `foldkit-entity` 0.5.0;
`foldkit-form` 0.3.0; `foldkit-mirror` 0.4.0; `foldkit-mixins` 0.5.0;
`foldkit-mixins-crud` 0.5.0; `foldkit-mixins-form` 0.3.0;
`foldkit-mixins-ui` 0.5.0; `foldkit-primitives` 0.4.0; `foldkit-remote`
0.9.0; `foldkit-remote-server` 0.9.0; `foldkit-richtext` 0.2.0;
`foldkit-richtext-dom` 0.2.0; `foldkit-ssr` 0.2.0; `foldkit-surface` 0.5.1;
`foldkit-sync` 0.7.0; `foldkit-remote-drizzle` 0.8.1. Republished to re-pin:
`foldkit-bundle-surface` 0.2.1, `foldkit-crud` 0.4.1,
`foldkit-mixins-richtext` 0.1.1, `foldkit-mixins-surface` 0.4.1, `foldkit-react`
0.2.1 and the four agent adapters 0.4.1. Three packages are published for the first time at
0.1.0: `foldkit-richtext-code`, `foldkit-richtext-code-shiki` and
`foldkit-richtext-markdown`. `foldkit-metadata` and `foldkit-react-codegen`
are unchanged.

**A page is assembled, not spread.** `assembly.runtime` builds the runtime
config in one call from an update that already routes every placement, and
derived args come from the parent seed — so a routed page takes its search
text without a second fetch, and `assembly.config` is gone.

**Remote asks once and says when.** A query carries its selection and comes
back with the fields (`Data.meta` says when it arrived and whether it is
stale), and `Data.satisfy` prepares a Model for a render, which is what the
static build runs per page.

**Static sites end to end.** The browser entry loads no server renderer, a
takeover is an explicit decision (`when`/`otherwise`/`fresh`), a
determinism check renders every page across zones and locales, and the
`staticSite` plugin turns `vite build` into the whole static build.

**An editor that replicates.** `Replicated` folds character-identified ops
in any order to the same state, `patchTo` redraws a remote keystroke without
remounting, and task lists, overlays and decorations round out the canvas.

**Views with less machinery.** `Input.field` draws a validated field in one
call, `FormView.fields` draws per key with overrides, `Button.view` is one
call, and every adapter has `toView`; forms validate all without
submitting, and a submit waits or disables explicitly.

**Styling without stylesheets.** Slots declared by their style, cascade
layers as a value, a theme from a few knobs, `Style.install`,
`Style.usedIn` for the first paint, and a `foundations` plugin that writes
the sheet into the head.

**State that survives.** The journal pages history, vacuums itself, and
binds replicas to actors across schema 6; Sync exchanges over a socket that
reconnects, persists its outbox in IndexedDB v2, and takes server resets.

### New packages

- **`foldkit-richtext-code` 0.1.0.** Total grammars as tokenizers over the
  shared `syntax-*` kinds: a JSON lexer that never throws, for
  `codeDecorations`.
- **`foldkit-richtext-code-shiki` 0.1.0.** Shiki grammars as tokenizers over
  the same kinds (colours discarded, scopes mapped, one stylesheet); the
  application owns the highlighter.
- **`foldkit-richtext-markdown` 0.1.0.** Markdown round-trips for the editor
  document: task items, tight lists, and the words around them.

### Upgrading from 0.11

- Replace `assembly.config` with `assembly.runtime` (compose a narrow
  `assembly.update(own)` first where the parent adds Messages); placement
  factories now take the seed without the placement's own field.
- Handle `Loading` and `Failed` from `Cms.revisionsOf` instead of an empty
  list; pass the `RevisionHistory`, not rows.
- Send mutations with `now`, read answers as `MutationAnswer`, and read
  `Data.more` as an `Option` (`Data.next`/`previous`/`fetch` are gone);
  entry dependencies are typed, and an overlaid-missing field reads
  `Failed`, not `Initial`.
- Expect Timer/Interval's first tick one interval after `Started`; match the
  new `TimedOut`/`GoTo` variants and the History `group` field.
- Serve the envelope on the stamped root (not a pre-`</body>` script);
  `SSR.entry` takes no `template`/`containerId`/`head` and refuses `meta`
  plans at construction; the `foldkit-ssr/replay` entry is gone.
- Open IndexedDB v2 fresh (old code cannot open it) and migrate durable to
  schema 6 (`legacyReplicaId` recovers actor-less replicas); the socket
  reconnects for as long as its layer lives.
- Rebuild hand-built `StyleValue`s through the brand; move the family
  `text` token to `on-fill`/`ink` (`text['on-accent']` is gone).
- Upgrade `foldkit-mixins-surface` with `foldkit-mixins` (its peer moved to
  `^0.5.0`), and the agent adapters with `foldkit-agent` (`^0.5.0`).
- A hand-written form control now satisfies `Record<FormTag, …>`; unknown
  `FormView.fields` keys are compile errors.
- Stay on Effect `4.0.0-rc.116` (rc.117 is admitted untested); the peer range
  stops below rc.118, whose `effect/rpc` move breaks our
  `effect/unstable/rpc` import. The import moves with the workspace Effect
  upgrade, which widens the range again.

### Breaking

- `foldkit-bundle`: `assembly.config` is removed; shared tags reach every
  claimant and the parent (first-claimant-wins is gone).
- `foldkit-cms`: `revisionsOf` returns `RevisionHistory`; `historyCard`
  takes it, not rows.
- `foldkit-remote`, `foldkit-remote-server`: `MutationSucceeded` carries
  `now`; `settleSuccess`/`reconcileMutation` take `MutationAnswer`; query
  windowing is `Data.more: Option` with `WindowGrown` (`next`/`previous`/
  `fetch` removed); entry dependencies are typed; overlay-missing reads
  `Failed`.
- `foldkit-primitives`: Timer/Interval tick late; `TimedOut`/`GoTo` break
  exhaustive matches; `HistoryModel` gains `group`.
- `foldkit-ssr`: the envelope rides the stamped root; `SSR.entry` answers
  `Rendered` with a new contract; the `replay` entry is gone.
- `foldkit-sync`, `foldkit-durable`: IndexedDB v2 and durable schema 6 do
  not open older stores; the socket reconnects while its layer lives.
- `foldkit-mixins`: `StyleValue` is branded; the family `text` token is
  `on-fill`/`ink`.

### Added

- **`foldkit-mixins-ui`, Badge recipe:** a status pill with a dot, toned by
  an attribute's value — `Recipes.Badge({ attribute: 'data-state', tones: {
  Published: 'success' } }).badge`. Unlike the variant recipes every tone is
  present at once (one style serves badges in every state), so it takes the
  attribute and the value-to-tone map instead of a variant selection; values
  the map leaves out keep the base. The CMS demo adopts it for both badges
  and keeps only the state-to-tone map.

- **`foldkit-mixins-crud`, Loading/Empty/Failure views:** what a read says
  before it has an answer, over any status slot — `Loading.view` is
  `role="status"` with `aria-busy`, `Empty.view` is `role="status"`,
  `Failure.view` is `role="alert"`, and `Loading.shown` fades busy text in
  late so a quick answer never flashes. `ListView` and `DetailView` draw
  these for their own states; the CMS demo adopts them for its lists, site
  reads, and editor branches.

- **`foldkit-cms`, entry views:** the studio cards every CMS draws, on its
  own slot builders — `Cms.stateBadge`, `Cms.revisionsOf`, `Cms.historyCard`,
  `Cms.moreCard`, with `HistoryCardSlots`/`MoreCardSlots`/`RevisionRow`
  types. Who published and the archive icon stay the application's; words
  for states come from `Cms.Display`. The CMS demo adopts them and keeps
  only its slots, styles, and chair names.

- **`foldkit-cms`, entry views fixes:** `Cms.stateBadge` writes a custom
  attribute for a new entry too, and `Cms.revisionsOf`/`Cms.historyCard`
  read a `RevisionHistory` so a failed or still-loading history no longer
  draws as nothing published. The CMS demo's `stateIs` copy is deleted in
  favor of `Cms.stateIs`.

- **`foldkit-mixins-ui`, Touch/Icons mechanisms:** no slots, no views —
  `Touch.target`/`Touch.targets` floor controls at 44px where the pointer is
  coarse, `Icons.glyph(size)` draws the icon in `--icon`, and
  `Icons.byAttribute(attribute, icons)` sets it per value from resolved
  `url(…)` strings. The CMS demo adopts them and keeps only its Lucide
  paths.

- **`foldkit-mixins-ui`, Button `primary`/`icon` variants:** the main action
  in ink (`variant: 'primary'`, tone-independent) and the square icon-only
  button (`variant: 'icon'` with `size: null`, words as the accessible name).
  The CMS demo adopts them with `ghost` for its buttons and deletes its
  bespoke `primaryButton`/`iconButton`.

- **`foldkit-mixins-ui`, Segmented recipe:** a tray of toggle buttons where
  pressing selects (`role="group"` + `aria-pressed`, not `Tabs`) — `tray`
  picks a muted tray or a plain row, `size` the text density, and the pressed
  option rises from the group so icon tiles share the rule. The CMS demo
  adopts it for its worklist tabs, viewport switcher, panel tabs, and
  inspector choices.

- **`foldkit-mixins-ui`, `Input.view`/`Textarea.view`:** one call drawing a
  field — the value and Messages, a style, `type`/`placeholder` (`rows` for a
  textarea), and a `draw` placing the resolved bundles. The job application's
  button fork is deleted in the same spirit: its views call the package
  `Button.view` instead of their subset copy.

- **`foldkit-mixins-ui`, `Input.field`/`Textarea.field`:** a text field in
  one call — a field's state drawn with its label, control, and description
  placed (first error, or the check while it runs), `type`/`placeholder`
  (`rows` for a textarea) riding through, and a `draw` placing the parts
  for layouts the default stack does not own. The waitlist example's
  per-kind overrides and the job application's field view adopt them and
  keep only their layouts and status marks; both now read the platform
  `Checking…` spelling.

- **`foldkit-mixins-form`, per-key element attrs:** `FormView.fields` takes
  `attrs` beside `overrides` and `styles` — what one key's element takes
  beyond the base field view (`type`, `placeholder`, textarea `rows`). The
  default renderers forward what fits their element and ignore the rest, and
  overrides receive the same map. The waitlist example moves its email type
  there and drops the thread-through.

- **`foldkit-mixins-form`, submit gating:** `FormView.submodel` takes the
  submit gate explicitly — `canSubmit` (a submit waits), a strict predicate
  (disabled through checks), or `() => true` (never pre-disable). The lenient
  default is unchanged.

- **`foldkit-primitives`, SSE view parity:** `SseView` with `isLive` and
  `viewOfSse(model, wanted)`, the same shape as the socket's `SocketView` —
  a page derives what the reader sees instead of keeping its own connection
  state.

- **`foldkit-bundle`, derived args:** a placement's `args` is a static value
  or a factory from the parent seed, `args: parent => ({ searchText:
  searchFromRoute(parent.route) })`. The seed is what
  `assembly.initial(rest)` was given, before any placement initialised; the
  factory's parameter omits the placement's own field, and every factory sees
  the same base seed, so placement order never matters. The result is checked
  against the bundle's args Schema and retained for `update`, helpers,
  Subscriptions, and resources, never re-run against live state — a factory
  runs once per seed it has seen. On a Model
  no initialization produced, `update` derives per use without retaining.

- **Routing example, derived placement args:** the People page is a Bundle
  placed once with its search text derived from the starting route, so
  `init(url)` is `assembly.initial({ route })` with no second fetch and no
  post-init Message. Route changes after startup still arrive as Messages,
  folded through the same placement, and the view keeps its `people` slot.

- **`foldkit-primitives`, scroll keeping:** `keepScroll(options)` in
  `foldkit-primitives/dom` — the window's scroll across an application's own
  navigations (the offset taken when the reader acts, a restore that holds
  while the screen settles, entries keyed by the Navigation API with offsets
  in `sessionStorage`). A stream sending no Messages, lifted with
  `Subscription.persistent`; the default storage key is `foldkit:scroll`.
  The CMS example adopts it in its studio and site subscriptions and deletes
  its hand-rolled `scroll.ts`.

- **SSR S1, browser entry without the server renderer:** the CMS example's
  browser entry takes `SSR` and `FOLDKIT_APP_ATTRIBUTE` from
  `foldkit-ssr/client` — its hand-written root mark is gone, and the takeover
  plan rides the bundle instead of a lazy chunk (cheap now that it draws
  from the client side, with no server renderer). A static import walk from
  the entry fails on reaching `foldkit/experimental/server`.

- **SSR S6, build determinism:** the CMS example renders every page twice
  under one time zone, once under zones at both extremes of the date line,
  and under two default locales in child processes — any difference fails
  the build. Building the check fixed two live leaks: `generateSite` takes
  the build's clock, threading it into the server and, via
  `Data.satisfy`'s `now`, into the read stamps the envelope carries.

- **SSR S7, static site as a build step:** `foldkit-ssr/vite` renders every
  path after the client bundle is written — `generateStaticSite` (paths or
  a thunk closing over what the site serves, per-path configs, template,
  head, `flat`/`directory` file layout, sitemap, robots) behind the `staticSite`
  plugin, which evaluates the site module through a server so the config
  names a file, never application code. `foldkit-mixins/foundations` writes
  the sheet module's stylesheet into the head the same way. The CMS example
  builds through both and deletes its hand-rolled script and plugin. Empty
  paths and two paths naming one file are refused before rendering.

- **SSR S5, deciding whether to take a page over:** `SSR.hydrate` takes
  `when` (asked before anything is adopted), `otherwise: 'render'` (a
  declined page draws afresh where the served page is, replacing its markup
  in place; anything else contains it as a resume failure does), and `fresh`
  over the plan's new `version` (asked once). The CMS example collapses its
  takeover branch into one call: a page for another reader draws afresh
  instead of taking stale facts over as live ones.

- **`foldkit-cms-drizzle`, `ImportItem<P>`:** the input of `cms.import`,
  named and exported — what a seed or a migration passes per entry (`type`,
  `values`, `as`, `at?`, `entry?`). The package's own tests and the CMS
  example's `seed.ts` read it instead of re-declaring it, and the README
  gains the seeding shape beside it: a fixed clock, named entries imported
  dependencies-first, `as` fixed once.

- **`foldkit-bundle`, `assembly.runtime`:** the runtime config in one call for
  an application whose `update` already routes every placement. `initial`
  rest becomes `init`, or an init function returning
  `assembly.initial(...)` is used as `init` when the seed needs runtime
  input, like the URL. The `update` passes through checked (route a narrow
  one with `assembly.update(own)` first, or omit it when the parent adds no
  Messages); the own `subscriptions` and `managedResources` merge with the
  items', defaulting to the items', so an application that adds none passes
   neither. `assembly.config` is removed in its favour; the CMS
   `siteConfig` and the entity client use it. Passing an already-wired
   record (`assembly.subscriptions()`) back as own is a type error instead
   of a later duplicate-key failure.

### Fixed

- **`foldkit-bundle`, placement typing:** `PlacedResources` keeps
  `onAcquired`'s parameters, so `Scene.ManagedResource.acquire` on a placed
  resource needs no stand-in value; a Link carries its top-level field, so
  `placements.initial` keeps its exact check through a custom Link, and an
  `Option` placement field may be given to start `None`.

- **`foldkit-mixins`, a slot named `__proto__`:** `forSlots` kept its piece
  on a plain object, where the name set the prototype instead.

- **`foldkit-remote`, two policies without losing data:** two
  `Data.subscriptions` calls over one domain no longer collect each other's
  data. Retention is the domain's: every call's `retain` entry roots the
  Surfaces and `connections` of every call, so reads under different policies
  can use a call each.
- **`foldkit-remote`, the default clock:** it reads `Date.now` at each use
  instead of capturing it when the domain is made, so fake timers move plans
  and stamps. A read under `staleWhileRevalidate` planned at the exact
  millisecond a value expired no longer stalls.

- **`foldkit-form`, optional and `Option` keys:** a key made with
  `Schema.optionalKey` and left empty is valid and left out of the value, as
  it already was for `Schema.optional` (an optional nested key too). A key
  typed `Option` (`Schema.OptionFromNullOr`) is edited as the value it holds
  and submits `Option.some` / `Option.none()`, instead of throwing "no
  control". A validation that changes nothing (a blur on an empty optional
  key) returns the Model it was given, so nothing redraws.

- **`foldkit-mirror`, a slow restore no longer loses the stored document:** a
  key-value or kernel mirror holds each write until the Model has taken in
  what `restore` answered. Before, the write Subscription started from the
  initial Model and, once the throttle passed, replaced or deleted the stored
  slice while the restore was still reading it. The hold is per runtime and
  applies again on every restore; a failed read counts as an empty store.
- **`foldkit-mixins`, `Inert.missingTokens` reads inline styles:** a
  `var(--fk-…)` in an inline style value is reported when nothing defines it,
  as a compiled rule's read already was; a token set inline still counts as
  defined.

- **`foldkit-remote`, query payloads in one response:** `Data.query(Query,
  input, { select })` sends the selection with the query, and the server
  returns the selected fields of the page's items with the edges. One
  `ConnectionMerged` merges the page and writes the fields, so a fresh list
  lands `Ready` without a second read. Edges-only servers still work: no
  selection sent means edges only, and absent entities read as empty. The
  shared requirement reader is exported as `RemoteServer.readHelper`, so a
  custom handler answers the same settled-fields payload.

- **`foldkit-remote`, `Data.meta(model, projection)`:** when what is shown
  was last received (`updatedAt`, newest server write among it, `undefined`
  when nothing shown was received), and whether any of it is stale or
  loading. Pure, for "updated 5s ago" without I/O.

- **CMS example, one studio application:** posts and pages share a document,
  a runtime and an address (`examples/cms/src/apps/studioApp.ts`); moving
  between them swaps no application. Each section keeps its Model, update,
  view and subscriptions (its Remote domain folds its own Messages); a
  same-document navigation carries the address's query into its target.

- **`foldkit-mixins-form`, `FormView.fields(form, { overrides, styles })`:**
  the whole form as `define` draws it, with per-key overrides and styles, plus
  one flat key's control for a layout the caller owns. Keys with no override
  render by kind, so a new key of a known kind needs nothing new; unknown
  keys are type errors. An override receives the control, field, id, validity,
  errors and Messages, with any `h`.

- **`foldkit-primitives/net`, the socket reads itself:** the WebSocket bundle
  tracks `opened` beside `status` and `lastError`, words its own errors
  (`Failed to connect to WebSocket` before it opened, `Connection error`
  after, `Connection timeout`, `Socket unavailable`), and derives `SocketView`
  (`Disconnected`/`Connecting`/`Connected`/`Error`) from the socket and
  whether the page still wants it, with `isOpen` gating sends and frames. A
  page keeps one `wantConnection` boolean instead of a connection state
  machine; `foldkit-websocket-chat` is the first caller.

- **`foldkit-mixins-ui`, `Button.view({ label, style, ... })`:** a button
  drawn as a button in one call (label, style, `type`, `disabled`, `onClick`),
  without the `UiButton.view` → `Button.toView` → `h.button` ceremony.
  `toView` stays for buttons drawn as something else.

- **`foldkit-remote`, `Data.satisfy(model, actives, { passes? })`:** the Model
  with everything the active Surfaces read, for a render that fetches nothing.
  It prefetches each Surface that plans a read, cache-first, pass after pass
  until a pass plans nothing, so a read that depends on another (a page's
  Blocks on its document) is made too. Past the bound (8 passes) it fails with
  `RemoteUnsatisfied`, naming the Surfaces still reading.

- **`foldkit-ssr`, `SSR.plan({ meta: model => Meta })`:** what a page says of
  itself to a search engine and a link preview (description, `og:*`,
  `twitter:card`, `article:*`, `robots`, alternates, JSON-LD), from the Model.
  The render writes it before `</head>`, escaped, and checks it like the view;
  `SSR.hydrate` replaces it as the Model changes, so a move to another post
  updates its description. `SSR.page` and `SSR.entry` now refuse a render that
  sets `canonical` or `ogUrl` into a template without the tag Foldkit fills,
  which Foldkit would otherwise leave out silently. The CMS example's
  hand-built head is now its plan's `meta`.

- **`foldkit-ssr`, `styles` for the first paint of a served page:**
  `SSR.render`, `SSR.entry` and `SSR.handle` take `styles: rendered =>
  string`, carried as the rendered root's last child where no template head
  can take it. Hydration adopts the nodes around it and drops it on its first
  patch; styles for a void root are refused with `VoidRootWithStyles`. The
  `foldkit-ssr` example ships its stylesheet this way again, as `SSR.generate`
  pages do in the head.

- **`foldkit-ssr`, `SSR.sitemap(pages, { origin })` and
  `SSR.robots({ origin, sitemap?, disallow? })`:** a generated site's sitemap
  (each page's full address, its `modified` date as the UTC day) and the
  `robots.txt` naming it. A duplicate path, a relative one, or a date `Date`
  cannot read is refused. The CMS example drops its own `sitemapOf` and
  `robots`.

- **`foldkit-bundle`, `onMessage`:** a placement's `onMessage` (and
  `(message, key)` on a collection) observes each child Message as a parent
  Step after the child and its `onOut`; `placements.update(own)` types `own`'s
  Message without the placements' wrappers (`Bundle.OwnMessage`).
- **`foldkit-bundle`, Links for `Update.foldChild`:**
  `Link.wrapper(Message.GotXMessage)` builds a wrapper from a variant the union
  already declares, and `Link.field` / `Link.optional` writes return the parent
  when the child is unchanged, so `Update.foldChild({ ...link, update })` no
  longer redraws for a Message the child ignores. `foldkit-ui-showcase` folds
  its 38 components this way. `Link.foldInit(link, rest)` is what
  `Update.foldChildInit` takes: the Link's `toParentMessage` with a
  `toParentModel` that writes the child into the rest of the parent.

- **`foldkit-primitives/time`, `ticks({ intervalMs, onTick })`:** a clock
  entry whose running and interval are functions of the parent Model; a new
  interval applies from the next tick without a restart. Timer and Interval
  are built on it.
- **`foldkit-primitives`, `keyboardEvents({ preventDefault })`** cancels the
  default of the presses a predicate over `KeyPress` picks, decided in the
  listener.
- **`foldkit-primitives`, websocket:** `Sent` carries `{ data }`, and an
  optional `connectTimeoutMs` closes a socket still connecting and reports the
  new `TimedOut`.
- **`foldkit-primitives`, `History.goTo(model, step)`** and the bundle's
  `GoTo { step }` jump to any kept step.

- **`foldkit-mixins`, slots declared by their style:** `Style.slots(pieces)`
  declares an application's own Slots from their styles and returns
  `{ slots, style }`; `Style.slot(options, piece)` gives one a capability,
  events or attributes. `forSlots` stays for a contract someone else published.
- **`foldkit-mixins`, short pieces:** wherever a piece is taken, a
  declarations object means `Style.self` and a list means `Style.compose`.
- **`foldkit-mixins/app`:** `AppStyle.make({ palette, colorScheme?, global? })`
  fixes the theme, the `app` layer and the page stylesheet once, giving `t`,
  `L`, `slots`, `forSlots` and `stylesheet`.
- **`foldkit-mixins/utilities`:** `Utilities` (`p`, `px`, `gap`, `text`,
  `font`, `rounded`, `color`, `bg`, `flex`, `truncate`, …) are pieces over the
  `Theme.tokens` scales and `Theme.oklch` names, so a step the scale lacks is a
  type error.
- **`foldkit-mixins`, `Style.install(css)`** puts a stylesheet in the page's
  head once and returns the element.
- **`foldkit-mixins/testing`:** `Inert.draw` draws views that use
  `h.submodel`; `Inert.css(nodes)` and `Inert.missingTokens(root, stylesheet)`
  replace the checks every view test wrote by hand.

- **`foldkit-mirror`, `Mirror.bootstrap` and `mirror.bootstrap(keys)`:** a
  first-class pre-init seam. When a store's keys are already in hand at boot
  (Flags the server embedded, a synchronous read, a test fixture),
  `Prefs.bootstrap(keys)` folds them into the initial Model before the first
  render — the same conservative read `reduce` applies to a `MirrorRestored`,
  with no Command and no flash — and `Mirror.bootstrap(initial, ...steps)`
  composes store steps with the URL step (`model => Filters.reduce(model,
  url)`), keeping URL > store > initial. This is deliberately not part of
  `Wiring`: a bootstrap runs inside `init` before the Model exists, while
  `Wiring.init` runs startup Commands (such as `restore`) after it.

- **`foldkit-mirror`, `Mirror.routing`:** `Mirror.routing({ mirrors,
  urlChanged, init, update, routing })` returns `init`, `update` and `routing`
  for `Runtime.makeApplication`. URL mirrors read the starting URL and each URL
  Message before the application's own `update` routes it; its `onUrlRequest`
  and `onUrlChange` pass through unchanged. `foldkit-query-sync` uses it.

- **`foldkit-ssr/client`, a browser entry:** `SSR.plan`, `resume`,
  `hydrate`, `static`, `serving`, `Resume` and the attribute names (including
  `FOLDKIT_APP_ATTRIBUTE`), importing nothing from
  `foldkit/experimental/server`: about 200 kB minified (60 kB gzip) less on a
  hydrating page. `foldkit-ssr` still exports everything.

- **`foldkit-mixins-ui`, `toView` on every adapter:**
  `X.toView(mixins, { h }, draw)` fills a component's `toView` slot and hands
  `draw` the bundles with the Mixins applied, in a component's `view` or a
  Submodel's `viewInputs`. `resolve` stays for bundles already in hand, and its
  `input` is now optional. Every adapter exports its result type
  (`ResolvedButton`, `ResolvedInput`, `ResolvedRadioGroup`, …), and
  `Textarea`'s `textarea` bundle is typed for `h.textarea`, so no cast.

- **`foldkit-form`, validating without submitting:**
  `Message.ValidatedAll()` validates every key and row as a submit would and
  submits nothing; `form.isValid(model)` says whether a submit now would hand
  over the value at once (unlike `canSubmit`, a running or unrun check is not
  valid). A nested row's Message that changes nothing keeps the parent Model
  by identity instead of rebuilding its rows, so a no-op in a row renders
  nothing.

- **`foldkit-mixins-form`, a check running and a submit in flight:** a key
  whose check runs shows a `Checking…` line in the new `checking` Slot
  (`role="status"`, named in the control's `aria-describedby`, words
  `words.checking`), and each field's `root` carries `data-validation` with
  its state. While a submit waits for a check, or the new view input
  `submitting` says the application's request is in flight, the `form` is
  `aria-busy` with `data-submitting` and the submit button is disabled and
  reads `words.submitting` (default `Submitting…`).

- **`foldkit-bundle`, a shared tag reaches everyone who shares it:** a Message
  tag wirings declare `shared` is folded by each of them in list order, and
  the parent's own update sees it after them. Before, the first claimant took
  it: of two URL mirrors only the first read the URL, and an application with
  a URL mirror never saw its own `UrlChanged`, so it could not route on it.

- **`foldkit-mixins-crud`, loading told from empty:** a list's or a detail's
  `status` line is `aria-busy` while the first answer is awaited, as the table
  already was while refreshing, so a style can draw a quiet placeholder for
  loading and keep its empty state for empty.

- **`foldkit-agent`, correlating by the call:** a completion's `correlate`
  receives a third argument, `{ invocation }` (type `Correlation`), so a fact
  that carries the invocation's id from `toMessage` is told apart where the
  input is not. The todo app and the root README's example completed `add_todo`
  by matching the trimmed title, which mixed up two todos of one title; they now
  pass `requestId: invocation.id` through `RequestedTodo` to `SubmittedTodo`.

- **CMS example as a static site:** `pnpm --filter foldkit-example-cms
  build:sandbox` builds the studio and the public site with the same server
  running in the page, on SQLite compiled to WebAssembly (`sql.js`), so it
  deploys with no backend. Each visitor's sandbox is kept in the browser's
  storage; `?reset` starts afresh. The server takes its database
  (`openServer(clock, sqlite)`), and one endpoint module answers requests for
  both the HTTP server and the page.
  On a phone the studio's sidebar is a top bar (the brand and who is looking,
  then the sections in a row), the editor's bar wraps its actions under its
  status, the builder's panels scroll within a short height so the page
  shows, and a post list's cards fit a narrow canvas. The posts open with what
  the demo is and what to try, and the page says it is starting while the
  sandbox opens. The address keeps the open post, the search and the Archive
  tab, as it kept the open page, so a reload lands where one was, and opening
  or closing a post or a page is a step Back returns from. A page has its History
  and More (discard, unpublish, archive) under a fold below the editor's bar,
  as a post has them in its aside. The History is a timeline: each revision
  with its date, time and publisher, the newest marked Live while it is on the
  site, and Restore offered only where it would change something. Moving
  between the studio's sections and the site no longer paints white: the
  foundations' stylesheet is in the HTML. A wait says "Loading…" only once it
  is noticeable, an entry being read shows no "New" badge, and the pages list
  no longer says "Nothing yet." before it is read. A new screen starts at the
  top and Back, Forward or a reload return where it was. A chair's avatar is
  centred in its touch target on a phone. The page builder shows its panel
  tabs at every width it stacks at: an editor between 52rem and 64rem wide
  (a 1280px window's) stacked every panel above the page with no tabs, so a
  new page seemed to open without one. The address keeps a post's preview and
  the Builder's panel and preview width, so a reload comes back to them, and
  the worklist's search and tab go through a `foldkit-mirror` URL mirror
  (`?archive=true` where it was `?archive=1`). The blog's eight posts explain
  how the demo is made (the CMS, the page builder, Composition, Form, Crud,
  Entity and Remote, and the styling), and a post's body can hold headings,
  lists and code. The site links to the demo's code on GitHub, and a
  published sandbox kept from the earlier seed is replaced by this one. A new
  post or page is in the address (`new=<id>`) from the moment it is started,
  so a reload comes back to it; its first save turns that into its own key.
  The public site is rendered at build time with `foldkit-ssr`: each
  published page and post is HTML with its text, styles, description, link
  preview, canonical address and article facts, beside a sitemap and
  `robots.txt`. The browser takes a generated page over without drawing or
  reading it again, while the visitor's sandbox still holds the seed. The
  studio is `noindex`. Moving between the studio's Posts and Pages no longer
  reloads the page: the two applications share one document and swap in
  place, keeping the loaded code and the in-page server, about 60 ms a move
  where a load took 220 (and 0.8–1 s on a slowed CPU).

- **Dropping a palette tile on the page's own space:** `PointerDrag`'s facts
  for a drag onto `targets` carry `region`, whether the pointer is inside the
  region, so `over: null` with `region: true` is its empty space.
  `foldkit-builder` gains `DraggedOverPage()`, which lands a tile where a
  press with nothing selected would put it, and `foldkit-mixins-builder` sends
  it; a tile dropped on an empty page, or below the last node, added nothing.

- **`foldkit-primitives`, `FollowTabStop`:** a Mount keeping focus inside a
  container of roving tab stops on its stop, when a transition it did not see
  moves the stop or removes the focused descendant. `TreeNavigation`'s
  Behavior attaches it, so the Builder's layers keep focus through a
  duplicate, a paste or a delete made by key, where focus stayed on the old
  row or fell to `<body>`. **`foldkit-builder`** moves `layers.current` off a
  removed node to the one after it, else before it, else its holder, rather
  than leaving it for the first row.

- **`foldkit-cms`: `Cms.Display.State`'s words include `withSchedule`**
  (`'{state}, {schedule}'`), where a state and its schedule were joined by a
  comma no application could word. A display renderer's context types its
  words as `DisplayWords`, where it had `any`.

- **`foldkit-builder`: its words.** `Builder.make(name, { words })` takes any of
  `EditWords` over `editWords`: what it announces of each edit, its commands'
  labels, and the refusals it makes itself, as text with blanks
  (`'Moved {label}{at}'`); `refusal` words those `apply` makes (`{code}`,
  `{message}`). Announcements name a Block by its label, not its stored name.

- **`foldkit-mixins-builder`: the editor's words.** Every word the drawn
  Builder shows of its own is one of `BuilderWords` (English defaults in
  `builderWords`), given as the view input `words`. Words are text, a value
  a blank in them (`'Add {label}'`), since a view input may hold no nested
  function. `keysOf` takes them, for the named keys (`keyNames`) and Ctrl,
  Alt and Shift, and no longer reads `Object`'s own names for a key called
  `constructor`. A look's blank choice now reads "Default", as its buttons do.

- **`foldkit-mixins`: parts, each drawn again only when what it reads
  changed.** `SlotView.parts(Slots)<Input, Message>()` makes parts that name
  the input keys they read and are given only those; `assemble` places them.
  `slots.row.lazy(item, draw, args)` draws one repeated item again only when
  its arguments or what the Mixins gave it changed. Over 1,000 nodes, a
  hover, a selection and a keystroke in the inspector each went from about
  50 ms to the next frame.
- **`foldkit-mixins-builder`: the editor as parts.** `BuilderView.parts(builder)`
  gives `Panels`, `Palette`, `Layers`, `Inspector`, `Toolbar`, `Crumbs`,
  `Viewports`, `Preview`, `Alert`, `Canvas` and `Live`, each with its own
  Behaviors; `BuilderView.assemble(render)` places them among an
  application's elements, and `define` is the default layout.
- **`foldkit-builder`: the inspector is a form.** A node's props, and the
  input of the action each event runs, are edited through `foldkit-form`
  forms of the Block's settings (`settingsOf`, `inputOf`), drawn by
  `FormView`, so a prop gets the control a form would give it, a value that
  does not decode shows its error and edits nothing, and a control of the
  application's own (`Input.bundle`, such as a color picker) works with no
  Builder code. `BuilderView.define(builder, { settings: { field, form,
  renderers } })` styles the forms and draws the application's control kinds.
- **`foldkit-composition`: a Block's words are its own.**
  `Block.words({ label, description, group })` names a Block and says what it
  is for; the palette, the layers, the inspector, `Catalog.describe`,
  `Composition.describe` and the agent's `operationSchema` all read it.
- **`foldkit-primitives/dom`: `Measure`**, a Mount that writes where marked
  elements are (`--fk-<name>-x/-y/-w/-h/-display`) for an overlay drawn over
  them. The drawn Builder's selection and hover are boxes placed this way.
- **`foldkit-builder`: one table of commands.** `PageBuilder.commands` (`{ id,
  label, keys, placement, run }`) is every key, node action, toolbar button
  and shortcut listed; `keyCommand` is derived from it and `Builder.make`'s
  `commands` changes it. Keys are written for the author's platform
  (`BuilderView.inputs({ platform: 'mac' })`).
- **`foldkit-builder`: a Block dragged from the palette** is added where it
  is dropped (`DragSource` is `Existing` or `New`). **`foldkit-primitives`:**
  `PointerDrag` takes `targets: { attribute, within }`, so a drag may land on
  another region's elements.
- **`foldkit-builder`: copy, cut and paste.** A node and all it holds is kept
  in the Model's `clipboard` and on the system clipboard as tagged JSON; a
  paste reads it back (`readText`, new in `foldkit-primitives/dom`), decodes
  it strictly, gives every node a new id and inserts it whole or refuses it.
- **`foldkit-composition`: Patterns.** `Catalog.make({ patterns })` holds
  arrangements of Blocks, checked where the Catalog is made;
  `Op.usePattern({ pattern, ids, at })` inserts one, and `operationSchema`
  offers each with exactly its ids. The drawn palette offers them in a group
  of their own.
- **Text edited in place.** A Block's view draws a text prop with
  `field(key)`; the editor edits it on the canvas, frozen at the text it had
  when editing began so no redraw moves the caret, one undo step per session
  (`History.close` and `History.revert`, new in `foldkit-primitives/state`).
  `EditableText`, new in `foldkit-primitives`, reads what is typed as text,
  once per composition, and `Renderer.fields` says which props a node draws
  this way.
- **`foldkit-mixins`: container breakpoints.** `Style.responsive` takes an
  at-rule as well as a media query, `Theme.inContainer(name, breakpoints)`
  writes a theme's breakpoints on a named container, and `Style.at(prelude,
  piece)` puts a selector under an at-rule. The Builder's frame is the page's
  container (`PAGE_CONTAINER`), so a look written this way follows a narrow
  preview in a wide window.
- **`foldkit-mixins-builder`: a narrow editor.** `BuilderView.narrow(width)`
  shows one panel at a time, chosen by a group of pressed buttons, below that
  width of the editor itself.

- **`foldkit-mixins`: a Style's rules arrive with the Slot that draws them.**
  Compiling a Style records each class with its CSS; in a browser, a class a
  Slot draws is appended once to one `<style data-foldkit-styles>` element
  (made only when there is something to add, declaring the standard layer
  order unless the page declares its own), unless a stylesheet on the page
  already carries it. A Style left out of an application's `Style.stylesheet` now
  draws instead of silently drawing nothing. `Style.stylesheet` is unchanged.
- **`foldkit-mixins`: `Style.usedIn(html)`**, the CSS of every compiled class a
  page's markup uses, after the layer order: what a server puts in the head.
  **`foldkit-ssr`:** `SSR.page`, `SSR.generate` and `SSR.entry` take
  `head: rendered => string`, put before the template's `</head>` (a template
  without one is refused when there is something to add; `SSR.entry` refuses it
  when it is made, and answers a `head` that throws `500`).
- **`foldkit-composition/foldkit`: `Renderer.render` draws a node again only
  when what it reads changed.** Inside a runtime render, each node's drawing is
  memoized on its node object, drawn children, read, visibility and marks, so
  an edit redraws the node it touched and its ancestors, and an unrelated Model
  change redraws no node. Each node's element is keyed by its id (the edit
  wrapper, or the Block's root in view mode unless the Block set a key).
- **`foldkit-mixins/testing`: `Inert.draw`, `unslotted`, `fixedInline` and
  `bySlot`,** which check a package view's customization contract: every
  element it draws comes from a Slot, however deeply its views nest, and no
  fixed declaration is inline. They found markup outside any Slot in three
  packages, now Slots of their own: `foldkit-mixins-builder`'s `selectOption`,
  `foldkit-mixins-form`'s `option` and `choiceLabel`, and
  `foldkit-mixins-crud`'s `head`, `headRow` and `body`.
- **`foldkit-mixins/testing`: `Inert`, queries over a view drawn with the
  inert builder** (`all`, `children`, `byTag`, `byRole`, `byLabel`, `text`,
  `value`, `classes`, `style`, `pressed`), replacing a tree walker seven test
  files each defined, and the casts to hand-written node types that came with
  them.
- **Fixed declarations are rules, not inline styles**, so a later layer can
  override them: `Prose.style`'s measure and line height (with a new `leading`
  option), `Style.grid`'s template and areas, and `Style.stagger`'s delay (its
  `--fk-index` stays inline). The drawn Builder's frame writes
  `--fk-frame-width`, read by a default rule in `components`.
- **`foldkit-mixins-builder`: what the editor calls a Block.**
  `Block.words({ label, description, group })` (now in `foldkit-composition`) names a
  Block, says what it is for, and files it in a palette group. The palette is
  grouped; each button is named "Add <label>", shows the description, and is
  titled with where it would go ("Adds it inside the Section") or why it
  cannot. A layer row shows the label and the node's first text in brief, and
  a row that holds others has a toggle. New Slots: `paletteGroup`,
  `paletteHeading`, `paletteLabel`, `paletteHint`, `rowToggle`, `rowLabel`,
  `rowSummary`; palette buttons and rows carry `data-block`. A palette button's
  text is now the label, not `Add <Block>`: find it by its accessible name.
- **`foldkit-mixins-builder`: the inspector in parts.** It opens with the
  selected Block's label, description and actions (now drawn there, each
  titled with its shortcut and carrying `data-action`), then its settings under
  Content, Style, Visibility and Interactions. A look of up to four values is a
  row of buttons, one pressed, instead of a `select`. Labels are the key spaced
  when there is no `title` ("Text", "Shown when audience is", "On press"), and
  viewport buttons read "Wide", "Medium", "Narrow". With nothing selected it
  says how to begin and lists the shortcuts. New Slots: `inspectorHead`,
  `inspectorTitle`, `inspectorHint`, `inspectorSection`,
  `inspectorSectionTitle`, `choices`, `choice`, `shortcuts`, `shortcutKeys`,
  `shortcutWhat`, and `label` and `option` for a field's name and a
  many-choice picker's choice, which were drawn outside any Slot.
- **`foldkit-builder`: Escape deselects** in `keyCommand`.
  **`foldkit-mixins-builder`** takes the shortcuts on the canvas as well as the
  layers (the canvas is now focusable), and draws a breadcrumb of where the
  selection is (`crumbs`, one `crumb` button per node holding it, the page
  first, the current one `aria-current="location"`).
- **`foldkit-mixins-builder`: pointing at a layer row marks its node** on the
  page (the Builder's `Hovered` and `Unhovered`), and an empty page says how to
  begin, in the new `empty` Slot.
- **`foldkit-surface`: `Action`, a named capability that ends in a Message.**
  `Action.define({ name, description, input, toMessage })` declares one, and
  `Action.run(action, data)` decodes the data as its input before making the
  Message, so stored or untrusted data never executes.
- **`foldkit-agent`: `Agent.action(action, { available?, authorize? })`** exposes
  an Action as a variant, under the tag of the Message it makes; another tag is
  a type error, and a dispatch through one is refused. `Agent.variant` is
  unchanged.
- **`foldkit-form`: `Input.bundle`, a control with a Model of its own.** A key's
  draft can now be a Bundle's Model, such as a color picker with a popover, a
  page builder, or a rich-text editor. `Input.bundle(kind, { bundle, value, fill, settled? })`
  says how the key's value is read from the Model and written into it. The
  Bundle's Messages travel as the form's new `Control` Message
  (`form.control(key).send`), its Commands answer as `Control` Messages, and
  its Subscriptions and Resources become the form's, keyed under the key. A
  Message is an edit, validated and counted by `authoredChanged`, only when it
  changes the key's value. `model.fields[key].value` is typed as the Bundle's
  Model. The Bundle may have no OutMessage and need no services, the key takes
  no `check`, and a nested form whose control has Subscriptions or Resources is
  refused.
- **`foldkit-mixins-form`: draws a control backed by a Bundle** with the
  Bundle's own view inside a new `control` field slot, unless a renderer names
  its kind. A renderer receives `bundle: { model, send }`, wrapped for its row
  inside a nested form.
- **`foldkit-cms`: the editor runs a form control's Subscriptions and
  Resources** while an entry is open, and stops them when it closes.
- **`foldkit-composition` (in development, not published): what a page is,
  as data.** `Block.define` declares what may exist (a props Schema, Regions,
  the Content it provides), `Catalog.make` gathers a context's Blocks and
  roots, and `Composition.Document` is the tolerant codec of a stored page: any
  Block name, props as JSON. `Composition.validate` reports ten kinds of
  finding, from a missing node to a Region that rejects a child, and
  `Composition.valid(catalog)` asks the same as a Schema check for an operation
  that publishes. `index`, `describe` and `Catalog.describe` read a Document
  and a Catalog. `Composition.apply` edits a Document by Operations (insert,
  insert a tree, remove, move, duplicate, set and unset a prop, the reserved
  fields, a batch), refusing what an Operation would cause with no partial
  result, and never minting an id itself. `History` keeps undo snapshots,
  grouped without a clock. `Composition.migrate` moves stored pages forward
  through named migrations (`renameBlock`, `renameProp`, `promoteUnknown`, or
  one of your own), each rewriting a node or declining, and throws when one
  breaks the Document's structure. `foldkit-composition/foldkit` draws a
  Document with one ordinary Foldkit view per Block (a Block without one is a
  type error), placeholders for what cannot be drawn, and an edit mode that
  marks each node; the same Renderer draws inside a `foldkit-ssr` static
  region, so a served page sends none of the Document. `Url` refuses
  `javascript:` and every scheme but http, https, mailto and tel.
  `foldkit-composition/richtext` holds a rich-text body checked against its
  Kit. Phases 1 to 4 of the page builder design.
- **`foldkit-builder` (in development, not published): the page builder's
  state.** `Builder.make(name, { catalog, renderer, starters })` gives a Bundle
  that edits a composition Document by Operations, mints new ids in a Command,
  keeps a selection and undo History beside the page, and records why an edit
  was refused. `builder.input` places it as a form key's control, so the page is
  the key's value, a selection is not an edit, and a fill starts undo over. Its
  plain view (palette, layers, text props, undo, the page in edit mode) is drawn
  by `foldkit-mixins-form` with the rest of the form. Phase 5 of the page
  builder design.
- **The CMS example builds a page too.** A Page content type whose `document`
  key is the page Builder goes through the post's whole story: autosave, a
  resumed draft, a preview drawn by the site's own views, publish, revisions,
  restore, a schedule and a conflict, with no CMS state added. Phase 6 of the
  page builder design.
- **`foldkit-builder`: the keyboard, the layers and announcements.** The
  Builder places `TreeNavigation` and `LiveAnnounce` in its Model; moving focus
  in the layers selects the node. `keyCommand(model, key, modifiers)` gives the
  shortcuts: Alt with the arrows moves the selected node among its siblings,
  out of its parent or into the node above; Mod+D duplicates; Delete removes;
  Mod+Z, Mod+Shift+Z and Mod+Y undo and redo. Structural edits, undo, redo and
  refusals are announced to assistive technology. A selection made anywhere
  else, such as an insert or a click on the page, is where the layers' keys
  start from. `offered` lists the Blocks the palette offers, and
  `inputWith(view)` is the form control drawn by another view.
- **`foldkit-mixins-builder` (in development, not published): the page
  Builder, drawn.** `BuilderView.define(builder)` draws a palette, the layers
  as an ARIA tree, the selected node's actions and props, undo and redo, a
  viewport picker, a refusal as an alert, a live region, and the page in edit
  mode through the site's own Renderer. Every element is a `BuilderSlots`
  Slot. The layers take `TreeNavigation` and the Builder's shortcuts, and the
  canvas takes `Targets`, so hovering and clicking the page mark and select
  its nodes. It adds no state and no Messages. The CMS example's page form
  draws its Builder this way. Phase 7 of the page builder design.
  The inspector labels a prop with its Schema's `title`, and a Block asks for a
  prop's control with `Block.annotate(Builder.controls({ ... }))`, such as
  `Input.multiline()`, or `Input.hidden()` to leave it out. A row in the
  layers or a node on the page can be dragged onto another with the pointer:
  the Builder's `drag` says where a drop would land (`dropAt`), the target is
  marked only where the page allows it, and a drop is one undoable, announced
  move.
- **`foldkit-composition`: appearance.** A Block offers appearance axes, each a
  list of variant values or token names, and `validate` and
  `Op.setAppearance` check a node's stored names against them
  (`composition:invalid-appearance`, `composition:unknown-token`). The new
  `foldkit-composition/appearance` subpath makes a look from a
  `foldkit-mixins` slot recipe and theme tokens: `Appearance.attach(look)`
  gives a Block its axes, `look.draw({ appearance, h })` gives its view the
  Slots with the chosen Style attached, every piece compiled once, and
  `look.styles` is the stylesheet. A Renderer's views receive `appearance`,
  the choices the Block offers. The drawn Builder's inspector chooses them.
  A token axis given `breakpoints` is responsive: a node stores
  `{ base: 'sm', md: 'lg' }`, drawn as rules the widest matching breakpoint
  wins. `look.draw({ appearance, h, with })` attaches a Block's own Behaviors
  after the look, and a style property a Behavior owns that a choice also sets
  is `mixins:style-property-conflict`. A layout Block is a Mixins layout this way: the test site's Columns is
  `Layout.switcher`, with its ratio, when it stacks, and its gap as choices.
  Phase 8 of the page builder design.
- **`foldkit-composition`: `operationSchema(catalog)`,** the Operations a
  Catalog's pages take as a Schema, inserts naming only its Blocks with their
  stored props, for an agent tool's input. The CMS example's page agent edits
  a page through the Builder's own `Applied`, undoable like any edit, and a
  Block outside the Catalog is refused by the tool's schema.
- **`foldkit-composition`: actions.** A Block names its events, a Catalog lists
  the actions its pages may reference (`foldkit-surface` Actions), and a node
  stores which action an event runs with literal input. `validate` and
  `Op.setAction` check them (`composition:invalid-action`,
  `composition:unknown-action`), and a Renderer's view gets `on(event)`, the
  Message the action makes from input its Schema decoded first;
  `Renderer.forMessages` checks it routes every such Message, and a
  `Renderer.make` view, such as an editor's canvas, gets none. The drawn
  Builder's inspector picks each event's action and edits its input.
- **`foldkit-composition/surface`: Surface Blocks.** `SurfaceBlock.define`
  places a `foldkit-surface` Surface where an author puts it, with params from
  its props; `SurfaceBlock.reads` and `SurfaceBlock.active` read the page's
  Surface Blocks as a Query Block's reads are, and `value(data)` reads a node's
  typed.
- **`foldkit-composition`: stateful Blocks.** A Block marked `stateful` is
  backed by a Bundle the page's parent places once per node, keyed by its id.
  `Composition.statefulNodes` lists them; `Stateful.sync` (in `/foldkit`) keeps
  a placed collection in step with the page shown, adding, removing, and
  starting again a node whose props changed; `Stateful.views` and
  `Stateful.html` draw each node with its own item.
- **`foldkit-form`: a title given before a check names the key.** Effect
  resolves a checked schema to its last check's annotations, so
  `Schema.String.annotate({ title }).check(...)` lost its label; the form now
  falls back to the schema's own annotations.
- **`foldkit-composition`: a Query Block gets its own window,** cut to its
  `first` even when another read of the same query loaded more rows.
  `Composition.valid` describes itself with `expected`, not a `title` a form
  would take for the field's label.
- **`foldkit-cms-drizzle`: a publish patches the whole row back,** as the
  handler left it, so the author's own screen shows what was published without
  the handler returning a patch.
- **`foldkit-mixins-builder`: an optional relation prop stored as `null` and
  decoded to an `Option`** (`Schema.OptionFromNullOr`) offers its blank: the
  inspector asks the stored side.
- **`foldkit-mixins-ui`: `Recipes.Button` on a link** is not underlined.
- **`foldkit-cms`: `placed.storedEntry(model)`,** the entry the server knows, as
  an `Option`: none while something new is not saved yet, so a link names only
  what exists.
- **`foldkit-mixins-builder`: relation pickers for Block props.** A prop asks
  for `Input.relationOne(Entity)` or `Input.relationMany(Entity)` through
  `Builder.controls`, and its choices come in `BuilderView.inputs({ options
  })`, keyed `'Block.prop'`.
- **`foldkit-form`: `Input.relationOne` and `Input.relationMany`,** a picker for
  a key that holds ids without being a relation.
- **`foldkit-mixins-form`: a Bundle control's view takes inputs,** from the
  form view's `controls`, by key. A key given none draws its view as before.
- **`foldkit-mixins-builder`: the canvas draws the page's data.**
  `BuilderView.submodel` takes `BuilderView.inputs({ data })`, each node's read,
  which the page's parent gives through the form's `controls`, so a Query or
  Surface Block on the canvas shows its rows. `builder.inputWith` accepts a
  view with inputs; `QueryBlock.active` and `SurfaceBlock.active` type what they
  read.
- **`foldkit-composition/remote`: Query Blocks.** `QueryBlock.define` makes a
  Block that names a `foldkit-remote` query and derives its input from props;
  `QueryBlock.reads(Data, catalog, document)` is the page's reads as one
  Projection keyed by node, fetched and resumed by Remote like any read; the
  Renderer hands each node its `data`, and the Block's `rows(data)` reads it
  typed. `QueryBlock.active(name, App.owner, Data, …)` is the read as an active Surface, so a
  server-rendered page resumes it with `Remote.resume`. The CMS example's pages can list the site's pages. Phase 9 of the
  page builder design.
- **`foldkit-composition`: conditions.** A Catalog may declare a `context`
  Schema (an audience, a locale, a flag), and a node's `when` is a list of
  conditions over it, `eq`, `isNull`, `isNotNull` and `contains`, meant as
  `foldkit-entity`'s `Expr` means them. `validate` and `Op.setWhen` check them
  (`composition:invalid-condition`, `composition:unknown-context`), and
  `Renderer.render` takes the `context`: a node whose `when` fails is left out,
  or marked `data-composition-hidden` in edit mode, and a page drawn without
  its context fails closed. `Composition.holds(when, context)` is the test.
  The Builder keeps what the author previews the page as (`preview`,
  `PreviewChosen`), and the drawn Builder offers a "Preview as" picker, draws
  the canvas for it, and edits a node's conditions in the inspector.
- **`foldkit-composition/foldkit`: the edit wrappers carry the marks.**
  `render` in edit mode takes `selected`, `hovered` and `drop`, and puts
  `data-composition-selected`, `data-composition-hovered` and
  `data-composition-drop` on those nodes' wrappers, so an editor's CSS draws
  the selection and where a drop lands. A node whose view throws is a
  placeholder, as a node that cannot be drawn is.
- **`foldkit-primitives`: `PointerDrag`, dragging one marked element onto
  another.** A Mount and a Behavior on a container: a press that moves past
  4px starts a drag, the element under the pointer is reported with the third
  of it the pointer is in (`before`, `inside`, `after`), and a release drops
  or Escape cancels. It writes no roles or keys, so it works on a tree's rows
  as on a canvas, and it swallows the click a drop ends with.
- **`foldkit-primitives`: `TreeNavigation`, keyboard navigation of a tree.**
  After the WAI-ARIA tree pattern: Up and Down through the rows showing, Right
  opens or steps in, Left closes or steps out, Home and End. Rows are given in
  tree order with their parent; openness is stored as what was toggled away from
  `openByDefault`. Its Behavior writes the tree's ARIA attributes and a roving
  tab stop. For a file explorer, a page's layers or a nested menu.
- **`foldkit-primitives`: `Targets`, which marked descendant is under the
  pointer or was pressed.** One Mount on a container reports `TargetHovered`
  once per change and `TargetPressed` with its modifiers, for the nearest
  descendant carrying a marking attribute, and can stop a press's default.
- **`foldkit-primitives`: an undo `history` groups steps.** A `Push` may name
  a `group`, and consecutive pushes of the same group are one step, so typing a
  word undoes as a whole without a clock. The steps are exported as pure
  functions (`History.start`, `push`, `undo`, `redo`, `clear`) for a parent
  that records an edit in the same transition that makes it. **Breaking** for
  code that builds a `HistoryModel` by hand: it gains `group`, `null` for none.
- **`foldkit-builder` keeps its page in that history:** its Model's `page` is a
  `foldkit-primitives/state` history whose present is the Document
  (`builder.document(model)` reads it), and `foldkit-composition` no longer has
  a History of its own. Undo is one mechanism in the repository, not two.
- **`foldkit-ssr`: its build configuration references the packages it builds
  from,** so another project can reference it.
- **`foldkit-ssr`: `SSR.render`'s result lists `unnamed`,** each element and
  event whose handler is a function the page cannot name
  (`{ element: 'button#point', event: 'pointerdown' }`). On a page that waits
  to boot, `SSR.entry` and `SSR.generate` warn about each once per process.
- **`foldkit-ssr`: `pnpm bench:manifest`** measures the resume manifest's size
  and decode time at 10, 100 and 1,000 rows; the SSR plan records the table.
  `pnpm bench:manifest:browser` times the same page in Chromium.
- **`foldkit-ssr`: the envelope lists the events its markers name,** and
  `Resume.listen` takes them as `events`, so a deferred page no longer reads
  every element's attributes to find them. The page's list of bindings is
  checked by hand rather than through a Schema. At a thousand rows, decoding
  and listening take 12 ms in Chromium, down from 22.

- **`foldkit-richtext`: `Replicated`, collaborative rich text without a CRDT.** A
  document state where every character has an identity: `translate` restates an
  edit as ops that name characters and blocks, `applyOps` folds them in any
  server order to the same state, `project` gives the editor a `Document`, and
  `anchor`/`resolve` keep a selection by its characters. `invert` gives the ops
  that undo an edit and nothing else. `translate`'s `continues` option and
  `coalesce` make a burst of typing one op, and a `Collect` op removes deleted
  text, in two phases, through the log. `examples/pages` wires it to Sync and
  Durable. Since: `RetypeContainer` retypes the caret's block in place,
  `unionChangeSet` unions held IME patches, `SetProps` is refused only when
  it would make valid props invalid, transactions carry their normalized
  `transactions`, and a cached `nodeIndex` answers block lookups.
- **`foldkit-richtext-dom`: `patchTo`, and an `overlay` Command** for
  decorations from application state, such as other people's carets.
  `patchTo` patches an externally replaced document without remounting (a
  remote keystroke keeps the caret), judging moved runs by both blocks;
  empty runs draw addressable spans, string data draws as
  `data-decoration-*`, input rules match on surrounding node kinds, and a
  non-moving transition keeps the Model by identity instead of clearing it.
- **`foldkit-richtext-markdown`, task items and tight lists:** `- [ ] ` at a
  list item's start makes it a task in place, and the printer records
  CommonMark spread, so tight items keep nested lists under their text.
- **`foldkit-richtext-code` and `foldkit-richtext-code-shiki`, first
  releases:** total JSON and Shiki grammars as tokenizers over the shared
  `syntax-*` kinds, for `codeDecorations` (the application owns the
  highlighter).
- **`foldkit-sync`:**
  - `Sync.fact`, which applies a durable fact in the intent's own transition.
  - `onReinstall` on `Sync.mount`.
  - `Sync.durable(message)`.
  - A contract's `coalesce`, which merges a burst into one unsent operation.
  - `Storage.append`, a one-row write per submit, with an IndexedDB outbox
    store.
  - Server push through `{ notify: true }` frames and `Transport.changes`.
  - Paged exchanges (`more`).
  - `transport.socket`, so presence shares the sync connection.
  - A presence `throttle`.
  - Server-reset recovery: a server's `epoch` goes back as `exchange`'s
    optional third argument, and a new one makes the replica rebuild from the
    server's answer and resend its outbox.
- **`foldkit-durable`:**
  - `Journal.cursor`, `read(key, after, { limit })` and `vacuum()`.
  - An in-memory snapshot with `snapshotEvery`.
  - `Journal.epoch(key)`.
  - A `replicaId` option that binds each replica to the actor of its first
    commit. Sync's `journalContract()` supplies it.

### Changed

- **`foldkit-primitives`, Timer and Interval's first tick** now comes one
  interval after `Started`, not at once. `History.push` keeps an already-empty
  `future`, so a view reading it is not redrawn per push. The new `TimedOut`
  and `GoTo` variants break a match over every variant.

- **`foldkit-mixins`, a branded `StyleValue` (breaking for hand-built
  values):** a `StyleValue` carries a brand, so a declarations object is never
  mistaken for one; `NamedStyle.pieces` and a `recipeFor` selection are
  `StyleValues`.

- **`foldkit-ssr`, Foldkit's config types:** `SSR.hydrate`, `render`,
  `generate`, `entry` and `handle` accept Foldkit's `makeApplication` config
  types; `routing`'s callbacks are checked against `update`'s Message, and
  `resources` is `Layer<never, never, never>` (the old type rejected
  Foldkit's own Layer).
- **`foldkit-ssr`, `SSR.entry` answers OPTIONS (breaking):** `204` with
  `allow: GET, HEAD[, POST], OPTIONS` instead of `405`, and a new
  `headers: request => HeadersInit` sets headers on every response it answers.
- **`examples/foldkit/ssr` serves as upstream does:** Effect's HTTP server on
  `@effect/platform-node` instead of a hand-written `node:http` host.

- **`foldkit-ssr`, the envelope rides the stamped root (breaking):**
  `SSR.render` carries the envelope as `data-foldkit-plus-resume` on the
  rendered root, beside Foldkit's own stamps, instead of a script before
  `</body>`; hydration adopts the nodes and drops the attribute on its first
  patch. `SSR.resume` reads it there, refusing a page with no stamped root or
  more than one. `SSR.entry` answers `Rendered` and takes no `template`,
  `containerId` or `head`: the host owns the template, through `handleRequest`
  or the `foldkit` Vite plugin's dev server, and a plan with `meta` is refused
  at construction (serve it with `SSR.generate`, which keeps the template,
  `head` and `meta`). The build id is the `FOLDKIT_BUILD_ID` deployment both
  bundles are compiled with. The `foldkit-ssg` and `foldkit-ssr` examples serve
  through `foldkit({ ssr })`, and the CMS example stamps pages with the same
  deployment id instead of the entry script's address.
- **`foldkit-remote`, typed entry dependencies:** `Data.subscriptions` and
  `Remote.fold(...).subscriptions` type each entry's dependencies
  (`ReadDependencies`, the new `LiveDependencies`, `RetentionRoots`) instead of
  `any`; the `retain` entry requires no services.

- **`foldkit-cms`, drafts:** a draft stores the form's Model settled, as it is
  shown again, so nothing in flight is saved; a Builder's undo history was,
  up to 200 copies of the page, and a page of about 150 blocks could no
  longer be saved ("This draft is too large to save").

- **`foldkit-mixins-builder`, words:** `selectAHolder` is `nothingHoldsIt`, and
  says what it now means: with nothing selected a tile goes anywhere that can
  hold it, so a disabled one has nowhere yet. The empty page says to begin
  with a block the palette offers.

- **`foldkit-cms`, editor status:** a publish or a schedule the form's own
  checks stop is `Incomplete` (a new `EditorStatus`) until the next edit, and
  one waiting for a check reads `Publishing`; before, the status stayed what
  the last save said, "Saved", so a refused publish read as a success.
  `EditorForm` gains `engine.isValidating`, which `Form.make` provides.

- **`foldkit-builder`, dropping:** where the node dragged over has no place
  for what is dragged, it lands by the nearest node holding it that does,
  before or after it, and `drag.over` names that holder; a Section dragged
  onto a Section's last Heading landed only on the Section's thin bottom edge.
  `dropAt` agrees.

- **`foldkit-mixins-builder`:** a click on a layers row makes it current, as
  the keys do (`TreeNavigation`'s `Focused`), rather than sending `Selected`,
  so a narrow editor keeps the layers showing instead of switching to
  Settings and hiding the row that had just taken focus.

- **CMS example:** a Quote's text and a Callout's body keep the lines broken
  with Shift+Enter once editing ends, in the editor and on the public page
  (`white-space: pre-line` on their looks).

- **`foldkit-primitives`, `PointerDrag`:** an Escape that cancels a drag is
  caught on the way down and stopped there, so the focused element does not
  also act on it; in the Builder, Escape during a canvas drag cancelled the
  drag and deselected the node.

- **`foldkit-mixins-builder`:** the palette's tiles and the command buttons
  are disabled by `aria-disabled` rather than `disabled`, so Undo pressed on
  the last step, or a tile whose place fills, keeps focus instead of dropping
  it to `<body>`. Style `[aria-disabled="true"]`; the CMS example does.

- **`foldkit-primitives`, `EditableText`:** when Enter or Escape ends an edit
  and the view then removes the field or makes it no longer editable, focus
  comes back to the container instead of falling to `<body>`, where the next
  key (an undo, a Delete) did nothing. The Builder's canvas is that container.

- **`foldkit-primitives`, `PointerDrag`:** `targets.within` is looked for
  nearest first, under the container's closest ancestor holding a match,
  not the first on the page, so the second of two editors dropped its tiles
  onto the first's page. **`foldkit-mixins-builder`** finds its canvas by a
  `data-builder-canvas` attribute rather than an id built from the Builder's
  name, which a name with a space or a colon broke (no drop landed, or every
  move threw).

- **`foldkit-primitives`, `Measure`:** a change in the subtree is measured as
  its records arrive, so an editor's selection box moves in the frame the
  selection is drawn in rather than one after; and it measures again when an
  image or a font inside loads and on each frame of a transition or an
  animation inside, which moved a target without resizing it and left the box
  where it was.

- **`foldkit-mixins`, per-item memo (`slots.x.lazy`):** a static Style's
  contribution is compared too, so two views apart only by a Style no longer
  reuse each other's rows (a theme switch kept the old theme's rows); and an
  item drawn with no runtime frame (a test, a server) keeps no bookkeeping.

- **`foldkit-builder`, text edited in place:** Escape puts the text back even
  where another edit came between, a commit writes nothing the page already
  holds, a second ask for the field being edited begins nothing, and an undo
  or a redo ends editing. A session in which nothing was typed writes nothing
  when it ends, so leaving a field untouched keeps an agent's edit made
  meanwhile (the Model's `editing` gains `typed`). A Block named as one of `Object`'s own names is not
  taken for one with starting props, and a pasted tree is checked by its own
  ids, so a refusal names what was copied rather than freshly minted ids.

- **`foldkit-builder`, the inspector:** an optional prop or input emptied is
  taken away (`unsetProp`, or the input written without it) instead of left
  as it was; a value the Block refuses leaves its field showing the node's
  value, not one that looks accepted; an action's input is written with only
  the keys its Schema names; and a held form Message with a key its variant
  lacks is not decoded. `Settings` gains `keys`.

- **`foldkit-builder`, placing and commands:** `placeFor` puts a Block that
  is no root, with nothing near the selection to take it, last in the last
  Region on the page with room that accepts it, so a node cut and pasted
  back comes back rather than being refused with a minted id; a paste with
  no place at all is refused before ids are minted, as `builder:no-place`
  (a new word, `noPlace`). Duplicate is not offered where its Region is
  full. `keyCommand` tries each command a key names in turn, so a command an
  application adds on a built one's key runs where that one has nothing to
  do.

- **`foldkit-composition`:** `field(key)` takes only a prop that is exactly
  `string`; a list of names (`'plain' | 'accent'`) is no longer a field. An
  id that is one of `Object`'s own names (`toString`, `constructor`,
  `__proto__`) is an id as any other: a tree naming one it lacks was a
  `TypeError` from `apply`, and one it held was refused as taken; a stored
  Document naming one it lacks was a `TypeError` from `validate`, `index` and
  `describe`, and is now `composition:missing-node`.
  `Renderer.fields` no longer shares the page's memo, which made a view that
  called it redraw every node on every change. `Composition.treeRefusal` is
  exported, to check a tree by its own ids before it is rekeyed.

- **`foldkit-mixins-builder`: the default layout is four regions.** `define`
  draws `regions` holding `start` (palette, layers), `bar` (toolbar, crumbs,
  viewports, preview), `stage` (alert, canvas) and `end` (inspector), where it
  drew ten sibling panels; `root` is always the container `builder`, so a
  Style may follow the editor's own width. A Style that placed each panel on
  the root's grid places the regions instead.

- **`foldkit-composition/foldkit`: absence is an `Option`.** `RenderContext.on(event)`
  returns an `Option` of the Message, and `Renderer.render`'s edit options
  `selected`, `hovered`, `drop` and `editing` take `Option`s, as an editor's
  Model holds them, rather than `undefined`.

- **`foldkit-mixins-builder`: `BuilderView.describe` and `BuilderView.controls`
  are gone,** for `Block.words` (in `foldkit-composition`) and
  `Builder.controls` (in `foldkit-builder`). The toolbar's `history`, `undo`
  and `redo` Slots are `toolbar` and `toolbarAction`, and `ACTIONS` and
  `SHORTCUTS` are the command table. **`foldkit-builder`:** `DragStarted`
  takes a `source`, and `dropAt` a `DragSource`, not an id.
- **`foldkit-primitives`:** `Measure` attaches nothing when it cannot start.
  Where there is no `ResizeObserver` (jsdom), it had already attached a
  `MutationObserver`, which then threw on every change to the page.

- **A value that may be absent is an `Option`, not `null` or `undefined`,**
  across the read and builder APIs. Breaking:
  - `foldkit-surface`: `Surface.at`'s params function returns
    `Option<Params>` (none: inactive), and `projectionOf` returns
    `Option<Projection>`.
  - `foldkit-remote`: `Data.active(name, projectionOf)` makes an application's
    read of the domain an active Surface; it replaces spelling one out from
    `contract`, and throws for a domain on a raw optic, which names no
    application.
  - `foldkit-crud`: `detail.at`'s `id` and `list.at`'s `input` return an
    `Option`; `more(model)` is an `Option<Command>`. `Crud.options` throws
    without lists.
  - `foldkit-cms`: the editor's `entry`, `pageId`, `resumed`, `state` and
    `error` reads return `Option`s; an editor domain gives `active` instead of
    `contract`.
  - `foldkit-builder`: the Model's `selected`, `hovered`, `refused` and `drag`
    are `Option`s, stored as `null`. `Selected` takes an id and `Deselected`
    clears it; likewise `Hovered`/`Unhovered`, `DraggedOver({ id, zone })`/
    `DraggedOff`, and `PreviewChosen`/`PreviewCleared`. `placeFor`, `moveBy`,
    `dropAt` and `keyCommand` return `Option`s.
  - `foldkit-remote`: a preview (`Data.overlay`) of an entity the server has
    not seen, missing a field its Selection reads, reads `Failed` with an
    `Overlaid` error naming the fields, not `Initial` for good.
  - `foldkit-composition`: `SurfaceBlock.reads`, `QueryBlock.reads`, `value`
    and the `documentOf` of their `active` are `Option`s; the reads gain
    `data(model)`, each node's value as a Renderer takes it. `Block.stored(block,
    key)` is how a prop is stored, and `StoredPropsOf<B>` its type.
- **`foldkit-mixins`: a family's `text` token is `on-fill`, and each family
  gains `ink`.** `accent.text` read as "accent-colored text" and was the text
  *on* the accent's fill. It is now `accent['on-fill']` (`--fk-accent-on-fill`),
  and `accent.ink` is the accent as text on the base surface, for every family.
  `text['on-accent']`, the same value as `accent['on-fill']`, is removed.
  Prose's `mark` drew its text in the on-fill color over the accent's tint; it
  uses `ink`.
- **`foldkit-remote`: a query read shows at most its window, and "load more"
  grows the window.** Remote keeps one connection per query and input, so a
  read of `first: 3` now shows three rows even when a `first: 50` read of the
  same query loaded more, with `hasNext` set when it cut any. Two windows of one
  connection are one query, for the wider; a window wider than what the
  connection holds fetches only the rows it lacks (before, it was never
  fetched). `Data.more(model, projection)` returns the Model with the read's
  window one page larger, an `Option`; `Data.next`, `Data.previous`,
  `Data.fetch` and the fold's `fetch` are removed. `Remote.query` and
  `Remote.queryMessage` still run one page by hand. The store gains `grown`
  and the `WindowGrown` Message.
- **`foldkit-bundle`: `complete`'s `update` error names a common cause:** an
  unannotated parameter on a callback written inline in the config, which keeps
  TypeScript from inferring the config at all.
- **`foldkit-composition`: `Renderer.render` of a Renderer that sends nothing
  takes any application's builder,** so a view passes its own `h` instead of
  `inertHtml`.
- **`foldkit-remote-drizzle`: `query` is written without type arguments;** the
  README says how the principal is inferred from `where`'s parameter.
  `foldkit-cms-drizzle` dropped its own.
- **`foldkit-mixins-crud`: `ListSlots` and `DetailSlots` gain `badge`,** and a
  Display renderer's context carries it, so a value drawn as a label of its own
  is styled as a Slot. `foldkit-cms`'s state renderer draws in it.
- **`foldkit-cms-drizzle`: `cms.import({ type, values, as, at?, entry? })`**
  publishes content that exists already (a seed, or another CMS's) by the
  publish path, in one transaction, instead of an application writing the CMS's
  tables by hand.
- **`foldkit-cms`: the Entry has a server-derived `may`,** the transitions the
  reader may ask by the server's `allow`; the placed editor gives
  `may(model, transition)`, and `Cms.transitions` lists them all.
  `foldkit-cms-drizzle` supplies it; its `Asked` type is removed for
  `foldkit-cms`'s `Transition`, which it duplicated.
- **`foldkit-mixins-form`: `FormView`'s `submits: false`** draws a form without
  its submit button.
- **`foldkit-primitives`: `KeepInView({ selector })`,** a Mount that scrolls
  whatever newly matches in its subtree into view. `foldkit-mixins-builder`
  mounts it on the layers panel and the canvas, so a new selection (an inserted
  Block, say) is in view. `foldkit-composition` exports `MARK_ATTRIBUTE`.
- **`foldkit-form`: a number-literal schema resolves to a `Select`,** whose
  `options` may be text or numbers and whose value is the chosen option itself.
  `Control.parse` now receives the control's `data`. `foldkit-mixins-builder`'s
  inspector draws the select and stores a number as a number.
- **`foldkit-entity`: `Selected<typeof selection>`,** the value a Selection
  reads.
- **`foldkit-cms`: the editor's Commands carry the form's requirements, not
  `any`.** `EditorForm`, `EditorContent` and `Editor.make` gain a `Services`
  parameter (default `never`), so an application's `update` types its Commands
  as `RemoteClient` and its runner needs no cast.
- **`foldkit-entity`: `Words.of(schema)`,** a schema's `title` and
  `description` as `Option`s, including a title given before a check (which
  Effect 4 resolves past). `foldkit-form`, `foldkit-crud`'s column labels and
  `foldkit-mixins-builder`'s inspector read words through it; the inspector and
  Crud no longer lose such a title.
- **`foldkit-remote-drizzle`: `drizzleWrites` and `returning.row`.**
  `drizzleWrites` is the provided database's `insert`, `update` and `delete`,
  typed by each table's columns, so a handler writes without casting
  `DrizzleDatabase`; `returning.row(binding, id)` reads back the row a handler
  wrote as patches, every column and each `one` relation as its ref.
  `foldkit-cms-drizzle` uses both instead of its own casts.
- **`foldkit-crud`: `list.more(model)` is the Model showing one page more,** an
  `Option`, instead of a Command.
- **`foldkit-composition`: `QueryBlock.reads` no longer cuts rows itself;**
  Remote does.
- **`foldkit-mixins-ui`: `outline` and `ghost` buttons read `--fk-ink` first,**
  so on a band that sets `--fk-ink: currentColor` their text is the band's
  color instead of the tone's ink, which does not read there.
- **`foldkit-mixins`: `Defaults.headings` reads `--fk-heading` first,** so a
  container drawn in its own color sets `--fk-heading: currentColor` and its
  headings take its color; elsewhere they stay `text-overt`.
- **`foldkit-mixins-form`: `FieldSlots` gains `group` and `affix`,** for a
  control drawn with text beside it; `foldkit-cms`'s slug renderer draws its
  prefix and input in them instead of in bare spans with a
  `data-cms-slug-prefix` attribute.
- **`foldkit-primitives`: `TreeNavigation` writes each row's level as
  `--fk-tree-level`** beside `aria-level`, so one `calc` indents any depth.
- **`foldkit-composition`: the edit marks are one attribute.**
  `data-composition-mark` is `selected` or `hovered` and replaces
  `data-composition-selected` and `data-composition-hovered`; a node both
  hovered and selected is `selected`. Restyle `[data-composition-selected]` as
  `[data-composition-mark='selected']`.
- **`foldkit-mixins`: a recipe's `variants` is optional,** so a recipe that is
  only its base (`Style.recipeFor(Slots)({ base })`) no longer writes
  `variants: {}`.
- **`foldkit-ssr`: Messages answered before boot reach `update` before any
  other Message,** instead of being replayed through a Subscription after the
  first render. An event dispatched in the task that boots the page, such as
  the rest of a burst of typing, reached the runtime before the replay, so
  the text ended on its first character. The runtime still starts from the
  resumed Model, so its first render is the served markup; its `update` is
  wrapped to run the answered Messages ahead of the first one it processes.
  The `foldkit-ssr.replay` entry is gone.
- **`foldkit-ssr`: deferred boot no longer depends on `hydrate` rendering its
  first frame before it returns.** Until that frame commits the page keeps
  answering from its markers, and it then sends the live page the events only
  it can answer.
- **`foldkit-mirror`: `reduce` returns the Model it was given when the store
  holds what the Model already does,** so the URL change a mirror's own write
  causes, a navigation that leaves its keys alone, and a restore that finds
  nothing new no longer render the page again. A structured field's text is
  remembered by the value's identity, so the write entry no longer serializes
  it on every Model change.
- **`foldkit-bundle`: a placement or collection item returns the parent Model
  itself when the child's `update` returns its own Model,** so a Message that
  changes nothing renders nothing.
- **`foldkit-primitives`: a Message that changes nothing returns the Model it
  was given,** across state, time, motion, media, interaction, device, network
  and event primitives, and the navigation and selection Behaviors describe
  their items once per render instead of once per item. `Virtual` caches its
  row offsets per keys array and heights record. `MediaStream`'s `Started`
  while live no longer stays at `requesting`, and `Presence`'s `Hide` while
  hidden no longer shows the content for the hide duration.
- **`foldkit-remote`: the common Messages that change nothing return the
  Model they were given,** so `Data.reduce` and the wiring keep the application's root on a
  duplicate live event, a repeated `ReadStarted`, an empty `Hydrated`, or a
  retention pass that collects nothing. An entity's or list row's decoded
  value is the same object after a refetch or live patch that brought equal
  data to every field of its entity, so a keyed row's lazy view does not
  re-run. The live entry no longer closes and reopens its stream on every
  event, and a pending request no longer rebuilds the visible store on each
  overlay change. A list read now shows a live insert
  or an optimistic connection change that wrote no entity; it used to keep
  the list from before it. The unused `shouldWake` export is removed.
- **`foldkit-remote`: `MutationSucceeded` carries `now`,** the clock reading of
  the answer, and the entities it writes are dated by it. They were dated 0, so
  under a freshness policy every value a mutation wrote was already expired and
  read again at once, and one a read had just dated was set back. `Data.mutate`
  and `Remote.mutateInto` take a `now` option (default `Date.now`), as
  `ObserveOptions` and `LiveOptions` do. `settleSuccess` and
  `reconcileMutation` take the answer as one `MutationAnswer` object
  (`{ entities, deleted?, now }`, plus `connections?` for `settleSuccess`)
  instead of positional arguments, so the clock cannot be left out. A
  hand-built `MutationSucceeded` adds the field, and a stored one without it
  no longer decodes.
- **`foldkit-remote`: the read entry plans once per Remote state and query.** A
  Model change the Remote model is not part of, such as typing in a field,
  reuses the plan until the next freshness deadline instead of walking every
  row again: about 1 ms to 0.02 ms per change for a list of 400 rows.
- **`foldkit-remote`: freshness follows what the server said and when.** A
  pending optimistic patch keeps the date of the value under it, so under a
  freshness policy a request in flight no longer makes a fresh entity read as
  expired and refetch it; an entity only a request holds (a temporary id) is
  never aged, planned or timed. A field the server settled without a value
  now ages out with its entity on the read entry's timer, instead of waiting
  for an unrelated Model change. `EntityWrite` takes an optional `updatedAt`.
- **Tag branching the type checker can check.** Every package branches on a
  `_tag` it can type: Schema ASTs are `SchemaAST.AST`, tested with Effect's
  guards, instead of a hand-written `{ _tag: string }`; switches list every
  variant or end in `absurd`; and casts before a `_tag` read are gone.
  `foldkit-entity` exports `SchemaShape` (`isNullish`, `present`, `isText`),
  the one reading of an optional Schema that `cms`, `crud`, `form`, `remote`
  and `remote-drizzle` each had a copy of. `foldkit-cms`'s `EditorForm.field`
  returns a `FieldValidation.Field<unknown>`. `pnpm tags:check` finds branching
  the checker cannot vouch for.
- **`foldkit-form`: `DraftKind` gains `'model'`,** and `NestedForm` gains
  `control` and `Message.Control`. A switch over `DraftKind` handles the new
  case, and a hand-written `NestedForm` adds the two members; forms made by
  `Form.make` have them.
- **`foldkit-durable` schema 6:** schema 5 adds epoch and replica-binding
  tables; schema 6 records the replica on each operation. Files from schema 4
  or 5 upgrade in place;
  retained operations restore their actor bindings. A custom journal with
  compacted older operations needs `legacyReplicaId` to recover the replica
  from an operation id; without it opening is refused. `foldkit-sync` supplies
  this callback. The snapshot cache also follows the document epoch after a
  reset through another handle. Older builds refuse a schema 6 file.
- **`foldkit-sync`: the socket transport reconnects for as long as its layer
  lives.** `maxRetries` now counts consecutive failures after which queued work
  fails fast, instead of ending the transport. `Replica.start` retries a failed
  exchange on a backoff, and every failed exchange sets `status.lastError`.
- **`foldkit-sync`: the IndexedDB database moves to version 2** (the outbox
  store); code from before it cannot open a database this version wrote.

## 0.11.0

`foldkit-remote`, `foldkit-remote-server` and `foldkit-remote-drizzle` 0.8.0;
`foldkit-surface` 0.5.0; `foldkit-bundle` 0.3.0; `foldkit-mixins`,
`foldkit-mixins-ui`, `foldkit-mixins-surface` and `foldkit-mixins-crud` 0.4.0;
`foldkit-primitives` 0.3.0; `foldkit-crud`, `foldkit-entity`, `foldkit-agent`
and the four agent adapters, and `foldkit-durable` 0.4.0; `foldkit-form`,
`foldkit-mixins-form`, `foldkit-cms`, `foldkit-cms-drizzle` and
`foldkit-bundle-surface` 0.2.0; `foldkit-mirror` 0.3.0; `foldkit-sync` 0.6.0;
`foldkit-react` and `foldkit-react-codegen` 0.2.0. Every one of them moves to
Foldkit 0.163 and Effect 4.0.0-rc.116; `foldkit-metadata` is unchanged at
0.1.0. Four packages are published for the first time at 0.1.0:
`foldkit-ssr`, `foldkit-richtext`, `foldkit-richtext-dom` and
`foldkit-mixins-richtext`.

**A page is declared once.** `Bundle.compose` states a parent's own fields and
Messages and the bundles it places, and derives its Model, Message union,
placements and assembly, so a page no longer spreads each placement's fields
and cases into Schemas it writes by hand. `Bundle.lazy` keeps a bundle's
`update` and `view` out of the boot chunk.

**Interaction and styling you do not have to rebuild.** `foldkit-primitives`
gains an `interaction` subpath of Bundles for roving focus, typeahead, grid
navigation, selection, press, focus scopes, dismissable layers and live
announcements. `foldkit-mixins` gains cascade layers as a value, a theme from a
few knobs, layout pieces, and multi-slot recipes, which `foldkit-mixins-ui`
ships for its components.

**Remote tells a withheld field from a deleted entity**, forgets everything at
a change of principal with `Data.forget`, and refreshes a value when it ages
out rather than when the Model next changes.

**Server rendering and rich text, first releases.** `foldkit-ssr` renders on
the server, hands the browser the Model the server reached instead of rerunning
`init`, and can answer events before the runtime boots. `foldkit-richtext` and
its DOM adapter give an editor whose document lives in the application Model.
All four new packages are early and may change between minor versions.

### New packages

- **`foldkit-ssr` 0.1.0.** Server rendering that hands the browser the Model
  the server reached, not the inputs to rebuild it. `SSR.plan` names the slice
  of the Model the browser owns, checked against the Surfaces it reads.
  `SSR.render` and `SSR.page` render on the server, `SSR.generate` at build
  time, and `SSR.entry` serves through Foldkit's `handleRequest`.
  `SSR.hydrate` adopts the server's HTML without running `init`.
  `SSR.static` regions belong to the server alone, and a part such as
  `Remote.resume(Data)` carries a package's state across. Resumable pages,
  forms that work with scripts off, and lazy bundles are listed under Added.
- **`foldkit-richtext` 0.1.0.** Pure semantic documents and text
  transactions. A `Document` is versioned data with stable node ids, and
  `run` or `apply`, called from `update`, returns the next state, a
  `ChangeSet` and a position map, or a diagnostic with no partial result. It
  holds no store and does no I/O. Unknown blocks are preserved, migrations
  keep identities, a rendering registry declares node kinds, and `toHtml` and
  `toText` serialize a document.
- **`foldkit-richtext-dom` 0.1.0.** The DOM adapter for an editable
  `foldkit-richtext` subtree. It renders a document into real DOM once,
  patches only the nodes a `ChangeSet` names, and turns browser events into
  commands the application's `update` decides on. Subpaths hold the host
  mount, events, HTML import, a read-only view, a marks toolbar, and an editor
  Bundle (`foldkit-richtext-dom/editor-bundle`).
- **`foldkit-mixins-richtext` 0.1.0.** The editor's mark toolbar as a
  Mixins `SlotView` (`markToolbar`, `MarkToolbarSlots`), so each button is a
  slot an application styles.

### Upgrading from 0.10

- Move `foldkit` and `@foldkit/ui` to `0.163.0`, and `effect`,
  `@effect/platform-browser` and any `@effect/*` package to `4.0.0-rc.116`.
- Deploy a Remote client and server together: the wire protocol is now 4, and a
  read you wrote by hand, a test fake included, returns `settled` beside
  `entities`.
- Replace `Theme.variable(theme, group, name)` with `Theme.ref(theme)[group][name]`.

### Breaking

- `foldkit-remote`, `foldkit-remote-server`: `ReadBatchResult` requires
  `settled`, the protocol is 4 and the cache version 5, so a cache persisted by
  0.10 is discarded. See the entry under Changed.
- `foldkit-surface`: an `ActiveSurface` carries a required `messages`, so one
  built by hand, rather than through `Surface.at` or `Surface.when`, adds it.
- `foldkit-mixins`: `Theme.variable` is removed; declarations are type-checked
  against csstype; a style property set by a Behavior and by anything else is
  refused (`mixins:style-property-conflict`).
- `foldkit-bundle`: an array collection's item must carry its key as its id;
  writing one that does not throws.
- `foldkit-cms`: a hand-built `EditorForm` needs `authoredChanged`, which a
  form made by `Form` already has.

### Added

- **`foldkit-bundle`: `Bundle.compose`, a parent in one declaration.** A
  parent's own fields, then through `pipe` its own Messages
  (`Bundle.withMessages`), the bundles it places (`Bundle.withChild`,
  `Bundle.withEach`), integration wiring (`Bundle.withWiring`) and its
  services (`Bundle.withServices`). It derives the Model, the Message union
  with each child's `Got<Field>Message`, each placement under
  `children.<field>`, and the assembly, so a parent no longer spreads
  `declare(...).fields` and `.cases` into Schemas it writes by hand. Each step
  is typed by the parent so far, so an `onOut` knows the Model. A child whose
  config is made from the parent itself, such as a Crud editor whose `onOut`
  needs the Surface application built from this Model, is added without one
  and given it later with `Bundle.configure`; until then its `children` and
  `placements` are type errors naming what waits. It builds the same values
  `declare`, `parent`, `at` and `assemble` do, and those stay for a parent
  whose Model already exists or a placement with a custom Link.
- **`foldkit-bundle`: `Bundle.lazy`, a bundle whose `update` and `view` load
  on demand.** The declaration (`Model`, `Message`, `args`, `init`,
  `subscriptions`, `resources`, `helpers`) stays in the boot chunk; the bodies
  are a `Bundle.Body` a chunk exports. A Message before the load returns a
  Command that loads them and yields it again, so nothing is lost; `while`
  renders meanwhile; `load()` preloads once. `Placed.view` and a collection's
  views now take any builder with `submodel` and `OnClick` (`BuilderLike`), so
  a wrapper of Foldkit's builder can be handed to them.
- **`foldkit-surface`: an active Surface carries `messages`.** `Surface.at`
  and `Surface.when` now give the tags of the Messages the Surface lists, so a
  tool holding a plan's Surfaces knows what each may send; `foldkit-ssr` reads
  it to keep a page's bindings to them. **Breaking** for code that builds an
  `ActiveSurface` by hand rather than through `Surface.at` or `Surface.when`:
  add `messages`, an empty list for a Remote requirement that sends nothing,
  as `foldkit-crud` and `foldkit-cms` now do.
- **`foldkit-ssr`: resumable pages.** On top
  of rendering on the server and handing the browser its slice of the Model,
  a page can now answer before its runtime boots. `Resume.builder(h)` writes
  in the server's markup which Message each element causes, and the browser
  answers events from those markers until a plan's `start: 'idle' |
  'on-interaction'` boots it, replaying what was answered. A page may only
  dispatch Messages its active Surfaces list. With `fallback: 'server'` a form
  posts its Message and `SSR.handle` runs `update` and its Commands on the
  server, so the form works with scripts off. The configuration's `lazy` list
  loads each `Bundle.lazy` before a page renders or boots. A tampered envelope
  is refused rather than thrown on, and a post whose Commands never settle is
  stopped after 100 steps. See the package README.
- **`Remote.resume(Data)`: Remote's state for a server-rendered page.** A
  resume part for `foldkit-ssr` that sends what the page's
  active Surfaces read, field by field through relations, each connection
  with its boundaries, and the live cursors of the entities captured; nothing
  else of the store. A `Snapshot` stays the tool for a cache that survives a
  reload. The part also vouches for Remote's Subscription entries, which
  `Data.subscriptions` and the fold's `subscriptions` mark as safe to start
  late, so a page that resumes Remote's data may defer its boot.

- **`Mirror.fold` and `Remote.fold`: a library's Messages under one variant
  of the application's union.** Spreading `Mirror.messages` or
  `Remote.messages` into the union leaves `update` unable to match it
  exhaustively, because the library's tags remain in the union after the
  `reduces` guard. A fold gives the shape Foldkit gives a Submodel: declare
  `GotPrefsMessage: { message: Mirror.Message }` or
  `GotRemoteMessage: { message: Remote.Message }`, fold the mirror or the
  domain under it, and match the whole union. Everything the library produces
  yields the wrapper with the lift recorded: a kv mirror's `restore` (and the
  fold's `init` Step that runs it), a domain's `fetch`, a mutation's Command,
  and its Subscription entries. A Story resolves a restore or a mutation by
  the library's own answer. `Mirror.Message` and `Remote.Message` are the
  union Schemas for the wrapper field. The spread and the `reduces` guard stay
  for an `update` that only reduces; wiring stays the bundle path.
- **`foldkit-primitives`: a `foldkit-primitives/interaction` subpath for
  interaction state a view's slots reflect.** Each primitive is a namespace
  (`RovingTabindex`, `Press`, ...) exporting its `bundle`, `Model`, `Message`,
  `Args`, a `foldkit-mixins` Behavior (`behavior`) that wires it to a view's
  slots, and its pure functions. `foldkit-mixins` is a new optional peer,
  needed only for this subpath.
- **`foldkit-primitives`: keyboard navigation and selection over a set of
  items.** `RovingTabindex` keeps one tab stop by the current item's id, so a
  reorder keeps it; its pure `move()` handles arrows by orientation, looping,
  Home, End, PageUp, PageDown, skipping disabled items and RTL, and under
  `virtual` DOM focus stays on the container with `aria-activedescendant`.
  `Typeahead` finds the item whose label starts with the typed characters, and
  a repeated character cycles. `ListNavigation` combines the two with one key
  handler. `GridNavigation` moves in two dimensions over rows of cells, with
  Home and End per row and Ctrl+Home and Ctrl+End per grid. `Selection` keeps
  `{ selected, anchor }` in `single`, `multiple` or `none` mode, with a Shift
  range through `Ranged` and the pure `between()`, and writes `aria-selected`.
- **`foldkit-primitives`: focus management.** `FocusScope` (a Mount in
  `/dom`, with a Behavior in `/interaction`) focuses `initialFocus` or the
  first tabbable element, keeps Tab inside the scope under `contain`, and
  returns focus on unmount under `restore`. `InputModality` (in `/events`)
  records whether the keyboard or a pointer was used last, and
  `FocusVisible.behavior` writes `data-focus-visible` under keyboard for a
  design system that decides focus rings in the Model.
- **`foldkit-primitives`: pointer and press input.** `Press` treats a pointer
  press, Enter, Space and an assistive-technology click as one activation. It
  ignores the ghost click after a touch and writes `data-pressed`. The
  placement must handle its `Pressed { pointerType, shiftKey }`. `LongPress`
  emits `LongPressed` after `thresholdMs`, reusing the events `Press` reports.
  `Move` (a Mount in `/dom`) captures the pointer and reports each move as the
  distance from where it went down. The parent's update decides what a drag
  means.
- **`foldkit-primitives`: overlay layers.** `DismissLayer` is one Bundle
  placed once that owns the document's pointerdown and Escape listeners. It
  gives the placement `Dismiss { ids }` for the layers a press outside or an
  Escape closes. Nested layers and triggers work without registration.
  `ScrollLock` and `HideOutside` are Mounts over Foldkit's `Dom.lockScroll`
  and `Dom.inertOthers`, attached through `Layers.scrollLock` and
  `Layers.hideOutside`.
- **`foldkit-primitives`: `LiveAnnounce`, screen-reader announcements from
  `update`.** One Bundle holds a polite and an assertive region. `say()`
  builds the Message, `view()` renders the regions, a burst is read once after
  `debounceMs`, the text clears after `clearAfterMs`, and a repeated text is
  read again.
- **`foldkit-primitives`: reduced motion as a service.** `Motion` in
  `foldkit-primitives/motion` is read when a transition starts. Provide
  `Motion.live` for the user's `prefers-reduced-motion`, or `Motion.reduced` /
  `Motion.full` in tests. Under reduced motion a presence exits at once and a
  tween or spring jumps to its end, using the same Messages. With no service
  provided, motion is unchanged.
- **`foldkit-bundle`: exports the `Declared` and `DeclaredEach` types**, for
  a helper that reads a placement's field and wraps its Messages.
- **`foldkit-mixins`: cascade layers as a value, and a stylesheet built from
  pieces.** `Layers.define(names)` returns `names`, `declare` (the `@layer`
  statement as a piece), `in(name, piece)` and `layer(name)`; a layer name
  outside the order is a type error. `Layers.standard` is the shipped order:
  `reset, tokens, theme, defaults, components, layouts, variants, utilities,
  app`. A slot style takes its layer when it is compiled, with
  `Style.forSlots(S)(pieces, { layer: L.layer('app') })`, so the view and the
  sheet share the same class names. `Style.stylesheet` now takes bare
  `StyleValue`s beside `NamedStyle`s and hoists the layer order first. Once a
  sheet declares an order, it refuses a rule outside it
  (`style:unlayered-rule`), because an unlayered rule beats every layer, `app`
  included. A sheet with no order behaves as before.
- **`foldkit-mixins`: a theme from a few knobs, under `foldkit-mixins/theme`.**
  `Theme.oklch(knobs)` derives surfaces, text, outlines, and the accent,
  secondary, tertiary and feedback colors from an accent and a few knobs.
  Every derived value is a CSS expression, so one knob override recolors the
  page in the browser. `Theme.tokens` holds the non-color scales, with
  `density` and `radius-factor` knobs. `Theme.root` and `Theme.scoped` turn a
  theme into `:root` and selector rules for the sheet, and `Theme.scoped`
  type-checks its overrides against the theme. `Theme.ref(theme)` gives every
  token as a typed `var(--fk-…)`, so a missing name is a type error.
  `Theme.compose`, `Theme.lightDark` and `Theme.breakpointWidths` complete the
  set, and the root export gains `ref`, `compose` and `lightDark`. The palette
  needs relative color syntax and `light-dark()`.
- **`foldkit-mixins`: layout, element defaults and prose as subpath
  entries.** `foldkit-mixins/layout` ships `Layout.stack`, `cluster`, `split`,
  `sidebar`, `switcher`, `reel`, `center`, `frame`, `pad`, `autoGrid`,
  `intrinsic` and `aside`. `foldkit-mixins/defaults` ships element defaults
  (`reset`, `body`, `headings`, `links`, `code`, `controls`, `all`), and
  `foldkit-mixins/prose` ships `Prose.style`. They are unlayered, so the page
  places them with `Layers.in`. `foldkit-mixins/layers` re-exports `Layers`.
- **`foldkit-mixins`: more Style pieces.** `Style.self` is a rule on the
  element's own class, for declarations that must sit in a layer rather than
  inline. `states` styles per `data-state` value. `responsive` takes a map
  keyed by breakpoint names typed from the record you pass. `enter` writes a
  `@starting-style` rule, and `allowDiscrete`, `vars` and
  `viewTransitionName` round it out. `Style.grid` declares a template whose
  `area(name)` accepts only the areas it names. The `Selector` namespace
  builds the strings `pseudo` and `nest` take. Every piece's declarations are
  typed as `Declarations`, csstype's camelCase properties plus custom
  properties.
- **`foldkit-mixins`: multi-slot recipes, per-item styles and
  `forCapability`.** `Style.recipeFor(Slots)` gives each slot of a contract a
  base, variants per axis, defaults and compound matches, and returns the
  pieces for `Style.forSlots`. Its `extend(patch)` adjusts a shipped recipe
  without forking it. `Style.perItem` computes a piece from the item a slot
  is rendered for, and `Style.stagger({ stepMs })` staggers a list with no
  timer. `Style.forCapability` styles every public slot with a given
  capability.
- **`foldkit-mixins`: slots rendered once per item, and ready-made stateless
  Behaviors.** `slots.x.attrs(base, item)` takes an optional `SlotItem`
  (`{ index, id?, count? }`), which reaches a Behavior's attributes and
  mount. `Behaviors.Collection` describes a parent's array once, with ids,
  disabled items and `aria-posinset`/`aria-setsize`, and refuses duplicate ids
  (`mixins:duplicate-item-id`). `Behaviors.Disclosure`,
  `Behaviors.ToggleState`, `Behaviors.FieldAssociation` and
  `Behaviors.SpinValue` put a parent's state into ARIA and keyboard handling.
- **`foldkit-mixins-ui`: `Recipes` for Button, Input, Textarea, Checkbox,
  Switch, Dialog and Tabs.** Each is a `Style.recipeFor` over the package's
  slot contract, such as
  `Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' })`.
  Values reference `Theme.tokens` and a `Theme.oklch` palette, so the page
  must ship those tokens. Bases sit in the `components` layer and variants in
  `variants`, all as layered rules, so an `app`-layer style overrides them.
  State comes from the ARIA attributes `@foldkit/ui` already writes.
- **`foldkit-mixins-ui`: `Patterns`, `HoverIntent` and `Anchor`.**
  `Patterns` has an `A11y.pattern` per adapter. `Patterns.catalog` gives each
  one's tier and the behavior it leaves to the browser, so
  `A11y.validate(Patterns.Tabs, MySlots)` checks a custom view.
  `HoverIntent` (`HoverIntentSlots`) adapts `@foldkit/ui`'s hover intent.
  `Anchor.behavior(Slots)({ floating, config })` positions a floating slot
  with `@foldkit/ui/anchor`.
- **`foldkit-remote`: `Data.forget`, the one boundary for a change of
  principal.** Called from `update` on a login, a logout or a switch of
  organization, it returns the Model with every server-derived fact gone
  (values, tombstones, unavailable fields, connections, live cursors,
  failures) and performs no I/O. Every active Surface's read and live entries
  restart, and a read or stream begun before is interrupted rather than
  landing after. A mutation in flight is treated as applied, so its answer
  writes nothing. `Remote.forget(bound, model)` is the unbound form.
- **`foldkit-remote`: a value ages out as a Message.** Under
  `staleWhileRevalidate` a page that sat still past its `maxAge` was never
  refreshed, because the plan ran only when the Model changed. The read entry
  now sleeps until the earliest value it holds ages out, under the Effect
  clock, and emits `RefreshStarted` for what is due; the plan that follows
  fetches it. A test controls this with the Effect test clock.
- **`foldkit-form`: `authoredChanged(before, after)`.** It says whether a
  completed transition changed what the author wrote, by comparing the two
  Models: a blur, a refused edit or a repeated value is `false`; a changed
  draft or an added, removed or changed row is `true`. Nested rows recurse.
  `foldkit-cms`'s editor now autosaves on it instead of on the form's Message
  tags, so a Bundle-backed or stateful control autosaves like a text field.
- **`foldkit-mixins-form`: every control carries `name=<key>`**, and a
  relation picker's checkboxes also carry `value`, so a plain form post (for
  example `foldkit-ssr`'s `fallback: 'server'`) carries the drafts.

### Changed

- **Foldkit 0.163.0 and Effect 4.0.0-rc.116.** Every package that peers
  `foldkit` now requires `^0.163.0`, every package peers
  `effect@^4.0.0-rc.116`, and `foldkit-mixins-ui` peers `@foldkit/ui@^0.163.0`.
  Foldkit itself now peers `@effect/platform-browser@4.0.0-rc.116`, so an
  application installs that alongside `effect`. `foldkit-durable` depends on
  `@effect/sql-sqlite-node@4.0.0-rc.116`.

  **Upgrading from 0.10.0:** pin `effect`, `@effect/platform-browser`, and any
  `@effect/*` package to `4.0.0-rc.116`, and `foldkit` and `@foldkit/ui` to
  `0.163.0`. Replace `evo` with `modifyFields` from `foldkit/struct`; the
  package READMEs and the skill already do. `@effect/vitest` at rc.116 needs
  Vitest 5. A test that opened a `@foldkit/ui` Dialog through
  `Dialog.init({ isOpen: true })` opens it through `Dialog.boot` now, because
  `init` always returns a closed Dialog since `@foldkit/ui` 0.161.
- **`foldkit-form`: a nested form's Commands are lifted with
  `Command.mapMessages`.** The row lift wrapped the inner form's answer by
  hand, which dispatched correctly but left Story and Scene unable to replay
  the wrap: resolving a row's check handed the parent update the inner form's
  bare `Checked`. Resolving it now yields the `Nested` Message the parent
  handles. The `at` and `row` args the old lift added are gone; nothing read
  them.
- **`foldkit-react-codegen` lowers `OnKeyDownSelf`** to `onKeyDown` guarded by
  `event.target === event.currentTarget`. `OnBeforeInput`,
  `OnBeforeInputPreventDefault`, `OnKeyDownSelfPreventDefault`, and
  `OnCancelPreventDefault` report `FKREACT0002` like the other attributes with
  no one-line React form.
- **Docs use `Schema.Option` for optional Model fields and `match` over a
  Message.** Foldkit's recommended Oxlint preset now rejects `Schema.NullOr`
  in a Model and `switch` on a Message tag; the surface, sync,
  mixins-surface, and mirror snippets, and the skill's one-screen example,
  no longer trip it.
- **`foldkit-remote`, `foldkit-remote-server`: a withheld field is settled on
  the wire instead of tombstoning its entity.** Before, a field the server
  answered without was planned again. The second read came back with no
  entity, and the client tombstoned it, dropping every field it already held.
  `ReadBatchResult` now has a required `settled: Array<{ entity, id, fields }>`:
  fields the server will not answer with. `RemoteServer` settles what
  `authorize` withheld and what a Source left out of a record. The client
  marks those fields unavailable: they are not planned again, a later write
  clears them, and a refresh forgets them. An id is tombstoned only when it is
  neither returned nor settled. A Selection naming such a field reads `Failed`
  with an `Unavailable` error. `REMOTE_PROTOCOL_VERSION` is now 4 and
  `REMOTE_CACHE_VERSION` is now 5, so a persisted cache from 0.10.0 is
  discarded. **Breaking** for a hand-written `RemoteClient`, `RemoteRpcClient`
  or server read handler, including test fakes: return `settled: []` (or the
  fields you withheld) beside `entities`. Deploy client and server together.
- **`foldkit-mixins`: `Theme.variable` is replaced by `Theme.ref`.**
  **Breaking.** `Theme.ref(theme)` is built once per theme and reads like the
  token it names. Migrate `Theme.variable(theme, 'surface', 'base')` to
  `Theme.ref(theme).surface.base`.
- **`foldkit-mixins`: declarations are type-checked against csstype.**
  **Breaking** at the type level only: `inline`, `self`, `pseudo`, `nest`,
  `media`, `supports`, `container` and the other pieces took any
  `Record<string, string>`. A misspelled or kebab-case property is now a type
  error. Write it in camelCase, or as a `--custom` property. Compiled CSS is
  unchanged, and `csstype` is a new dependency.
- **`foldkit-mixins`: a style property a Behavior sets has one owner.**
  **Breaking.** When a Behavior sets a property through `h.Style` and a Style
  piece, the base or another Behavior sets the same one, resolving now raises
  `mixins:style-property-conflict`, naming both. Before, the last writer won
  silently. To migrate, remove the property from one of the two.
- **`foldkit-mixins`: rule pieces work under `Style.whenInput`.** Before, a
  pseudo, nest or media piece inside `whenInput` was refused with
  `style:conditional-rules-unsupported`. Now each compiles to its own class,
  which ships in the sheet and is present only while the input matches. That
  diagnostic code is gone.
- **`foldkit-cms`: the editor autosaves on `authoredChanged`.** A hand-built
  `EditorForm` now needs it; a form made by `Form` already has it.

### Fixed

- **`foldkit-surface`: `Projection.pick` no longer merges two fields that share
  a name.** A picked field is named by its last key, so `post.id` and
  `viewer.id` both became `id`. When their schemas were the same object, which
  `Schema.String` always is, they were merged without a word: `get` kept one
  value and dropped the other, and `set` wrote that one value into both
  fields. Mirror, Sync and Agent contexts are built from `pick`, so a URL
  mirror or a replica could overwrite one field with another. Both `pick` and
  `Projection.compose` now refuse the collision when the projection is built,
  naming both paths. The same field picked twice is still kept once.
- **`foldkit-bundle`: four routing and assembly bugs.** A nested placement
  listed after its outer placement now gets its Messages, because routing asks
  the deepest placements first. `Link.collectionById` throws, naming both, when
  an item's id is not its key; before, the item could never be read back and
  its Messages reached nothing. A tag is shared only when every claimant
  declares it shared, and a placement never shares. A nested child under an
  absent outer child no longer runs its init Commands.
- **`foldkit-mixins`: `Style.nest` and `Style.pseudo` scope every selector
  of a comma list.** Only the first selector got the element's class, so the
  rest matched page-wide. Each top-level selector is now scoped. A selector
  that writes `&` places the class there instead of gaining a prefix. Rules
  without a comma compile to the same text and class.

## 0.10.0

`foldkit-remote`, `foldkit-remote-server` and `foldkit-remote-drizzle` 0.7.0;
`foldkit-crud` and `foldkit-mixins-crud` 0.3.0; `foldkit-surface` 0.4.1.
Republished only so their pinned dependencies are the current ones:
`foldkit-agent` 0.3.3, `foldkit-bundle-surface` 0.1.3, `foldkit-cms` and
`foldkit-cms-drizzle` 0.1.2, `foldkit-mirror` 0.2.3 and `foldkit-sync` 0.5.4.

**A first run no longer needs a server, and a stuck read says why.**
`RemoteServer.memory` serves rows you give it through the same handlers a real
server uses, so a page can show real data before there is a database.
`Data.why` answers the question every newcomer asks of a read sitting at
`Initial`: is no active Surface reading it, or are Remote's Subscriptions not
installed? `Remote.patch` and `Remote.ref` let the entity you declared with
`foldkit-entity` be the one you patch.

**Reads are more honest about loading and failure.** Two reviews of 0.9's
failure handling found reads that still lied. A failed refresh could be
forgotten once a later page loaded, leaving an outdated first page reading
`Ready`. A read waiting on a related entity said `Initial`, the state that
means a wiring mistake. An editor opened on a value whose refresh had failed
showed an empty form. All of these are fixed.

### Upgrading from 0.9

Upgrade every `foldkit-*` package you use together; they pin each other's
versions exactly. Most applications need nothing else.

1. **A relation's value is typed by its entity.** A relation to `User` takes
   `` `User:${string}` `` (`RefKey<'User'>`), not any `string`. A literal such
   as `'User:u1'` or a template such as `` `User:${id}` `` already fits. A plain
   `string` variable passed to a relation field needs the same template.
2. **`DetailView`'s root is a `div` in every state.** A style or behaviour that
   targeted `root` to reach the `dl` moves to the new `list` slot.
3. **A failed list refresh stays stale.** Code that read a connection's `stale`
   flag after a `QueryFailed` sees `true` where it saw `false`. What shows on
   screen is unchanged: the list reads `Failed` with its rows as `previous`.
4. **`App.fields` is deprecated.** Use `App.model`; they are the same object.

### Breaking

- **`foldkit-remote`: a relation's wire value names its entity in the type.**
  A relation to `User` was typed as any `string`, so `owner: 'Project:p9'`
  typechecked in a patch and read as a row that does not exist. It is now
  `RefKey<'User'>`, which is `` `User:${string}` ``. Runtime is unchanged.
- **`foldkit-mixins-crud`: `DetailView`'s root is a `div` in every state.** It
  was the `dl` while showing a value, and a `div` around a status line
  otherwise, so a style or behaviour on `root` covered different elements as
  the read changed, and missed the alert a failed refresh shows beside the
  value. The `dl` now has a slot of its own, `list`, and carries `aria-busy`
  while refreshing.
- **`foldkit-remote`: a failed refresh stays owed.** `QueryFailed` cleared the
  connection's stale mark, so once "load more" landed a later page and settled
  the failure, the list read `Ready` with its first page still outdated and the
  refresh never retried. The connection now stays stale; the failure is what
  stops the planner asking again, and whatever settles it lets the refresh run.

### Added

- **`foldkit-remote-server`: `RemoteServer.memory`, a backend held in memory.**
  Give it the domain and some rows, and its `layer` is a `RemoteClient`, so a
  first run, a test or a demo needs no database and no network. Reads go
  through the same `handlers` a real server uses, so fields, nested relations
  and relation pages arrive as production sends them. A `Query.define` body is
  run over the rows by the reference interpreter and paged by row id, as a
  keyset: a page ends where the next begins, and "load more" keeps working
  after the last row stops matching. Mutations are yours to give, and write
  through the store they are handed. No live changes, no authorization.
- **`foldkit-remote`: `Data.why(model, projection, { surfaces })`.** `Initial`
  means nothing is fetching a read, and in practice it is almost always wiring.
  `Data.why` tells the two usual mistakes apart: `NotObserved`, when no active
  Surface asks for all of the read, and `NotFetching`, when one does and
  Remote's Subscriptions are not running. It names the Surfaces involved and
  says what to do. For every other state it says in words what the state means.
- **`foldkit-remote`: `Remote.patch(entity, id, values)` and
  `Remote.ref(entity, id)`.** An optimistic patch or a connection change for a
  `foldkit-entity` Entity had no direct spelling: it needed
  `Entity.from(Project).patch(...)` with Remote's `Entity`, whose name collides
  with `foldkit-entity`'s. Both take either kind of entity and check `values`
  against its fields.
- **`foldkit-crud`: `refresh(model)` on the editor**, like placed lists and
  details, for a retry button while `status` is `LoadFailed`.

### Fixed

- **`foldkit-remote`: a read waiting on a related entity reads `Loading`.** It
  read `Initial`, so a live patch that moved a project to a new owner dropped a
  value that was on screen into the "nothing is fetching this" state while the
  owner loaded. Loading is now checked through relations, for entity reads and
  list rows alike.
- **`foldkit-remote`: a refresh retries a related entity whose read failed**,
  even when the server does not expand the relation, as servers need not.
- **`foldkit-remote`: retention forgets a field read nothing waits for any
  more**, as it already did for a list's query, so an interrupted read cannot
  leave a value reading `Loading` for good.
- **`foldkit-remote`: a hydrated value settles the failure of the field it
  writes**: every field under `replace`, and under `preserve-existing` only
  those of entities the store did not hold.
- **`foldkit-crud`: an editor opens on the last good value when its refresh
  failed.** It stayed in `LoadFailed` with an empty form, though the value was
  in `previous`. It now fills from it.
- **`foldkit-mixins-crud`: an empty list that failed to refresh says it was
  empty**, under the failure, instead of showing the alert alone.

### Deprecated

- **`foldkit-surface`: `App.fields` is deprecated; use `App.model`.** They
  were the same references under two names, and the docs used one while the
  tests used the other, so a reader could reasonably think they differed. This
  reverses the Surface README's earlier advice to prefer `fields`, which was
  written before the APIs that settled on `model`: `App.surface` hands a
  Surface `{ model }`, and `Remote.make` and `Editor.at` take
  `model: App.model.…`. `App.fields` still works, is the same object, and is
  marked `@deprecated` so an editor points at the new name. It will be removed
  in a later minor.

## 0.9.0

`foldkit-entity` 0.3.0; `foldkit-surface` 0.4.0; `foldkit-remote`,
`foldkit-remote-server` and `foldkit-remote-drizzle` 0.6.0; `foldkit-crud` and
`foldkit-mixins-crud` 0.2.0. Republished only so their pinned dependencies are
the current ones: `foldkit-agent` 0.3.2, `foldkit-bundle-surface` 0.1.2,
`foldkit-cms` and `foldkit-cms-drizzle` 0.1.1, `foldkit-form` and
`foldkit-mixins-form` 0.1.2, `foldkit-mirror` 0.2.2 and `foldkit-sync` 0.5.3.
`foldkit-mixins-surface` 0.3.1 moves its peer range to `foldkit-surface@^0.4.0`.

**Remote reads now tell the truth about failure and loading.** A request that
failed used to leave a read at `Initial`, which looks exactly like "nobody
asked", and nothing asked again, so a list could sit empty for good with no sign
of an error. A failed refresh read `Ready`, as if it had worked. Now a failed
read is `Failed`, keeping what was on screen as `previous`. It is retried when
something asks for it, never in a loop. A list whose first page is on its way
reads `Loading`. The CRUD views keep the rows through a failed refresh and can
offer a **Try again** button.

**The client can run a query over the rows it already holds.** The reference
interpreter moved to `foldkit-entity`, so `Data.filtered` can filter a loaded
list without asking the server, and says whether its answer covers the whole
list. Live inserts are judged against the query before the declared policy is
used.

**Also:** a list can survive a reload (its rows, never its cursors),
`Data.explain` describes a query read in one serializable value, and
`Surface.when` makes why a Surface is active something a tool can read. Two
declared behaviours that had never been wired now work: a connection's
`LivePolicy`, and live invalidation.

### Upgrading from 0.8

Upgrade every `foldkit-*` package you use together. They pin each other's
versions exactly, and `foldkit-mixins-surface` 0.3.0 does not accept
`foldkit-surface` 0.4. Most applications then need only the first two steps.

1. **Persistence takes a `Snapshot`.** Wrap the Model in `snapshotOf`, and pass
   both halves of what comes back to `Hydrated`:

   ```ts
   // 0.8
   RemotePersistence.dehydrate(model.remote.entities, { scope })
   // 0.9
   RemotePersistence.dehydrate(RemotePersistence.snapshotOf(model.remote), { scope })

   const restored =
     RemotePersistence.hydrate(text, { scope }) ?? RemotePersistence.emptySnapshot
   Data.reduce(model, {
     _tag: 'Hydrated',
     entities: restored.entities,
     connections: restored.connections,
     merge: 'preserve-existing',
   })
   ```

   `REMOTE_CACHE_VERSION` is 4, so a cache written by 0.8 is discarded once
   and refetched, never misread.
2. **`Failed` now also means the request failed**, not only that stored data
   did not decode. `RemoteData.render` already draws `Failed { previous }` as
   the old value with a `Stale` freshness, so a view built on it needs nothing.
   A view that matches `Failed` itself should draw `previous` when it is there.
   Nothing retries a failed read on its own, so give the user a way to ask:
   `Data.refresh(model, projection)`, a placed list's or detail's
   `refresh(model)`, or `onRetry` on `ListView`/`DetailView`.
3. **One new Remote Message, `QueryStarted`.** Code that spreads
   `Remote.messages` into its union and routes through `Data.reduce` or
   `Data.wiring` needs nothing. A hand-written exhaustive switch over Remote's
   Messages needs one more case.
4. **A `RemoteModel` built by hand** (rather than from `Remote.initial`) needs
   `failures: noFailures`.
5. **Removed:** `invalidateConnection`, `isStale`, `refreshConnection` and
   `LiveState.stale`. They recorded staleness that nothing read. To invalidate
   a connection, reduce `ConnectionInvalidated`.
6. **`Expr.contains` accepts only text** (a text field, nullable included, or
   an `Expr<string>`). A number field used to typecheck and then fail in the
   database.
7. **A hand-written `DomainLike`** passed to `foldkit-crud` needs `refresh`.
   Remote's own domain already has it.

`evaluate`, `supported`, `assertSupported` and `Row` can now be imported from
`foldkit-entity`. Their old home, `foldkit-remote-server`, still re-exports
them, so nothing has to move.

### Breaking

- **`foldkit-remote`: a snapshot is a `Snapshot`, not a store.**
  `RemotePersistence.dehydrate`, `hydrate`, `save` and `restore` take and return
  `{ entities, connections }` rather than an `EntityStore`. Build one with
  `RemotePersistence.snapshotOf(model.remote)`; to get the old behaviour, name no
  connections. That is the default. `restore`'s fallback is
  `RemotePersistence.emptySnapshot`, which replaces returning `emptyStore`.
  `REMOTE_CACHE_VERSION` is 4, so a cache written by an earlier version is
  discarded, never misread. Migrating: `dehydrate(model.remote.entities)`
  becomes `dehydrate(RemotePersistence.snapshotOf(model.remote))`, and code
  that used the value `restore` returns as a store reads its `.entities`.
- **`foldkit-remote`: `invalidateConnection`, `isStale` and `refreshConnection`
  are gone, and so is `LiveState.stale`.** They kept a second record of stale
  connections that no read or plan consulted, so an invalidation written
  through them had no effect (see Fixed below). A connection's staleness is
  its own `stale` flag. To invalidate one, reduce `ConnectionInvalidated`.
- **`foldkit-remote`: a read whose request failed reads `Failed`.** Before, a
  query or entity read that failed before anything loaded read `Initial` and
  was never asked for again, because nothing it planned had changed. One that
  failed to refresh read `Ready`, as if nothing had happened. Now failures are
  kept in `RemoteModel.failures`, as `{ connections, fields }`. A read with
  nothing to show reads `Failed { error }`, and one with a value reads
  `Failed { error, previous }`, which `RemoteData.render` draws as data with
  `Stale` freshness. A list fails when a row's field failed, and a read through
  a relation fails when the target's did. What failed is not asked for again on
  its own. `Data.refresh` retries it, including something that never loaded.
  The value arriving, a live invalidation or delete, or retention dropping it
  also clears it. `Remote.inspect` reports `failures`. A view that matched on
  `Failed` for decode errors only will now also see request failures, and code
  that builds a `RemoteModel` by hand needs `failures: noFailures`.
- **`foldkit-remote`: a broken live stream records a gap instead of ending a
  read.** Its `ReadFailed` now carries the `stream` and adds it to
  `RemoteModel.gaps`. It no longer clears the loading and stale marks of the
  fields it watched: nothing was reading them, and a read in flight for the
  same fields used to lose its `Loading`.

### Added

- **`foldkit-remote`: `Data.filtered(model, over, by, input)` filters a loaded
  list on the client.** It runs the body of `by`, a registered `Query.define`
  query, over the rows of the connection `over` reads, and returns
  `{ items, complete }`. The items are decoded through `over`'s own Selection,
  so one view function renders a filtered item or a listed one. It filters a
  list and does not run a query: `complete` is true only when every row was
  judged, every match could be shown, and the list is terminal at both ends
  with no gap. An empty, incomplete answer means "none that I can see yet",
  which is a different answer from "none". It creates no connection and fetches
  nothing. It throws when `by` reads a different Entity from `over`.
- **`foldkit-remote`: `Remote.matching(store, descriptor, input)`**, the
  primitive under `Data.filtered`. It returns the keys a body matches among the
  rows the store holds, plus the keys it skipped because a row lacked a field
  the body reads. The input is given decoded and encoded through the
  descriptor's `Input`. The store holds wire values, and a decoded input
  compared against them matches nothing, with no error.
- **`foldkit-remote`: a declared connection survives a reload.**
  `snapshotOf(model, { connections: [ref] })` keeps that connection's edges,
  segment by segment, and never its cursors, because a cursor may name server
  state that no longer exists. A restored connection has `Unknown` boundaries
  and is stale, so its rows show at once, it reads as `Refreshing`, and the
  planner refetches it. It reports `hasNext` and `hasPrevious` as true in both
  directions, because `Unknown` is not `Terminal`.
- **`foldkit-remote`: a live insert is judged before the declared policy is
  used.** For a connection whose query has a body, an inserted row that the
  client holds and can tell does not match is ignored. A row that matches, or
  that the client cannot judge, gets the connection's `LivePolicy`. A row held
  with a stale value in a field the body reads counts as one it cannot judge,
  so an outdated value never suppresses an insert.
- **`foldkit-remote`: `Data.explain(model, projection, { surfaces? })`**
  returns one serializable value describing a query read: the definition and
  its input, the connection identity, the window, the Selection, the body as
  text with its dependencies, and what the read answers from this Model. Given
  the application's Surfaces, it also lists every active Surface that reads the
  connection and why each is active.
- **`foldkit-surface`: `Surface.when(surface, place, Case, value => params)`**
  activates a Surface while a place in the Model holds one case of a tagged
  union, with the case's fields inferred for `params`. It does what `Surface.at`
  does, but the place and the tag are values, so `Data.explain` can report why a
  Surface is on. It takes a `ModelPlace` (`dependency` and `get`), which a
  `ModelRef` satisfies. `Surface.at` is unchanged.
- **`foldkit-entity`: `Expr.show` and `Query.show`** render a body as text for
  reading. This is deliberately not SQL: an input shows as `$name`, and
  `contains` is named rather than rendered as any dialect's `like`.
- **`foldkit-entity`: `evaluate`, `supported`, `assertSupported` and `Row`**
  are exported from `foldkit-entity`. The reference interpreter depends only on
  the IR, and a client needs it without a server package.
  `foldkit-remote-server` still re-exports all four, so existing imports are
  unchanged.
- **`foldkit-entity/conformance`**, a new subpath, holds the conformance suite
  (`Subject`, `rows`, `cases`) that every interpreter runs. The fixture has an
  `at` column whose encoded form differs from its domain form, so an
  interpreter that compares decoded values fails.

### Fixed

- **`foldkit-mixins-crud`: a failed refresh keeps the rows on screen.**
  `ListView` and `DetailView` drew any `Failed` as a lone error, which was
  right while only decode errors produced it. Now that a failed refresh reads
  `Failed { previous }`, they draw the previous rows or value with the error
  above them. `onRetry` on either view adds a **Try again** button (the `retry`
  slot, worded by `words.retry`), and `foldkit-crud`'s placed lists and details
  gain `refresh(model)` for its Message to return.
- **`foldkit-remote`: a list waiting on its first page reads `Loading`.** It
  read `Initial`, which is documented as "nothing is fetching this", so a view
  could not tell a slow network from a Surface that was never activated. The
  read entry now sends a new `QueryStarted` Message before it runs queries,
  and the page or the failure ends it. Retention dropping the list forgets it,
  so a query the entry stopped waiting for cannot leave a list `Loading` for
  good. An application whose own code switches exhaustively over Remote's
  Messages has one more case.
- **`foldkit-remote`: a declared `LivePolicy` is honoured.**
  `Query.connection(E, { live })` was typed, carried on the descriptor and
  documented, but nothing set the policy on a `LiveReceived` Message, so every
  live insert used the default. The bound `reduce` now resolves the policy.
- **`foldkit-remote`: a live invalidation invalidates the connection.** A
  server's `ConnectionInvalidate` event and a `LiveInsertion` of `'invalidate'`
  used to advance the cursor and do nothing else. Both now mark the connection
  stale, so it reads as `Refreshing` and the planner refetches it.
- **`foldkit-remote`: a page bigger than the window that asked for it is
  refused.** More edges than `first` or `last` requested is now `QueryFailed`
  with a protocol error that carries both numbers. The edges never reach the
  store, and a connection already loaded keeps the rows it had.
- **`foldkit-remote-drizzle`: a `contains` whose search is null compiles.**
  It threw at compile time. It is now SQL's unknown, so a negated or compared
  `contains` over a missing input means what the reference interpreter says it
  means, rather than stopping the request.
- **`foldkit-entity`: `Expr.contains` accepts only text.** A number field
  typechecked and reached the database as `lower(rank) like …`, which SQLite
  coerces and Postgres rejects at runtime. Its operand must be a text field
  (nullable included) or an `Expr<string>`. Code in this repository needed no
  change.

### Interpreters

- **How text compares when ordering is the backend's, and outside the
  conformant subset.** A third interpreter (TanStack DB, in `examples/tanstack`)
  sorts strings by locale where SQLite sorts by code point, and the semantics
  had said nothing at all about collation — two interpreters written here had
  agreed, and the agreement had been mistaken for a rule. Picking code point and
  enforcing it was the first answer and the wrong one: SQLite without ICU cannot
  sort by locale, Postgres would need `COLLATE "C"` on both the ordering and the
  keyset comparison that pages it (losing the index built in its own collation),
  and code point puts every capital before every lowercase. No interpreter
  changed behaviour; the conformance suite (now `foldkit-entity/conformance`)
  drops its text-ordering case, because it pinned whichever engine was written
  first rather than anything promised.

- **`foldkit-entity`: `Query.unsupported(query, supported)` and the `Operation`
  vocabulary.** The operations a query needs that an interpreter does not run,
  so it can refuse rather than skip one — skipping answers a different question
  and still passes every case it does support. The refusal belongs to the
  interpreter, since one that compiles at registration and one that runs a body
  directly fail at different moments.
- **Both interpreters declare what they run.** `foldkit-remote-drizzle` checks
  at registration, beside its column check, so a server that starts is one whose
  queries it can answer; the reference interpreter exports `supported` and
  `assertSupported` (from `foldkit-entity`, re-exported by
  `foldkit-remote-server`), and `evaluate` calls it. Both currently run the whole
  kernel, so there is nothing to refuse yet; it exists for the interpreter that
  does not.

## 0.8.0

`foldkit-entity` 0.2.0; `foldkit-remote`,
`foldkit-remote-drizzle` and `foldkit-remote-server` 0.5.0; `foldkit-cms`,
`foldkit-cms-drizzle` and `foldkit-mixins-crud` published for the first time at
0.1.0. `foldkit-crud`, `foldkit-form` and `foldkit-mixins-form` are republished
at 0.1.1 only so their pinned `foldkit-entity` is the current one — every
package pins its workspace dependencies exactly, so a dependent left behind
would install a second copy of it.

- **`foldkit-entity`: `Expr.isNull` / `Expr.isNotNull` / `Expr.contains`, and a
  predicate may stand where a boolean is wanted.** The three operations the CMS
  worklist needs, and no more. `isNull` and `isNotNull` are one node with the
  answer absence gives flipped, so nothing has to negate a predicate.
  `Expr.eq(Expr.isNotNull(field), input.flag)` is how a query depends on an
  input without branching on it — a body is built once, so there is nothing to
  branch on. `contains` treats the empty string as everything, which makes an
  empty search box the same query as a full one; over a **nullable** column that
  is not the same as no filter, because a null contains nothing. It is
  **case-insensitive** (ASCII folding), which is stated rather than left to the
  backend: SQLite's `like` ignores case and Postgres's does not, so a body that
  left it open would mean two things. On Postgres this makes the CMS search
  case-insensitive where it was not.
- **`foldkit-cms`: the worklist is declared by what it means.** `CmsEntries`
  carries all three of its questions and its order, so `foldkit-cms-drizzle`
  registers it as `query(descriptor, { entity })` and the `and(eq, ternary,
  ternary)` written in Drizzle's dialect is gone. Same rows, same escaping of
  `%` and `_`, same audience boundary — the boundary is conjoined with the body
  by `visible`, as for every other source.
- **`foldkit-remote-drizzle`: a predicate compared to a boolean is resolved at
  request time**, into that predicate or its negation, rather than sent to the
  database as a boolean parameter — which dialects disagree about, and which
  SQLite refuses outright. The SQL is then exactly what a hand-written
  `archived ? isNotNull : isNull` produced.

- **`foldkit-remote-server`: `evaluate`, the reference interpreter.** Runs a
  query body over rows already in memory — pure, reading the rows it is given and
  nothing else. It is what makes a body source-neutral in fact rather than in
  principle: the tests run the same body through it and through
  `foldkit-remote-drizzle` against a real SQLite, and require the same ids in the
  same order. **It follows SQL, not JavaScript** — `null = null` is unknown and
  matches no row, where JavaScript would call the two equal. It refuses rather
  than guesses in two places: ordering by a column that is null in some row
  (SQLite sorts nulls first, Postgres last, so there is no answer to be
  conformant to), and comparing values it has no order for.

- **`foldkit-remote-drizzle`: a query body compiles to SQL.** A descriptor
  declared with `Query.define` needs only `query(descriptor, { entity: binding })`
  — the columns and the order come from its body, through the binding that knows
  which column holds which field. A field the binding has no column for is refused
  when the source is registered, not when a request arrives — a predicate's
  fields as well as an ordering's, so a server that starts is a server whose
  queries can be answered. A body order that does not already end on the id gets
  it appended, exactly as a computed `orderBy` does, since a body says what the
  rows mean and not how a cursor walks them; a literal `orderBy` given at
  registration is left as written. The compiled
  predicates are **conjoined** with the server's own `where` and the binding's
  `visible` rule, so a body is the application's question and never widens what a
  principal may see; an `orderBy` given at registration replaces the body's, since
  a connection pages on exactly one order. `Query.make` is unchanged and still
  requires an `orderBy`.
- **`foldkit-cms`: `Cms.bySlug` is declared by what it means.** Its body is
  `eq(the slug field, input.slug)` ordered by id, so `foldkit-cms-drizzle`
  registers the source without restating the `where` or the order in Drizzle's
  dialect. The audience boundary is unchanged: a visitor still finds only
  published rows, because visibility is conjoined with the body rather than
  expressed by it.

- **`foldkit-remote`: `Query.define`, a query declared by what it means.**
  `Query.define(name, Input, ({ input }) => body)` returns an ordinary
  `QueryDescriptor` — the same name, `Input`, `ref` and connection identity
  `Query.make` gives — carrying its `body` besides, with the result a connection
  over the Entity the body reads so it is not named twice. A server can compile
  that body instead of being told the same thing again in its own dialect; one
  that would rather answer the query its own way still can, and a descriptor
  from `Query.make` has no body at all. The body is built **once**: `input.slug`
  is a placeholder typed from `Input`, never the value, so a condition that
  depends on what was passed is a comparison over the placeholder. A body needs
  a `foldkit-entity` Entity (`Entity.define`), which is what has addressable
  `fields`; this package's own `Entity.make` describes a field as the schema of
  its value and has nothing to point at. `Input` must be fields or a plain
  `Schema.Struct`: a codec exposing no keys is refused at declaration rather
  than handing the body an empty object, which would compare a column to
  nothing while every type agreed.

- **`foldkit-entity`: `Query`, which rows a query is about.** An Entity to
  read, the predicates every row must hold, and the order to read them in,
  composed with `pipe`: `Query.from(Post).pipe(published, newest)`. Each step is
  a new frozen value and performs no work. **Two `where`s conjoin and two
  `orderBy`s append** — neither replaces, so piping a fragment can only narrow a
  query, and `Query.unfiltered` / `Query.unordered` are the only ways back. A
  predicate or ordering term over a different Entity than `Query.from` is
  refused where it is piped, by identity rather than by name. The
  list of predicates *is* the conjunction, which is why there is still no
  `Expr.and`: three conditions are three `where`s. `foldkit-remote` spreads
  these into its own `Query`, so `Query.make` and `Query.from` come from one
  import instead of two namespaces of the same name.

- **`foldkit-entity`: `Expr`, a query's scalar computations as values.** An
  Entity says what a domain has; an `Expr` says something about one row of it.
  `Expr.eq` compares two scalars, coercing a field or a plain value on either
  side; `Expr.input(key, schema)` stands for a value the query is given when it
  runs; `Order.asc`/`Order.desc` is one term of an ordering;
  `dependenciesOf(...)` says which fields and inputs an expression reads and
  which operations it uses. Building one performs no work — an interpreter
  compiles it, which is what will let one query mean the same thing in more than
  one place. Comparing a field to the wrong kind of value is an error where it is
  written. Only `eq` exists: the operator set grows from real queries in this
  repository, not from what a database could express. First step of
  [data-query-DESIGN](docs/design/data-query-DESIGN.md) §32, sized to the CMS's
  `bySlug`.

- **`foldkit-remote`: `Data.confirmed(projection)`.** The same projection read
  over the server-derived store alone, with the pending optimistic layers and
  connection overlays left off. It plans exactly what the projection plans, so
  observing it fetches what observing the projection fetches and only what it
  shows differs. For a reader that must not believe a change until the server
  has agreed — in practice `Agent.when({ projection: Data.confirmed(...) })`.
  There is deliberately no `Data.visible`: a projection already is the visible
  read. async-semantics-DESIGN gated this on Remote having optimistic mutation
  layers; the CMS's preview built them, and nothing had gone back to notice.
- **`foldkit-remote`: `RemoteData.render(data, cases)`.** The view-oriented
  fold: the six states as the three a view draws, keeping useful data on screen.
  `Initial`/`Loading` reach `loading`, `Ready`/`Refreshing` reach `data`, and a
  `Failed` still carrying the value it had reaches `data` too, so a failed read
  does not throw away what the reader was looking at. `notFound` is its own
  branch and not optional. The `data` branch is told which it got through one
  `Freshness` tag (`Fresh` / `Refreshing` / `Stale` with its error), not a pair
  of booleans that could claim both. `match` is unchanged and still the
  exhaustive fold.
- **`foldkit-remote`: a refresh restarts only what it refreshed.** The refresh
  generation was one counter on the Remote store, which every read entry carried
  as a dependency, so refreshing one Projection restarted every read stream and
  cancelled every read in flight. Generations are now per field mark and per
  connection identity, and an entry takes the highest over what it plans. A
  connection needs its own mark: a `networkOnly` entry observing an invalidated
  connection plans the same query either way. `refresh` moves from a Struct to a
  runtime field in the Model schema, beside `loading` and `gaps`. The marks are
  collected with the entities and connections they belong to, so they stay
  bounded by what the Model holds rather than by how often it has refreshed.
- **`foldkit-remote`: `Data.inspect(model).loading`.** The reads in flight,
  beside `mutations.pending` for the writes, so a tool can answer "what is
  Remote doing now" from the Model rather than from the fibers doing the work.
- **The optimistic vocabulary is stated once.** Remote and Sync mean the same
  four words by different mechanisms — confirmed or committed, plus pending, is
  visible; settled is answered either way. `docs/state-model.md` says it with
  both packages' names side by side, and both READMEs point there.

- **`foldkit-form`: a form can say what it is editing.** A check is given the
  key's value and whatever else in the form decodes, which is not enough to ask
  "is this address taken?": a post's input carries a title and an address, not
  the row's id, so the check cannot tell a post's own address from someone
  else's. `FormModel` gains `subject`, a plain record set with
  `Message.About({ subject })` and read with `form.subject(model)`, and a check's
  context gains it. It changes no draft, answers no submit, and survives `fill`
  and `Reset`. `Cms.editor` sends it the row's id as it opens, so a content
  type's slug check knows which row to pass over. This is the seam the CMS design
  doc recorded as missing.
- **`foldkit-form`: a check that needs something can now be added at all.**
  `Form.make` and the `Form.checks` step both read a check's requirement (`R`)
  as `never`, because Effect's `R` is not an inference site a mapped type wins —
  so a check needing `RemoteClient` was refused by the shape meant to accept it,
  and the documented "the check's requirements become the Bundle's" was
  unreachable. `Form.checks` now reads the requirement off the functions it is
  given, and a type test pins it. `Form.make`'s options still cannot infer it;
  the README and the skill say to use the step.
- **`foldkit-cms`: `Cms.addressFree(type)`.** A form check that says while the
  author types what a publish would refuse. It asks the content type's `bySlug`
  query — which an author reads through the same binding as everyone else, so it
  sees unpublished rows too — and excepts the row the editor says the form is
  about. It needs no new server surface. It is advice, deliberately not the rule:
  two authors can both be told an address is free, and the server refuses the
  second on the same key. A check that cannot reach the server says nothing.
- **`foldkit-cms`: `Cms.editor`, the authoring editor's state.** A Bundle around
  the content type's form: autosave after a rest, valid or not; publish by
  submitting the form, saving first; a draft resumed by its saved Model, then its
  values key by key, then what is published, and never failing to open;
  `Conflict` with reload and overwrite; discard. End to end tests drive it
  against the real server over SQLite.
- **Scheduling and archiving.** `CmsSchedule` promises a draft that would publish
  now, `CmsUnschedule` takes it back, and `cms.due(now, { as })` publishes what has
  come due, each in its own transaction, as whoever scheduled it; a failure stays
  scheduled with its reason and waits for the draft to change. The package owns
  no timer. `CmsArchive` also takes what can be hidden off show. The editor gains
  `ScheduleAsked({ at })`, which submits and saves first, and `UnscheduleAsked`,
  `ArchiveAsked`, `UnarchiveAsked`. `cms_drafts` gains `scheduled_by`.
- **Review of the CMS, and what it fixed.**
  - *Security:* a scheduled draft is published as whoever scheduled it, and any
    author could save, restore or discard over it, so an author who may not
    publish could publish through one who may. That is now refused to anyone
    `allow` would not let `schedule`.
  - *Correctness:* `Transaction.statements` takes turns at its one connection; a
    write arriving between another request's `begin` and `rollback` was rolled
    back with it after being reported done. Every operation is now one
    transaction, so a save cannot leave an entry without its draft.
  - The worklist's search treats `%` and `_` as characters, and a draft's size is
    bounded (`maxDraftSize`, one million characters of JSON by default).
  - The editor asks once when publish is pressed twice; lists a draft by what its
    author typed, valid or not; forgets an old failure at the next save; resumes
    a stored Model with nothing in flight (`form.settled`, new in `foldkit-form`);
    follows a previewed post to the row publishing gives it; and gains `flush`,
    for an author who leaves within the rest of their last edit.
- **A server's word about one key, on that key.** `foldkit-form` gains
  `Message.Refused({ key, error })`: the key reads invalid with that reason,
  keeps what was typed, and clears on the next edit. `Checked` could not serve,
  since it only answers a check the form itself started. `Cms.editor` uses it, so
  a publish refused for a taken address marks the address, with nothing to wire.
- **`foldkit-cms`: `Opened`, beside `Editing`.** `Editing` meant both "open and
  idle" and "edited since the last save", so no application could word its status
  truthfully. `Editing` now means there are unsaved edits, `Opened` means the form
  is as it was found, and a draft the form was filled from reads `Saved`.
- **`examples/cms`**: a post from its first keystroke to being taken off show, from
  three chairs, over SQLite, with its transcript pinned, and the same application
  in a browser (`pnpm dev`) where the chair is in the address. `foldkit-cms` gains
  `Cms.editorView` and the editor's `pageId`, which the browser mode needed, and
  annotates an entry's `id` as hidden and its `state` with a title, so a worklist
  shows Title and State rather than a raw uuid and a lowercase header.
- **In-app preview.** `foldkit-remote` gains `Data.overlay(model, id, operations)`
  and `Data.lift(model, id)` (`OverlayShown`, `OverlayLifted`): optimistic
  operations shown with no request behind them. A content type's `preview` says
  how a value would look in the store, and the editor's `PreviewShown` lays what
  is in the form over it, edit by edit, until `PreviewHidden`.
- **Restoring.** `CmsRestore` makes a revision's value the working copy and
  publishes nothing; the editor's `RestoreAsked({ revision })` shows it in the form.
- **`foldkit-cms`: kinds and their renderers.** `Cms.slug(from)` and
  `Cms.dateTime()` for a form's `inputs`; `Cms.Display.State` and
  `Cms.Display.Moment`, which `Cms.Entities` are annotated with;
  `Cms.controlRenderers()` and `Cms.displayRenderers()` to spread beside the
  mixins' own. `foldkit-cms` now depends on `foldkit-crud`.
- **Breaking, `foldkit-cms` and `foldkit-cms-drizzle`:** `CmsSaveDraft`'s `entry`
  is required, and the first save of an id nobody has makes the entry
  (`Cms.newEntryId()`), because a mutation's status carries no output for a
  client to learn a server-made id from. `CmsEntry` gains `revision`, a column of
  `cms_entries`, which a publish compares and sets inside its transaction. Every
  operation patches the entry with its `state`. `newId` is gone from the server's
  config. A save based on a draft that is gone no longer leaves an entry behind.
- **Fix, `foldkit-remote`:** `Data.refresh` of an entity known to be absent asks
  for it again, as the README said it did. It did nothing: a tombstone has no
  field to mark stale, and nothing planned a read of it.
- `foldkit-form`: `form.partial(model)`, what decodes as it stands, by key.

- **`foldkit-cms-drizzle` 0.1.0 (new): drafts, publishing, and the audience boundary.** The
  entries, drafts and revisions tables for SQLite and Postgres; `CmsSaveDraft`
  (compare and set on what the save was based on, so a second author is a
  conflict) and `CmsDiscardDraft`; the `Cms.Entries` worklist; an entry's state
  derived with the server's clock. To a principal that is not an author, the
  three tables are empty on every read path and every operation is refused, and
  `published(column, isAuthor)` makes a content table's `visible` rule, which
  `CmsServer.make` requires of a type that can be unpublished. `CmsPublish` runs
  the application's own `create` or `update` handler with the draft's value,
  inside a transaction (`Transaction.statements` or `Transaction.drizzle`) that
  also shows the row, appends the revision and removes the draft; a publish made
  from an older revision is a conflict. `CmsUnpublish` hides the row and keeps it.
  A visitor is refused before anything is looked up. A `slug` role adds a
  `<name>BySlug` query (`Cms.bySlug`), and a publish to a taken slug fails as
  `CmsSlugTaken: <key>: ...`, whether the check or the unique index caught it.
  `foldkit-cms` gains `Cms.Entries`.
- `foldkit-remote-drizzle`: a derived member may be `{ supplied: true }`: bound,
  and answered by the application's own source.

- `foldkit-remote-drizzle`: **row visibility.** A binding takes
  `visible: principal => SQL | undefined`, applied on every path its table is
  read: by id, as a relation's children (listed, counted, paged), as the target
  of a `one` ref (which reads `null`), and through a query. Before this, a
  by-id read and a query returned any row to any principal; only a collection
  relation could be filtered, through `policies`.

- **`foldkit-cms` 0.1.0 (new): the pure core.** `Cms.roles` marks the members of
  an Entity that play a CMS part (`label`, `slug`, `published`) as metadata, read
  with `Cms.rolesOf`. `Cms.content` declares a type of content: its Entity, its
  form, the application's own publish operations, its words. `Cms.Entities`
  (`Entry`, `Draft`, `Revision`) and `Cms.Operations` are ordinary Entities and
  Remote mutations. `Cms.state` and `Cms.offers` derive an entry's state and its
  transitions from facts and a clock; nothing stores a status. No server yet.

- `foldkit-form`: `Input.following(key, through)` writes a key's draft from
  another key until the author writes it themselves (a slug from a title).
  Emptying it hands it back, and a form filled with a value for it does not
  follow. The Model gains `touched`; a control gains `follows`; a form gains
  `isFollowing`, and a drawn field is told `following`. The first step of
  [the CMS design](./docs/design/cms-DESIGN.md).

- `foldkit-remote`: `Selection.from` compiles an Entity Selection once. `Data.get`
  and `Data.query` are called with one on every render, and compiling it each
  time rebuilt its schemas and missed Remote's read cache, which is keyed by the
  Selection: a list read is about eleven times faster, and repeated reads now
  return the same value, not an equal one.

- **`foldkit-remote` and `foldkit-remote-server`: a relation may be read whole and
  by the page at once.** A page of a whole list (`Entity.page`, or
  `Selection.connection` over an array of refs) is read under an alias,
  `comments@first=10`, so it is a field of its own to the store, the planner and
  the wire; `RemoteServer` reads the alias apart and answers under it, and the
  live hub re-reads a subscriber's page when its list changes. A write to the
  list marks its pages stale. Requirements for such a Selection now name the
  alias in `fields`, `windows` and `relations`. A request may page one
  relation at most four ways, since each is a source read the client names, and
  `Entity.make` refuses a field whose name contains `@`. Both packages must be
  upgraded together: an older server does not know an alias. `RELATION_ALIAS`,
  `relationAlias` and `aliasedField` are exported.

- **Words are text. Breaking.** `FormMessages` entries may be text with blanks
  (`'{label} is required'`). `foldkit-mixins-form` takes `words: { submit, search, add, remove }`
  in place of `submitLabel`, `searchLabel`, `addLabel` and `removeLabel`, and
  `foldkit-mixins-crud`'s `failed` is text (`'{message}'`); both were functions in
  places, which Foldkit refuses inside a placed view's inputs. The three shapes
  share no key, so one object serves all. `fillWords` is exported by `foldkit-form`.
  New dependency of `foldkit-mixins-crud`: `foldkit-form`.

- `foldkit-form`: forms pipe. `Form.inputs`, `Form.checks`, `Form.messages`,
  `Form.nested` and `Form.debounce` are steps that give a new form with the
  option added to. A form now carries `name`, `options`, and `pipe`.

- `foldkit-entity`: `Entity.fields(entity, ...keys)` gives field schemas to spread
  into an input's struct, and an `Entity.input` mapping may name a member by its
  key (`{ authorId: 'author' }`).

- **Typed ids reach the read.** An Entity `Selection` carries its Entity's id type
  (a fourth, defaulted type parameter), and `foldkit-remote`'s `Data.get` /
  `Data.live` take it. **Breaking** for an Entity with a branded `id` read with a
  plain string. `Crud.remover` takes `id: 'id'` in place of `input` when the
  mutation's input is just the id.

- `foldkit-crud`: `Sort.make(columns)` is a list's sort state written once: its
  schema, `toggle`, and the `sort` input a drawn table takes.
  `foldkit-remote-drizzle`: `sortTerms(sort, columns)` reads that state into order
  terms through the columns the server offers.

- `foldkit-crud`: `Crud.actives({ ...pieces })` gathers the `active` of every placed
  editor, list, detail, and `Crud.options` result, for `Data.wiring`.

- **`foldkit-form`: a nested key takes a form. Breaking.** `nested: { author: AuthorForm }`
  replaces the recursing options bag; the form that edits an author alone is the
  one a post nests. `form.nested.author` is that form, typed, and
  `form.row('author', id)` gives its Message constructors wrapped for the row.
  Exports `FormFor`, `NestedForms`, `RowHandle`.

- **One primitive for controls, and one for displays. Breaking.** A form's
  `Control` is `{ kind, draft, shown, searches, data, parse?, unparsed? }` and a
  Crud `Display` is `{ kind, shown, data, text }`; both were closed unions on
  `_tag`. `Input.kind` and `Display.kind` make a kind, and the shipped ones
  (`Input.Text`, `Input.Number`, `Input.RelationOne`, ..., `Display.Flag`, ...)
  are made with them. Narrow with `Kind.is(control)` and read `control.data`
  where code read `control._tag` and its fields. `foldkit-mixins-form` draws by a
  table of `renderers` whose defaults are entries; `foldkit-mixins-crud` takes
  `renderers` by kind beside `cells` by column. `FormMessages.notANumber` is
  `unparsed`. `Input.search()` is a `ControlChange`, not a control.

- **`foldkit-mixins-crud` 0.1.0 (new).** Draws a `Crud.list` as an accessible
  table and a `Crud.detail` as a description list through Mixins slots. Opening
  a row, sorting, and loading more are Messages the application passes in.
- **`Display`** in `foldkit-crud`: how a selected member shows, without a
  renderer. `list.columns` and `detail.fields` carry a `display`, set with
  `Display.of`, resolved from how a relation was selected or from the schema
  otherwise; `Display.show` is the text any view can fall back on. A list also
  exposes a type-only `Row`, and a detail a type-only `Value`. New dependency:
  `foldkit-metadata`.

- **Typed ids.** `foldkit-entity`: an Entity's `id` field keeps its type.
  `IdOf<E>`, `EntityRef<Name, Id>`, a ref schema that is the id's own, and
  `Relation.input` taking the target's id type. An `id` of `Schema.String` types
  as before; a branded one now rejects another Entity's id. **Breaking** only for
  code that mapped a plain `Schema.String` key to a relation whose target has a
  branded id: give the key the id's schema.
- `foldkit-remote-drizzle`: `bind` stores an optional `one` on the target's table
  (`{ foreignKey }`), the inverse side of a one-to-one, and refuses a foreign key
  that is not unique. `ManyRelation` gains `single`.
- `foldkit-remote-drizzle`: a `query`'s `orderBy` may be a function of the input
  and the principal, as `where` is, so a list sorts by what the user chose. A
  computed order without the id is tie-broken by it.
- **Pickers that search.** `foldkit-form`: `Input.search()` marks a relation
  picker as searching; the form holds the text (`Searched`, `form.search`). The
  form's Model gains `searches`. `foldkit-mixins-form` draws the search box
  (`search` slot, `searchLabel`). `foldkit-crud`: `Crud.options(form, lists, { chosen })`
  keeps what a picker holds among its choices and returns `active` to require
  those rows; a placed list gains `row(id)`, `choiceOf(model, id)` and `owner`.
- `examples/entity` shows a page of a relation (`Entity.page`) and a nested write
  (`Relation.nested`, a form that nests a form, a server that writes both).
- `foldkit-crud`: an editor's `open` and new `target(model)` use the Entity's id
  type; a remover takes the id type its `input` names; a list's rows are typed
  from its Selection with or without a `choice`.

## 0.7.2

The `v0.7.1` tag was pushed from an incomplete commit and published nothing.

- **`foldkit-admin` is now `foldkit-crud`**, and its export `Admin` is `Crud`
  (`Crud.editor`, `Crud.list`, `Crud.detail`, `Crud.remover`, `Crud.options`,
  `Crud.editorView`). Nothing else changed. The old name promised a drawn back
  office; the package is headless and serves any edit screen. `foldkit-admin`
  0.1.0 stays on npm, deprecated, pointing here.

## 0.7.0

Five new packages and the changes that let existing ones read them. Design and
the order things were built in: [entity-DESIGN.md](./docs/design/entity-DESIGN.md).

### New packages

- **`foldkit-metadata` 0.1.0.** The opaque, key-owned metadata from
  `foldkit-surface`, as its own package, with `Metadata.empty`, `Metadata.combine`
  and `Metadata.is` made public. Surface re-exports it, so no import changes.
- **`foldkit-entity` 0.1.0.** A domain declared once: `Entity.define`,
  `Entity.derived`, `Entity.relate` (all relations in one step, so Entities that
  point at each other type-check), `Entity.select` with an assembled schema, `Entity.page` for a `many` relation
  read a page at a time,
  `Entity.annotate` / `annotateMembers`, and, experimental, `Entity.input` with
  `selectFor` and `valuesFor`, and `Relation.nested` for an input key that holds
  the relation's target itself.
- **`foldkit-form` 0.1.0.** A headless form as a Bundle over core
  `fieldValidation`, built from an `Entity.input`, with its words supplied or
  translated through `messages`, and rules only something outside can answer as
  `checks`: debounced, stale answers dropped, and a submit that waits for them.
  A key mapped with `Relation.nested` holds rows of a nested form, which
  `foldkit-mixins-form` draws with add and remove buttons.
- **`foldkit-mixins-form` 0.1.0.** Draws a `foldkit-form` form as accessible
  HTML with every element a Mixins Slot.
- **`foldkit-crud` 0.1.0.** `Crud.editor`: a form, the Remote mutation its
  value feeds, and their Entity, joined into an edit or create screen.
  `Crud.list`: a Remote query and an Entity Selection, with columns and paging.
  `Crud.options`: each relation picker of a form fed by the list over its
  target. `Crud.editorView`: a form's view as the view of the editor around it.
  `Crud.remover`: a delete with a yes in between. `Crud.detail`: one Entity
  through a Selection.

### `foldkit-remote`

- `Remote.make` / `Remote.define` take `foldkit-entity` Entities beside
  descriptors, and `Data.get`, `Data.live`, `Remote.select` and a query's `select`
  take Entity Selections. `Entity.from` and `Selection.from` are the compile
  steps; an `Entity.page` compiles to a relation connection. New dependency: `foldkit-entity`.
- **Behaviour change.** A read the server answers without an id it was asked
  for by name now tombstones that entity, so its Projection reads `NotFound`
  instead of `Initial` / `Loading` for good. It is refetched only by
  `Data.refresh`, and a later write clears it. The unexpanded target of a returned
  ref is untouched; the planner asks for it by id next. A hand-written
  `RemoteClient` that returned partial batches on purpose must now return every
  entity it was asked for by id.
- A mutation can delete. `MutationOutcome.deleted` (and `deleted` on the wire's
  `MutationResult` and on `MutationSucceeded`) names entities that are gone; the
  client tombstones them, which removes them from every connection and relation.
  `reconcileMutation` and `settleSuccess` take the deletions as a last argument.
- `Data.mutation(model, requestId)` reads a mutation's outcome from the Model:
  `Pending`, `Applied`, `Failed` with its error, or `Unknown`.
- **Breaking (kernel).** `MutationState` gains `errors`, and `failMutation` takes
  the error as a third argument. `Data.get`'s parameter type is now
  `EntitySelection`.

### `foldkit-remote-drizzle`

- `bind(entities, storage)` binds an `Entity.relate` result to tables: fields by
  column name, a relation as `{ field }`, `{ foreignKey }` or `{ through, … }`, a
  derived member as a count. Bindings may point at each other, and a column
  that plainly cannot hold its field is refused at definition. New dependency:
  `foldkit-entity`.

### `foldkit-bundle`

- `Bundle.withView(view)` gives a bundle a view with view inputs of that view's
  own, which `mapView` cannot.

### `foldkit-surface`

- `Metadata` now comes from `foldkit-metadata` (re-exported). New dependency.

### `foldkit-primitives`

- 0.2.0. Platform detection reads client hints and touch; `distanceToEnd` sits
  beside `isAtEnd` on the virtual list; a denied device request keeps the last
  device list, as geolocation keeps its fix.

### Versions

`foldkit-surface` 0.3.0, `foldkit-remote` 0.4.0, `foldkit-remote-server` 0.4.0,
`foldkit-remote-drizzle` 0.4.0, `foldkit-bundle` 0.2.0. Packages that pin one of
those exactly are republished against it with no change of their own:
`foldkit-agent` 0.3.1, `foldkit-mirror` 0.2.1, `foldkit-sync` 0.5.1,
`foldkit-bundle-surface` 0.1.1.

## 0.5.0

Every package below changes its public types or adds API, so each takes a minor
while pre-1.0: `foldkit-surface` 0.2.0, `foldkit-remote` 0.3.0,
`foldkit-remote-server` 0.3.0, `foldkit-remote-drizzle` 0.3.0,
`foldkit-mixins` 0.3.0, `foldkit-mixins-surface` 0.3.0, `foldkit-agent` 0.3.0,
`foldkit-agent-a2a` 0.3.0, `foldkit-agent-mcp` 0.3.0, `foldkit-agent-native`
0.3.0, `foldkit-sync` 0.5.0, and `foldkit-mirror` 0.2.0 (its `Contract` output
changed). `foldkit-agent-webmcp` 0.3.0 and `foldkit-mixins-ui` 0.3.0 republish
only for their peer ranges. `foldkit-durable` does not republish.

Several of these changes exist so that user code, tests included, needs no type
casts: a cast in a test marked a gap in the API.

### `foldkit-surface` (breaking)

- **Projection metadata is open to any package.** Surface declared Remote's
  requirement types, so no other package could attach facts to a Projection
  without editing Surface. `Metadata.key<A>(name, { merge, summarize })` gives a
  package its own typed slot; `Projection.metadata` carries the entries and every
  combinator merges them per key. Entries are found by the key object, so two
  copies of one package do not share them.
- **`Metadata` is opaque.** Only a key's `of` and composition make one; its
  entries are private and frozen, so a hand-built value has none and nothing can
  mutate them. `MetadataTypeId` marks a value.
- **Removed:** `Projection.requirements`, `Projection.connections`, and the
  matching `Projection.fromReader` options. Remote's requirement types moved to
  `foldkit-remote` (below).
- **`Contract.requirements` and `SurfaceInspection.requirements` are now
  `metadata: MetadataSummary[]`** (`{ name, entries }`), so `Module` and DevTools
  show every package's entries. A hand-written `Contract` literal must spell
  `metadata: []`. `Module.toMarkdown` renders the column as
  `name: entries; name: entries`, with `|` escaped.
- **Schemas are decodable codecs.** `Projection.Model` and `Surface.Params` are
  `Schema.Codec<Value, unknown>`, so `Schema.decodeUnknownSync(projection.Model)`
  needs no cast, and `Surface.Params` is present, not `| undefined`, when the
  Surface declares params (`ParamsSchema`). `Projection.fromReader` and
  `Surface.make({ Params })` refuse a schema that needs decoding services.

### `foldkit-remote` (breaking)

- **Remote owns its requirements.** `Requirement`, `RelationRequirement`,
  `ConnectionRequirement` and the `Requirement.merge*` helpers move here from
  `foldkit-surface`, stored under `RemoteRequirements` and `RemoteConnections`.
  Read them with `requirementsOf(projection)` / `connectionsOf(projection)`.
  `Window` is gone; it was `QueryWindow`.
- **`Data.refresh(model, projection | surface)`** marks what a consumer already
  declares as due again, from `update`, instead of restating each request. It
  returns the Model, with selected fields reading `Refreshing` and loaded
  connections invalidated; the `Data.subscriptions` read entries refetch them,
  so the data is requested once. Unobserved data is revalidated with
  `Remote.prefetch` and `RemotePolicy.networkOnly`. A refreshed connection's
  page replaces its pages, so removed and reordered items follow the server and
  later pages are paged again; a read already in flight is restarted rather than
  applied after the refresh. Refreshing what is already refreshing returns the
  same Model.
- `Data.subscriptions` returns `SubscriptionEntries`, with exact `<key>.read`,
  `<key>.live` and `retain` keys, so a lookup needs no `!`.
- `RemotePersistence.dehydrate` returns `string` when no `maxBytes` is given.
- `Remote.Model` is a decodable `Schema.Codec<RemoteModel, unknown>`.

### `foldkit-remote-server`

- No longer depends on `foldkit-surface`; `Requirement` comes from
  `foldkit-remote`.

### `foldkit-mixins-surface` (breaking)

- `SurfaceView.describe` returns `metadata: MetadataSummary[]` in place of
  `requirements`.
- **`SurfaceView.render(view, surface, params, root)`** renders a view for a
  Surface's projection with an inert builder, for demos, tests and static output.

### `foldkit-agent` (breaking)

- **`Agent.when` completes on state.** A Message contract couples a capability
  to one implementation path; a state contract completes when a condition holds,
  whatever made it so. It reads a `projection` of the application's Model (which
  must be that Model, and needs `host.subscribe`) or a `source: { get,
  subscribe }` outside it. Completed means the condition holds, not that this
  call made it true; a creation still completes on its Message with `correlate`.
  A throwing predicate fails the invocation as a defect, and a value a
  notification left unchanged is not evaluated again; a `source` is re-evaluated
  on every notification, since it may mutate its value in place.
- `request` is inferred inline in `Agent.expose`; inside `Agent.variant` it is
  annotated and checked against `input`. Elsewhere it is `unknown`.
- **`CompletionOutcome` is a union**, and so is `DispatchResult.completion`: a
  Message contract carries its `message`; a state contract has none and cannot
  fail. Code that read `completion.message._tag` unconditionally needs `?.`.
- **`Manifest` completion gains a `kind`**: `{ kind: 'message', success,
  failure? }` or `{ kind: 'state', observes }`.
- `AgentHost.dispatch` may return a failing Effect, such as `Sync.mount`'s
  `Exit`; the failure is the invocation's defect, as a thrown error already was.
- **The audit log is typed by principal.** `auditLog<Principal>`, `AuditSink`,
  `AuditLogOptions` and `AuditRecord` take the principal type, so a projection
  `(caller: User) => caller.id` needs no cast, and binding a log built for
  another principal is refused. An unannotated projection now sees `unknown`,
  and a hand-written sink declares its principal type. `AuditRecord.principal`
  is `Principal | undefined`: a call refused before its principal is resolved
  is recorded with `undefined`, and the `principal` projection is not called.
- `Agent.make` returns `context` as present when one was given.
  `Agent.contextSchema` returns a `JsonSchemaDocument` rather than an untyped
  record.

### `foldkit-agent-mcp` (breaking)

- `AgentMcp.httpApp({ server })` accepts a server alone; passing handler options
  beside it, which were ignored, is now a type error.
- `AgentMcp.stdio` types `input` and `output` as the `on`/`off`/`write` it uses
  (`LineInput`, `LineOutput`), so a fake stream needs no cast. Node's
  `process.stdin` and `process.stdout` still fit.

### `foldkit-agent-a2a` (breaking)

- `Success.result` is a `Task`, which every handler already returns. Code that
  builds a `Success` by hand must pass one.

### `foldkit-agent-native` (breaking)

- `AgentNative.actions` returns an `ActionRegistry` with exact keys for a known
  contract, so a known capability needs no `!`; indexing it with an arbitrary
  string is a type error. An open contract keeps string keys.
- An action's `schema` also types its `~standard.jsonSchema`.

### `foldkit-agent-webmcp`

- Republished with a peer range on `foldkit-agent` 0.3.0. Its own API is
  unchanged, but the published 0.2.1 peers `foldkit-agent@^0.2.1`, which in 0.x
  excludes 0.3.0.

### `foldkit-sync` (breaking)

- **The committed state is readable.** `Replica.committed` and
  `ReplicaSnapshot.committed` are the server-confirmed state the optimistic
  `shared` is built on: a pending edit reaches them only once committed, and a
  rejected one never does.
- **`Mounted.committed`** is a `CommittedView` (`{ get, subscribe }`), the source
  an agent waits on to finish on confirmation rather than on its own optimistic
  edit: `Agent.when({ source: mounted.committed, … })`. It is notified after every
  exchange, including a checkpoint that keeps the cursor. `Mounted` gains a third
  type parameter, `Shared`, defaulting to `unknown`.
- An exchange that acknowledges an edit without returning it now re-installs the
  shared slice, instead of leaving the dropped edit in the Model.
- A Model, Message or committed listener that throws no longer stops the
  listeners after it or the mount's refresh; its error is re-thrown from a
  microtask.
- `dispose` no longer hangs when a persist dies with a defect.
- **A refresh no longer hides a durable edit still waiting for the replica.**
  An exchange that settled while an edit's submit waited for the replica lock
  installed a shared slice without it, so the edit vanished until the next
  exchange. The mount now submits one edit at a time, in dispatch order, and a
  refresh replays the edits the replica does not hold yet on top of one replica
  snapshot. Nothing is deferred, so remote changes still show while edits keep
  overlapping, and no edit is applied twice.
- `Replica.snapshot` reads the status, `shared`, `committed` and the new
  `ReplicaSnapshot.nextLocalSequence` from one replica state. `DefinedSync.replay`
  is the reducer the replica replays durable Messages with.
- `Sync.forApplication(App).make({ authorize })` types
  `journalContract().authorize` as present.

### `foldkit-mirror`

- Its `Contract` carries `metadata: []` in place of `requirements: []`.

### `foldkit-mixins`

- **`Attributes.find`, `filter` and `tagOf`** read a resolved `SlotAttributes`
  bundle by tag and return that variant typed (`find(attrs, 'Class')?.value`),
  so reading attributes needs no cast. An unknown tag is a type error.
- **`SlotView.inertBuilder<Message>()`** is Foldkit's `inertHtml` typed for a
  Message universe, for rendering outside a runtime. It holds the one cast the
  invariant builder needs.

### `foldkit-mixins-ui`

- Republished with a peer range on `foldkit-mixins` 0.3.0. Its own API is
  unchanged, but the published 0.2.0 peers `foldkit-mixins@^0.2.0`, which in 0.x
  excludes 0.3.0.

### `foldkit-remote-drizzle`

- `keysetWhere` returns `SQL` for a non-empty tuple of order terms.

## 0.4.1

`foldkit-durable` and `foldkit-sync` take a minor for new, additive API. No other
package republishes.

### `foldkit-durable` 0.3.0 and `foldkit-sync` 0.4.0

- **Namespaces, additively.** Both packages exported bare functions while every
  other package here is namespace-first, and Effect is too. `Journal.make`,
  `Journal.layer`, `Journal.metrics` and `Journal.define`, and `Sync` grouping
  `forApplication`, `define`, `mount`, `metrics`, `indexedDb` plus `transport.*`,
  `presence.*` and `lww.*`. They delegate by reference, so inference at call
  sites is unchanged, and every previous export keeps its name, signature and
  behaviour. The branded ids lead with `DocumentId.make('todos')`, which Effect's
  schemas already provide; the lowercase decoders still work.
- **`Journal.define<Operation, Snapshot, Principal>(key)`** closes a soundness
  hole. `JournalService` takes its type arguments at the use site with nothing
  tying them to the layer that satisfied the tag, so reading a key back as a
  journal of another shape compiles. A definition fixes the types once and
  returns the tag and the layer constructor that agree on them.
- **Effect schemas as codecs.** `JournalOptions.operation` and `.snapshot` accept
  a `Schema.Codec` as well as the `encode`/`decode` pair, with `Codec.fromSchema`
  as the explicit conversion, resolved once at construction because the sync
  decoders recompile per call.
- **A refusal can say why.** `authorize` accepts `{ allowed: false, reason }` and
  the reason reaches `OperationRejectedError` and its message, which matters
  because sync forwards rejections to the replica and the person whose edit
  reverted saw no reason. `validate` now accepts an Effect as `authorize`
  already did, and `runEffect`'s `retryFailed` accepts a predicate over the
  record, since the recovery policy asks the application to decide per intent.

## 0.4.0

`foldkit-remote` and the `foldkit-mixins` family take a minor; everything else
republishes so npm serves the corrected pages. The one breaking change is
`foldkit-remote`'s new `ReadStarted` message and `loading` field, below.

### `foldkit-remote` 0.2.0

- **`RemoteData.Loading` means something now.** It was a required `match` case
  nothing constructed — the missing half of a symmetry, since `Refreshing` is
  produced by `RefreshStarted` marking present fields stale. The read entry now
  emits `ReadStarted` before it reads, the reducer records a mark per requested
  field, and `ReadReceived` or `ReadFailed` clears it, so a value the store
  lacks reads `Loading` while a read is fetching it and `Initial` when none is.
  That distinction is worth rendering differently: nothing fetches a projection
  no active Surface observes, so it reads `Initial` forever and a spinner there
  hides the wiring mistake. **Breaking:** `RemoteMessage` gains `ReadStarted`
  and `RemoteModel` gains `loading`, so code that matches every Remote message
  or builds a `RemoteModel` literal needs the new case and field. The documented
  path, `Remote.reduces` then `Data.reduce`, is unaffected.

### `foldkit-mixins` 0.2.0

- **`SlotView.forMessages<Message>().define(...)`.** `define`'s Message universe
  was anchored only by the render callback's builder, so without an explicit
  `h: HtmlBuilder<Message>` it resolved to `unknown` and failed later as a
  variance mismatch that never named the annotation. The curried form fixes
  Message up front, following `Agent.forModel<Model>()`; `define` is unchanged.
  `foldkit-mixins-surface` and `foldkit-mixins-ui` follow to 0.2.0 for the peer
  range.

### Documentation

Two fixes reach the published artifacts themselves.

- **`foldkit-remote-drizzle` now ships its third-party notice.** The package
  adapts [fate](https://github.com/nkzw-tech/fate)'s Drizzle integration under
  MIT and records the attribution in `THIRD_PARTY_NOTICES.md`, which `files`
  omitted, so the published tarball carried the pointer without the notice.
- **`foldkit-remote`'s declaration file named an API that does not exist.** Four
  doc comments referenced `Remote.update`, which the package does not export;
  the reducer is `updateRemote`, and on a bound domain it is `Data.reduce`.
  The wrong name reached editors through the shipped `.d.mts`.
- **Every README was checked against its source.** Snippets that could not
  compile are fixed across `foldkit-durable`, `foldkit-sync`, `foldkit-mirror`,
  `foldkit-mixins`, `foldkit-mixins-ui`, `foldkit-remote`, `foldkit-remote-server`,
  `foldkit-remote-drizzle` and `foldkit-surface`; `foldkit-agent-webmcp` is
  rewritten around the feature detection a reader needs before `register`
  throws. Each package now opens in plain language, says when to reach for it
  and when not to, and links its guide, siblings, and example.
- **Manifests.** The eight packages that were private until 0.3.0 gained the
  `keywords` npm search matches on and the `publishConfig` the other seven
  carry. No package behaviour changed in this release.

## 0.3.0

Every package ships. The eight packages that were `private` — `foldkit-surface`,
`foldkit-remote`, `foldkit-remote-server`, `foldkit-remote-drizzle`,
`foldkit-mixins`, `foldkit-mixins-surface`, `foldkit-mixins-ui`, and the new
`foldkit-mirror` — publish for the first time at 0.1.0, as does
`foldkit-agent-native`. `foldkit-sync` is 0.3.0, and `foldkit-durable`,
`foldkit-agent`, `foldkit-agent-webmcp`, `foldkit-agent-mcp`,
`foldkit-agent-a2a`, and `foldkit-agent-native` are 0.2.0.

Correctness fixes from a review of the implementation, the `foldkit-surface`
reference-selection work and the `foldkit-remote` submodel. Breaking for
`foldkit-sync` (the storage and presence APIs), `foldkit-durable` (`append`'s
result), `foldkit-agent` (`define` is `make`; `Agent.context` and `Agent.pick`
give way to a `foldkit-surface` projection), and `foldkit-remote` (`RemoteModel`
and the mutation/observe signatures). `foldkit-agent`, `foldkit-remote`, and
`foldkit-sync` now depend on `foldkit-surface`, which resolves from npm from
this release on.

### `foldkit-mirror` 0.1.0 (new)

- **A Model slice kept in the URL or a key-value store.** `Mirror.url(App, {
  fields: Projection.pick(…), keys })` and `Mirror.kv(App, { key, scope, fields })`
  keep a writable projection in step with the URL query string (or hash) and
  Effect's `KeyValueStore`: `reduce(model, url | MirrorRestored)` reads a
  store back into the Model, `encode`/`href` write it out with defaults (from
  `App.initial`) elided, one Subscription entry per mirror writes when the
  encoded slice changes (push or replace per key, throttled), `restore` is the
  Command that reads a store, and `contract` (kind `mirror`, observes the
  slice, owns nothing) joins a `Module`. A slice is field refs straight from
  `App.fields` or a writable projection over them; a URL mirror's `reduce`
  takes a URL and a store mirror's the Message (`fromKeys`/`restoreKeys` are
  the kernel's); an application built without `initial` passes it in the
  config. Codecs derive from the field schemas; a key may name its own.
  `MirrorStore.memory` records writes for tests. See `docs/design/MIRROR.md`.

### `foldkit-surface` 0.1.0

- **`App.surface` and `Surface.at` (#69, Phase C).** `App.surface(name, {
  params, model, messages })` is `Surface.make` with the mechanical wrappers
  lifted: `params` are the fields of a `Schema.Struct` (or a schema, kept as
  is), and `model` may return an object of Projections and field refs, which
  becomes `Projection.struct`. `Surface.at(surface, params)` is the Surface as
  the Model activates it: `params` is the value or a function of the Model
  (`undefined` while inactive), and `projectionOf(model)` the projection for
  those params. `Requirement.live` marks a requirement the projection also
  subscribes to; `Requirement.merge` keeps the mark.
- **Errors and hovers (#69, Phase E).** `Invalid<Message>` is a branded
  compile-time failure that names its cause; `ActiveSurface` carries the
  Surface's `owner`, so a domain can reject another application's Surface. A
  Surface's Model now hovers as the projected value (`{ project:
  RemoteData<…> }`) instead of the internal `StructValue<…>` alias.
- **`Projection.connections` (#69, Phase D; breaking).** A Projection carries
  the query connections it reads as `ConnectionRequirement { identity, window,
  select }`, next to its requirements; `struct`, `array`, `option`, and
  `fromReader` propagate them and `Requirement.mergeConnections` unions what
  one connection and window select. A hand-written Projection literal now
  needs `connections: []`.
- **`Module`, the pure composition root.** `Module.make(App, [contracts])`
  collects an application's contracts as data; `Module.validate` reports a
  contract from another application, a duplicate `kind:name`, two owners of
  overlapping Model paths, a Message durable in two replication contracts, and
  a path or Message the application does not declare; `Module.manifest`,
  `Module.toMarkdown`, and `Module.toMermaid` show who owns each Model path (local, sync, or remote) and
  every contract's observes/messages/requirements. A `Contract` is the shared
  description: `Surface.contract` derives one from a Surface, and Sync, Remote,
  and Agent attach one to the values they produce. `Surface.registry` is
  removed; `Module` is the explicit collection (#60, sections 1 and 8).
- **The primitives are first-class.** `Projection.pick`/`Projection.compose`
  (were `Surface.pick`/`Surface.compose`) build writable projections, and
  `MessageSet.make(App, [constructors])`/`MessageSet.union` (were
  `Surface.messages`/`Surface.unionMessages`) build typed Message subsets, now
  typed `MessageSet`. Agent and Sync consume `Projection` and `MessageSet`
  values, not Surface helpers; a `Surface` is what composes one of each with a
  name and a renderer (#60, section 4).
- **`make` constructs, `application` scopes.** One vocabulary across the
  application-contract packages (#60): `forApplication(App)` specializes a
  package to an application and `make(config)` constructs a contract, as
  `Ref.make`/`Queue.make` do in Effect and `Remote.make`/`Entity.make` already
  did here. `Surface.define(App, name, config)` is now `Surface.make`, and the
  scope-only `Surface.make({ Model, Message })` is folded into
  `Surface.application`, which already accepted a config without
  `initial`/`update`. The mixins packages keep their own `Slots.define`/
  `SurfaceView.define` vocabulary for now.
- **Reference-based selection.** `Surface.application` generates a reference tree
  (`App.fields`), and `Projection.pick`/`Projection.compose` build writable projections
  from it, so a shared projection is derived from the Model Schema instead of
  declared twice. `Sync.forApplication` and `Agent.forApplication` consume it.
- **Typed Message subsets.** `MessageSet.make(app, [constructors])` and
  `MessageSet.union(...)` produce a `MessageSet` with a pure codec, a tag
  set, and an owner token, so two structurally identical applications cannot mix
  selections and a subset cannot leak across applications.
- **Encoded types are preserved.** `ModelRef`/`FieldRef` and `MessageSet` carry
  an `Encoded` parameter, so a transforming field (`Schema.NumberFromString`)
  keeps its encoded type through `Projection.pick` and the journal snapshot codec
  instead of widening to `unknown`.
- **Transition and resources.** `Surface.application` accepts optional
  `initial`/`update` and resource-carrying Commands; the runnable form is what
  `Agent.forApplication` and `Sync.forApplication` require.

### `foldkit-remote` 0.1.0

- **The bound domain (#69, Phase B; breaking).** `Remote.make({ model, entities,
  queries, mutations })` now binds the domain to its place in the application
  Model in one step and returns a `RemoteDomain`: the descriptor, the binding,
  and the application-facing operations `get`, `plan`, `storeOf`, `prefetch`,
  `mutate`, `reduce`, and `inspect`, each compiled onto the `Remote.*` function
  of the same name (which stay exported). The descriptor alone is
  `Remote.define`, the binding alone `Remote.at`. `Remote.Model` and
  `Remote.initial` are the submodel's schema and initial value, the same for
  every domain, so the application Model embeds them before the domain is
  bound. `Remote.messages` is Remote's Message cases for `defineMessageUnion`
  and `Remote.reduces` narrows an application's union to them, so there is no
  wrapper Message: `update` hands them to `Data.reduce`. `Data.mutate(model,
  mutation, input, options?)` starts a registered mutation from `update`: the
  request id comes from a monotonic sequence in `RemoteModel.mutations`
  (`{ requestId }` overrides it; `tempId` derives from it), the optimistic
  operations may be a function of those ids, and the returned Command yields
  the `MutationSucceeded` or `MutationFailed` that settles it. An entity is
  the receiver of its selections and patches: `Project.select({ … })` and
  `Project.patch(id, values)` (`Selection.make` and `Entity.patch` stay).
  `Mutation.make` and `Query.make` take the fields of a `Schema.Struct` where a
  codec is expected, and `Query.make`'s `Result` takes the entity a connection
  is over. `MutationState.sequence` is new.
- **Live and subscriptions on the domain (#69, Phase C).** `Data.live(selection,
  id)` is `Data.get` with the projection's requirements marked `live`; the
  mark survives `Projection.struct` and never reaches the wire.
  `Data.subscriptions({ key: Surface.at(surface, params) | surface }, options)`
  returns the record `Subscription.make` takes: a `<key>.read` entry per
  Surface (`Remote.observe` over the params the Model gives), a `<key>.live`
  entry subscribing what the Surface reads live (`Remote.live`), and one
  `retain` entry with every active Surface as a root (`Remote.retain`).
  `options` are the observe, live, and retain options together. The kernel
  entries now derive their requirements from a function of the Model.
- **Page sizes are non-negative integers (#69, review).** `Data.query` rejects
  any other `first`/`last` at the call, naming the query, and the wire's
  `WindowSchema`/`QueryRequest` refuse one at decode (`PageSize`) instead of
  letting the server substitute its default.
- **Less work per Model change (#69, review).** A selection's `RemoteData`
  and `Page` schemas are built once and shared; `Data.subscriptions` computes
  each Surface's projection once per Model object across its read, live, and
  retain entries; `Remote.select` and `Data.query` memoize a read's result per
  visible store snapshot (and connection), so equal reads of one Model state
  return one value.
- **Errors that name the descriptor (#69, Phase E).** `Data.get`, `Data.live`,
  `Data.query`, `Data.mutate`, and `Remote.select` reject a descriptor the
  domain never declared with a one-line branded error at the argument
  (`Entity "Team" is not registered with this Remote domain`; `Registered` and
  `SelectsEntity` are the types), and at runtime with an error naming the
  descriptor and the domain. `Data.query` rejects a selection of another entity
  than the query lists the same way, and `Data.subscriptions` rejects a Surface
  of another application by owner token. The README leads with the application
  API and documents the kernel under "Advanced".
- **Queries as Projections (#69, Phase D; breaking).** `Data.query(query,
  input, { select, first | last, after | before })` is a Projection reading a
  connection as a `RemoteData<Page<Value>>`: `Initial` until the page and every
  item's selected fields are present, `Ready` once they are, `Refreshing` while
  the connection or any item refetches, `Failed` on data that does not decode;
  `select` is a selection of the query's entity and the window is one side or
  the other. The projection carries the connection (`Projection.connections`),
  so the read entry plans it like a field: an unknown or stale connection is a
  query to run, a known one contributes its visible items' fields. The entry
  runs the queries and the entity read concurrently; a merged page (one
  `ConnectionMerged` with `refreshes: true`, which also clears `stale`) makes
  its items the next plan, and a failed query yields the new `QueryFailed`
  Message, which ends the refresh and keeps the pages. `Data.next`/`previous(model,
  projection)` are the neighbouring page's `QueryRef` from the loaded
  boundaries (same page size), or `undefined`; `Data.fetch(ref)` is the
  Command that merges it. `Remote.planQueries` is the pure query plan, query
  reads coalesce like entity reads (`coalesceQueries`, applied by
  `Remote.clientLayer`), and the retain entry roots a projection's connections
  by itself: a `RetentionRoots` connection is now `{ identity, select? }`, and
  `gc` keeps what a page's `select` reaches through each item. `Data.prefetch` now runs the pending queries, then one read, and
  returns the Model (it returned the store). `Remote.query`/`queryMessage` and
  `Remote.visibleItems` stay for hand-driven connections.
- **Review hardening.** One plan: `Remote.plan(bound, model, projection,
  options?)` replaces `planProjection`/`observeProjection`/`planSurface`
  (a Surface's is `surface.projection(params)`); `Remote.retain(projections,
  toMessage?, options)` drops the bound remote, and `observe`/`live`/`retain`
  default `toMessage` to the identity; `Remote.storeOf(bound, model)` is the
  visible store (base under pending layers), memoized per model state so every
  read and plan of one render shares it; `Remote.live` takes `{ now }`;
  `Remote.visibleItems` and `RetainOptions.connections` accept a `QueryRef`.
  A merged cursor page keeps the stored page's near boundary instead of
  inventing one, and pages merged within one read result see each other.
  `ConnectionChange.prepend`/`append`/`remove` (was `Optimistic.*`) build the
  connection half of `MutateOptions.optimistic`; `OptimisticState` is the
  model slice. Persistence is namespace-only (`RemotePersistence.*`); the
  wire caps `MAX_FIELDS_PER_REQUEST` (256) and `MAX_RELATION_DEPTH` (8) with
  static nesting; `Entity.patch` takes wire-shaped values; `Selection.make`
  refuses an empty selection, which would require nothing and read `Ready`.
  `SelectionOf` and `SelectionValue` are exported, and
  `docs/design/DX_PROTOTYPES.md` with `test/dx.test-d.ts` prototype the #69
  application API against the kernel types (Phase A; compile-only).
  `Remote.clientLayer` is generic in the RPC client's requirements, so
  in-process `RemoteServer.handlers` over a database become a `RemoteClient`
  with one `Layer.provide` instead of a hand-written adapter.
- **Recursive nested selections.** `Selection.make(Project, { owner:
  UserSummary })` now reads through the ref into the target instead of failing
  to decode: the field codec follows the entity field's shape (ref, nullable
  ref, array of refs, or a page of refs through
  `Selection.connection(Entity, window, nested)`, which reads a `Page` of
  items), `Remote.select` assembles every level from the normalized store and
  reads `Initial` until each is present, and the requirement carries the graph
  (`relations`, on `foldkit-surface`'s `Requirement`, with `Requirement.merge`
  and `Requirement.mergeRelation`). `plan` attaches a relation to a field
  being fetched and follows a known relation's refs into concrete
  requirements. `Entity.ref`/`refPage` codecs are annotated, and `refsIn` /
  `relationShape` are exported. Breaking wire change: `ReadBatch` and
  `LiveRequirement` carry `REMOTE_PROTOCOL_VERSION` (now 3), `ReadRequest` gains
  `relations`, and a version mismatch fails with `RemoteProtocolError`
  (`RemoteClient.read`/`live` error types widen accordingly) (#65, section 1).
- **One statement per windowed relation.** `foldkit-remote-drizzle` ranks a
  windowed relation's children per parent in a window function and keeps the
  first `pageSize + 1` of each, so a `Selection.connection` over many parents
  no longer runs one page query per parent; the statement count of a windowed
  nested read no longer grows with the number of parents (#65, Phase E item 16).
  Its `source` declares the binding's fields (`EntitySource.fields`), so the
  server never asks it for another; `first: 0` is honored as a page of
  boundaries only rather than falling back to the default size;
  `returning(binding, fields)` pairs a mutation's `returning` columns with
  the normalization of the rows they yield.
- **Property tests and two fixes they found.** Seeded property checks over
  connection merge, live event ordering, and optimistic convergence. `merge`
  now puts a terminal-start segment first and a terminal-end segment last, so
  a gap never reorders the sides; `foldkit-remote-server` chunks a nested
  level's fan-out by `maxIdsPerEntity` instead of refusing it (#65, Phase E).
- **The durable boundary, stated.** The README says what a Remote mutation is
  (an immediate, server-derived command) and what it is not (durable intent,
  which `foldkit-sync`/`foldkit-durable` own); no second queue (#65, section 9).
- **Hydration hardening.** Snapshots are deterministic (equal stores give
  byte-equal text), carry a `scope`, and respect `maxBytes` on save and
  restore; `dehydrate`/`hydrate` are the text forms for SSR, `mergeStores`
  and the new `Hydrated { entities, merge }` Message bring one into the Model
  by `replace` or `preserve-existing`, and runtime state is never in a
  snapshot. `REMOTE_CACHE_VERSION` is 3; `stableStringify` is exported (#65,
  section 8).
- **Live pruning.** A live `ConnectionRemove` hides a server-known edge (a
  `remove` overlay), not only a pending insert; `ConnectionMerged` prunes the
  settled overlays a page supersedes and leaves a pending request's alone;
  `visibleItems` skips an edge whose target is a tombstone when given the
  store, and `Remote.visibleItems(model, connection)` reads all of it (#65,
  section 7).
- **A mutation owns its optimistic operations.** `MutationStarted { requestId,
  optimistic }` applies entity patches (`Entity.patch`) and connection changes
  (`ConnectionChange.prepend`/`append`/`remove`, new) as a layer and overlays owned
  by the request; `MutationSucceeded` releases both and records the result's
  confirmed `connections` (new on `MutationResult` and the server's
  `MutationOutcome`) in the same position, and `MutationFailed` drops both.
  `visibleItems` reads pending prepends newest-first and hides `remove`
  overlays. Breaking: `OptimisticAdded`/`OptimisticRemoved` are gone,
  `Remote.mutate` returns `connections`, `Remote.mutateInto` takes
  `{ optimistic }`, and the protocol version is 3 (#65, section 5).
- **Coalesced reads.** `Remote.clientLayer` (and `Remote.coalesced` for a
  hand-written client) batch requirements issued together into one
  `ReadBatch`, union overlapping fields, join a requirement already in flight,
  and release it when the read fails; built on Effect's `RequestResolver`
  with an optional `window` (#65, section 2).
- **Cache retention.** `Remote.retain(projections, toMessage?, {
  connections, grace })` is a Subscription entry whose dependencies are the
  retention roots; it emits the new `RetentionChanged` Message after `grace`,
  and `Remote.update` applies the pure `gc(state, roots)`, keeping what the
  roots reach through refs and nested relations, retained connections' edges,
  and pending optimistic layers and overlays (#65, section 3).
- **Request policies.** `RemotePolicy.cacheFirst` / `staleWhileRevalidate({
  maxAge })` / `networkOnly` on `Remote.observe` and `Remote.prefetch` decide
  what a field the store already holds means. A refreshing policy emits
  `RefreshStarted` (new `RemoteMessage`) before the read, marking the refetched
  fields stale so `Remote.select` reads `Refreshing`, which was unreachable
  before. Breaking: the pure planners take `PlanOptions` (`{ freshness, force }`)
  instead of a bare `PlanFreshness`, and `prefetch` takes `{ policy, now }`
  instead of `{ freshness }` (#65, section 4).
- **A `Contract` for `Module`.** `Remote.at` attaches `contract`: the bound
  Remote owns its store's Model path, named after it.
- **A real Remote submodel.** `RemoteModel` is the four producers' shared state
  (`entities`, `connections`, `optimistic`, `live`, `mutations`, `gaps`), and
  `Remote.update` is the single reducer over reads, mutation results, live events,
  connection merges, and optimistic layers. `Remote.make` returns
  `Model`/`initial`/`Message`/`update`/`rpc`. A live event ahead of its cursor
  records a gap instead of being applied out of order.
- **Entity-aware selections.** `Remote.at` carries the domain's registered entity
  names and `Remote.select` is constrained to them, so a selection for an entity
  the domain never declared is a compile error. `Selection.schema` is a pure
  codec, removing a decode cast.
- **Mutation reconciliation.** `Remote.mutate` returns the result's normalized
  patches (previously dropped) and `Remote.mutateInto` reconciles them and returns
  the new Model; settling is idempotent per `requestId`.
- **Simpler observation.** `observe`/`live` emit a `RemoteMessage` through a single
  handler, and `Remote.live` reads its resume cursor from `RemoteModel.live`
  instead of a callback the application cannot key. `Remote.prefetch` accepts a
  freshness window; the pure planners take `PlanFreshness`. `RemoteData.schema` is
  exported.
- **Queries and introspection.** `Remote.query`/`Remote.queryMessage` consume a
  `QueryRef` end to end, and `Remote.inspect`/`Remote.inspectEntity` expose a pure,
  serializable cache view for DevTools.
- **Gap lifecycle.** A live stream's gap clears when an in-order event applies or
  a `GapCleared` message arrives, rather than sticking forever.
- **Self-describing refs and a registry.** `QueryRef` carries its input codec, so
  `Remote.query(ref)` needs no descriptor; `Remote.make` builds a name-keyed
  `registry` from the declared entities, queries, and mutations.
- **An RPC client adapter.** `Remote.clientLayer(rpcClient)` turns an Effect RPC
  client for `RemoteRpc` into a `RemoteClient`, reconstructing the client's
  `LiveEvent` from the wire's `LiveChange` so the mapping is not re-invented per
  application.

### `foldkit-remote-server` 0.1.0

- **Review hardening.** A request for a field the Entity does not declare
  never reaches `read` or `authorize` (`RemoteServer.entity(Project, …)`
  records the declared fields; `EntitySource.fields`); the per-entity id cap
  counts a batch's distinct ids across its window groups, and a live
  subscription is refused over the same cap; the wire refuses, rather than
  silently truncates, a selection nested past `MAX_RELATION_DEPTH`.
  `RemoteServer.liveHub(entities)` takes the entity sources, so the mutation
  sources that signal it can be built after it; subscribers sharing a
  principal share a read by the principal's identity, not its serialization;
  `HandlerOptions<P, R>` types the hub; `RemoteServer.prepend`/`append`/
  `remove(connection, ref)` build a mutation outcome's connection changes.
- **A live hub.** `RemoteServer.liveHub(entities)` tracks each live
  subscriber's requirements and principal; `hub.changed(ref, fields)` re-reads
  the changed fields a subscriber selects through the entity source under its
  principal and streams the patch, `hub.deleted(ref)` streams a delete, and
  `handlers(server, principal, { live: hub })` registers every subscription
  (#65, section 6).
- **Nested resolution in one read.** `FoldkitRemoteRead` resolves a request's
  `relations` level by level: each level's refs become the next level's
  requests, a target the batch already read is not read again, every level is
  authorized through its own entity source, and `HandlerOptions.maxDepth`
  (default 8) caps traversal. Both read and live handlers refuse another
  protocol version with `RemoteProtocolError` (#65, section 1).

- **Live handler.** `RemoteServer.live` and the compiled `FoldkitRemoteLive`
  handler were missing; the server can now stream the client's live requirements.
  Two wire bugs are fixed with it: `LiveRequirement` was missing the resume cursor
  and `LivePatch.cursor` was a string while the client cursor is numeric.
- **Typed live changes.** The live wire success is now a `LiveChange` union of
  entity patches, deletes, and connection insert/remove/invalidate events, so a
  connection change can travel over the wire instead of entity patches only.
- **Less ceremony.** `RemoteServer.make` drops its unused domain argument, and the
  server imports the canonical `NormalizedPatch` instead of duplicating it.

### `foldkit-agent-native` 0.2.0

- **Published.** The Agent Native adapter leaves prototype status at `0.1.0`.
  `AgentNative.actions` compiles an exposed contract into registry entries whose
  `run` only dispatches, and advertises the encoded input schema as a Standard
  Schema validator. It remains pinned to `@agent-native/core@0.177.1`.

### `foldkit-mixins` 0.1.0

- **Slot contracts.** New private package: branded Capability / Event / Attr
  tokens and `Slots.define` contracts.
- **Resolver.** A `Mixin` contribution model and a pure, deterministic
  `Resolver.resolve`: additive deduplicated classes, per-property inline styles,
  single-owner events and scalar attributes, protected slots, opaque
  `ChildAttribute` preservation, and one composed `OnMount`. Conflicts throw a
  structured `DiagnosticError`.
- **SlotView.** `SlotView.define` publishes typed Slots and resolves attached
  Mixins per slot into ordinary Foldkit attributes; `SlotView.attach` is
  immutable.
- **Style v1.** Pure `Style.class`/`inline`/`compose`/`when`/`forSlots`, compiling
  to a contribution; `Style.attach` is `SlotView.attach` for a style.
- **Input-driven Style.** `Style.whenInput(predicate, piece)` defers a piece to
  render time, folded against the view's input and composable (including nested
  conditions). It compiles to a message-free `Mixin<never>`; the mixin boundaries
  accept `Mixin<never>` explicitly because it does not widen to `Mixin<Message>`.
  The CSS compiler is not in this slice.
- **Behavior v1.** `Behavior.slot`/`forSlots` build attributes from the view's
  `input` and `h` at resolve time, so the view's Message universe governs them.
  Definition-time validation rejects an unknown slot, an unsatisfied capability,
  and an unpublished event or attribute; a Behavior owns no state.
- **Mount runtime coverage.** Composition is tested through `foldkit/test`'s
  `Scene` (two Behaviors yield exactly one observed Mount) and directly on the
  merged stream: every inner stream's Messages are collected, and a failing
  inner stream fails the merge rather than being swallowed.
- **Theme and recipes.** `Theme.define` is typed token data, with
  `Theme.variable`/`Theme.variables` compiling to CSS custom properties;
  `Style.recipe` is a typed variant selector returning Style data, with
  `compound` combinations matched against the resolved selection.
- **Advanced Style compiler (started).** `Style.pseudo`/`media`/`supports`/
  `container`/`nest` compile to a deterministic class (FNV-1a of the canonical
  rule text) plus CSS text; `Style.keyframes` and `Style.global` contribute
  class-independent CSS. Declarations are kebab-cased and equal rules share a
  class. `NamedStyle.css`/`globalCss` plus structured `rules`/`globalRules`, and
  `Style.stylesheet`, expose deduplicated CSS as data, so SSR and the browser
  agree and nothing mutates the DOM. Rules inside `Style.whenInput` are rejected
  (`style:conditional-rules-unsupported`). Render-time collection/extraction is
  still out of scope.
- **A11y patterns.** `A11y.pattern` is a portable requirements map and
  `A11y.validate` reports every mismatch as a stable `a11y:*` diagnostic
  (missing or hidden slot, capability mismatch, missing event or attribute). It
  is pure and DOM-independent. The UI/Surface adapters are not in this slice.
- **Prototype-key slot names.** `Style`, `Behavior`, `Mixin.compose`,
  `Style.compose`, `Slots.describe`, the `SlotView` builders, and the
  `@foldkit/ui` resolver accumulate into prototype-free records, so a slot or
  style named `__proto__` keeps its contribution instead of silently becoming
  the accumulator's prototype.

### `foldkit-mixins-ui` 0.1.0

- **`@foldkit/ui` adapter.** New private package formalizing the attribute
  bundles of Button, Input, Textarea, Select, Checkbox, Switch, Fieldset, and
  Disclosure as `Slots`, and resolving attached Mixins into them. Base
  attributes, event Messages and `ChildAttribute`s are preserved; a Behavior
  cannot take over an event the component already owns.
- **Submodel adapter.** Dialog's seven `ChildAttribute` groups are published as
  `DialogSlots`; `resolve` preserves them by identity and passes `isVisible`
  through. Popover's four groups (with its anchor/portal Mounts), Tooltip's two,
  and Slider's six are published the same way. All are tested DOM-free with
  `foldkit/test`'s `Scene`, so real ChildAttributes exercise the resolver,
  including the owned close/trigger `click`, `focus` or `pointerdown`.
  `Event.Cancel` was added for the dialog's Escape handler.
- **Nested Submodels.** Tabs, RadioGroup and Calendar publish per-item groups
  (`tabs[i].tab`/`panel`, `options[i].option`/`label`/`description`,
  `weeks[].cells[].cellAttributes`/`buttonAttributes`). Their adapters call
  `SlotView.buildersFor` directly and map each item, so one slot contribution
  applies to every item while each item's base keeps its own event ownership.
  Tested through `Scene` with identity, Style and conflict assertions.
- **Out of reach with this seam.** `Menu`, `Listbox`, `ComboBox` and `DatePicker`
  own their markup and expose no `toView`/attribute bundles, so there is nothing
  to resolve against.

### `foldkit-mixins-surface` 0.1.0

- **SurfaceView bridge.** `SurfaceView.define(surface, slots, render)` binds a
  Surface's projected Model and Message subset to a core `SlotView`: the
  renderer's input is the projection, and its builder is typed with the
  Surface's Message subset, so a Behavior cannot emit a message the Surface does
  not expose. The result is an ordinary `SlotView`, so Style/Behavior attach and
  pipe unchanged; `SurfaceView.toRenderer` adapts it to `Surface.view` /
  `Surface.rootView`. Type tests pin the projected-Model and Message-subset
  rejections, and runtime tests drive `Surface.rootView` end-to-end, including a
  Style and a Behavior reading the projected input. `SurfaceView.inspect(view)`
  returns serializable `{ name, slots, mixins }` (no functions), composing with
  `Surface.inspect`. `SurfaceView.describe(surface, params, view)` merges both
  into one serializable description (emitted Messages as tags, not constructors),
  with a deterministic `toMarkdown` for docs and CI. A `@foldkit/ui` component
  composes inside a SurfaceView: the Surface's Message subset flows into its
  config and a Mixin resolves around its bundle. Phase 10 started, not complete.

### `foldkit-mixins-example` (example)

- **Worked Surface + Mixins trace.** A `ProjectCard` Surface projects two fields
  and exposes two of the application's Messages; a SlotView styles and decorates
  it (`Style.whenInput`, `Style.pseudo`, a Behavior reading the projected input).
  The demo prints the observation set, slot contracts, mixin names, projected
  model, resolved attributes, the compiled stylesheet, and the serializable
  `SurfaceView.describe` value plus its `toMarkdown`; `pnpm demo` runs it and a
  test asserts every line. Remote is not part of this example.

### `foldkit-kitchen-sink` (example)

- The transcript now runs the whole Remote path end to end: a nested `owner`
  selection over Drizzle, a live subscription fed by the server's hub from the
  rename mutation, an optimistic insert into the projects connection confirmed
  in place by the mutation result, a dehydrate/hydrate round trip that
  leaves nothing to fetch, and two `Remote.retain` passes showing what the
  Board's roots keep with and without the projects connection (#65, Phase E).
  The server is reached through `Remote.clientLayer(handlers)` over the
  database layer rather than a hand-written adapter.

### `foldkit-remote-example` (example)

- **Remote-backed trace.** A `ProjectPage` Surface selects a project out of a
  `foldkit-remote` store; `Remote.plan` reports the requirement,
  `Remote.prefetch` fills it against an in-process `RemoteClient`, the projected
  `RemoteData` moves `Initial → Ready`, a SurfaceView styles and decorates it, a
  `Remote.mutateInto` rename is visible through the same projection, and a
  malformed stored value surfaces as `Failed`. `pnpm demo` runs it; a test asserts
  every line. The trace also runs the `Remote.observe` entry under
  `RemotePolicy.staleWhileRevalidate` (`RefreshStarted` reads `Refreshing`,
  then `Ready`) and a `Remote.retain` pass that collects what the page does
  not reach.

### `foldkit-agent` 0.2.0

- **A Surface as context.** `Agent.forApplication(App).make({ context })` accepts
  a feature Surface (without params) beside a `Projection` or a writable pick,
  so the Surface a view renders is also what the agent sees (#60, section 3).
- **A `Contract` for `Module`.** `Agent.forApplication(App).make` attaches
  `contract`: what the agent observes (its context projection) and the Message
  tags it exposes; `name` (default `'agent'`) names it. `Agent.make` alone
  cannot know the application and attaches none.
- **`define` is `make`.** `Agent.define`, `Agent.forModel<Model>().define`, and
  `Agent.forApplication(App).define` are `make`, and `DefineOptions` is
  `MakeOptions`, matching `Sync.forApplication(App).make` and `Surface.make`
  (#60). `Definition` keeps its name: it is what `make` returns.
- **Surface-based context.** `Agent.context` and `Agent.pick` are removed. The
  `make` `context` option now takes a `foldkit-surface` projection — a read-only
  `Projection` (`Projection.of`/`struct`/`fromReader`) or a writable
  `Projection.pick`/`Projection.compose` — and the runtime reads it with `.read`.
  `Agent.forApplication(App)` infers the Model from a `Surface.application` and
  accepts either projection directly; `Agent.forModel<Model>()` remains when there
  is no application. `Agent.contextSchema` is unchanged.
- **Subset exposure and a curried principal.** `Agent.exposeSubset(subset,
  variants)` exposes only the variants of a `MessageSet.make` subset, and
  `MessageSet.union` composes disjoint subsets. `Agent.forApplication` infers
  the Model, so a `Principal` is supplied by
  `Agent.forApplication(App).withPrincipal<Principal>()` — TypeScript cannot
  infer Model beside an explicit principal, and the chained form keeps one entry
  point instead of the curried `forApplication<Principal>()(App)` (#60). A `Surface.application` now takes optional
  `initial`/`update` and accepts resource-carrying Commands.
- **Subset ownership is enforced.** `Agent.forApplication(App).exposeSubset`
  refuses a subset whose owner token belongs to a different application, matching
  `Sync.forApplication`, so two structurally identical applications cannot mix
  selections.
- **One outcome summary for adapters.** `Agent.summarize(dispatchResult)` returns
  `{ ok, text }` — `Dispatched <tag>` without a completion contract, otherwise
  `<Completed|Failed>: <tag>`. WebMCP, MCP, A2A, and Agent Native render it
  instead of repeating the wording four times.

### `foldkit-durable` 0.2.0

- **Compacted operation identity.** Compaction drops the payload but now keeps a
  SHA-256 payload hash, so a retry of a compacted `opId` with different data or
  actor is an `IdentityConflictError` instead of being accepted as an idempotent
  repeat. When the payload is compacted, `append` returns `AlreadyCommitted`
  (`opId`, `sequence`, `actorId`) rather than returning the retransmitted
  operation as the committed one — which could otherwise run an effect for
  content that was never committed. The `user_version` migration to 2 adds and
  backfills the column.
- **Newer databases are refused.** A database whose `user_version` is above this
  build's `SCHEMA_VERSION` fails during `makeJournal` with
  `UnsupportedJournalVersionError` instead of being treated as migrated.
- **Reads below the floor fail closed.** `read(key, after)` fails with
  `CompactedCursorError` when `after < compact_before`, rather than returning a
  tail that silently starts late.
- **Encoded-typed and branded surface.** `Codec<Value, Encoded>` carries the wire
  side, and `append` takes it instead of `unknown`. `Committed` now includes the
  journal's own `opId`, and `sequence`/`cursor` are branded `Sequence`/`Cursor`,
  so `read` and `compact` cannot be swapped.
- **Batch, maintenance, and recovery APIs.** `appendAll` commits an ordered batch
  in one transaction. `keys`, `reset`, `unfinished`, and `clearEffect` give
  recovery and maintenance an API instead of re-deriving intents from
  application state.
- **Canonical idempotency.** Encoded payloads are canonicalized (object keys
  sorted) before they are stored and hashed, so a retry with a different key
  order is the same operation rather than an `IdentityConflictError`.
- **Bounded change stream.** `subscribe` is a sliding `PubSub`: a slow subscriber
  drops the oldest wake-ups instead of growing memory without bound.
- **Multiple journals.** `makeJournalLayer` and `JournalService` take an optional
  service key, so an application with more than one journal type does not
  collide on the default tag.
- **Retry control and Effect authorization.** `runEffect(key, run, { retryFailed:
  false })` fails fast with `EffectFailedError` instead of retrying a failed
  record, and `authorize` may return an `Effect` (it runs inside the append
  transaction, so it has no service requirement).
- **Canonical hash migration.** `SCHEMA_VERSION` 3 recomputes retained
  operations' `payload_hash` from canonical JSON, so a payload compacted after
  the upgrade compares canonically rather than rejecting a reordered retry. A
  payload already compacted before schema 3 keeps its legacy hash.
- **A recovery worker.** `journal.recover({ key, from, intents, onUnresolved })`
  runs the scan/reconcile loop the README described: it replays committed
  operations after `from`, derives their effect intents, reuses recorded
  successes, and stops before an operation whose intent failed or was skipped,
  returning the cursor it settled so the caller can persist it.

### `foldkit-sync` 0.3.0

- **`Sync.mount` routes the URL.** `mount(App, sync, { url: { init, onUrlChange, onUrlRequest? } })`
  reduces the URL into the Model before the first render, names the Message
  for every navigation, and follows a link the application does not claim
  (an internal one pushed, an external one loaded), so a `foldkit-mirror` URL
  mirror plugs in without window listeners.

- **Fragments.** `Sync.forApplication(App).fragment({ shared, durable })`
  declares one feature's shared fields and durable Messages, and
  `compose(...fragments)` merges them into a value to spread into `make`,
  inferring the merged shared shape and Message union. A field declared twice
  with a different codec, a duplicate durable tag, or a fragment from another
  application throws (#63).
- **Authorization on the contract.** `make({ authorize: { Tag: rule } })` takes
  one rule per durable variant, with `message` typed as that variant, `shared`
  as the snapshot, and `principal` fixed by `withPrincipal<P>()`; a key that is
  not a durable tag is a compile error. `journalContract()` now returns a
  `PolicyJournalContract` carrying the compiled `authorize`, so
  `makeJournal({ ...contract })` applies it; an unruled variant is allowed and a
  contract without rules declares none (#63).
- **`Sync.mount`.** Runs a Foldkit application over an open replica with one
  reducer: a durable Message is applied at once through `update` and persisted
  afterwards in a Command; a failed persist reverts it and reports through
  `onPersistenceFailure`; the shared slice is re-installed when an exchange or a
  rejection moves the replica; `dispose` waits for in-flight persists; the
  runtime's union is the application's plus three private variants, so Commands
  from `update` need no re-wrapping. `mounted.model`, `dispatch`, `subscribe`,
  and `observe` are the host an agent binds to, `observe` reporting every
  application Message the runtime applies. `foldkit` becomes a peer dependency. This closes the
  runtime seam (#60, section 5) without an upstream hook; `examples/sync` drops
  its hand-written wrapper.
- **A `Contract` for `Module`.** `Sync.forApplication(App).make` attaches
  `contract`: the replica owns the shared projection's paths and records the
  durable tags, so `Module.validate` catches two replication contracts over the
  same field or Message.
- **Surface-based contract.** The standalone `pick`/`Projection` (#59 spike) is
  gone, superseded by the shared Surface `ModelRef`/`Projection`.
  `Sync.forApplication(App).make({ documentId, shared, durable })` derives the
  shared projection, the durable subset, the initial snapshot, and replay from a
  `Surface.application`, a `Projection.pick`/`Projection.compose` projection, and a
  `MessageSet.make` subset; `make({ ..., replay })` replaces the derived replay
  with a custom reducer over the shared slice. It compiles to the low-level
  `defineSync` and returns a read-only `surface`; `TodoSync.journalContract()`
  derives the durable operation/snapshot codecs, empty snapshot, and reducer.
  Additive — `defineSync` remains the protocol primitive. `Sync.project` is
  removed; `Projection.pick` is the writable projection.
- **One entry point, shaped like Agent's.** `Sync.forApplication(App)` specializes
  the constructors to an application and `.make(config)` produces the
  contract, matching `Agent.forApplication(App).make(config)` (#60). The
  earlier `Sync.forApplication(App, config)` and `Sync.make(App, name, config)`
  forms are gone; `Sync.make`'s explicit `initial` and bare constructor array
  came from the application and a `MessageSet.make` subset anyway. `make`
  refuses a durable subset whose owner token belongs to a different application.
  `MakeOptions` names its config.
- **Derived replay is guarded.** `Sync.forApplication`'s replay refuses a durable
  Message whose `update` returns a Command or changes a Model field outside the
  shared projection, naming the Message and the fields, instead of silently
  dropping the Command or the change. A durable Message is a deterministic,
  state-only transition of the shared projection; an effectful Message stays
  local and emits a durable fact when its Command settles. The Command's effect
  is never run. `examples/sync` drops its hand-written copy of the same guards.
- **`submit` fails closed.** The replica replays a Message before writing it to
  the outbox and fails with `ReplayError` (a new `ReplicaError` member carrying
  the replay's message and cause) when replay throws, for the new Message or
  for a pending one while the projection is rebuilt, so a Message no replica
  could apply is never persisted. The submit-time result seeds the optimistic
  projection, so a read after a submit no longer replays the whole outbox.
- **Replay documented at the definition.** `MakeOptions.replay` states that a
  custom replay is a pure reducer over the shared subset, that only durable
  Messages reach it, that it runs during admission, replay, and optimistic
  projection, and that it is not guarded.
- **An exchange loop.** `Replica.start` exchanges once and then after every
  `submit`, until the replica closes or the fiber is interrupted; a transport
  failure is recorded and retried on the next wake, so the application does not
  have to hand-roll the synchronize loop.
- **Branded positions.** `Sequence` (a committed document position) and
  `LocalSequence` (a replica's own 1-based counter) are brands with `sequence`
  /`localSequence` decoders, so `baseCursor`/`serverSequence`/`cursor` cannot be
  swapped with `localSequence`. `Operation`, `CommittedOperation`, `Checkpoint`,
  `ReplicaState`, `Replica.cursor`, and `ReplicaStatus` use them.
- **Distinct committed type.** Sync's committed operation is `CommittedOperation`,
  so importing it beside `foldkit-durable`'s `Committed` no longer collides.
- **Grouped codec helpers.** `Sync.codec` collects `normalizeOperation`,
  `operationFrom`, `committedFrom`, and `decodeExchange`; they are advanced
  wire/transport helpers, not the application-facing surface.
- **Presence as a Stream.** `Presence.changes` emits the live peers on subscribe
  and whenever the set changes, composing with Effect like the journal's change
  stream; `subscribe` remains for a callback edge.
- **Observable status.** `Replica.statusChanges` emits `ReplicaStatus` on
  subscribe and after every submit and exchange, so a UI can subscribe instead of
  polling `status`; `Replica.close` now wakes `Replica.start` so the loop returns
  rather than waiting for the scope.
- **One subscription for status and shared.** `Replica.changes` emits a
  `ReplicaSnapshot` — the status and the optimistic `shared` value read from one
  replica state — on subscribe and after every submit and exchange.
- **Foreign acknowledgements.** A response that acknowledges an operation the
  replica never sent (for example one submitted while the exchange was in flight)
  is a `ForeignAcknowledgementError` and no longer deletes that pending operation.
  A response that both acknowledges and rejects one id is refused too.
- **Encoded persistence.** The replica state is encoded through the shared codec
  before it is saved, so a transforming `shared` schema (`Schema.NumberFromString`,
  a brand, a date) round-trips instead of failing to reload. `Storage` is now
  opaque, and persisted state ids are branded.
- **Failed open cleanup.** `openReplica` closes its storage on a failed open,
  matching `openLwwClock`, instead of leaking the handle.
- **Presence identity.** `servePresence` stamps the connection's own peer id and
  ignores a client-supplied one, so a peer cannot spoof, move, or remove another.
- **Malformed responses are typed.** A malformed exchange response fails with
  `InvalidExchangeError` (and records `lastError`) instead of becoming an Effect
  defect.
- **Terminal transport after retries.** Once the reconnect schedule is exhausted,
  later exchanges fail immediately with the terminal error rather than queueing
  behind a fiber that is gone.
- **Interrupted exchanges free their slot.** An exchange interrupted before a
  reply no longer counts toward the queue limit; a late reply for it is ignored.

## 0.2.0

`foldkit-sync` 0.2.0 and `foldkit-durable` 0.1.1. The `foldkit-agent` family is
unchanged at 0.1.0, so its versions are not republished.

### `foldkit-sync` 0.2.0

- **Version negotiation.** A persisted replica or clock state from a version this
  build does not understand now fails with `UnsupportedReplicaVersionError` or
  `UnsupportedClockVersionError`, naming the found and supported versions, rather
  than a generic invalid-state error. The stored bytes are left untouched, so the
  state stays recoverable. `openLwwClock`'s error type is now
  `StorageError | UnsupportedClockVersionError`; match the new tag when handling
  an unsupported version.
- **`replica.status`.** A redacted view — pending count, cursor, the last exchange
  failure, and the operations the server refused (most recent first, bounded) —
  enough for a UI to explain and recover without exposing Messages or the Model.
- **O(1) projection reads.** `replica.shared` memoizes its projection against the
  immutable replica state, so repeated reads no longer replay the outbox. Measured:
  a read at a 5,000-operation outbox drops from ~100 ms to ~1 µs.

### `foldkit-durable` 0.1.1

- README only. Documents [retention](./packages/durable/README.md#retention):
  operation identities and effect records are never garbage-collected, so a
  reconnecting replica past the compaction floor is still acknowledged idempotently;
  bounding storage means rotating the journal and refusing retries older than the
  retained window. No code change.

### Not published

The repo also gains a benchmark harness (`pnpm bench`, `pnpm bench:storage`), a
weekly non-gating Bench workflow, and a long-outbox recovery test. These are
root-level tooling and are not part of any published package.

## 0.1.0

The first release.

### Packages

- `foldkit-agent` — the protocol-neutral contract: `context`, `expose`, `define`,
  `resource`, introspection, and the bound `AgentRuntime`.
- `foldkit-agent-webmcp` — the browser adapter over `document.modelContext`.
- `foldkit-agent-mcp` — the external MCP adapter: a transport-free handler, plus
  stdio and Streamable HTTP.
- `foldkit-agent-a2a` — the A2A adapter: an Agent Card and `message/send` as
  tasks.
- `foldkit-durable` — a durable, ordered operation log on
  `effect/unstable/sql`, with migrations, compaction, change streams, a durable
  effect ledger, and metrics.
- `foldkit-sync` — a local-first replica: offline outbox, optimistic projection,
  reconciliation, presence, an Effect `Transport` service, and a reconnecting
  WebSocket transport.

### Notes

- Foldkit `0.158.2` peer-depends on `effect@4.0.0-rc.112`, so these packages
  target Effect 4.
- `foldkit-durable` requires Node 22 for `node:sqlite`.
- The `foldkit-agent-native` prototype under `packages/agent-native` is
  `private` and not published.
