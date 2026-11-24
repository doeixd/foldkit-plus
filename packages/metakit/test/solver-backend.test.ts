import { Deferred, Effect, Exit, Fiber, Layer, Option, Schema } from 'effect'
import { Expr, Num, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'
import { expect, it } from 'vitest'

const Row = Schema.Struct({ count: Schema.Int })
const goal = Expr.in({ row: Row }, ({ row }) => Num.gte(row.count, 0))

const layer = (solve: Prove.SolverBackend['solve']) =>
  Layer.succeed(Prove.Solver, { name: 'fixture', encoding: 'test-integers-v1', solve })

it('opens a solver session only when an invariant needs escalation', async () => {
  let sessions = 0
  const backend = layer(() =>
    Effect.sync(() => {
      sessions++
      return Prove.SolverAnswer.Unsat()
    }),
  )
  const checked = await Effect.runPromise(
    Prove.invariant(Row, Expr.lit(true)).pipe(Effect.provide(backend)),
  )
  expect(Verdict.isTrue(checked)).toBe(true)
  expect(sessions).toBe(0)
  const solved = await Effect.runPromise(
    Prove.policy({ row: Row }, goal).pipe(Effect.provide(backend)),
  )
  expect(solved).toEqual(
    Verdict.True(
      Option.some(
        Verdict.Proved('solver', {
          backend: 'fixture',
          encoding: 'test-integers-v1',
        }),
      ),
    ),
  )
  expect(sessions).toBe(1)
})

it.each([
  { count: -1, refutes: true },
  { count: 1, refutes: false },
  { count: '-1', refutes: false },
])('replays and validates the backend assignment $count', async ({ count, refutes }) => {
  const solved = await Effect.runPromise(
    Prove.policy({ row: Row }, goal).pipe(
      Effect.provide(
        layer(() =>
          Effect.succeed(
            Prove.SolverAnswer.Sat({ env: { row: { count } }, flat: { 'row.count': count } }),
          ),
        ),
      ),
    ),
  )
  if (refutes) expect(solved).toEqual(Verdict.False(Option.some({ 'row.count': count })))
  else expect(Verdict.isUnknown(solved)).toBe(true)
})

it('keeps logical unknown, a spent budget and backend unavailability separate', async () => {
  for (const kind of ['nonlinear', 'budget'] as const) {
    const expected = { reason: kind, obligation: Option.some({ kind, detail: kind }) }
    const proof = Prove.policy({ row: Row }, goal).pipe(
      Effect.provide(layer(() => Effect.succeed(Prove.SolverAnswer.Undecided(expected)))),
    )
    expect(await Effect.runPromise(proof)).toEqual(
      Verdict.Unknown(expected.reason, expected.obligation),
    )
  }
  const unavailable = new Prove.SolverUnavailableError({ cause: 'offline' })
  const proof = Prove.policy({ row: Row }, goal).pipe(
    Effect.provide(layer(() => Effect.fail(unavailable))),
  )
  expect(await Effect.runPromise(Effect.result(proof))).toMatchObject({ failure: unavailable })
})

it('interrupts and releases only the interrupted solver session', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const firstStarted = yield* Deferred.make<void>()
      const secondStarted = yield* Deferred.make<void>()
      const finishSecond = yield* Deferred.make<void>()
      const released: Array<number> = []
      const interrupted: Array<number> = []
      const backend = layer(({ timeoutMs }) =>
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              released.push(timeoutMs)
            }),
          )
          if (timeoutMs === 1) {
            yield* Deferred.succeed(firstStarted, undefined)
            return yield* Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted.push(timeoutMs)
                }),
              ),
            )
          }
          yield* Deferred.succeed(secondStarted, undefined)
          yield* Deferred.await(finishSecond)
          return Prove.SolverAnswer.Unsat()
        }),
      )
      const start = (timeoutMs: number) =>
        Prove.policy({ row: Row }, goal, { timeoutMs }).pipe(
          Effect.provide(backend),
          Effect.forkChild,
        )
      const first = yield* start(1)
      yield* Deferred.await(firstStarted)
      const second = yield* start(2)
      yield* Deferred.await(secondStarted)
      yield* Fiber.interrupt(first)
      const firstExit = yield* Fiber.await(first)
      expect(Exit.hasInterrupts(firstExit)).toBe(true)
      expect(released).toEqual([1])
      expect(interrupted).toEqual([1])
      yield* Deferred.succeed(finishSecond, undefined)
      expect(Verdict.isTrue(yield* Fiber.join(second))).toBe(true)
      expect(released).toEqual([1, 2])
    }),
  )
})
