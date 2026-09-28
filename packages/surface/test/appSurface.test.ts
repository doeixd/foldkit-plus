import { Schema, Option } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Projection, Surface, type ActiveSurface } from '../src/index.js'

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
    expect(Schema.decodeUnknownSync(Page.Params)({ id: 'p1' })).toEqual({ id: 'p1' })
    expect(() => Schema.decodeUnknownSync(Page.Params)({})).toThrow()
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

  it('carries the Surface’s name and owner, so a domain can tell another application’s Surface', () => {
    const active = Surface.at(Page, { id: 'p1' })
    expect(active.name).toBe('Page')
    expect(active.owner).toBe(App.owner)
  })

  it('a value activates the Surface with those params', () => {
    expect(
      Option.map(Surface.at(Page, { id: 'p9' }).projectionOf(root), shown => shown.read(root)),
    ).toEqual(Option.some('p9'))
    expect(Surface.at(Page, { id: 'p9' }).name).toBe('Page')
  })

  it('a function reads the params from the Model, and none means inactive', () => {
    const active = Surface.at(Page, model =>
      model.route.startsWith('/') ? Option.some({ id: model.route.slice(1) }) : Option.none(),
    )
    expect(Option.map(active.projectionOf(root), shown => shown.read(root))).toEqual(
      Option.some('p1'),
    )
    expect(Option.isNone(active.projectionOf({ ...root, route: 'home' }))).toBe(true)
  })

  it('a Surface without params is active as a value, and its function says when', () => {
    const Home = App.surface('Home', { model: ({ model }) => ({ count: model.count }) })
    const read = (active: ActiveSurface<typeof root>) =>
      Option.map(active.projectionOf(root), shown => shown.read(root))
    expect(read(Surface.at(Home, undefined))).toEqual(Option.some({ count: 3 }))
    expect(read(Surface.at(Home, () => Option.some(undefined)))).toEqual(Option.some({ count: 3 }))
    expect(read(Surface.at(Home, () => Option.none()))).toEqual(Option.none())
  })
})
