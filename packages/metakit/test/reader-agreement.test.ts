import { inspect } from 'node:util'
import { Expr, Path } from '@doeixd/metakit'
import * as Interpreter from '@doeixd/metakit/interpreter'
import { Effect, Result, Schema } from 'effect'
import { expect, it } from 'vitest'
import { sameAnswer } from '../src/propertyChecks.js'
import { generate } from './support/generate.js'

const seed = 20261128

it('prepared Match refuses a NUL subject before taking its fallback', async () => {
  const { text } = Path.forSchema(Schema.Struct({ text: Schema.String }))
  const expr = Expr.matchOrElse(text, { a: 1 }, 0)
  const env = { text: '\u0000' }
  const prepared = await Effect.runPromise(Interpreter.prepare(expr))

  expect(prepared.evaluateSync(env)).toMatchObject({ reason: 'unportable', at: 'match' })
})

it('agrees across reference, prepared and residual evaluation on generated expressions', async () => {
  const pairs = generate(seed, 2_000)
  for (const [index, { expr, env }] of pairs.entries()) {
    const mask = Math.imul(seed + index, 0x9e3779b1) >>> 16
    const partial = Object.fromEntries(
      Object.entries(env).filter((_, field) => (mask & (1 << field)) !== 0),
    )
    const reference = Result.merge(Expr.evalResult(expr, env))
    const prepared = (await Effect.runPromise(Interpreter.prepare(expr))).evaluateSync(env)
    const residual = Result.merge(Expr.evalResult(Expr.residualize(expr, partial), env))
    const agrees = sameAnswer(reference, prepared) && sameAnswer(reference, residual)

    const diagnostic = agrees
      ? undefined
      : [
          `seed ${seed}, index ${index}`,
          Expr.show(expr),
          inspect({ env, partial, reference, prepared, residual }),
        ].join('\n')
    expect(agrees, diagnostic).toBe(true)
  }
})
