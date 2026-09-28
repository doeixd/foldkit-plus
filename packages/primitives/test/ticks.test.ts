/**
 * The `ticks` entry on TestClock time, run the way the runtime runs an entry
 * (foldkit 0.163 `runtime/subscriptionFibers.js`): dependencies read from
 * every Model, the stream restarted when they change under the entry's
 * equivalence, and `readDependencies` answering the latest.
 */
import { Effect, Fiber, Option, Queue, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import { ticks } from '../src/time/index.js'

type Model = { readonly intervalMs: Option.Option<number>; readonly other: number }

const entry = ticks({ intervalMs: (model: Model) => model.intervalMs, onTick: at => at })

const every = (intervalMs: number, other = 0): Model => ({
  intervalMs: Option.some(intervalMs),
  other,
})
const stopped: Model = { intervalMs: Option.none(), other: 0 }

const settle = Effect.gen(function* () {
  for (let i = 0; i < 100; i++) yield* Effect.yieldNow
})

/** The tick times up to `until`, starting from `initial` and moving to each Model at its time. */
const tickTimes = (
  initial: Model,
  changes: ReadonlyArray<readonly [at: number, model: Model]>,
  until: number,
): Promise<ReadonlyArray<number>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const models = yield* Queue.unbounded<Model>()
      let latest = entry.modelToDependencies(initial)
      const emitted: Array<number> = []
      const fiber = yield* Effect.forkChild(
        Stream.concat(Stream.make(initial), Stream.fromQueue(models)).pipe(
          Stream.map(model => (latest = entry.modelToDependencies(model))),
          Stream.changesWith(
            entry.keepAliveEquivalence ?? Schema.toEquivalence(entry.dependenciesSchema),
          ),
          Stream.switchMap(dependencies => entry.dependenciesToStream(dependencies, () => latest)),
          Stream.runForEach(at => Effect.sync(() => void emitted.push(at))),
        ),
      )
      yield* settle
      let now = 0
      for (const [at, model] of changes) {
        yield* TestClock.adjust(at - now)
        now = at
        yield* Queue.offer(models, model)
        yield* settle
      }
      yield* TestClock.adjust(until - now)
      yield* settle
      yield* Fiber.interrupt(fiber)
      return emitted
    }).pipe(Effect.provide(TestClock.layer())),
  )

describe('ticks', () => {
  it('ticks one interval after starting, then every interval, with its time', async () => {
    expect(await tickTimes(every(1000), [], 999)).toEqual([])
    expect(await tickTimes(every(1000), [], 3000)).toEqual([1000, 2000, 3000])
  })

  it('is silent while the interval is None', async () => {
    expect(await tickTimes(stopped, [], 10_000)).toEqual([])
  })

  it('applies a new interval from the next tick, without restarting', async () => {
    // A restart at 500 would tick at 800; the running wait finishes at 1000.
    expect(await tickTimes(every(1000), [[500, every(300)]], 1600)).toEqual([1000, 1300, 1600])
  })

  it('keeps ticking through a Model change that leaves the interval alone', async () => {
    expect(await tickTimes(every(1000), [[500, every(1000, 1)]], 2000)).toEqual([1000, 2000])
  })

  it('stops on None and starts afresh on Some', async () => {
    expect(
      await tickTimes(
        every(1000),
        [
          [1500, stopped],
          [2000, every(1000)],
        ],
        3500,
      ),
    ).toEqual([1000, 3000])
  })

  it.each([0, -5, Number.POSITIVE_INFINITY, Number.NaN])(
    'refuses an interval of %s where the Model gives it',
    intervalMs => {
      expect(() => entry.modelToDependencies(every(intervalMs))).toThrow(
        /intervalMs must be positive and finite/,
      )
    },
  )
})
