import { Effect, Exit, Fiber, Schema } from 'effect'
import { Bool, Expr, Num, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'
import { expect, it, vi } from 'vitest'
import type { Z3 } from '../src/prove/lower.js'

const fixture = vi.hoisted(() => {
  let start!: () => void
  let interrupt!: () => void
  const started = new Promise<void>(resolve => {
    start = resolve
  })
  const interrupted = new Promise<void>(resolve => {
    interrupt = resolve
  })
  return { start, interrupt, started, interrupted, released: false, reason: '' }
})

vi.mock('z3-solver', async original => {
  const mod = await original<typeof import('z3-solver')>()
  return {
    ...mod,
    init: async () => {
      const z3 = await mod.init()
      let isolate = true
      return {
        ...z3,
        Context: new Proxy(z3.Context, {
          construct(Context, args) {
            const context: Z3 = Reflect.construct(Context, args)
            if (!isolate) return context
            isolate = false
            const interrupt = context.interrupt.bind(context)
            context.interrupt = () => {
              interrupt()
              fixture.interrupt()
            }
            Object.defineProperty(context, 'Solver', {
              value: class extends context.Solver {
                override async check() {
                  this.reset()
                  const x = context.Int.const('factorX')
                  const y = context.Int.const('factorY')
                  this.add(x.gt(1), y.gt(1), x.mul(y).eq(context.Int.val((1n << 127n) - 1n)))
                  this.set('timeout', 2_000)
                  fixture.start()
                  // The native check starts after the first interrupt, as on a cold worker.
                  await fixture.interrupted
                  const result = await super.check()
                  fixture.reason = this.reasonUnknown()
                  return result
                }

                override release() {
                  super.release()
                  fixture.released = true
                }
              },
            })
            return context
          },
        }),
      }
    },
  }
})

it('interrupts a late-starting native check and releases it before the next proof', async () => {
  const Row = Schema.Struct({ n: Schema.Int })
  const goal = Expr.in({ row: Row }, ({ row }) => Bool.or(Num.gt(row.n, 0), Num.lte(row.n, 0)))
  const proof = Prove.policy({ row: Row }, goal)
  await Effect.runPromise(
    Effect.gen(function* () {
      const cancelled = yield* Effect.forkChild(proof)
      yield* Effect.promise(() => fixture.started)
      const next = yield* Effect.forkChild(proof)
      yield* Fiber.interrupt(cancelled)
      expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true)
      expect(fixture.reason).toBe('interrupted')
      expect(fixture.released).toBe(true)
      expect(Verdict.isTrue(yield* Fiber.join(next))).toBe(true)
    }),
  )
})
