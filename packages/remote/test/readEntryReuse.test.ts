/**
 * A read entry's plan reused without working out what it asks (#580): while
 * the store is the same object and so is everything the ask reads beside it,
 * the plan cannot have changed. Counted by how often the Surface's projection
 * is built, which is what working out the ask costs.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Remote, RemotePolicy, type RemoteMessage } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model, draft: Schema.String, route: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item] })
const Named = Entity.select(Item, { name: true })
const initial: Model = { remote: Remote.initial, draft: '', route: 'i1' }

const answered = (id: string): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [{ entity: 'Item', id, fields: ['name'] }],
  result: { settled: [], entities: [{ entity: 'Item', id, values: { name: id } }] },
  now: 0,
})

/** A Surface that counts how often its projection is built. */
const counted = () => {
  const built = { count: 0 }
  const surface = Surface.make(App, 'Detail', {
    Params: Schema.Struct({ id: Schema.String }),
    model: ({ params }) => {
      built.count += 1
      return Data.get(Named, params.id)
    },
  })
  return { built, surface }
}

const asked = (dependencies: { readonly requirements: ReadonlyArray<{ readonly id: string }> }) =>
  dependencies.requirements.map(requirement => requirement.id)

describe('A read entry reuses its plan', () => {
  it('without building the ask while the store is the same and the ask reads nothing else', () => {
    const { built, surface } = counted()
    const read = Remote.observe(Data, surface, { id: 'i1' })
    const first = read.modelToDependencies(initial)
    expect(built.count).toBe(1)
    expect(read.modelToDependencies({ ...initial, draft: 'typing' })).toBe(first)
    expect(read.modelToDependencies({ ...initial, draft: 'typing more' })).toBe(first)
    expect(built.count).toBe(1)
    const answeredModel = Data.reduce(initial, answered('i1'))
    expect(asked(read.modelToDependencies(answeredModel))).toEqual([])
    expect(built.count).toBe(2)
  })

  it('for a bare Surface in a subscriptions record', () => {
    const built = { count: 0 }
    const Bare = App.surface('Bare', {
      model: () => {
        built.count += 1
        return { item: Data.get(Named, 'i1') }
      },
    })
    const read = Data.subscriptions({ bare: Bare })['bare.read']
    const first = read.modelToDependencies(initial)
    const counted = built.count
    expect(read.modelToDependencies({ ...initial, draft: 'typing' })).toBe(first)
    expect(built.count).toBe(counted)
  })

  it('not across a change of the policy the Model picks', () => {
    const { surface } = counted()
    const read = Remote.observe(Data, surface, { id: 'i1' }, undefined, {
      policy: (model: Model) =>
        model.route === 'offline' ? RemotePolicy.cacheOnly : RemotePolicy.cacheFirst,
    })
    expect(asked(read.modelToDependencies(initial))).toEqual(['i1'])
    // The same store, read under a policy that asks the server nothing.
    expect(asked(read.modelToDependencies({ ...initial, route: 'offline' }))).toEqual([])
  })

  it('not past the time its plan says to read again', () => {
    const { surface } = counted()
    let clock = 10
    const read = Remote.observe(Data, surface, { id: 'i1' }, undefined, {
      policy: RemotePolicy.staleWhileRevalidate({ maxAge: 100 }),
      now: () => clock,
    })
    const held = Data.reduce(initial, answered('i1'))
    const fresh = read.modelToDependencies(held)
    expect(fresh.expires?.at).toBe(100)
    expect(fresh.refreshes).toEqual([])
    clock = 50
    expect(read.modelToDependencies({ ...held, draft: 'typing' })).toBe(fresh)
    clock = 150
    expect(asked({ requirements: read.modelToDependencies(held).refreshes })).toEqual(['i1'])
  })

  it('and works the ask out again where it may read the Model beside the store', () => {
    const { built, surface } = counted()
    const read = Data.subscriptions({
      detail: Surface.at(surface, (model: Model) => Option.some({ id: model.route })),
    })['detail.read']
    expect(asked(read.modelToDependencies(initial))).toEqual(['i1'])
    // The store is the same object, and what the Surface reads is not.
    expect(asked(read.modelToDependencies({ ...initial, route: 'i2' }))).toEqual(['i2'])
    expect(built.count).toBe(2)
  })
})
