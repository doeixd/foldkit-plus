import { Schema } from 'effect'
import { Num, Path, Transition } from 'metakit'
import * as Machine from 'metakit/machine'

const State = Schema.Struct({ total: Schema.Int })
const Add = Transition.make({
  state: State,
  input: Schema.Struct({ amount: Schema.Int }),
  supplied: { limit: Schema.Int },
  when: ({ input, supplied }) => Num.lte(input.amount, supplied.limit),
  apply: ({ state, input }) => [Transition.add(state.total, input.amount)],
})
const Rename = Transition.make({
  state: State,
  input: Schema.Struct({ label: Schema.String }),
  supplied: { user: Schema.String },
  apply: () => [],
})
const child = Machine.make({ state: State, transitions: { Add, Rename } })
const add = Machine.intent(child, 'Add')
const message = add.message({ amount: 4 })
add.can({ input: { amount: 4 }, supplied: { limit: 5 } })
child.dispatch({ total: 0 }, { ...message, supplied: { limit: 5 } })

// @ts-expect-error client intent needs host-supplied data before dispatch
child.dispatch({ total: 0 }, message)
// @ts-expect-error the add arm does not take a label
add.message({ label: 'x' })
// @ts-expect-error the add arm does not accept the rename arm's supplied fields
add.can({ supplied: { user: 'alice' } })
// @ts-expect-error canDispatch picks supplied fields from its tag
Machine.canDispatch(child, 'Add', { supplied: { user: 'alice' } })
// @ts-expect-error there is no Clear arm
Machine.intent(child, 'Clear')

const Parent = Schema.Struct({ cart: State })
const parent = Machine.compose({
  state: Parent,
  transitions: {},
  children: { Cart: Machine.lift(Path.from(Parent).cart, child) },
})
const nested = Machine.intent(parent, 'CartAdd')
const tag: 'CartAdd' = nested.message({ amount: 3 })._tag
void tag
// @ts-expect-error the lifted arm preserves its original input
nested.message({ label: 'cart' })
