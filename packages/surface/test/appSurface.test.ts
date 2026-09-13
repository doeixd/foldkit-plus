import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Projection, Requirement, Surface } from '../src/index.js'

const Model = Schema.Struct({ route: Schema.String, count: Schema.Number })
const Message = defineMessageUnion({ Ping: {}, Bump: { by: Schema.Number } })
const App = Surface.application({ Model, Message })
const root = { route: '/p1', count: 3 }

describe('App.surface lifts the mechanical wrappers', () => {
  it('plain params fields become the Params Struct', () => {
    const Page = App.surface('Page', {
      params: { id: Schema.String },
      model: ({ params, model }) => ({
        id: Projection.fromReader(Schema.String, () => params.id),
        count: model.count,
      }),
    })
    expect(Schema.decodeUnknownSync(Page.Params as never)({ id: 'p1' })).toEqual({ id: 'p1' })
    expect(() => Schema.decodeUnknownSync(Page.Params as never)({})).toThrow()
    expect(Page.projection({ id: 'p1' }).read(root)).toEqual({ id: 'p1', count: 3 })
  })

  it('an explicit Params schema is kept as is', () => {
    const Params = Schema.Struct({ id: Schema.String }).annotate({ title: 'PageParams' })
    const Page = App.surface('Page', {
      params: Params,
      model: ({ model }) => ({ count: model.count }),
    })
    expect(Page.Params).toBe(Params)
    expect(Page.projection({ id: 'p1' }).read(root)).toEqual({ count: 3 })
  })

  it('an object of Projections and refs is Projection.struct; a Projection passes through', () => {
    const Lifted = App.surface('Lifted', {
      model: ({ model }) => ({ count: model.count, route: model.route }),
    })
    const Explicit = App.surface('Explicit', {
      model: ({ model }) => Projection.struct({ count: model.count, route: model.route }),
    })
    expect(Lifted.Params).toBeUndefined()
    expect(Lifted.projection(undefined).read(root)).toEqual({ count: 3, route: '/p1' })
    expect(Lifted.projection(undefined).dependencies).toEqual(
      Explicit.projection(undefined).dependencies,
    )
  })

  it('carries the Message subset like Surface.make', () => {
    const Page = App.surface('Page', {
      model: ({ model }) => ({ count: model.count }),
      messages: [Message.Bump],
    })
    expect(Page.messages).toEqual([Message.Bump])
    expect(Page.owner).toBe(App.owner)
  })
})

describe('Surface.at makes activation a Model fact', () => {
  const Page = App.surface('Page', {
    params: { id: Schema.String },
    model: ({ params }) => Projection.fromReader(Schema.String, () => params.id),
  })

  it('a value activates the Surface with those params', () => {
    expect(Surface.at(Page, { id: 'p9' }).projectionOf(root)?.read(root)).toBe('p9')
    expect(Surface.at(Page, { id: 'p9' }).name).toBe('Page')
  })

  it('a function reads the params from the Model, and undefined means inactive', () => {
    const active = Surface.at(Page, model =>
      model.route.startsWith('/') ? { id: model.route.slice(1) } : undefined,
    )
    expect(active.projectionOf(root)?.read(root)).toBe('p1')
    expect(active.projectionOf({ ...root, route: 'home' })).toBeUndefined()
  })

  it('a Surface without params is active whatever the function returns', () => {
    const Home = App.surface('Home', { model: ({ model }) => ({ count: model.count }) })
    expect(Surface.at(Home, undefined).projectionOf(root)?.read(root)).toEqual({ count: 3 })
    expect(
      Surface.at(Home, () => undefined)
        .projectionOf(root)
        ?.read(root),
    ).toEqual({ count: 3 })
  })
})

describe('Requirement.merge keeps the live mark', () => {
  it('a requirement is live when any merged part is', () => {
    const plain = { entity: 'User', id: 'u1', fields: ['name'] }
    expect(Requirement.merge([plain, { ...plain, fields: ['id'], live: true }])).toEqual([
      { entity: 'User', id: 'u1', fields: ['name', 'id'], live: true },
    ])
    expect(Requirement.merge([plain, { ...plain, live: false }])).toEqual([plain])
    // Whichever part carries it, first or later.
    expect(
      Requirement.merge([
        { ...plain, live: true },
        { ...plain, fields: ['id'] },
      ]),
    ).toEqual([{ entity: 'User', id: 'u1', fields: ['name', 'id'], live: true }])
  })
})
