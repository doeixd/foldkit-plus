/**
 * A row's revision on Remote's wire (#544, #480's open item): an answer of a
 * lower revision than the row held writes nothing, whichever Message brings
 * it, and a row with no revision behaves as before.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Remote, fieldMark, type RemoteMessage } from '../src/index.js'
import { live } from '../src/live.js'

const Product = Entity.make(
  'Product',
  Schema.Struct({ id: Schema.String, name: Schema.String, stock: Schema.Number }),
)
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Product], mutations: [Rename] })
const selection = Product.select({ name: true, stock: true })
const product = Data.get(selection, 'p1')
live(Data, selection, 'p1')

const request = { entity: 'Product', id: 'p1', fields: ['name', 'stock'] }
const row = (name: string, revision?: number) => ({
  entity: 'Product',
  id: 'p1',
  values: { name, stock: 3 },
  ...(revision === undefined ? {} : { revision }),
})
const readOf = (name: string, revision?: number, now = 0): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [request],
  result: { entities: [row(name, revision)], settled: [] },
  now,
})
const patchOf = (name: string, cursor: number, revision?: number): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream: 's',
  event: {
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'Product', id: 'p1' },
    values: { name },
    changed: ['name'],
    ...(revision === undefined ? {} : { revision }),
  },
  now: 10 + cursor,
})
const answerOf = (from: Model, name: string, revision?: number): Model => {
  const started = Data.mutate(from, Rename, { id: 'p1', name }, { optimistic: [] })
  return Data.reduce(started.model, {
    _tag: 'MutationSucceeded',
    requestId: started.requestId,
    entities: [
      {
        entity: 'Product',
        id: 'p1',
        values: { name },
        ...(revision === undefined ? {} : { revision }),
      },
    ],
    now: 20,
  })
}

const nameOf = (model: Model): string | undefined => {
  const data = product.read(model)
  return data._tag === 'Ready' || data._tag === 'Refreshing' ? data.value.name : undefined
}

const at5 = Data.reduce({ remote: Remote.initial }, readOf('Five', 5))

describe('A row revision', () => {
  // Every Message that writes a row answer, at a lower revision than held.
  const older: ReadonlyArray<readonly [string, (model: Model) => Model]> = [
    ['ReadReceived', model => Data.reduce(model, readOf('Four', 4, 1))],
    ['LiveReceived', model => Data.reduce(model, patchOf('Four', 1, 4))],
    ['MutationSucceeded', model => answerOf(model, 'Four', 4)],
  ]

  it.each(older)('drops a lower revision from %s', (_, apply) => {
    expect(nameOf(apply(at5))).toBe('Five')
    expect(apply(at5).remote.entities['Product:p1']?.revision).toBe(5)
  })

  const newer: ReadonlyArray<readonly [string, (model: Model) => Model]> = [
    ['ReadReceived', model => Data.reduce(model, readOf('Six', 6, 1))],
    ['LiveReceived', model => Data.reduce(model, patchOf('Six', 1, 6))],
    ['MutationSucceeded', model => answerOf(model, 'Six', 6)],
  ]

  it.each(newer)('writes a higher revision from %s, and holds it', (_, apply) => {
    expect(nameOf(apply(at5))).toBe('Six')
    expect(apply(at5).remote.entities['Product:p1']?.revision).toBe(6)
  })

  it('writes an answer at the revision held', () => {
    // The same revision may carry fields the row lacked, or a change no event moved.
    expect(nameOf(Data.reduce(at5, readOf('Still five', 5, 1)))).toBe('Still five')
  })

  it('writes a row with no revision as before, and keeps the revision held', () => {
    const plain = Data.reduce(at5, readOf('Plain', undefined, 1))
    expect(nameOf(plain)).toBe('Plain')
    expect(plain.remote.entities['Product:p1']?.revision).toBe(5)
    // The revision held still orders what comes after.
    expect(nameOf(Data.reduce(plain, readOf('Four', 4, 2)))).toBe('Plain')
  })

  it('advances the live cursor past a dropped patch', () => {
    const dropped = Data.reduce(at5, patchOf('Four', 1, 4))
    // The next event is not a gap.
    const next = Data.reduce(dropped, patchOf('Seven', 2, 7))
    expect(next.remote.gaps.size).toBe(0)
    expect(nameOf(next)).toBe('Seven')
  })

  it('leaves a field failure standing under a dropped patch', () => {
    const named = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Product', id: 'p1', fields: ['name'] }],
        result: {
          entities: [{ entity: 'Product', id: 'p1', values: { name: 'Five' }, revision: 5 }],
          settled: [],
        },
        now: 0,
      },
    )
    const failed = Data.reduce(named, {
      _tag: 'ReadFailed',
      requests: [{ entity: 'Product', id: 'p1', fields: ['stock'] }],
      error: { _tag: 'RemoteReadError', message: 'down' },
    })
    const stale: RemoteMessage = {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        cursor: 1,
        ref: { entity: 'Product', id: 'p1' },
        values: { stock: 1 },
        changed: ['stock'],
        revision: 4,
      },
      now: 11,
    }
    expect(Object.keys(Data.reduce(failed, stale).remote.failures.fields)).toEqual([
      fieldMark('Product', 'p1', 'stock'),
    ])
  })

  it('keeps a deleted row gone from a row of the revision it was deleted at', () => {
    const gone = Data.reduce(at5, {
      _tag: 'LiveReceived',
      stream: 's',
      event: { _tag: 'EntityDeleted', cursor: 1, ref: { entity: 'Product', id: 'p1' } },
      now: 11,
    })
    expect(product.read(Data.reduce(gone, readOf('Five', 5, 12)))._tag).toBe('NotFound')
    expect(nameOf(Data.reduce(gone, readOf('Six', 6, 12)))).toBe('Six')
  })

  const hidden = Data.reduce(at5, {
    _tag: 'ReadReceived',
    requests: [request],
    result: { entities: [], settled: [] },
    now: 11,
  })

  it('brings back a row a read left out, asked again, at the revision it had', () => {
    // Hidden from this reader for a while, then shown again unchanged.
    expect(product.read(hidden)._tag).toBe('NotFound')
    const asked = Data.refresh(hidden, product)
    expect(nameOf(Data.reduce(asked, readOf('Five', 5, 12)))).toBe('Five')
  })

  it('keeps a row a read left out gone from a late answer at the revision it had', () => {
    // An answer to a read begun before the one that left the row out.
    expect(product.read(Data.reduce(hidden, readOf('Five', 5, 12)))._tag).toBe('NotFound')
  })
})
