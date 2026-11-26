import { Effect, Exit, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Fn from '../src/fn.js'
import * as Interpreter from '../src/interpreter.js'
import * as Num from '../src/ops/num.js'
import * as Operation from '../src/operation.js'
import * as Path from '../src/path.js'
import * as Policy from '../src/policy.js'
import * as Transition from '../src/transition.js'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
})
const Principal = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'viewer']),
})

const doubleOp = Operation.define({
  id: 'math.double',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})

const tripleOp = Operation.define({
  id: 'math.triple',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})

const doubleImpl = Operation.implement(doubleOp, n => n * 2)
const tripleImpl = Operation.implement(tripleOp, n => n * 3)

describe('metakit/interpreter (Effect service & composable layers)', () => {
  it('supports yield* Interpreter.Interpreter directly and zero-config ambient helpers', async () => {
    const acc = Path.from(Account)
    const doubled = Num.add(acc.balance, acc.balance)

    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const interp = yield* Interpreter.Interpreter
        const val = yield* interp.eval(doubled, { id: 'a1', balance: 21 })
        const verdict = yield* Interpreter.judge(Num.gt(acc.balance, 10), { balance: 21 })
        return { name: interp.name, val, verdict: verdict._tag }
      }),
    )

    expect(out).toEqual({ name: 'memory', val: 42, verdict: 'True' })
  })

  it('threads ambient foreign implementations via Interpreter.layer and withForeign across Expr, Transition, Fn, and Policy', async () => {
    const acc = Path.from(Account)
    const doubledExpr = doubleOp(acc.balance)

    const DoubleDeposit = Transition.make({
      state: Account,
      input: Schema.Struct({ amount: Schema.Int }),
      when: ({ input }) => Num.gt(input.amount, 0),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.add(state.balance, doubleOp(input.amount))),
      ],
    })

    const BonusFn = Fn.make({ amount: Schema.Int }, ({ amount }) => tripleOp(amount))

    const AccountPolicy = Policy.make({
      row: Account,
      principal: Principal,
      rules: ({ row }) => ({
        highValue: Num.gte(doubleOp(row.balance), 100),
      }),
    })

    const baseLayer = Interpreter.layer({
      foreign: Operation.implementations('math-double', doubleImpl),
    })
    const composedLayer = Interpreter.withForeign(
      Operation.implementations('math-triple', tripleImpl),
    ).pipe(Layer.provide(baseLayer))

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const e = yield* Interpreter.evalExpr(doubledExpr, { id: 'a1', balance: 15 })
        const next = yield* Interpreter.run(
          DoubleDeposit,
          { id: 'a1', balance: 10 },
          { amount: 25 },
        )
        const fnVal = yield* Interpreter.runFn(BonusFn, { amount: 7 }, { checked: true })
        const allowed = yield* Interpreter.allow(AccountPolicy, 'highValue', {
          row: { id: 'a1', balance: 50 },
          principal: { id: 'u1', role: 'viewer' },
        })
        return { e, next, fnVal, allowed }
      }).pipe(Effect.provide(composedLayer)),
    )

    expect(result).toEqual({
      e: 30,
      next: { id: 'a1', balance: 60 },
      fnVal: 21,
      allowed: true,
    })
  })

  it('sandboxes foreign ops via withAllowlist (allows listed ops, refuses unlisted ops)', async () => {
    const acc = Path.from(Account)
    const fullLayer = Interpreter.layer({
      foreign: Operation.implementations('math', doubleImpl, tripleImpl),
    })
    const sandboxLayer = Interpreter.withAllowlist(new Set(['math.double'])).pipe(
      Layer.provide(fullLayer),
    )

    const ok = await Effect.runPromise(
      Interpreter.evalExpr(doubleOp(acc.balance), { id: 'a', balance: 5 }).pipe(
        Effect.provide(sandboxLayer),
      ),
    )
    expect(ok).toBe(10)

    const exit = await Effect.runPromiseExit(
      Interpreter.evalExpr(tripleOp(acc.balance), { id: 'a', balance: 5 }).pipe(
        Effect.provide(sandboxLayer),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('records structured events via withObserver and composes with withTracing', async () => {
    const events: Array<Interpreter.InterpreterEvent> = []
    const acc = Path.from(Account)

    const observedLayer = Interpreter.withTracing().pipe(
      Layer.provide(
        Interpreter.withObserver(event =>
          Effect.sync(() => {
            events.push(event)
          }),
        ),
      ),
    )

    const val = await Effect.runPromise(
      Effect.gen(function* () {
        const v = yield* Interpreter.evalExpr(Num.add(acc.balance, 5), { id: 'a', balance: 10 })
        yield* Interpreter.judge(Num.gt(acc.balance, 0), { balance: 10 })
        return v
      }).pipe(Effect.provide(observedLayer)),
    )

    expect(val).toBe(15)
    expect(events.map(e => e.kind)).toEqual(['eval', 'judge'])
    expect(events[0]?.kind === 'eval' && events[0].ok).toBe(true)
    expect(events[1]?.kind === 'judge' && events[1].verdict).toBe('True')
  })
})
