// @vitest-environment node
/**
 * `pollLive`: a tick reads only the rows a log names since the last one, none on
 * a quiet tick, and everything when the log cannot say; a watched list's rows
 * join and leave by it. `rowChangeLog` keeps that log over real SQLite, and
 * `rowLog` reads it.
 */
import { DatabaseSync } from 'node:sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Fiber, Layer, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { Entity } from 'foldkit-entity'
import { RemoteServerError, type EntitySource } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import {
  bind,
  databaseLayer,
  pollLive,
  rowChangeLog,
  rowLog,
  type DrizzleDatabase,
  type ListWatch,
  type RowLog,
} from '../src/index.js'

/**
 * A table whose reads are counted by row, and a log of the rows each write
 * touched, kept as the triggers would. Entries before `trimmed` are gone.
 */
const table = (rows: Record<string, string> = { t1: 'Milk' }) => {
  const state = {
    rows: { ...rows },
    log: [] as Array<string>,
    trimmed: 0,
    reads: [] as Array<string>,
    calls: 0,
  }
  const source: EntitySource<string, DrizzleDatabase> = {
    entity: 'Todo',
    read: ({ ids }) =>
      Effect.sync(() => {
        state.calls++
        state.reads.push(...ids)
        return ids.flatMap(id => {
          const title = state.rows[id]
          return title === undefined ? [] : [{ id, values: { id, title, done: 0 } }]
        })
      }),
  }
  const log: RowLog = {
    head: Effect.sync(() => state.log.length),
    since: after =>
      Effect.sync(() => ({
        through: state.log.length,
        ids: after < state.trimmed ? Option.none() : Option.some(state.log.slice(after)),
      })),
  }
  /** A write of `id`: its title, or its deletion. */
  const write = (id: string, title: string | undefined) => () => {
    if (title === undefined) delete state.rows[id]
    else state.rows[id] = title
    state.log.push(id)
  }
  return { state, source, log, write }
}

type PollOptions = NonNullable<Parameters<typeof pollLive<string, DrizzleDatabase>>[1]>

/** The stream's events after each tick, with each write run before the tick it names. */
const ticks = (
  source: EntitySource<string, DrizzleDatabase>,
  options: PollOptions,
  writes: ReadonlyArray<() => void>,
  ids: ReadonlyArray<string> = ['t1'],
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const seen: Array<string> = []
      const fiber = yield* pollLive(source, { every: '1 second', ...options })
        .subscribe({
          requirements: ids.map(id => ({ entity: 'Todo', id, fields: ['title'] })),
          after: 0,
          principal: 'ada',
        })
        .pipe(
          Stream.runForEach(change =>
            Effect.sync(() => {
              seen.push(
                'connection' in change ? `${change._tag} ${change.connection}` : change._tag,
              )
            }),
          ),
          Effect.forkChild,
        )
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      for (const write of writes) {
        write()
        yield* TestClock.adjust('1 second')
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      }
      yield* Fiber.interrupt(fiber)
      return seen
    }).pipe(
      // The source and the log here are in memory: the database is never asked.
      Effect.provide(Layer.merge(TestClock.layer(), databaseLayer({}))),
    ),
  )

const quiet = () => {}

describe('pollLive with a row log', () => {
  it('reads no row on a quiet tick', async () => {
    const { state, source, log } = table()
    await ticks(source, { changes: log }, [quiet, quiet, quiet])
    // The baseline only.
    expect(state.reads).toEqual(['t1'])
  })

  it('reads and reports a row the log names', async () => {
    const { state, source, log, write } = table()
    const seen = await ticks(source, { changes: log }, [quiet, write('t1', 'Oat milk'), quiet])
    expect(seen).toEqual(['EntityPatched'])
    expect(state.reads).toEqual(['t1', 't1'])
  })

  it('reads nothing of a row the log does not name', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const seen = await ticks(source, { changes: log }, [write('t2', 'Bread')])
    expect(seen).toEqual([])
    expect(state.reads).toEqual(['t1'])
  })

  it('reads every row when the log no longer reaches back', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const trimmed = () => {
      write('t2', 'Bread')()
      state.trimmed = state.log.length
    }
    await ticks(source, { changes: log }, [trimmed])
    expect(state.reads).toEqual(['t1', 't1'])
  })

  it('reads every tick when the log cannot be read', async () => {
    const { state, source } = table()
    const broken: RowLog = {
      head: Effect.fail(new RemoteServerError({ message: 'no such table' })),
      since: () => Effect.fail(new RemoteServerError({ message: 'no such table' })),
    }
    await ticks(source, { changes: broken }, [quiet, quiet])
    expect(state.reads).toEqual(['t1', 't1', 't1'])
  })

  it('reads every tick without a log', async () => {
    const { state, source } = table()
    await ticks(source, {}, [quiet, quiet])
    expect(state.reads).toEqual(['t1', 't1', 't1'])
  })
})

describe('pollLive watching lists, with a row log', () => {
  const watching = (
    state: ReturnType<typeof table>['state'],
    identity = 'AllTodos',
    watchId = 'watch',
  ) => {
    const windows = { reads: 0 }
    const list: ListWatch<string> = {
      identity,
      watchId,
      fields: ['id', 'title', 'done'],
      edges: () =>
        Effect.sync(() => {
          windows.reads++
          return Object.keys(state.rows).map(id => ({ entity: 'Todo', id, key: `Todo:${id}` }))
        }),
    }
    return { windows, list }
  }

  it('asks the database nothing on a quiet tick', async () => {
    const { state, source, log } = table()
    const { windows, list } = watching(state)
    await ticks(source, { changes: log, lists: [list] }, [quiet, quiet], ['watch'])
    // The watch id and the window's rows, read once as the stream opened.
    expect(state.calls).toBe(2)
    expect(windows.reads).toBe(1)
  })

  it('joins a row the log names and the principal can read, without reading the window', async () => {
    const { state, source, log, write } = table()
    const { windows, list } = watching(state)
    const seen = await ticks(
      source,
      { changes: log, lists: [list] },
      [write('t2', 'Eggs')],
      ['watch'],
    )
    expect(seen).toEqual([
      'ConnectionInvalidate AllTodos',
      'EntityPatched',
      'ConnectionInsert AllTodos',
    ])
    // The window once, when the stream opened; then only the logged row.
    expect(windows.reads).toBe(1)
    expect(state.reads.filter(id => id === 't2')).toEqual(['t2'])
  })

  it('lets a listed row go when the log names it and it is gone', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const { windows, list } = watching(state)
    const seen = await ticks(
      source,
      { changes: log, lists: [list] },
      [write('t2', undefined)],
      ['watch'],
    )
    expect(seen).toEqual([
      'ConnectionInvalidate AllTodos',
      'EntityDeleted',
      'ConnectionRemove AllTodos',
    ])
    expect(windows.reads).toBe(1)
  })

  it('patches a listed row the log names, and joins nothing', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const { list } = watching(state)
    const seen = await ticks(
      source,
      { changes: log, lists: [list] },
      [write('t2', 'Bread')],
      ['watch'],
    )
    expect(seen).toEqual(['ConnectionInvalidate AllTodos', 'EntityPatched'])
  })

  it('polls only the lists a stream watches', async () => {
    const { state, source, log, write } = table()
    const mine = watching(state, 'Mine', 'watch-mine')
    const theirs = watching(state, 'Theirs', 'watch-theirs')
    const seen = await ticks(
      source,
      { changes: log, lists: [mine.list, theirs.list] },
      [write('t2', 'Eggs')],
      ['watch-mine'],
    )
    expect(seen).toEqual(['ConnectionInvalidate Mine', 'EntityPatched', 'ConnectionInsert Mine'])
    expect(theirs.windows.reads).toBe(0)
  })

  it('diffs each list a stream watches', async () => {
    const { state, source, log, write } = table()
    const mine = watching(state, 'Mine', 'watch-mine')
    const theirs = watching(state, 'Theirs', 'watch-theirs')
    const seen = await ticks(
      source,
      { changes: log, lists: [mine.list, theirs.list] },
      [write('t2', 'Eggs')],
      ['watch-mine', 'watch-theirs'],
    )
    // The row is patched once, then joins each list.
    expect(seen).toEqual([
      'ConnectionInvalidate Mine',
      'ConnectionInvalidate Theirs',
      'EntityPatched',
      'ConnectionInsert Mine',
      'ConnectionInsert Theirs',
    ])
  })
})

describe('rowChangeLog and rowLog over SQLite', () => {
  const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
  // The table's and the id column's SQL names differ from the Entity's.
  const items = sqliteTable('item_rows', {
    id: text('item_id').primaryKey(),
    name: text('name').notNull(),
  })
  const Db = bind({ Item }, { Item: { table: items } })

  const open = (keep?: number) => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('create table item_rows (item_id text primary key, name text not null)')
    for (const statement of rowChangeLog(Db.Item, keep === undefined ? {} : { keep })) {
      sqlite.exec(statement)
    }
    const layer = databaseLayer(drizzle({ client: sqlite }))
    const run = <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) =>
      Effect.runPromise(effect.pipe(Effect.provide(layer)))
    return { sqlite, run, log: rowLog(Db.Item) }
  }

  it('logs each insert, update and delete, in order, for rowLog to read', async () => {
    const { sqlite, run, log } = open()
    expect(await run(log.head)).toBe(0)
    sqlite.exec("insert into item_rows values ('a', 'Anchor')")
    sqlite.exec("insert into item_rows values ('b', 'Bolt')")
    sqlite.exec("update item_rows set name = 'Big anchor' where item_id = 'a'")
    sqlite.exec("delete from item_rows where item_id = 'b'")
    expect(await run(log.head)).toBe(4)
    expect(await run(log.since(0))).toEqual({
      through: 4,
      ids: Option.some(['a', 'b', 'a', 'b']),
    })
    expect(await run(log.since(2))).toEqual({ through: 4, ids: Option.some(['a', 'b']) })
    expect(await run(log.since(4))).toEqual({ through: 4, ids: Option.some([]) })
  })

  it('keeps the last entries, and says it no longer reaches back past them', async () => {
    const { sqlite, run, log } = open(2)
    for (const name of ['one', 'two', 'three', 'four']) {
      sqlite.exec(`insert into item_rows values ('${name}', '${name}')`)
    }
    expect(await run(log.since(2))).toEqual({ through: 4, ids: Option.some(['three', 'four']) })
    expect(await run(log.since(0))).toEqual({ through: 4, ids: Option.none() })
  })

  it('runs again over a database that has it', () => {
    const { sqlite } = open()
    for (const statement of rowChangeLog(Db.Item)) sqlite.exec(statement)
  })

  it('fails to read a log that is not there, rather than saying nothing changed', async () => {
    const sqlite = new DatabaseSync(':memory:')
    const read = await Effect.runPromise(
      Effect.result(rowLog(Db.Item).head).pipe(
        Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
      ),
    )
    expect(read).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'The row log could not be read' },
    })
  })

  it('refuses a Postgres table, and a keep that is no count', () => {
    const PgDb = bind(
      { Item },
      {
        Item: {
          table: pgTable('items', {
            id: pgText('id').primaryKey(),
            name: pgText('name').notNull(),
          }),
        },
      },
    )
    expect(() => rowChangeLog(PgDb.Item)).toThrow("Item's table is not SQLite's")
    expect(() => rowChangeLog(Db.Item, { keep: 0 })).toThrow('keep must be a whole number above 0')
  })
})
