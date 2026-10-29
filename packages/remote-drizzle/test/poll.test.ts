// @vitest-environment node
/**
 * `pollLive`: a tick reads only the rows a log names since the last one, none on
 * a quiet tick, and everything when the log cannot say; a list read live
 * (a `LiveQuery`, as `handlers` resolve one) has its rows join and leave by it. `rowChangeLog` keeps that log over real SQLite, and
 * `rowLog` reads it.
 */
import { DatabaseSync } from 'node:sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Fiber, Layer, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { Entity } from 'foldkit-entity'
import { RemoteServerError, type EntitySource, type LiveQuery } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import {
  bind,
  databaseLayer,
  pollLive,
  rowChangeLog,
  rowLog,
  type DrizzleDatabase,
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
    fields: [] as Array<ReadonlyArray<string>>,
    calls: 0,
    /** Rows whose next read fails. */
    failing: new Set<string>(),
  }
  const source: EntitySource<string, DrizzleDatabase> = {
    entity: 'Todo',
    read: ({ ids, fields }) =>
      Effect.suspend(() => {
        state.calls++
        state.reads.push(...ids)
        state.fields.push(fields)
        const failed = ids.filter(id => state.failing.delete(id))
        if (failed.length > 0) {
          return Effect.fail(new RemoteServerError({ message: `could not read ${failed}` }))
        }
        return Effect.succeed(
          ids.flatMap(id => {
            const title = state.rows[id]
            // `done` moves with the title, so a field read beside it changes too.
            return title === undefined ? [] : [{ id, values: { id, title, done: title.length } }]
          }),
        )
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

type PollOptions = NonNullable<Parameters<typeof pollLive<string, DrizzleDatabase>>[1]> & {
  /** The lists the subscriber reads live. */
  readonly queries?: ReadonlyArray<LiveQuery<DrizzleDatabase>>
}

/** The stream's events after each tick, with each write run before the tick it names. */
const ticks = (
  source: EntitySource<string, DrizzleDatabase>,
  options: PollOptions,
  writes: ReadonlyArray<() => void>,
  /** Each subscribed row, asked for `fields`, or for fields of its own. */
  ids: ReadonlyArray<string | readonly [string, ReadonlyArray<string>]> = ['t1'],
  fields: ReadonlyArray<string> = ['title'],
  /** Each patch's `changed`, in the order sent. */
  changed: Array<ReadonlyArray<string>> = [],
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const seen: Array<string> = []
      const { queries = [], ...poll } = options
      const fiber = yield* pollLive(source, { every: '1 second', ...poll })
        .subscribe({
          requirements: ids.map(row =>
            typeof row === 'string'
              ? { entity: 'Todo', id: row, fields: [...fields] }
              : { entity: 'Todo', id: row[0], fields: [...row[1]] },
          ),
          queries,
          after: 0,
          principal: 'ada',
        })
        .pipe(
          Stream.runForEach(change =>
            Effect.sync(() => {
              if (change._tag === 'EntityPatched') changed.push(change.changed)
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

  it('names the changed fields in the order the subscription asked them', async () => {
    const { source, write } = table({})
    const changed: Array<ReadonlyArray<string>> = []
    await ticks(source, {}, [write('t2', 'Eggs')], ['t2'], ['title', 'done'], changed)
    expect(changed).toEqual([['title', 'done']])
  })

  it('reads the subscribed rows in one read a tick, not one a row', async () => {
    const ids = ['t1', 't2', 't3', 't4', 't5']
    const { state, source, write } = table(Object.fromEntries(ids.map(id => [id, id])))
    const seen = await ticks(source, {}, [write('t3', 'Bread'), quiet], ids)
    expect(seen).toEqual(['EntityPatched'])
    // As the stream opened, then once a tick.
    expect(state.calls).toBe(3)
    expect(state.reads).toEqual([...ids, ...ids, ...ids])
  })
})

describe('pollLive reading as a read answers the principal', () => {
  /** The table's Source, declaring its fields and refusing everyone `done`. */
  const declared = (source: EntitySource<string, DrizzleDatabase>) => ({
    ...source,
    fields: new Set(['id', 'title', 'done']),
    authorize: (_: string, fields: ReadonlyArray<string>) =>
      fields.filter(field => field !== 'done'),
  })

  it('asks only for the declared fields the principal may read, and sends no other', async () => {
    const { state, source, write } = table()
    const changed: Array<ReadonlyArray<string>> = []
    await ticks(
      declared(source),
      {},
      [write('t1', 'Oat milk')],
      ['t1'],
      ['title', 'done', 'constructor'],
      changed,
    )
    expect(state.fields).toEqual([['title'], ['title']])
    expect(changed).toEqual([['title']])
  })

  it('reports no deletion of a row the principal may read nothing asked of', async () => {
    const { state, source, write } = table()
    const seen = await ticks(declared(source), {}, [write('t1', undefined)], ['t1'], ['done'])
    expect(seen).toEqual([])
    expect(state.calls).toBe(0)
  })

  it('reports no deletion of such a row read beside one it may read', async () => {
    const { source, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const seen = await ticks(
      declared(source),
      {},
      [write('t1', undefined)],
      [
        ['t1', ['done']],
        ['t2', ['title']],
      ],
    )
    expect(seen).toEqual([])
  })

  /** Every row of the table, listed live with `fields` selected. */
  const listing = (
    state: ReturnType<typeof table>['state'],
    fields: ReadonlyArray<string>,
  ): LiveQuery<DrizzleDatabase> => ({
    identity: 'AllTodos',
    select: { entity: 'Todo', fields: [...fields] },
    edges: Effect.sync(() =>
      Object.keys(state.rows).map(id => ({ entity: 'Todo', id, key: `Todo:${id}` })),
    ),
  })

  it('reads a listed row as it reads a subscribed one', async () => {
    const { state, source, write } = table()
    const changed: Array<ReadonlyArray<string>> = []
    const list = listing(state, ['title', 'done', 'constructor'])
    await ticks(declared(source), { queries: [list] }, [write('t1', 'Oat milk')], [], [], changed)
    expect(state.fields).toEqual([['title'], ['title']])
    expect(changed).toEqual([['title']])
  })

  it('reads no listed row the principal may read nothing selected of', async () => {
    const { state, source, write } = table()
    const list = listing(state, ['done'])
    const seen = await ticks(declared(source), { queries: [list] }, [write('t1', 'Oat')], [])
    // Opened as every list is, and nothing joins it.
    expect(seen).toEqual(['ConnectionInvalidate AllTodos'])
    expect(state.calls).toBe(0)
  })
})

describe('pollLive watching lists read live, with a row log', () => {
  const watching = (
    state: ReturnType<typeof table>['state'],
    identity = 'AllTodos',
    select: LiveQuery['select'] = { entity: 'Todo', fields: ['id', 'title', 'done'] },
  ) => {
    const windows = { reads: 0 }
    const list: LiveQuery<DrizzleDatabase> = {
      identity,
      select,
      edges: Effect.sync(() => {
        windows.reads++
        return Object.keys(state.rows).map(id => ({ entity: 'Todo', id, key: `Todo:${id}` }))
      }),
    }
    return { windows, list }
  }

  it('asks the database nothing on a quiet tick', async () => {
    const { state, source, log } = table()
    const { windows, list } = watching(state)
    await ticks(source, { changes: log, queries: [list] }, [quiet, quiet], [])
    // The window's rows, read once as the stream opened.
    expect(state.calls).toBe(1)
    expect(windows.reads).toBe(1)
  })

  it('invalidates a list once as the stream opens, beside the rows it subscribes', async () => {
    const { state, source, log, write } = table()
    const { list } = watching(state)
    const seen = await ticks(source, { changes: log, queries: [list] }, [write('t1', 'Oat')])
    expect(seen).toEqual(['ConnectionInvalidate AllTodos', 'EntityPatched'])
  })

  it('reads a listed row by what its read selects, less a paged relation', async () => {
    const { state, source, log } = table()
    const { list } = watching(state, 'AllTodos', {
      entity: 'Todo',
      fields: ['title', 'tags'],
      windows: { tags: { first: 3 } },
    })
    await ticks(source, { changes: log, queries: [list] }, [quiet], [])
    expect(state.fields).toEqual([['title']])
  })

  it('watches no list of another entity', async () => {
    const { state, source, log, write } = table()
    const other = watching(state, 'Tags', { entity: 'Tag', fields: ['id'] })
    const seen = await ticks(
      source,
      { changes: log, queries: [other.list] },
      [write('t2', 'Eggs')],
      [],
    )
    expect(seen).toEqual([])
    expect(other.windows.reads).toBe(0)
  })

  it('joins a row the log names and the principal can read, without reading the window', async () => {
    const { state, source, log, write } = table()
    const { windows, list } = watching(state)
    const seen = await ticks(source, { changes: log, queries: [list] }, [write('t2', 'Eggs')], [])
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
      { changes: log, queries: [list] },
      [write('t2', undefined)],
      [],
    )
    expect(seen).toEqual([
      'ConnectionInvalidate AllTodos',
      'EntityDeleted',
      'ConnectionRemove AllTodos',
    ])
    expect(windows.reads).toBe(1)
  })

  it('joins a row whose read failed once, on a later tick', async () => {
    const { state, source, log, write } = table()
    const { list } = watching(state)
    const failing = () => {
      write('t2', 'Eggs')()
      state.failing.add('t2')
    }
    const seen = await ticks(
      source,
      { changes: log, queries: [list] },
      [failing, quiet, quiet, quiet],
      [],
    )
    expect(seen).toEqual([
      'ConnectionInvalidate AllTodos',
      'EntityPatched',
      'ConnectionInsert AllTodos',
    ])
  })

  it('reads again for the list that failed, and repeats nothing to the one that did not', async () => {
    const { state, source, log, write } = table()
    const mine = watching(state, 'Mine')
    const theirs = watching(state, 'Theirs')
    const failing = () => {
      write('t2', 'Eggs')()
      // Mine reads first.
      state.failing.add('t2')
    }
    const seen = await ticks(
      source,
      { changes: log, queries: [mine.list, theirs.list] },
      [failing, quiet, quiet],
      [],
    )
    expect(seen).toEqual([
      'ConnectionInvalidate Mine',
      'ConnectionInvalidate Theirs',
      'EntityPatched',
      'ConnectionInsert Theirs',
      'EntityPatched',
      'ConnectionInsert Mine',
    ])
  })

  it('patches a listed row the log names, and joins nothing', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const { list } = watching(state)
    const seen = await ticks(source, { changes: log, queries: [list] }, [write('t2', 'Bread')], [])
    expect(seen).toEqual(['ConnectionInvalidate AllTodos', 'EntityPatched'])
  })

  it('diffs each list a stream watches', async () => {
    const { state, source, log, write } = table()
    const mine = watching(state, 'Mine')
    const theirs = watching(state, 'Theirs')
    const seen = await ticks(
      source,
      { changes: log, queries: [mine.list, theirs.list] },
      [write('t2', 'Eggs')],
      [],
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

  it('says it no longer reaches back when the log is trimmed while it is read', async () => {
    const { sqlite, run, log } = open(2)
    for (const name of ['one', 'two']) {
      sqlite.exec(`insert into item_rows values ('${name}', '${name}')`)
    }
    // Five writes land just before the entries are selected, trimming three and four.
    const prepare = sqlite.prepare.bind(sqlite)
    let pending = ['three', 'four', 'five', 'six', 'seven']
    sqlite.prepare = (sql: string) => {
      if (sql.includes('order by')) {
        for (const name of pending) {
          sqlite.exec(`insert into item_rows values ('${name}', '${name}')`)
        }
        pending = []
      }
      return prepare(sql)
    }
    expect(await run(log.since(2))).toEqual({ through: 7, ids: Option.none() })
    expect(pending).toEqual([])
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
