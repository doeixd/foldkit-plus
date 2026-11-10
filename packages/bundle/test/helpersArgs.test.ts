/**
 * Helpers given as a function of the args: each placement calls it with the
 * args it holds, static or derived from a seed, as `update` sees them; a
 * preset binds them; `withHelpers` keeps them beside its own; a collection
 * passes its own.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel, type CounterArgs } from './fixture.js'

// The fixture's Counter, with a helper that reads the placement's `limit`.
const {
  at: _at,
  each: _each,
  with: _with,
  resources: _resources,
  helpers: _helpers,
  ...spec
} = Counter
const Filling = Bundle.make({
  ...spec,
  name: 'Filling',
  helpers: ({ limit }: CounterArgs) => ({
    fill: (model: CounterModel) => ({ model: { ...model, count: limit } }),
  }),
})

const GotA = Link.wrapper('GotA', CounterMessage)
const GotB = Link.wrapper('GotB', CounterMessage)
const GotItem = Link.keyedWrapper('GotItem', CounterMessage)
const Model = Schema.Struct({
  a: CounterModel,
  b: CounterModel,
  items: Schema.Record(Schema.String, CounterModel),
  ticks: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotA.cases, ...GotB.cases, ...GotItem.cases })
type Message = typeof Message.Type

const counter = { count: 0, running: false }
const model: Model = { a: counter, b: counter, items: { x: counter }, ticks: 0 }

describe('helpers that read their args', () => {
  it('see each placement’s own static args', () => {
    const A = Filling.at(Link.field<Model>()('a', GotA), {
      args: { limit: 3, start: 0 },
      onOut: Bundle.ignore,
    })
    const B = Filling.at(Link.field<Model>()('b', GotB), {
      args: { limit: 8, start: 0 },
      onOut: Bundle.ignore,
    })
    expect(A.helpers.fill()(model).model.a.count).toBe(3)
    expect(B.helpers.fill()(model).model.b.count).toBe(8)
  })

  it('see the args derived from the seed the assembly last ran, not earlier ones', () => {
    const A = Filling.at(Link.field<Model>()('a', GotA), {
      args: (seed: Pick<Model, 'ticks'>) => ({ limit: seed.ticks + 3, start: 0 }),
      onOut: Bundle.ignore,
    })
    const assembly = Bundle.assemble<Model, Message>()([A])
    assembly.initial({ b: counter, items: {}, ticks: 4 })
    expect(A.helpers.fill()(model).model.a.count).toBe(7)
    assembly.initial({ b: counter, items: {}, ticks: 1 })
    expect(A.helpers.fill()(model).model.a.count).toBe(4)
  })

  it('are bound by a preset', () => {
    const Preset = Filling.with({ limit: 6, start: 0 })
    // A preset takes no args, so its helpers need none to read.
    expect(Bundle.helpersOf(Preset).fill(counter).model.count).toBe(6)
  })

  it('are read off the bundle with the args given, for a parent that folds it itself', () => {
    expect(Bundle.helpersOf(Filling, { limit: 4, start: 0 }).fill(counter).model.count).toBe(4)
  })

  it('stay beside the helpers `withHelpers` adds', () => {
    const Both = Filling.pipe(
      Bundle.withHelpers({
        zero: (child: CounterModel) => ({ model: { ...child, count: 0 } }),
      }),
    )
    const A = Both.at(Link.field<Model>()('a', GotA), {
      args: { limit: 5, start: 0 },
      onOut: Bundle.ignore,
    })
    const filled = A.helpers.fill()(model)
    expect(filled.model.a.count).toBe(5)
    expect(A.helpers.zero()(filled.model).model.a.count).toBe(0)
  })

  it('see a collection’s args, for the item named', () => {
    const Items = Filling.each(Link.collection<Model>()('items', GotItem), {
      args: { limit: 9, start: 0 },
      onOut: Bundle.ignore,
    })
    const filled = Items.helpers.fill('x')(model)
    expect(Option.fromUndefinedOr(filled.model.items['x']?.count)).toEqual(Option.some(9))
  })
})
