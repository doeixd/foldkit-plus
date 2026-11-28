import { Schema } from 'effect'
import { Transition } from 'metakit'
import { test } from 'vitest'

const State = Schema.Struct({ count: Schema.Int })
const Add = Transition.make({
  state: State,
  input: Schema.Struct({ amount: Schema.Int }),
  apply: ({ state, input }) => [Transition.add(state.count, input.amount)],
})
const state = { count: 0 }
const input = { amount: 1 }

test('evaluate a scalar write', async ({ bench }) => {
  await bench('evaluate a scalar write', () => Transition.step(Add, state, input)).run()
})

test('evaluate and observe a scalar write', async ({ bench }) => {
  await bench('evaluate and observe a scalar write', () =>
    Transition.stepObserved(Add, state, input)).run()
})
