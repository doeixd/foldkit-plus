import { Effect, Layer, Schema } from 'effect'
import { expect, it } from 'vitest'
import * as Interpreter from '../src/interpreter.js'
import * as Operation from '../src/operation.js'

const define = (id: string) =>
  Operation.define({ id, version: 1, args: [Schema.Int], returns: Schema.Int, nulls: 'strict' })

const A = define('a')
const B = define('b')
const a = Operation.implement(A, x => x + 1)
const b = Operation.implement(B, x => x * 2)
const foreign = Operation.implementations('a-and-b', a, b)

it.each([
  { direction: 'wider', first: [a.key], second: [a.key, b.key] },
  { direction: 'narrower', first: [a.key, b.key], second: [a.key] },
])('keeps both restrictions when a $direction allowlist is layered', async ({ first, second }) => {
  const layered = Interpreter.withAllowlist(new Set(second)).pipe(
    Layer.provide(Interpreter.withAllowlist(new Set(first))),
  )
  const backend = Interpreter.withForeign(foreign).pipe(Layer.provide(layered))

  await expect(
    Effect.runPromise(Interpreter.evalExpr(A(3), {}).pipe(Effect.provide(backend))),
  ).resolves.toBe(4)
  await expect(
    Effect.runPromise(Interpreter.evalExpr(B(3), {}).pipe(Effect.provide(backend))),
  ).rejects.toMatchObject({ reason: 'unsupported', at: 'b' })
})
