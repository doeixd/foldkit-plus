import { Schema } from 'effect'
import { Num, Transition } from 'metakit'
import { expect, it } from 'vitest'

it('reports invalid transition write targets even for dynamic callers', () => {
  const Model = Schema.Struct({ quantity: Schema.Int })
  const { input, state } = Transition.pathsOf(Model, Model, {})
  expect(() => Reflect.apply(Transition.set, undefined, [input.quantity, 0])).toThrow(
    'target must be a path under "state", got "input.quantity"',
  )
  expect(() => Reflect.apply(Transition.set, undefined, [Num.add(state.quantity, 1), 0])).toThrow(
    'target must be a path under "state"',
  )
})
