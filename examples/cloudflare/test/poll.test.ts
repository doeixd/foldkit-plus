// @vitest-environment node
/**
 * `pollLive` with a row log: a tick reads only the rows the log names since
 * the last one, none on a quiet tick, and everything when the log cannot say.
 * The D1 triggers that keep the log are exercised end to end in
 * `cloudflare.test.ts`.
 */
import { Effect, Fiber, Layer, Option, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { databaseLayer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServerError, type EntitySource } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { pollLive, type RowLog } from '../src/schema.js'

/**
 * A table whose reads are counted by row, and a log of the rows each write
 * touched, kept as the triggers would. Entries before `trimmed` are gone.
 */
const table = (rows: Record<string, string> = { t1: 'Milk' }) => {
  const state = {
    rows: { ...rows },
    log: [] as Array<string>,
    trimmed: 0,
    reads: [] as string[],
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

/** The stream's events after each tick, with each write run before the tick it names. */
const ticks = (
  source: EntitySource<string, DrizzleDatabase>,
  options: Parameters<typeof pollLive>[1],
  writes: ReadonlyArray<() => void>,
  id = 't1',
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const seen: Array<string> = []
      const fiber = yield* pollLive(source, { interval: '1 second', ...options })
        .subscribe({
          requirements: [{ entity: 'Todo', id, fields: ['title'] }],
          after: 0,
          principal: 'ada',
        })
        .pipe(
          Stream.runForEach(change => Effect.sync(() => void seen.push(change._tag))),
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

describe('pollLive watching a list, with a row log', () => {
  const watched = (state: ReturnType<typeof table>['state']) => {
    const windows = { reads: 0 }
    return {
      windows,
      list: {
        identity: 'AllTodos',
        watchId: 'watch',
        edges: () =>
          Effect.sync(() => {
            windows.reads++
            return Object.keys(state.rows).map(id => ({ entity: 'Todo', id, key: `Todo:${id}` }))
          }),
      },
    }
  }

  it('asks the database nothing on a quiet tick', async () => {
    const { state, source, log } = table()
    const { windows, list } = watched(state)
    await ticks(source, { changes: log, list }, [quiet, quiet], 'watch')
    // The watch id and the window's rows, read once as the stream opened.
    expect(state.calls).toBe(2)
    expect(windows.reads).toBe(1)
  })

  it('joins a row the log names and the principal can read, without reading the window', async () => {
    const { state, source, log, write } = table()
    const { windows, list } = watched(state)
    const seen = await ticks(source, { changes: log, list }, [write('t2', 'Eggs')], 'watch')
    expect(seen).toEqual(['ConnectionInvalidate', 'EntityPatched', 'ConnectionInsert'])
    // The window once, when the stream opened; then only the logged row.
    expect(windows.reads).toBe(1)
    expect(state.reads.filter(id => id === 't2')).toEqual(['t2'])
  })

  it('lets a listed row go when the log names it and it is gone', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const { windows, list } = watched(state)
    const seen = await ticks(source, { changes: log, list }, [write('t2', undefined)], 'watch')
    expect(seen).toEqual(['ConnectionInvalidate', 'EntityDeleted', 'ConnectionRemove'])
    expect(windows.reads).toBe(1)
  })

  it('patches a listed row the log names, and joins nothing', async () => {
    const { state, source, log, write } = table({ t1: 'Milk', t2: 'Eggs' })
    const { list } = watched(state)
    const seen = await ticks(source, { changes: log, list }, [write('t2', 'Bread')], 'watch')
    expect(seen).toEqual(['ConnectionInvalidate', 'EntityPatched'])
  })
})
