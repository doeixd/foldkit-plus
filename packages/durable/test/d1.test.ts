// @vitest-environment node
/**
 * The journal over Cloudflare D1, through `@effect/sql-d1` and a miniflare
 * binding: the same contract as over `node:sqlite`, without transactions,
 * `PRAGMA user_version`, or `VACUUM`. Miniflare's binding rejects what
 * production D1 rejects, so anything the journal still emits fails loudly
 * here instead of passing against a permissive double.
 */
import * as D1Client from '@effect/sql-d1/D1Client'
import { Effect, Layer, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Journal } from '../src/core.js'
import {
  actorId,
  cursor,
  documentId,
  makeJournal,
  opId,
  sequence,
  type Journal as JournalShape,
} from '../src/index.js'

const Note = Schema.Struct({ opId: Schema.String, title: Schema.String })
type Note = typeof Note.Type

type D1 = Awaited<ReturnType<Miniflare['getD1Database']>>

let mf: Miniflare
let db: D1

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
  })
  db = await mf.getD1Database('DB')
}, 60_000)

afterAll(async () => {
  await mf.dispose()
})

/** Drops the schema, so the next open re-migrates from nothing. */
beforeEach(async () => {
  await db.batch([
    db.prepare('DROP TABLE IF EXISTS operations'),
    db.prepare('DROP TABLE IF EXISTS documents'),
    db.prepare('DROP TABLE IF EXISTS effects'),
    db.prepare('DROP TABLE IF EXISTS epochs'),
    db.prepare('DROP TABLE IF EXISTS replicas'),
    db.prepare('DROP TABLE IF EXISTS durable_meta'),
  ])
})

/** Opens a journal, creating the schema. */
const openJournal = async (options?: {
  readonly replicaId?: (operation: Note) => string
}): Promise<JournalShape<Note, ReadonlyArray<Note>, string>> => {
  const Notes = Journal.define<Note, ReadonlyArray<Note>, string>('test/NotesD1')
  const live = Notes.layer({
    operation: Note,
    snapshot: Schema.Array(Note),
    empty: () => [],
    reduce: (state, value) => [...state, value],
    opId: value => opId(value.opId),
    actorId: principal => actorId(principal),
    d1: true,
    ...options,
  }).pipe(Layer.provide(D1Client.layer({ db })))
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* Notes.tag
    }).pipe(Effect.provide(live)),
  )
}

const key = documentId('d')
const note = (n: number, title = `note ${n}`): Note => ({ opId: `n:${n}`, title })

/**
 * Runs `inject` once, just before the first statement whose text contains
 * `match` while `armed` holds, then delegates everything to the wrapped
 * client: a deterministic concurrent writer landing inside one journal call.
 * Arming matters because the same statement can run earlier for another
 * reason (an append's materialize reads what a load's rereads). The casts
 * are confined here, as a Proxy cannot carry the service's precise type.
 */
const interceptOnce = (
  real: SqlClient.SqlClient,
  match: string,
  armed: () => boolean,
  inject: () => Promise<unknown>,
): SqlClient.SqlClient => {
  let fired = false
  const call = (target: object, args: ReadonlyArray<unknown>): unknown => {
    if (!fired && armed() && String(args[0]).includes(match)) {
      fired = true
      return Effect.flatMap(
        Effect.tryPromise(() => inject()),
        () =>
          Reflect.apply(
            target as (...call: ReadonlyArray<unknown>) => Effect.Effect<unknown>,
            real,
            args,
          ),
      )
    }
    return Reflect.apply(
      target as (...call: ReadonlyArray<unknown>) => Effect.Effect<unknown>,
      real,
      args,
    )
  }
  return new Proxy(real, {
    apply: (target, _thisArg, args) => call(target, args as ReadonlyArray<unknown>),
  }) as SqlClient.SqlClient
}

/** Opens append and load journals over one instrumented client. */
const openInstrumentedPair = async (
  match: string,
  armed: () => boolean,
  inject: () => Promise<unknown>,
  snapshotEvery = 1,
): Promise<{
  readonly appendJournal: JournalShape<Note, ReadonlyArray<Note>, string>
  readonly loadJournal: JournalShape<Note, ReadonlyArray<Note>, string>
}> => {
  const Notes = (name: string) => Journal.define<Note, ReadonlyArray<Note>, string>(name)
  const instrumented = Layer.effect(
    SqlClient.SqlClient,
    Effect.map(SqlClient.SqlClient, real => interceptOnce(real, match, armed, inject)),
  ).pipe(Layer.provide(D1Client.layer({ db })))
  const open = (name: string) => {
    const Defined = Notes(name)
    const live = Defined.layer({
      operation: Note,
      snapshot: Schema.Array(Note),
      empty: () => [],
      reduce: (state, value) => [...state, value],
      opId: value => opId(value.opId),
      actorId: principal => actorId(principal),
      snapshotEvery,
      d1: true,
    }).pipe(Layer.provide(instrumented))
    return Effect.runPromise(
      Effect.gen(function* () {
        return yield* Defined.tag
      }).pipe(Effect.provide(live)),
    )
  }
  // The load journal opens cold: its first load reads the database rather
  // than the append journal's remembered state.
  return { appendJournal: await open('test/NotesD1A'), loadJournal: await open('test/NotesD1B') }
}

describe('durable over D1', () => {
  it('migrates a fresh database and versions it in durable_meta', async () => {
    const journal = await openJournal()
    const { snapshot, cursor: at } = await Effect.runPromise(journal.load(key))
    expect(snapshot).toEqual([])
    expect(at).toBe(cursor(0))
    const meta = await db
      .prepare("SELECT value FROM durable_meta WHERE key = 'schema_version'")
      .all()
    expect(meta.results).toEqual([{ value: '6' }])
  }, 30_000)

  it('appends, loads, and reads committed operations', async () => {
    const journal = await openJournal()
    const first = await Effect.runPromise(journal.append(key, note(1), 'ada'))
    const second = await Effect.runPromise(journal.append(key, note(2), 'ada'))
    expect(first).toMatchObject({ _tag: 'Committed', committed: { sequence: 1 } })
    expect(second).toMatchObject({ _tag: 'Committed', committed: { sequence: 2 } })
    const { snapshot, cursor: at } = await Effect.runPromise(journal.load(key))
    expect(snapshot).toEqual([note(1), note(2)])
    expect(at).toBe(cursor(2))
    const since = await Effect.runPromise(journal.read(key, cursor(1)))
    expect(since.map(entry => entry.operation)).toEqual([note(2)])
  }, 30_000)

  it('answers a retransmission idempotently and refuses a reused id', async () => {
    const journal = await openJournal()
    const committed = await Effect.runPromise(journal.append(key, note(1), 'ada'))
    const repeated = await Effect.runPromise(journal.append(key, note(1), 'ada'))
    expect(repeated).toMatchObject({ _tag: 'Committed', committed: { sequence: 1 } })
    expect(committed).toEqual(repeated)
    const conflict = await Effect.runPromise(
      Effect.flip(journal.append(key, note(1, 'changed'), 'ada')),
    )
    expect(conflict._tag).toBe('IdentityConflictError')
  }, 30_000)

  it('commits concurrent appends with gap-free sequences', async () => {
    const journal = await openJournal()
    const results = await Effect.runPromise(
      Effect.all(
        Array.from({ length: 12 }, (_, index) => journal.append(key, note(index + 1), 'ada')),
        { concurrency: 'unbounded' },
      ),
    )
    expect(
      results
        .map(result => (result._tag === 'Committed' ? Number(result.committed.sequence) : -1))
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const { snapshot, cursor: at } = await Effect.runPromise(journal.load(key))
    expect(at).toBe(cursor(12))
    const byNumber = (entry: Note): number => Number(entry.opId.slice(2))
    expect([...snapshot].sort((a, b) => byNumber(a) - byNumber(b))).toEqual(
      Array.from({ length: 12 }, (_, index) => note(index + 1)),
    )
  }, 30_000)

  it('compacts, floors, resets, and vacuums', async () => {
    const journal = await openJournal()
    await Effect.runPromise(journal.append(key, note(1), 'ada'))
    await Effect.runPromise(journal.append(key, note(2), 'ada'))
    await Effect.runPromise(journal.append(key, note(3), 'ada'))
    await Effect.runPromise(journal.compact(key, sequence(2)))
    expect(await Effect.runPromise(journal.floor(key))).toBe(2)
    const compacted = await Effect.runPromise(Effect.flip(journal.read(key, cursor(0))))
    expect(compacted._tag).toBe('CompactedCursorError')
    const tail = await Effect.runPromise(journal.read(key, cursor(2)))
    expect(tail.map(entry => entry.operation)).toEqual([note(3)])
    await Effect.runPromise(journal.vacuum())
    await Effect.runPromise(journal.reset(key))
    const { snapshot, cursor: at } = await Effect.runPromise(journal.load(key))
    expect(snapshot).toEqual([])
    expect(at).toBe(cursor(0))
  }, 30_000)

  it('hands out one epoch per document', async () => {
    const journal = await openJournal()
    const first = await Effect.runPromise(journal.epoch(key))
    const again = await Effect.runPromise(journal.epoch(key))
    expect(again).toBe(first)
  }, 30_000)

  it('binds replicas without a transaction', async () => {
    const journal = await openJournal({ replicaId: operation => operation.opId.split(':')[0]! })
    await Effect.runPromise(journal.append(key, { opId: 'tab-1:1', title: 'a' }, 'ada'))
    const refused = await Effect.runPromise(
      Effect.flip(journal.append(key, { opId: 'tab-1:2', title: 'b' }, 'grace')),
    )
    expect(refused._tag).toBe('OperationRejectedError')
  }, 30_000)

  it('refuses a schema newer than the build understands', async () => {
    await openJournal()
    await db.prepare("UPDATE durable_meta SET value = '99' WHERE key = 'schema_version'").run()
    const Notes = Journal.define<Note, ReadonlyArray<Note>, string>('test/NotesD1Version')
    const live = Notes.layer({
      operation: Note,
      snapshot: Schema.Array(Note),
      empty: () => [],
      reduce: (state, value) => [...state, value],
      opId: value => opId(value.opId),
      actorId: principal => actorId(principal),
      d1: true,
    }).pipe(Layer.provide(D1Client.layer({ db })))
    const failed = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          return yield* Notes.tag
        }).pipe(Effect.provide(live)),
      ),
    )
    expect(failed._tag).toBe('UnsupportedJournalVersionError')
  }, 30_000)

  it('re-migrates after a crash that left an old version on a current schema', async () => {
    const journal = await openJournal()
    await Effect.runPromise(journal.append(key, note(1), 'ada'))
    // A crash between the schema writes and the version write: the schema
    // is current, but the version says otherwise.
    await db.prepare("UPDATE durable_meta SET value = '1' WHERE key = 'schema_version'").run()
    const reopened = await openJournal()
    const meta = await db
      .prepare("SELECT value FROM durable_meta WHERE key = 'schema_version'")
      .all()
    expect(meta.results).toEqual([{ value: '6' }])
    const { snapshot, cursor: at } = await Effect.runPromise(reopened.load(key))
    expect(snapshot).toEqual([note(1)])
    expect(at).toBe(cursor(1))
  }, 30_000)

  it('refuses a tail a compaction cut short mid-read', async () => {
    const { appendJournal: journal } = await openInstrumentedPair(
      'SELECT actor_id, op_id, sequence, input FROM operations',
      () => true,
      () =>
        db.batch([
          db.prepare("UPDATE operations SET input = NULL WHERE key = 'd'"),
          db.prepare("UPDATE documents SET compact_before = 2 WHERE key = 'd'"),
        ]),
    )
    await Effect.runPromise(journal.append(key, note(1), 'ada'))
    await Effect.runPromise(journal.append(key, note(2), 'ada'))
    await Effect.runPromise(journal.append(key, note(3), 'ada'))
    // The floor was 0 when checked; the injected compaction moved it to 2
    // before the page ran. Without the re-check this returns [] as success.
    const compacted = await Effect.runPromise(Effect.flip(journal.read(key, cursor(0))))
    expect(compacted).toMatchObject({ _tag: 'CompactedCursorError', floor: 2 })
    expect(await Effect.runPromise(journal.floor(key))).toBe(2)
  }, 30_000)

  it('loads the snapshot its cursor names when a commit lands mid-load', async () => {
    let armed = false
    // The operations page, not the cursor read: the injection must land
    // after the cursor is read, or the read itself sees the injected state.
    // The load journal opens cold so the load rereads rather than reusing
    // what the append remembered, and the snapshot lags (snapshotEvery 2)
    // so there is a page to read at all.
    const { appendJournal, loadJournal } = await openInstrumentedPair(
      'SELECT input FROM operations WHERE key',
      () => armed,
      () =>
        db.batch([
          db.prepare(
            `INSERT INTO operations (key, op_id, sequence, actor_id, input, payload_hash, replica_id)
             VALUES ('d', 'n:99', 2, 'ada', '{"opId":"n:99","title":"injected"}', 'hash', NULL)`,
          ),
          db.prepare("UPDATE documents SET cursor = 2 WHERE key = 'd'"),
        ]),
      2,
    )
    await Effect.runPromise(appendJournal.append(key, note(1), 'ada'))
    armed = true
    // The cursor and snapshot were read; the injected commit moved the
    // cursor before the operations were read. The snapshot holds the prefix
    // its cursor names, not the commit that landed between. Without the
    // bound it replays the injected operation a load too early.
    const { snapshot, cursor: at } = await Effect.runPromise(loadJournal.load(key))
    expect(snapshot).toEqual([note(1)])
    expect(at).toBe(cursor(1))
    // The injected commit really landed: the snapshot excludes it by cursor.
    const ops = await db
      .prepare("SELECT op_id, sequence FROM operations WHERE key = 'd' ORDER BY sequence")
      .all()
    expect(ops.results).toEqual([
      { op_id: 'n:1', sequence: 1 },
      { op_id: 'n:99', sequence: 2 },
    ])
  }, 30_000)

  it('refuses d1 over a file: it is for a D1 SqlClient through core', async () => {
    const refused = await Effect.runPromise(
      Effect.scoped(
        Effect.flip(
          makeJournal<Note, ReadonlyArray<Note>, string>({
            file: ':memory:',
            operation: Note,
            snapshot: Schema.Array(Note),
            empty: () => [],
            reduce: (state, value) => [...state, value],
            opId: value => opId(value.opId),
            actorId: principal => actorId(principal),
            d1: true,
          }),
        ),
      ),
    )
    expect(refused._tag).toBe('JournalError')
    expect(refused.message).toMatch(/D1 SqlClient/)
  }, 30_000)
})
