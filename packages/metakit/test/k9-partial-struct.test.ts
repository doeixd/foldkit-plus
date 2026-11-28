import { Eq, Expr, Path, Verdict } from '@doeixd/metakit'
import { Schema } from 'effect'
import { expect, it } from 'vitest'

it('leaves struct equality open when a partial environment omits optional keys', () => {
  const Struct = Schema.Struct({ x: Schema.Int, y: Schema.optionalKey(Schema.Int) })
  const { a, b } = Path.forEnv({ a: Struct, b: Struct })
  const equal = Eq.is(a, b)
  const partial = { a: { x: 1 }, b: { x: 1 } }
  const unequal = { a: { x: 1, y: 2 }, b: { x: 1 } }

  expect(Expr.evaluate(equal, partial)).toBe(true)
  expect(Expr.evaluate(equal, unequal)).toBe(false)
  expect(Verdict.isUnknown(Expr.judge(equal, partial))).toBe(true)
  expect(Expr.evaluate(Expr.residualize(equal, partial), unequal)).toBe(false)

  const whole = { a: { x: 1, y: 2 }, b: { x: 1, y: 2 } }
  expect(Verdict.isTrue(Expr.judge(equal, whole))).toBe(true)
})
