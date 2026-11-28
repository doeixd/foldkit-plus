import { Bool, Expr, Num, Path } from '@doeixd/metakit'
import * as Artifact from '@doeixd/metakit/artifact'
import { Effect, Result, Schema } from 'effect'
import { expect, it } from 'vitest'

it('evaluates twenty thousand conjuncts without exhausting the stack', () => {
  expect(Expr.evaluate(Expr.all(...Array.from({ length: 20_000 }, () => true)), {})).toBe(true)
})

it.each([
  { name: 'all', join: Expr.all },
  { name: 'any', join: Expr.any },
])('encodes and reads a 66-term $name', async ({ join }) => {
  const { allowed } = Path.forEnv({ allowed: Schema.Boolean })
  const expr = join(...Array.from({ length: 66 }, () => allowed))

  await Effect.runPromise(Artifact.encodeExpr(expr))
  expect(Expr.judge(expr, { allowed: true })).toEqual(Expr.judge(allowed, { allowed: true }))
  expect(Expr.evaluate(Expr.residualize(expr, {}), { allowed: false })).toBe(false)
})

it.each([
  { name: 'all', join: Expr.all, binary: Bool.and, identity: true },
  { name: 'any', join: Expr.any, binary: Bool.or, identity: false },
])('preserves left-deep $name values and the first refusal', ({ join, binary, identity }) => {
  const firstRefusal = Num.gt(Num.add(Number.MAX_SAFE_INTEGER, 1), 0)
  const secondRefusal = Num.gt(Num.mul(Number.MAX_SAFE_INTEGER, 2), 0)
  const operands: ReadonlyArray<Expr.Expr<unknown, boolean | null>> = [
    Expr.lit(true),
    Expr.lit(false),
    Expr.lit(null),
    firstRefusal,
    secondRefusal,
  ]
  const cases = [operands]
  let seed = 1
  for (let row = 0; row < 100; row++) {
    cases.push(
      Array.from({ length: row % 12 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return operands[(seed >>> 16) % operands.length]!
      }),
    )
  }

  expect(Expr.evaluate(join(), {})).toBe(identity)
  const first = Expr.evalResult(firstRefusal, {})
  expect(Result.isFailure(first)).toBe(true)
  expect(Expr.evalResult(join(firstRefusal, true, false, secondRefusal), {})).toEqual(first)
  for (const terms of cases) {
    const [first, ...rest] = terms
    const leftDeep =
      first === undefined
        ? Expr.lit(identity)
        : rest.reduce((acc, term) => binary(acc, term), first)
    const balanced = join(...terms)
    const expected = Expr.evalResult(leftDeep, {})
    expect(Expr.evalResult(balanced, {})).toEqual(expected)
    expect(Expr.evalResult(Expr.residualize(balanced, {}), {})).toEqual(expected)
    expect(Expr.judge(balanced, {})).toEqual(Expr.judge(leftDeep, {}))
  }
})
