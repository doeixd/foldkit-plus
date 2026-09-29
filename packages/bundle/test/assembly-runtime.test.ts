/**
 * `assembly.runtime`: the runtime config in one call. `initial` rest becomes
 * `init`, or an init function returning `assembly.initial(...)` is used as
 * `init`; the full update passes through; own Subscriptions and Managed
 * Resources merge with the items', defaulting to the items'.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const GotA = Link.wrapper('GotAMessage', CounterMessage)
const Model = Schema.Struct({ a: CounterModel, ticks: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Ticked: {}, ...GotA.cases })
type Message = typeof Message.Type

// Counter uses the `Socket` resource tag; placing needs its resource record.
const A = Counter.at(Link.field<Model>()('a', GotA), {
  args: { limit: 9, start: 1 },
  onOut: Bundle.ignore,
})
const assembly = Bundle.assemble<Model, Message>()([A])

const ownUpdate = (model: Model, message: Message) =>
  message._tag === 'Ticked' ? { model: { ...model, ticks: model.ticks + 1 } } : { model }

// Like a real application: the update routes every placement first, so what
// `runtime` receives already handles the whole Message.
const update = assembly.update(ownUpdate)

describe('assembly.runtime with initial rest', () => {
  it('derives init, update, subscriptions, and resources, passing the rest through', () => {
    const config = assembly.runtime({
      Model,
      container: null,
      initial: { ticks: 0 },
      update: update,
      view: 'view',
      routing: 'routing',
    })
    expect('initial' in config).toBe(false)
    expect(config.container).toBe(null)
    expect(config.view).toBe('view')
    expect(config.routing).toBe('routing')
    expect(config.init().model.a).toEqual({ count: 1, running: false })
    expect(
      config.update({ a: { count: 0, running: false }, ticks: 0 }, Message.Ticked()).model.ticks,
    ).toBe(1)
    expect(
      config.update(
        { a: { count: 0, running: false }, ticks: 0 },
        GotA.make(CounterMessage.Incremented()),
      ).model.a.count,
    ).toBe(1)
    expect(Object.keys(config.subscriptions)).toEqual(['Counter@a/ticks'])
    expect(Object.keys(config.managedResources)).toEqual(['Counter@a/socket'])
  })

  it('merges the parent’s own Subscriptions and resources with the items’', () => {
    const ownSubs = Subscription.make<Model, Message>()(entry => ({
      clock: entry(
        {},
        { modelToDependencies: () => ({}), dependenciesToStream: () => Stream.empty },
      ),
    }))
    const config = assembly.runtime({
      initial: { ticks: 0 },
      update: update,
      subscriptions: ownSubs,
    })
    expect(Object.keys(config.subscriptions).sort()).toEqual(['Counter@a/ticks', 'clock'])
  })

  it('refuses an init of its own, naming initial instead', () => {
    expect(() =>
      assembly.runtime({
        initial: { ticks: 0 },
        update: update,
        // @ts-expect-error: runtime owns init
        init: () => assembly.initial({ ticks: 0 }),
      }),
    ).toThrow(/runtime owns init/)
  })
})

describe('assembly.runtime with an init function', () => {
  it('uses the function as init and still derives the records', () => {
    const init = () => assembly.initial({ ticks: 0 })
    const config = assembly.runtime({ initial: init, update: update })
    expect(config.init).toBe(init)
    expect(config.init().model.a).toEqual({ count: 1, running: false })
    expect(Object.keys(config.subscriptions)).toEqual(['Counter@a/ticks'])
    expect(Object.keys(config.managedResources)).toEqual(['Counter@a/socket'])
  })
})

describe('assembly.runtime with a composed update', () => {
  it('routes a narrow own update composed in, with a function seed', () => {
    const narrow = (model: Model, message: { readonly _tag: 'Ticked' }) => ({
      model: { ...model, ticks: model.ticks + 1 },
    })
    const config = assembly.runtime({
      initial: () => assembly.initial({ ticks: 0 }),
      update: assembly.update(narrow),
    })
    expect(config.init().model).toEqual({ a: { count: 1, running: false }, ticks: 0 })
    const ticked = config.update({ a: { count: 0, running: false }, ticks: 0 }, Message.Ticked())
    expect(ticked.model.ticks).toBe(1)
    const incremented = config.update(
      { a: { count: 0, running: false }, ticks: 0 },
      GotA.make(CounterMessage.Incremented()),
    )
    expect(incremented.model.a.count).toBe(1)
  })
})

describe('assembly.runtime with derived args', () => {
  it('reads a factory placement’s resources once initial ran', () => {
    const dynamic = Counter.at(Link.field<Model>()('a', GotA), {
      args: () => ({ limit: 9, start: 2 }),
      onOut: Bundle.ignore,
    })
    const dynamicAssembly = Bundle.assemble<Model, Message>()([dynamic])
    dynamicAssembly.initial({ ticks: 0 })
    expect(Object.keys(dynamicAssembly.resources())).toEqual(['Counter@a/socket'])
    const config = dynamicAssembly.runtime({ initial: { ticks: 0 }, update: update })
    expect(Object.keys(config.managedResources)).toEqual(['Counter@a/socket'])
    expect(config.init().model.a).toEqual({ count: 2, running: false })
  })
})

describe('assembly.runtime with update omitted', () => {
  it('routes placements and leaves own Messages unchanged', () => {
    const config = assembly.runtime({ initial: { ticks: 0 } })
    expect(config.init().model).toEqual({ a: { count: 1, running: false }, ticks: 0 })
    const model: Model = { a: { count: 0, running: false }, ticks: 0 }
    expect(config.update(model, GotA.make(CounterMessage.Incremented())).model.a.count).toBe(1)
    expect(config.update(model, Message.Ticked()).model).toBe(model)
    expect(Object.keys(config.subscriptions)).toEqual(['Counter@a/ticks'])
  })
})

describe('factory memoization', () => {
  const seed = { ticks: 0 }

  it('runs once per seed across records and init', () => {
    const calls = { count: 0 }
    const counted = Counter.at(Link.field<Model>()('a', GotA), {
      args: () => {
        calls.count += 1
        return { limit: 9, start: 1 }
      },
      onOut: Bundle.ignore,
    })
    const countedAssembly = Bundle.assemble<Model, Message>()([counted])
    const config = countedAssembly.runtime({ initial: seed, update: update })
    expect(calls.count).toBe(1)
    expect(config.init().model.a).toEqual({ count: 1, running: false })
    expect(calls.count).toBe(1)
  })

  it('re-runs for a new seed', () => {
    const calls = { count: 0 }
    const counted = Counter.at(Link.field<Model>()('a', GotA), {
      args: () => {
        calls.count += 1
        return { limit: 9, start: 1 }
      },
      onOut: Bundle.ignore,
    })
    const countedAssembly = Bundle.assemble<Model, Message>()([counted])
    countedAssembly.initial({ ticks: 0 })
    countedAssembly.initial({ ticks: 1 })
    expect(calls.count).toBe(2)
    countedAssembly.initial({ ticks: 1 })
    expect(calls.count).toBe(2)
  })
})
