import { Expr, Node, Num, Path } from '@doeixd/metakit'
import { settleNode, Settled } from '@doeixd/metakit/build'
import { Result, Schema } from 'effect'
import { expect, it } from 'vitest'

const { x } = Path.forEnv({ x: Schema.Int })
const { list, struct } = Path.forEnv({
  list: Schema.Array(Schema.Int),
  struct: Schema.Struct({ n: Schema.Int }),
})

it.each([
  { law: 'add zero', expr: Num.add(x, 0) },
  { law: 'multiply by one', expr: Num.mul(x, 1) },
  { law: 'double negation', expr: Num.neg(Num.neg(x)) },
])('preserves positive zero through the $law rewrite', ({ expr }) => {
  const env = { x: -0 }
  const residual = Expr.residualize(expr, {})

  expect(residual.node).toBe(x.node)
  expect(Expr.evaluate(expr, env)).toBe(0)
  expect(Expr.evaluate(residual, env)).toBe(0)
})

it('normalizes a known numeric path in partial evaluation and judgement', () => {
  const env = { x: -0 }
  const residual = Expr.residualize(x, env)

  expect(residual.node).toEqual(Node.Lit({ value: 0 }))
  expect(Expr.evaluate(residual, { x: 1 })).toBe(0)
  expect(settleNode(x.node, env)).toEqual(Settled.Known({ value: 0 }))
})

it('preserves negative zero inside a list or struct read whole', () => {
  const env = { list: [-0], struct: { n: -0 } }

  expect(Expr.evaluate(list, env)).toBe(env.list)
  expect(Expr.evaluate(struct, env)).toBe(env.struct)
  expect(Expr.evaluate(Expr.residualize(list, env), env)[0]).toBe(-0)
  expect(Expr.evaluate(Expr.residualize(struct, env), env).n).toBe(-0)
  expect(Expr.evaluate(struct.n, env)).toBe(0)
})

it('refuses an unsafe integer result from mixed integer and fractional operands', () => {
  const max = Number.MAX_SAFE_INTEGER
  expect(Expr.evalResult(Num.add(max, 0.5), {})).toMatchObject({
    failure: { reason: 'unsafe-integer', at: 'num.add' },
  })
  expect(Expr.evalResult(Num.sub(-max, 0.5), {})).toMatchObject({
    failure: { reason: 'unsafe-integer', at: 'num.sub' },
  })
  expect(Expr.evalResult(Num.add(max, -0.5), {})).toEqual(Result.succeed(max - 1))
  expect(Expr.evalResult(Num.add(1, 0.5), {})).toEqual(Result.succeed(1.5))
})
