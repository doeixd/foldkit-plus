/**
 * `Bundle.make({ machine })` exposes the declarative machine on the bundle,
 * leaves bundles without one unchanged, and lifts it at each placement's path
 * so parents compose child machines without calling `Machine.lift` by hand.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Num, Ord, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'

const CounterModel = Schema.Struct({ count: Schema.Number })
type CounterModel = typeof CounterModel.Type
const CounterMessage = defineMessageUnion({
  Incremented: { by: Schema.Number },
  DecrementedPositive: {},
  SetCount: { value: Schema.Number },
})

const CounterMachine = Machine.make({
  state: CounterModel,
  transitions: {
    Incremented: Transition.make({
      state: CounterModel,
      input: CounterMessage.Incremented,
      apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
    }),
    DecrementedPositive: Transition.make({
      state: CounterModel,
      input: CounterMessage.DecrementedPositive,
      when: ({ state }) => Ord.gt(state.count, 0),
      apply: ({ state }) => [Transition.set(state.count, Num.sub(state.count, 1))],
    }),
    SetCount: Transition.make({
      state: CounterModel,
      input: CounterMessage.SetCount,
      apply: ({ state, input }) => [Transition.set(state.count, input.value)],
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

describe('Bundle.make({ machine })', () => {
  it('exposes the machine on the bundle and preserves it through with and combinators', () => {
    const InSpec = Bundle.make({
      name: 'InSpec',
      Model: CounterModel,
      Message: CounterMessage,
      init: () => ({ model: { count: 0 } }),
      update: model => ({ model }),
      machine: CounterMachine,
    })

    expect(Counter.machine).toBe(CounterMachine)
    expect(InSpec.machine).toBe(CounterMachine)
    expect(Counter.with({ start: 5 }).machine).toBe(CounterMachine)
    expect(Counter.pipe(Bundle.rename('Score')).machine).toBe(CounterMachine)
  })

  it('leaves bundles and placements without a machine unchanged', () => {
    const GotPlain = Link.wrapper('GotPlainMessage', CounterMessage)
    const ParentModel = Schema.Struct({ plain: CounterModel })
    const placed = Plain.at(Link.field<typeof ParentModel.Type>()('plain', GotPlain))

    expect(Plain.machine).toBeUndefined()
    expect('machine' in Plain).toBe(false)
    expect(placed.machine).toBeUndefined()
    expect('machine' in placed).toBe(false)
  })
})

describe('placement machine lifting', () => {
  const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
  const ParentModel = Schema.Struct({
    title: Schema.String,
    counter: CounterModel,
    maybe: Schema.Option(CounterModel),
  })
  type ParentModel = typeof ParentModel.Type
  const ParentMessage = defineMessageUnion({
    Renamed: { title: Schema.String },
    ...GotCounter.cases,
  })

  const placed = Counter.at(Link.field<ParentModel>()('counter', GotCounter), {
    args: { start: 1 },
  })

  const makeParentMachine = () =>
    Machine.compose({
      state: ParentModel,
      transitions: {
        Renamed: Transition.make({
          state: ParentModel,
          input: ParentMessage.Renamed,
          apply: ({ state, input }) => [Transition.set(state.title, input.title)],
        }),
      },
      children: {
        Counter: placed.machine,
      },
    })

  it('lifts transitions at the link path so stepping updates the parent field and reads/writes its footprint', () => {
    const ParentMachine = makeParentMachine()
    expect(ParentMachine.footprints.CounterIncremented.writes).toEqual([['counter', 'count']])

    const initial: ParentModel = {
      title: 'Home',
      counter: { count: 2 },
      maybe: Option.none(),
    }
    const [next] = ParentMachine.update(initial, {
      _tag: 'CounterIncremented',
      input: CounterMessage.Incremented({ by: 3 }),
    })

    expect(next).toEqual({
      title: 'Home',
      counter: { count: 5 },
      maybe: Option.none(),
    })
  })

  it('preserves parent model identity on refused guards and same-value no-ops', () => {
    const ParentMachine = makeParentMachine()
    const zero: ParentModel = {
      title: 'Home',
      counter: { count: 0 },
      maybe: Option.none(),
    }
    const [afterRefused] = ParentMachine.update(zero, {
      _tag: 'CounterDecrementedPositive',
      input: CounterMessage.DecrementedPositive(),
    })
    expect(afterRefused).toBe(zero)

    const [afterSameSet] = ParentMachine.update(zero, {
      _tag: 'CounterSetCount',
      input: CounterMessage.SetCount({ value: 0 }),
    })
    expect(afterSameSet).toBe(zero)
  })

  it('refuses a lifted transition when an optional child is absent', () => {
    const GotMaybe = Link.wrapper('GotMaybeMessage', CounterMessage)
    const optionalPlaced = Counter.at(Link.optional<ParentModel>()('maybe', GotMaybe), {
      args: { start: 0 },
    })
    const OptionalParent = Machine.compose({
      state: ParentModel,
      transitions: {},
      children: { Maybe: optionalPlaced.machine },
    })

    const absent: ParentModel = {
      title: 'Home',
      counter: { count: 0 },
      maybe: Option.none(),
    }
    const [afterAbsent] = OptionalParent.update(absent, {
      _tag: 'MaybeIncremented',
      input: CounterMessage.Incremented({ by: 1 }),
    })
    expect(afterAbsent).toBe(absent)
  })

  it('exposes the lifted machine on Bundle.compose children and nested Link.compose paths', () => {
    const Composed = Bundle.compose({ title: Schema.String }).pipe(
      Bundle.withChild('counter', Counter, { args: { start: 10 } }),
    )
    const ComposedMachine = Machine.compose({
      state: Composed.Model,
      transitions: {},
      children: {
        Counter: Composed.children.counter.machine,
      },
    })
    const initial = Composed.placements.initial({ title: 'App' }).model
    const [updated] = ComposedMachine.update(initial, {
      _tag: 'CounterIncremented',
      input: CounterMessage.Incremented({ by: 4 }),
    })
    expect(updated.counter).toEqual({ count: 14 })

    const OuterModel = Schema.Struct({ nested: ParentModel })
    type OuterModel = typeof OuterModel.Type
    const GotOuter = Link.wrapper('GotOuterMessage', ParentMessage)
    const outerLink = Link.compose(
      Link.field<OuterModel>()('nested', GotOuter),
      Link.field<ParentModel>()('counter', GotCounter),
    )
    const nestedPlaced = Counter.at(outerLink, { args: { start: 0 } })
    const OuterMachine = Machine.compose({
      state: OuterModel,
      transitions: {},
      children: { Nested: nestedPlaced.machine },
    })
    const outerStart: OuterModel = {
      nested: { title: 'Deep', counter: { count: 1 }, maybe: Option.none() },
    }
    const [outerNext] = OuterMachine.update(outerStart, {
      _tag: 'NestedIncremented',
      input: CounterMessage.Incremented({ by: 6 }),
    })
    expect(outerNext.nested.counter).toEqual({ count: 7 })
  })
})
