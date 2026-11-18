# Traps: Remote, Entity, Guard, Sync, forms and the SQL adapters

Read before touching Remote, Entity, Guard, Sync, Form, a live read, or the Drizzle, SQLite or Postgres code.

- **A form checks a draft against its key's type side.** `planOf` decodes
  with `Schema.toType(schema)` (an `Option` key is unwrapped to what it holds
  first). `Schema.toEncoded` keeps inner checks but drops one made
  after a transformation: `NumberFromString.check(isGreaterThan(0))` accepted
  `'-1'`. Re-check against the whole Schema.
- **An exchange that throws on one operation blocks the outbox.** The
  journal decoded each pending operation outside any handling, so one a
  client tampered with failed the whole exchange; the replica would send it
  again on every exchange, and the edits behind it never went. Refuse such
  an operation by its id (`rejected`), so the replica drops it, and fail the
  exchange only for what is not an operation at all. `foldkit-sync/journal`'s
  `journalExchange` and `serveJournal` keep this; prefer them to a new
  hand-written exchange.
- **A durable edit shows before it is stored.** `Sync.mount` applies the
  Message to the Model at once and persists it in a Command after, so the
  registry's cell read "pending" while IndexedDB had nothing yet. Its e2e
  reloaded the device on that mark and, on CI's slower runs, lost the edit
  (`3.21` for `6.66`). Before reloading, wait for the replica's own status
  (its `pending` count moves only once storage has the operation), not for
  anything the Model draws.
- **A replayed durable Message may write the shared slice and nothing else.**
  Sync replays it through `update` over the app's `initial` Model and refuses
  any other field it changes. Reconciling Remote's overlays at the end of
  `update` failed every replica ("changed Model fields outside the shared
  projection: remote"); the registry's old `settledOf` did the same and passed
  only because it changed nothing while `retired` was empty, as it always is
  in a replay. Derive such state in `Sync.mount`'s `afterUpdate`.
- **A Port decodes what it is sent.** `Port.inbound(schema).send` takes the
  schema's encoded form; `Sync.mount`'s `dispatch`, typed to take a Message,
  passed it a decoded one, so a Message with an `Option` field failed with a
  `SchemaError` and was dropped, and every test of it used plain strings.
  Encode before `send`, and test a dispatch with a transforming field.
- **Drizzle 1.0 rc decodes through dialect codecs.** `column.mapFromDriverValue`
  no longer turns SQLite's `1` into `true`; select a raw value with
  `sql\`…\`.mapWith(column)` to decode it as the column would.
- **An adapter's library is a peer, not a dependency.** `foldkit-remote-drizzle`
  depended on `drizzle-orm`, so an application whose Drizzle resolved with
  other optional peers (it had `@effect/sql-sqlite-wasm`) got a second copy,
  and its tables did not type-check against the adapter. A library the
  application also uses is a `peerDependency`.

- **SQLite's change counters see less than a test assumes.** `total_changes()`
  counts the calling connection's writes only, so a test reading it from a
  second connection saw none of the journal's; `PRAGMA data_version` sees
  other connections' commits, but an `UPDATE` that writes the values a row
  already holds changes no page and moves neither. A mutation adding such a
  write survives: say so in the spec rather than chase a test.

- **A member is the Entity's, not its descriptor's** (#332). `relate`,
  `derived` and `sets` add to every descriptor of the Entity, so test fixtures
  that pipe different members onto one shared Entity collide ("already a
  derived member"); give each such test a domain of its own.
- **`isMaxLength` counts UTF-16 units; SQL's `length()` counts code points.** A
  CHECK translated from it is looser for an emoji. Use `isMaxCodePoints` for a
  rule the database should hold too.
- **Pending placement reads no app Model.** It runs over `RemoteModel` alone
  (memoized reads), so a list body over `Expr.viewer` was judged with no
  context and a card you made never joined `Mine` until the answer; only
  `Law.check` saw it. What a pending layer is judged with travels on the
  layer (`EntityLayer.viewer`), as the operation's context does.
- **Folding two dev checks into one option changes what each sees.**
  `verifyPredictions` turns on placement checking, which marks each placed
  list stale to fetch its page, and a stale list plans no row reads, so the
  `Gap` check stopped seeing gaps in it. Plan gaps over the lists as they
  would be unchecked (`unverified`).
- **What a body reads is its `fields` and its `reaches`.** `Query.dependencies`
  leaves what a path, an exists or a path from the viewer reads out of
  `fields`, and `impactOn` judged a change by `predicate` alone, so a list
  over `Expr.path(team, name)` kept a member relinked away, and kept every
  row when the team was renamed. A caller deciding "did this change touch the
  body" reads `reaches` too.
- **Probe, do not assume, what a library type means.** `Schema.Struct({})` is
  not an empty-object schema: it accepts `{foo:1}`, `[]` and `"str"` even with
  `onExcessProperty: 'error'`. Use `Schema.Record(Schema.String, Schema.Never)`.
  Run a scratch probe against the installed version before relying on semantics
  inferred from a name.
- **`JSON.stringify` writes `Infinity` and `NaN` as `null`.** A key cursor paged
  past an infinite key as if it were null and dropped the rows tied with it.
  Tag every value JSON cannot carry, as dates and bigints are.
- **SQLite's and Postgres's drivers store a lone surrogate as U+FFFD,** so
  `'a\uD83D'` and `'a\uDE00'` compare equal there; memory code comparing text
  replaces lone surrogates the same way. Python cannot write such a string to
  a file at all: a script writing one raised after `open(p, 'w')` had emptied
  AGENTS.md. Write text holding surrogate escapes with the Edit tool.
- **`Schema.Record` drops a key its key schema refuses.** Decoding `{ constructor: … }`
  against `Schema.Record(Id, Entry)` returned `{}`, with no error, unless the call passes
  `onExcessProperty: 'error'`. That keeps a bad key out, and also loses its value silently.
- **`Optic.at` cannot insert.** It is a prism, not a lens: `replace` is a no-op on
  an absent key, so writing a new key (or clearing one) needs a container-aware
  setter, not `optic.replace`. Silent no-op otherwise.
- **Untrusted field names are prototype keys.** `field in values` walks the
  prototype chain; filter with `Object.hasOwn` and accumulate with no prototype.
  The Drizzle adapter's relation/computed/column maps are `Object.create(null)`,
  and app-supplied policy/window lookups use `Object.hasOwn`, because
  `RemoteServer` passes client-chosen `fields` straight to `source.read`; a
  crafted `fields: ['__proto__']` otherwise misread `Object.prototype` as a
  relation and crashed the read.
- **`EntitySource.read` is not what a reader may see.** The handlers apply
  `authorize` and `filter` around it, so a guard's member Read rules live
  outside `read`. `pollLive` called `read` itself and sent a withheld member
  in every patch, while the Source it read through passed
  `GuardServer.validate` (#264). Anything that reads to send reads through
  `RemoteServer.readAs`.
- **A row that leaves a list is not a row that is gone.** `pollLive` sent
  every row leaving a live list as `EntityDeleted` beside `ConnectionRemove`,
  so a row pushed out of a full window, or edited out of a filter, read
  `NotFound` on the page while it existed; the patch-level tests used a list
  of every row, which nothing leaves but by deletion. Read a leaving row to
  tell the two apart, and test a filtered, windowed list through the client
  (`pollWindow.test.ts`).
- **A bound on how many rows a read names is no bound on what it reads.**
  `maxIdsPerEntity` capped a read's ids, but a collection relation read
  whole selected every child of each, and `pollLive` did so every tick, from
  before 0.35.0 until remote-drizzle's `maxCollection`. Bound what each
  named thing fans out to, and refuse past it: a whole list has no `hasNext`
  to say it was cut short.
- **Readable is not listed.** With a row log, `pollLive` once listed every
  logged row the subscriber could read, so a filtered list took in rows its
  query excludes and grew past its `first`. Membership is the query's: run
  its window again.

- **A Drizzle `PgColumn` is structurally a `SQLiteColumn`.** An overload
  taking SQLite columns first matched Postgres ones too and returned SQLite
  check builders, which `pgTable` refused with a misleading error. List the
  Postgres overload first.
- **SQLite sorts the last term of an order that places nulls against its
  default.** Every keyset page wrote Postgres's placement (`asc nulls last`),
  and SQLite 3.53 then added `USE TEMP B-TREE FOR LAST TERM OF ORDER BY`
  whatever the index, `NOT NULL` or `WITHOUT ROWID`, so every page sorted
  its id tie-break and every test stayed green. A not-null column places no
  nulls now; hold a page to its index with `EXPLAIN QUERY PLAN`
  (`remote-drizzle/test/orderPlan.test.ts`).
- **sql.js leaves SQLite's foreign keys off; Node's `node:sqlite` turns them
  on.** Chirp's `likes.post_id ... on delete cascade` held in every Node test
  while the published demo, on sql.js, would have left a deleted chirp's likes
  behind. A server that relies on a reference sets `pragma foreign_keys = on`
  itself, and a test of it runs on the demo's database too
  (`examples/chirp/test/wasm.browser.test.ts`).
- **Drizzle's SQLite transaction is synchronous.** `db.transaction(async tx
  => …)` over `node-sqlite` commits before the callback's awaits run, so a
  failure after an await rolls nothing back; a probe left the row of a
  "failed" transaction in the table. Write the callback synchronously, with
  `.run()` and `.all()`; Postgres takes an async one, and D1 only `batch`.

- **An adapter's peer range is not proof that its imports exist.** Drizzle's
  `effect-postgres` driver loads `cache/core/cache-effect.ts`, which called
  `Schema.TaggedErrorClass` in `1.0.0-rc.4` — a name no Effect 4 release
  exports — so a static import threw `Schema$1.TaggedErrorClass is not a
  function` and failed every test file that reached it, not just the query.
  `1.0.0-rc.5` declares the same error with `Schema.TaggedError` and mentions
  the old name nowhere. Import the driver in a probe run from inside the package
  before trusting a peer range, and keep library code on a Context tag until the
  two versions are known to agree.

- **A bound one consumer checks is missed by the next.** The `liveHub`
  refused a live subscription over `maxIdsPerEntity` itself, so `pollLive`,
  added later beside it, re-read any number of ids every tick. Check a
  client-chosen size where the request is decoded (`FoldkitRemoteLive`'s
  admission), before any consumer sees it.
- **Bounding ids does not bound statements.** `pollLive` read once per
  distinct field set its rows asked, so a client asking each of 1000 rows
  for a set of its own made each tick 1000 reads; and it compared fields by
  identity, so a collection relation's refs, a new array each read, patched
  every row every tick. Bound the work a client-shaped request does per tick
  (one read, then compare each row on its own fields), and compare polled
  values with `Equal.equals`.
- **An exists reached through a path leaves its row too.** The guard refused
  a write that changed what a path rule reads of its own row by naming each
  `Path`'s first relation; an `Expr.path(rel, Expr.exists(…))` is an
  `Exists` with a `via`, and was skipped, so a member moved a note into a
  team they had no seat on. Match every reach variant
  (`Path`, `Exists`, `ViewerPath`) when deriving what a rule reads.

- **A body's `fields` are its own row's; what it reaches is in `reaches`.**
  `Query.dependencies(...).predicate` and `dependenciesOf(...).fields` hold
  no member a path, a path from the viewer or an exists reads.
  `GuardServer.validate` judged hidden members over `predicate` alone, so a
  body filtering by `Expr.path(Todo.relations.tag, Tag.fields.id)` passed
  while SQL read the hidden link; the client's list impact reads them alone
  too, and keeps a held row that a relink took out of a path's filter. A
  check over what a body reads walks `reaches` as well.

- **Tell the other tabs the answer before the store says it is done.** The
  outbox's sender first wrote `done` to the store and announced it; the
  sender's own save of that change pinged first, so the other tab read the
  write as settled with no answer and fell back to refetching (its row read
  `Refreshing`), in the two-tab browser test only. Announce the outcome, then
  write the store. A `BroadcastChannel` made per post reaches every other
  instance in the page, the poster's own tab's listener included.
- **jsdom's `navigator` has no `locks`.** Vitest's jsdom environment replaces
  Node's `navigator`, so a Web Lock is silently not taken there; a claim that
  only one tab sends is a browser test (`outboxTabs.browser.test.ts`), where
  two runtimes in one page share the locks, `localStorage` and channels.


