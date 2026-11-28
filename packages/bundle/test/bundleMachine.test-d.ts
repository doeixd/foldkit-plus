/**
 * Type inference and negative constraints for `Bundle.make({ machine })` and
 * lifted machines on placements.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Num, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { expectTypeOf } from 'vitest'
import { Bundle, Link } from '../src/index.js'

const CounterModel = Schema.Struct({ count: Schema.Number })
type CounterModel = typeof CounterModel.Type
const CounterMessage = defineMessageUnion({
  Incremented: { by: Schema.Number },
})
type CounterMessage = typeof CounterMessage.Type

const CounterMachine = Machine.make({
  state: CounterModel,
  transitions: {
    Incremented: Transition.make({
      state: CounterModel,
      input: CounterMessage.Incremented,
      apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
    }),
  },
})

const Counter = Bundle.make('Counter', {
  Model: CounterModel,
  Message: CounterMessage,
  args: Schema.Struct({ start: Schema.Number }),
  init: ({ start }) => ({ model: { count: start } }),
  update: model => ({ model }),
  machine: CounterMachine,
})

const Plain = Bundle.make({
  name: 'Plain',
  Model: CounterModel,
  Message: CounterMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model }),
})

// Positive inference without annotations: machine is preserved or undefined.
expectTypeOf(Counter.machine).toEqualTypeOf(CounterMachine)
expectTypeOf(Counter.with({ start: 0 }).machine).toEqualTypeOf(CounterMachine)
expectTypeOf(Counter.pipe(Bundle.rename('Renamed')).machine).toEqualTypeOf(CounterMachine)
expectTypeOf(Plain.machine).toEqualTypeOf<undefined>()

// Mismatched machine State is rejected at Bundle.make (both overloads).
const WrongModel = Schema.Struct({ label: Schema.String })
const WrongMachine = Machine.make({
  state: WrongModel,
  transitions: {
    Renamed: Transition.make({
      state: WrongModel,
      input: Schema.Struct({ label: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.label, input.label)],
    }),
  },
})

Bundle.make('Bad', {
  Model: CounterModel,
  Message: CounterMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model }),
  // @ts-expect-error: machine State must match the bundle's Model
  machine: WrongMachine,
})

Bundle.make({
  name: 'BadInSpec',
  Model: CounterModel,
  Message: CounterMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model }),
  // @ts-expect-error: machine State must match the bundle's Model
  machine: WrongMachine,
})

// Placement exposes Machine.Lifted<Parent, Transitions> directly for Machine.compose.
const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const ParentModel = Schema.Struct({ title: Schema.String, counter: CounterModel })
type ParentModel = typeof ParentModel.Type

const placed = Counter.at(Link.field<ParentModel>()('counter', GotCounter), {
  args: { start: 0 },
})
const plainPlaced = Plain.at(Link.field<ParentModel>()('counter', GotCounter))

expectTypeOf(placed.machine).toEqualTypeOf<
  Machine.Lifted<ParentModel, typeof CounterMachine.transitions>
>()
expectTypeOf(plainPlaced.machine).toEqualTypeOf<undefined>()

const ParentScope = Bundle.parent({
  Model: ParentModel,
  Message: defineMessageUnion({ ...GotCounter.cases }),
})
expectTypeOf(ParentScope.place(Counter, 'counter', { args: { start: 0 } }).machine).toEqualTypeOf<
  Machine.Lifted<ParentModel, typeof CounterMachine.transitions>
>()

const ComposedBundle = Bundle.compose({ title: Schema.String }).pipe(
  Bundle.withChild('counter', Counter, { args: { start: 0 } }),
)
expectTypeOf(ComposedBundle.children.counter.machine).toEqualTypeOf<
  Machine.Lifted<typeof ComposedBundle.Model.Type, typeof CounterMachine.transitions>
>()

const ParentMachine = Machine.compose({
  state: ParentModel,
  transitions: {},
  children: { Counter: placed.machine },
})
expectTypeOf<keyof typeof ParentMachine.transitions>().toEqualTypeOf<'CounterIncremented'>()
ParentMachine.update(
  { title: '', counter: { count: 0 } },
  { _tag: 'CounterIncremented', input: { _tag: 'Incremented', by: 1 } },
)
ParentMachine.update(
  { title: '', counter: { count: 0 } },
  // @ts-expect-error: composed machine only accepts CounterIncremented
  { _tag: 'Missing', input: {} },
)

Machine.compose({
  state: ParentModel,
  transitions: {},
  children: {
    // @ts-expect-error: a bundle without a machine has undefined placed.machine
    Plain: plainPlaced.machine,
  },
})
