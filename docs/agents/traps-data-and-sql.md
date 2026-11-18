# Traps: Remote, Entity, Guard, Sync, forms and the SQL adapters

Read before touching Remote, Entity, Guard, Sync, Form, a live read, or the Drizzle, SQLite or Postgres code.

## Remote, Entity and Guard

- **A body's `fields` are its own row's; what it reaches is in `reaches`.**
  `Query.dependencies(...).predicate` and `dependenciesOf(...).fields` hold no member a path, a path from the viewer or an exists reads. `impactOn` kept a member relinked away (and every row on a team rename) for a list over `Expr.path(team, name)`; `GuardServer.validate` passed a body filtering by `Expr.path(Todo.relations.tag, Tag.fields.id)` while SQL read the hidden link; the guard refused a write by naming each `Path`'s first relation and skipped `Expr.path(rel, Expr.exists(…))` (an `Exists` with a `via`), so a member moved a note into a team they had no seat on. Check what a body reads by walking `reaches` and matching every variant (`Path`, `Exists`, `ViewerPath`).
- **A member is the Entity's, not its descriptor's** (#332).
  `relate`, `derived` and `sets` add to every descriptor of the Entity, so fixtures piping different members onto one shared Entity collide ("already a derived member"): give each such test a domain of its own.
- **Pending placement reads no app Model.**
  It runs over `RemoteModel` alone (memoized reads), so a list body over `Expr.viewer` was judged with no context and a created card never joined `Mine` until the answer (only `Law.check` saw it). What a pending layer is judged with travels on the layer (`EntityLayer.viewer`), as the operation's context does.
- **Folding two dev checks into one option changes what each sees.**
  `verifyPredictions` turns on placement checking, which marks each placed list stale to fetch its page, and a stale list plans no row reads, so the `Gap` check stopped seeing gaps. Plan gaps over the lists as they would be unchecked (`unverified`).
- **A list placement needs a collation on every text key of its order,** the `id` tie-break included (`Collation.binary`), or the client cannot place a row.
- **`isMaxLength` counts UTF-16 units; SQL's `length()` counts code points.**
  A CHECK translated from it is looser for an emoji; use `isMaxCodePoints` for a rule the database should hold too.
- **A form checks a draft against its key's type side.**
  `planOf` decodes with `Schema.toType(schema)` (an `Option` key unwrapped first); `Schema.toEncoded` keeps inner checks but drops one made after a transformation, so `NumberFromString.check(isGreaterThan(0))` accepted `'-1'`. Re-check against the whole Schema.

## Live reads (`pollLive`, `liveHub`)

- **Read through `RemoteServer.readAs`, not `EntitySource.read`.**
  The handlers apply `authorize` and `filter` around `read`, so a guard's member Read rules live outside it: `pollLive` sent a withheld member in every patch while its Source passed `GuardServer.validate` (#264).
- **A row that leaves a list is not a row that is gone.**
  `pollLive` sent every leaving row as `EntityDeleted` beside `ConnectionRemove`, so a row pushed out of a full window or edited out of a filter read `NotFound` while it existed; patch-level tests used a list of every row. Read a leaving row to tell them apart; test a filtered, windowed list through the client (`pollWindow.test.ts`).
- **Readable is not listed: membership is the query's.**
  With a row log, `pollLive` listed every logged row the subscriber could read, so a filtered list took in rows its query excludes and outgrew its `first`. Run the query's window again.
- **Bound what a request does, where it is decoded, not in each consumer.**
  `maxIdsPerEntity` capped a read's ids but a collection relation read whole fanned out to every child each tick (until remote-drizzle's `maxCollection`; a whole list has no `hasNext` to say it was cut short); `liveHub` refused over-large subscriptions itself so `pollLive`, added later, re-read any number of ids (check in `FoldkitRemoteLive`'s admission); and `pollLive` read once per distinct field set, so 1000 rows with sets of their own made 1000 reads per tick (one read, then compare each row on its own fields). Compare polled values with `Equal.equals`: a collection relation's refs, a new array each read, patched every row every tick.

## Sync

- **An exchange that throws on one operation blocks the outbox.**
  The journal decoded each pending operation unhandled, so one a client tampered with failed the whole exchange, was resent every time, and the edits behind it never went. Refuse it by its id (`rejected`) so the replica drops it; fail the exchange only for what is not an operation. Prefer `foldkit-sync/journal`'s `journalExchange` and `serveJournal`.
- **A durable edit shows before it is stored.**
  `Sync.mount` applies the Message at once and persists in a Command after, so the cell read "pending" while IndexedDB had nothing; the e2e reloaded on that mark and on slow CI lost the edit (`3.21` for `6.66`). Before reloading, wait for the replica's own status (`pending` moves only once storage has the operation).
- **A replayed durable Message may write the shared slice and nothing else.**
  Sync replays it through `update` over the app's `initial` Model and refuses any other field it changes: reconciling Remote's overlays at the end of `update` failed every replica ("changed Model fields outside the shared projection: remote"), and the registry's old `settledOf` passed only because it changed nothing while `retired` was empty. Derive such state in `Sync.mount`'s `afterUpdate`.
- **A Port decodes what it is sent.**
  `Port.inbound(schema).send` takes the encoded form; `Sync.mount`'s `dispatch`, typed to take a Message, passed a decoded one, so a Message with an `Option` field failed with a `SchemaError` and was dropped (tests used plain strings). Encode before `send`; test a dispatch with a transforming field.
- **Tell the other tabs the answer before the store says it is done, and know jsdom has no `locks`.**
  The outbox's sender wrote `done` to the store and announced after, so the sender's own save pinged first and the other tab read an unanswered write and refetched (its row read `Refreshing`, two-tab browser test only): announce, then write. A `BroadcastChannel` made per post reaches every other instance in the page, the poster's own tab's listener included. Vitest's jsdom replaces `navigator`, so a Web Lock is silently not taken: "only one tab sends" is a browser test (`outboxTabs.browser.test.ts`).

## Schema and JSON

- **Probe, do not assume, what a library type means.**
  `Schema.Struct({})` accepts `{foo:1}`, `[]` and `"str"` even with `onExcessProperty: 'error'`; use `Schema.Record(Schema.String, Schema.Never)`. Run a scratch probe against the installed version.
- **`Schema.Record` drops a key its key schema refuses.**
  Decoding `{ constructor: … }` against `Schema.Record(Id, Entry)` returned `{}` with no error unless the call passes `onExcessProperty: 'error'`, which also loses the value silently otherwise.
- **`Optic.at` cannot insert.**
  It is a prism: `replace` is a no-op on an absent key, so writing a new key or clearing one needs a container-aware setter.
- **Untrusted field names are prototype keys.**
  `field in values` walks the prototype chain: filter with `Object.hasOwn`, accumulate with no prototype. The Drizzle adapter's relation/computed/column maps are `Object.create(null)` and app-supplied policy/window lookups use `Object.hasOwn`, because `RemoteServer` passes client-chosen `fields` to `source.read` (`fields: ['__proto__']` read `Object.prototype` as a relation and crashed).
- **`JSON.stringify` writes `Infinity` and `NaN` as `null`.**
  A key cursor paged past an infinite key as if null and dropped the rows tied with it. Tag every value JSON cannot carry, as dates and bigints are.
- **SQLite's and Postgres's drivers store a lone surrogate as U+FFFD,** so `'a\uD83D'` and `'a\uDE00'` compare equal; memory code comparing text replaces them the same way.
  Python cannot write such a string to a file (a script raised after `open(p, 'w')` had emptied AGENTS.md): write text holding surrogate escapes with the Edit tool.

## Drizzle, SQLite, Postgres

- **Drizzle 1.0 rc decodes through dialect codecs.**
  `column.mapFromDriverValue` no longer turns SQLite's `1` into `true`; select a raw value with `sql\`…\`.mapWith(column)` to decode it as the column would.
- **An adapter's library is a peer, not a dependency.**
  `foldkit-remote-drizzle` depending on `drizzle-orm` gave an application (which also had optional `@effect/sql-sqlite-wasm`) a second copy whose tables did not type-check against the adapter.
- **An adapter's peer range is not proof its imports exist.**
  Drizzle's `effect-postgres` driver loads `cache/core/cache-effect.ts`, which called `Schema.TaggedErrorClass` in `1.0.0-rc.4` (no Effect 4 release exports it), so a static import failed every test file that reached it; `1.0.0-rc.5` uses `Schema.TaggedError`. Import the driver in a probe from inside the package before trusting a peer range; keep library code on a Context tag until the versions agree.
- **A Drizzle `PgColumn` is structurally a `SQLiteColumn`.**
  An overload taking SQLite columns first matched Postgres ones and returned SQLite check builders, which `pgTable` refused with a misleading error. List the Postgres overload first.
- **SQLite sorts the last term of an order that places nulls against its default.**
  Every keyset page wrote Postgres's placement (`asc nulls last`), so SQLite 3.53 added `USE TEMP B-TREE FOR LAST TERM OF ORDER BY` whatever the index, and every page sorted its id tie-break with tests green. A not-null column places no nulls; hold a page to its index with `EXPLAIN QUERY PLAN` (`remote-drizzle/test/orderPlan.test.ts`).
- **SQLite's change counters see less than a test assumes.**
  `total_changes()` counts the calling connection only; `PRAGMA data_version` sees other connections' commits but an `UPDATE` writing the values a row already holds moves neither. A mutation adding such a write survives: say so in the spec.
- **sql.js leaves foreign keys off; `node:sqlite` turns them on.**
  Chirp's `likes.post_id ... on delete cascade` held in every Node test while the sql.js demo would have left a deleted chirp's likes. A server relying on a reference sets `pragma foreign_keys = on` itself and tests on the demo's database too (`examples/chirp/test/wasm.browser.test.ts`).
- **Drizzle's SQLite transaction is synchronous.**
  `db.transaction(async tx => …)` over `node-sqlite` commits before the awaits run, so a failure after one rolls nothing back. Write the callback synchronously with `.run()`/`.all()`; Postgres takes an async one, and D1 only `batch`.
