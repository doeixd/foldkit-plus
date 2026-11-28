import { Result, Schema } from 'effect'
import { expect, it } from 'vitest'
import { Num } from '../src/index.js'
import * as Fn from '../src/fn.js'

const USD = Schema.Number.check(Schema.isGreaterThan(0)).pipe(Schema.brand('USD'))
const f = Fn.params({ x: Schema.Number })
  .returns(USD)
  .body(({ x }) => Num.add(x, 1))

// T3: deciding whether direct calls enforce return Schemas is pending.
it.fails('keeps unchecked direct calls from returning values outside the branded Schema', () => {
  const result = Result.try(() => f.run({ x: -2 }))

  if (Result.isSuccess(result)) expect(result.success).toSatisfy(Schema.is(USD))
})

it('checks a branded return Schema in runChecked', () => {
  expect(f.runChecked({ x: 1 })).toEqual(Result.succeed(Schema.decodeUnknownSync(USD)(2)))
  expect(Result.flip(f.runChecked({ x: -2 }))).toEqual(
    Result.succeed(expect.objectContaining({ phase: 'returns' })),
  )
})
