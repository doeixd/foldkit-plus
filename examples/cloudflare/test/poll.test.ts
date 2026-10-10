// @vitest-environment node
/**
 * `pollLive` with a change count: a tick whose count has not moved reads no
 * row, and one whose count moved reads and reports what changed. The D1
 * triggers that keep the count are exercised end to end in `cloudflare.test.ts`.
 */
import { Effect, Fiber, Layer, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { databaseLayer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServerError, type EntitySource } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { pollLive } from '../src/schema.js'

/** A table of one row, its reads counted, and a write count kept as triggers would. */
const table = () => {
  const state = { title: 'Milk', count: 0, reads: 0 }
  const source: EntitySource<string, DrizzleDatabase> = {
    entity: 'Todo',
    read: ({ ids }) =>
      Effect.sync(() => {
        state.reads++
        return ids.map(id => ({ id, values: { id, title: state.title } }))
      }),
  }
  return { state, source }
}

/** The stream's events after each tick, with `write` run before the tick it names. */
const ticks = (
  source: EntitySource<string, DrizzleDatabase>,
  changes: Effect.Effect<number, RemoteServerError, DrizzleDatabase> | undefined,
  writes: ReadonlyArray<() => void>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const seen: Array<string> = []
      const live = pollLive(source, { interval: '1 second', changes })
      const fiber = yield* live
        .subscribe({
          requirements: [{ entity: 'Todo', id: 't1', fields: ['title'] }],
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
      // The source and the count here are in memory: the database is never asked.
      Effect.provide(Layer.merge(TestClock.layer(), databaseLayer({}))),
    ),
  )

describe('pollLive with a change count', () => {
  it('reads no row on a tick whose count has not moved', async () => {
    const { state, source } = table()
    const changes = Effect.sync(() => state.count)
    const quiet = () => {}
    await ticks(source, changes, [quiet, quiet, quiet])
    // The baseline only.
    expect(state.reads).toBe(1)
  })

  it('reads and reports a change once the count moves', async () => {
    const { state, source } = table()
    const changes = Effect.sync(() => state.count)
    const seen = await ticks(source, changes, [
      () => {},
      () => {
        state.title = 'Oat milk'
        state.count++
      },
      () => {},
    ])
    expect(seen).toEqual(['EntityPatched'])
    expect(state.reads).toBe(2)
  })

  it('reads every tick when the count cannot be read', async () => {
    const { state, source } = table()
    const broken = Effect.fail(new RemoteServerError({ message: 'no such table' }))
    await ticks(source, broken, [() => {}, () => {}])
    expect(state.reads).toBe(3)
  })

  it('reads every tick without a count', async () => {
    const { state, source } = table()
    await ticks(source, undefined, [() => {}, () => {}])
    expect(state.reads).toBe(3)
  })
})
