import { Schema } from 'effect'
import { Num, Path, Transition } from 'metakit'
import * as Machine from 'metakit/machine'

const Child = Schema.Struct({ quantity: Schema.Int })
const Shape = Schema.Struct({
  quantity: Schema.Int,
  child: Child,
  items: Schema.Array(Schema.String),
})
const { state, input, supplied } = Transition.pathsOf(Shape, Shape, {
  quantity: Schema.Int,
  items: Schema.Array(Schema.String),
})

Transition.set(state.quantity, input.quantity)
Transition.set(state.child.quantity, supplied.quantity)
Transition.set(Path.compose(state.child, Path.from(Child).quantity), input.quantity)
Transition.add(state.quantity, supplied.quantity)
Transition.append(state.items, 'item')
Transition.emit('Changed', { quantity: Num.add(input.quantity, supplied.quantity) })

// @ts-expect-error the input is readable but cannot be assigned
Transition.set(input.quantity, state.quantity)
// @ts-expect-error a supplied value is readable but cannot be incremented
Transition.add(supplied.quantity, state.quantity)
// @ts-expect-error a nested input path still has no write authority
Transition.set(input.child.quantity, state.child.quantity)
// @ts-expect-error a computed expression is never a write target
Transition.set(Num.add(state.quantity, 1), state.quantity)
// @ts-expect-error collections follow the same target rule as scalars
Transition.append(input.items, 'item')
// @ts-expect-error supplied collections are read-only too
Transition.append(supplied.items, 'item')

const Increase = Transition.make({
  state: Child,
  input: Child,
  when: ({ state, input }) => Num.gt(input.quantity, state.quantity),
  apply: ({ state, input }) => [Transition.add(state.quantity, input.quantity)],
})
const child = Machine.make({ state: Child, transitions: { Increase } })
Machine.lift(Path.from(Shape).child, child)
