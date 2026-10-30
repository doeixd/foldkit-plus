/** Model fields named like a ref's own members (#331). */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { ModelRef, Projection, Surface } from '../src/index.js'

const Inner = Schema.Struct({
  Schema: Schema.String,
  optic: Schema.String,
  dependency: Schema.String,
  dependencies: Schema.String,
  key: Schema.String,
  read: Schema.String,
  get: Schema.String,
  set: Schema.String,
  modify: Schema.String,
  owner: Schema.String,
  at: Schema.Number,
  index: Schema.Number,
  select: Schema.Boolean,
})
const Model = Schema.Struct({ index: Schema.Number, carousel: Inner })
const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })

const carousel = {
  Schema: 's',
  optic: 'o',
  dependency: 'd',
  dependencies: 'ds',
  key: 'k',
  read: 'r',
  get: 'g',
  set: 'st',
  modify: 'm',
  owner: 'w',
  at: 1,
  index: 2,
  select: true,
}
const model = { index: 7, carousel }

describe('fields named like a ref member', () => {
  it.each(Object.keys(carousel) as ReadonlyArray<keyof typeof carousel>)(
    '%s reads and writes as a field',
    name => {
      const focus = ModelRef.focus(App.model.carousel[name])
      expect(focus.get(model)).toBe(carousel[name])
      expect(focus.dependency).toEqual(['carousel', name])
      expect(focus.key).toBe(name)
      expect(focus.set(model, carousel[name] as never)).toEqual(model)
    },
  )

  it('keeps only the fields as string keys', () => {
    expect(Object.keys(App.model)).toEqual(['index', 'carousel'])
    expect(Object.keys(App.model.carousel)).toEqual(Object.keys(carousel))
  })

  it('writes through a field named set', () => {
    expect(ModelRef.focus(App.model.carousel.set).set(model, 'x').carousel.set).toBe('x')
    expect(ModelRef.focus(App.model.index).modify(model, index => index + 1).index).toBe(8)
  })

  it('Projection.pick and Projection.struct read them', () => {
    const Picked = Projection.pick(App.model.carousel.index, App.model.carousel.at)
    expect(Picked.get(model)).toEqual({ index: 2, at: 1 })

    const Struct = Projection.struct({
      dependencies: App.model.carousel.dependencies,
      index: App.model.index,
    })
    expect(Struct.read(model)).toEqual({ dependencies: 'ds', index: 7 })
    expect(Struct.dependencies).toEqual([['carousel', 'dependencies'], ['index']])

    // A ref to a Struct with fields named like a Projection's members is still a ref.
    const Whole = Projection.struct({ carousel: App.model.carousel })
    expect(Whole.read(model)).toEqual({ carousel })
    expect(Whole.dependencies).toEqual([['carousel']])
  })

  it('a Surface reads them', () => {
    const Carousel = App.surface('carousel', {
      model: ({ model }) => ({ index: model.carousel.index, select: model.carousel.select }),
    })
    expect(Carousel.projection(undefined).read(model)).toEqual({ index: 2, select: true })
  })
})

describe('a focus', () => {
  const Records = Surface.application({
    Model: Schema.Struct({
      byId: Schema.Record(Schema.String, Schema.Struct({ title: Schema.String })),
      items: Schema.Array(Schema.Number),
    }),
    Message: defineMessageUnion({ Ping: {} }),
  })
  const records = { byId: { a: { title: 'A' } }, items: [1, 2] }
  const Title = Projection.of(Schema.Struct({ title: Schema.String }))({ title: true })

  it('a focus goes to a record entry, an array item and a selection', () => {
    const entry = ModelRef.focus(ModelRef.focus(Records.model.byId).at('a'))
    expect(entry.get(records)).toEqual(Option.some({ title: 'A' }))
    expect(entry.dependency).toEqual(['byId', 'a'])
    expect(entry.select(Title).read(records)).toEqual(Option.some({ title: 'A' }))
    const item = ModelRef.focus(ModelRef.focus(Records.model.items).index(1))
    expect(item.get(records)).toEqual(Option.some(2))
  })

  it('ModelRef.is tells a ref from a Projection', () => {
    expect(ModelRef.is(Records.model.byId)).toBe(true)
    expect(ModelRef.is(Title)).toBe(false)
    expect(ModelRef.is({ dependency: [], get: () => 1 })).toBe(false)
  })
})
