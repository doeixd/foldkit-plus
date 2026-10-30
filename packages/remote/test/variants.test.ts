/**
 * Variants of an Entity (#357) in Remote's store: the store holds the stored
 * row, every field of every case, and a Selection that selects `_tag` reads it
 * as its case, as the Entity Selection's own schema says.
 */
import { Schema } from 'effect'
import { Entity as Domain, Relation } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  Selection,
  emptyStore,
  entityKey,
  initialRemoteModel,
  writeEntity,
  type EntityStore,
} from '../src/index.js'

const DomainFields = Domain.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const CartFields = Domain.define('Cart', Schema.Struct({ id: Schema.String }))
const Shop = Domain.relate(
  { Domain: DomainFields, Cart: CartFields },
  { Cart: { domain: Relation.one(DomainFields) } },
)

const Quote = Domain.select(Shop.Domain, { _tag: true, name: true, price: true })
const Names = Domain.select(Shop.Domain, { name: true })
const CartLine = Domain.select(Shop.Cart, { domain: Quote })

const Data = Remote.define({ entities: [Entity.from(Shop.Domain), Entity.from(Shop.Cart)] })
const App = Surface.application({
  Model: Schema.Struct({ remote: Data.Model }),
  Message: defineMessageUnion({ Ping: {} }),
})
const AppRemote = Remote.at(Data, App.model.remote)
const root = (store: EntityStore) => ({ remote: { ...initialRemoteModel, entities: store } })

const store = [
  ['d1', { _tag: 'Available', id: 'd1', name: 'a.dev', price: 5 }],
  ['d2', { _tag: 'Unconfirmed', id: 'd2', name: 'b.dev', price: null }],
] as const
const held = store.reduce(
  (entities, [id, row]) => writeEntity(entities, entityKey('Domain', id), row),
  writeEntity(emptyStore, entityKey('Cart', 'c1'), { id: 'c1', domain: 'Domain:d2' }),
)

describe('a variant Selection in Remote', () => {
  it('reads each stored row as its case', () => {
    const read = Remote.select(AppRemote, Selection.from(Quote))
    expect(read('d1').read(root(held))).toEqual({
      _tag: 'Ready',
      value: { _tag: 'Available', name: 'a.dev', price: 5 },
    })
    expect(read('d2').read(root(held))).toEqual({
      _tag: 'Ready',
      value: { _tag: 'Unconfirmed', name: 'b.dev' },
    })
  })

  it('reads the case of a row a relation reaches', () => {
    expect(Remote.select(AppRemote, Selection.from(CartLine))('c1').read(root(held))).toEqual({
      _tag: 'Ready',
      value: { domain: { _tag: 'Unconfirmed', name: 'b.dev' } },
    })
  })

  it('reads one without _tag as the stored row', () => {
    expect(Remote.select(AppRemote, Selection.from(Names))('d2').read(root(held))).toEqual({
      _tag: 'Ready',
      value: { name: 'b.dev' },
    })
  })
})
