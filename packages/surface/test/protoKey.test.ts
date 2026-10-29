/** Model fields and record keys named like `Object.prototype` members. */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Projection, Surface } from '../src/index.js'

const names = ['__proto__', 'constructor', 'toString'] as const

// As a stored Model arrives: `JSON.parse` makes `__proto__` a key of its own.
const model = JSON.parse(
  '{"__proto__":"p","constructor":"c","toString":"t","other":"o","items":{"a":1}}',
)
const Model = Schema.Struct({
  ['__proto__']: Schema.String,
  constructor: Schema.String,
  toString: Schema.String,
  other: Schema.String,
  items: Schema.Record(Schema.String, Schema.Number),
})
const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })
const refOf = (name: (typeof names)[number]) =>
  (App.model as unknown as Record<string, typeof App.model.other>)[name]!

describe('fields named like Object.prototype members', () => {
  it.each(names)('%s has a reference of its own', name => {
    expect(Object.hasOwn(App.model, name)).toBe(true)
    expect(refOf(name).get(model)).toBe(model[name])
  })

  it('Projection.pick reads and writes each', () => {
    const Pick = Projection.pick(refOf('__proto__'), refOf('constructor'), refOf('toString'))
    expect(Object.entries(Pick.get(model))).toEqual([
      ['__proto__', 'p'],
      ['constructor', 'c'],
      ['toString', 't'],
    ])
    expect(Object.keys(Pick.schema.fields)).toEqual(names)
    const written = Pick.set(
      model,
      JSON.parse('{"__proto__":"P","constructor":"C","toString":"T"}'),
    )
    expect(Object.entries(written)).toEqual([
      ['__proto__', 'P'],
      ['constructor', 'C'],
      ['toString', 'T'],
      ['other', 'o'],
      ['items', { a: 1 }],
    ])
  })

  it('Projection.of reads each', () => {
    const Of = Projection.of(Model)(JSON.parse('{"__proto__":true,"constructor":true}'))
    expect(Object.entries(Of.read(model))).toEqual([
      ['__proto__', 'p'],
      ['constructor', 'c'],
    ])
    const decoded = Schema.decodeUnknownSync(Of.Model)(
      JSON.parse('{"__proto__":"x","constructor":"y"}'),
    )
    expect(Object.entries(decoded)).toEqual([
      ['__proto__', 'x'],
      ['constructor', 'y'],
    ])
  })

  it('Projection.compose keeps each', () => {
    const Both = Projection.compose(
      Projection.pick(refOf('__proto__'), refOf('constructor')),
      Projection.pick(refOf('toString'), App.model.other),
    )
    expect(Object.keys(Both.schema.fields)).toEqual([...names, 'other'])
    expect(Object.entries(Both.get(model))).toEqual([
      ['__proto__', 'p'],
      ['constructor', 'c'],
      ['toString', 't'],
      ['other', 'o'],
    ])
    const Proto = Projection.pick(refOf('__proto__'))
    expect(Object.keys(Projection.compose(Proto, Proto).schema.fields)).toEqual(['__proto__'])
  })
})

describe('record keys named like Object.prototype members', () => {
  it.each(names)('a record without %s reads it as absent', name => {
    expect(Option.isNone(App.model.items.at(name).get(model))).toBe(true)
  })
})
