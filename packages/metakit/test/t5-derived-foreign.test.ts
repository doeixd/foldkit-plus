import { Schema } from 'effect'
import { expect, it } from 'vitest'
import { Expr } from '../src/index.js'
import * as Fn from '../src/fn.js'
import * as Operation from '../src/operation.js'

const Inner = Operation.define({
  id: 'inner',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})
const definition = Fn.make({ x: Schema.Int }, ({ x }) => Inner(x))
const increment = Operation.implement(Inner, x => x + 1)
const double = Operation.implement(Inner, x => x * 2)
const spec = {
  id: 'outer',
  version: 1,
  definition,
  paramOrder: ['x'] satisfies ['x'],
  returns: Schema.Int,
}

it('runs inner operations supplied only by the evaluator', () => {
  const Outer = Operation.derived(spec)
  const foreign = Operation.implementations('evaluation', Outer.implementation, double)

  expect(Expr.evaluate(Outer(3), {}, { foreign })).toBe(6)
})

it('prefers the evaluating implementation to the definition-time one', () => {
  const Outer = Operation.derived({
    ...spec,
    foreign: Operation.implementations('definition', increment),
  })
  const foreign = Operation.implementations('evaluation', Outer.implementation, double)

  expect(Expr.evaluate(Outer(3), {}, { foreign })).toBe(6)
})

it('falls back to the definition-time implementation for an absent key', () => {
  const Outer = Operation.derived({
    ...spec,
    foreign: Operation.implementations('definition', increment),
  })
  const foreign = Operation.implementations('evaluation', Outer.implementation)

  expect(Expr.evaluate(Outer(3), {}, { foreign })).toBe(4)
})
