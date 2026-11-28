import { Result, Schema } from 'effect'
import { expect, it } from 'vitest'
import { Expr, Num } from '../src/index.js'
import * as Fn from '../src/fn.js'

const USD = Schema.Number.check(Schema.isGreaterThan(0)).pipe(Schema.brand('USD'))
const f = Fn.params({ x: Schema.Number })
  .returns(USD)
  .body(({ x }) => Num.add(x, 1))

it('keeps direct and symbolic calls from returning values outside the branded Schema', () => {
  const result = Result.try(() => f.run({ x: -2 }))
  expect(Result.isFailure(result)).toBe(true)
  expect(f.run({ x: 1 })).toSatisfy(Schema.is(USD))

  expect(Result.isFailure(Expr.evalResult(f({ x: -2 }), {}))).toBe(true)
  expect(Expr.evaluate(f({ x: 1 }), {})).toSatisfy(Schema.is(USD))
  expect(Expr.evaluate(f.bare({ x: -2 }), {})).toBe(-1)
})

it('checks a branded return Schema in runChecked', () => {
  expect(f.runChecked({ x: 1 })).toEqual(Result.succeed(Schema.decodeUnknownSync(USD)(2)))
  expect(Result.flip(f.runChecked({ x: -2 }))).toEqual(
    Result.succeed(expect.objectContaining({ phase: 'returns' })),
  )
})
