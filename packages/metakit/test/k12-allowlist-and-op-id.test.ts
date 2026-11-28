import { Effect, Exit, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Interpreter from '../src/interpreter.js'
import * as Operation from '../src/operation.js'
import * as Path from '../src/path.js'

const Row = Schema.Struct({ amount: Schema.Int })
const $row = Path.from(Row)

const payV1 = Operation.define({
  id: 'pay',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})

const payV2 = Operation.define({
  id: 'pay',
  version: 2,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})

const payV1Impl = Operation.implement(payV1, n => n + 1)
const payV2Impl = Operation.implement(payV2, n => n + 2)

describe('K12: operation ids and interpreter allowlist matching', () => {
  it('refuses "@" in Operation.define ids at definition time', () => {
    expect(() =>
      Operation.define({
        id: 'pay@v2',
        version: 1,
        args: [Schema.Int],
        returns: Schema.Int,
        nulls: 'strict',
      }),
    ).toThrow(/@/)
  })

  it('does not admit pay@1 or pay@2 when allowlist only names bare "pay"', async () => {
    const baseLayer = Interpreter.layer({
      foreign: Operation.implementations('pay', payV1Impl, payV2Impl),
    })
    const sandboxLayer = Interpreter.withAllowlist(new Set(['pay'])).pipe(Layer.provide(baseLayer))

    const exitV1 = await Effect.runPromiseExit(
      Interpreter.evalExpr(payV1($row.amount), { amount: 10 }).pipe(Effect.provide(sandboxLayer)),
    )
    expect(Exit.isFailure(exitV1)).toBe(true)

    const exitV2 = await Effect.runPromiseExit(
      Interpreter.evalExpr(payV2($row.amount), { amount: 10 }).pipe(Effect.provide(sandboxLayer)),
    )
    expect(Exit.isFailure(exitV2)).toBe(true)
  })

  it('admits an exact id@version allowlist entry and refuses other versions', async () => {
    const baseLayer = Interpreter.layer({
      foreign: Operation.implementations('pay', payV1Impl, payV2Impl),
    })
    const sandboxLayer = Interpreter.withAllowlist(new Set(['pay@1'])).pipe(
      Layer.provide(baseLayer),
    )

    const ok = await Effect.runPromise(
      Interpreter.evalExpr(payV1($row.amount), { amount: 10 }).pipe(Effect.provide(sandboxLayer)),
    )
    expect(ok).toBe(11)

    const exitV2 = await Effect.runPromiseExit(
      Interpreter.evalExpr(payV2($row.amount), { amount: 10 }).pipe(Effect.provide(sandboxLayer)),
    )
    expect(Exit.isFailure(exitV2)).toBe(true)
  })
})
