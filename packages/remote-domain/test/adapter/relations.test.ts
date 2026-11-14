// @vitest-environment node
/**
 * `one` relations through the adapter: a product's View holds its supplier's
 * id, the read answers it as a ref key, and the supplier is read through its
 * own View in the same batch, where `validate` hides an unlisted one.
 */
import { Effect, type Layer, type Scope } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { RemoteClient, REMOTE_PROTOCOL_VERSION, type Requirement } from 'foldkit-remote'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { DomainRemote } from '../../src/index.js'
import { Products, shop, ShopApi } from './lists.js'

type Shop = ReturnType<typeof shop>

const run = <A, E>(body: Effect.Effect<A, E, Layer.Success<Shop['layer']> | Scope.Scope>) => {
  const seeded = shop()
  return Effect.runPromise(
    Effect.andThen(seeded.drain, body).pipe(Effect.scoped, Effect.provide(seeded.layer)),
  )
}

const read = (requests: ReadonlyArray<Requirement>) =>
  Effect.flatMap(RemoteClient, client =>
    client.read({ version: REMOTE_PROTOCOL_VERSION, requests }),
  )

const withSupplier = (id: string): Requirement => ({
  entity: 'Product',
  id,
  fields: ['stock', 'supplier'],
  relations: { supplier: { entity: 'Supplier', fields: ['name', 'revision'] } },
})

describe('a one relation', () => {
  it('answers the target as a ref key, and reads it through its View in the same batch', async () => {
    const answer = await run(read([withSupplier('p1'), withSupplier('p2')]))
    expect(answer.entities).toEqual([
      { entity: 'Product', id: 'p1', values: { stock: 10, supplier: 'Supplier:s1' }, revision: 1 },
      { entity: 'Product', id: 'p2', values: { stock: 5, supplier: 'Supplier:s1' }, revision: 1 },
      // Read once, though two products point at it.
      { entity: 'Supplier', id: 's1', values: { name: 'Acme', revision: 1 }, revision: 1 },
    ])
    expect(answer.settled).toEqual([])
  })

  it('answers a link that points nowhere as null, and reads no target', async () => {
    const answer = await run(read([withSupplier('p5')]))
    expect(answer.entities).toEqual([
      { entity: 'Product', id: 'p5', values: { stock: 5, supplier: null }, revision: 1 },
    ])
  })

  it('leaves out a target its own View hides from who asks', async () => {
    const answer = await run(read([withSupplier('p4')]))
    expect(answer.entities).toEqual([
      { entity: 'Product', id: 'p4', values: { stock: 5, supplier: 'Supplier:s2' }, revision: 1 },
    ])
  })

  it('reads no target of a row its View hides', async () => {
    const answer = await run(read([withSupplier('p3')]))
    expect(answer.entities).toEqual([])
  })

  it('reads the targets of a list page selected with the relation', async () => {
    const page = await run(
      Effect.flatMap(RemoteClient, client =>
        client.query({
          query: 'Stocked',
          input: { shelf: 'main' },
          window: { first: 2 },
          select: {
            entity: 'Product',
            fields: ['supplier'],
            relations: { supplier: { entity: 'Supplier', fields: ['name'] } },
          },
        }),
      ),
    )
    expect(page.entities?.map(row => `${row.entity}:${row.id}`)).toEqual([
      'Product:p1',
      'Product:p2',
      'Supplier:s1',
    ])
  })

  it.each([
    {
      request: { entity: 'Supplier', id: 's1', fields: ['products'] },
      refused: /Supplier\.products is a list of rows/,
    },
    {
      request: {
        entity: 'Product',
        id: 'p1',
        fields: ['supplier'],
        relations: { supplier: { entity: 'Product', fields: ['stock'] } },
      },
      refused: /Product\.supplier points at Supplier, not Product/,
    },
    {
      request: {
        entity: 'Product',
        id: 'p1',
        fields: ['stock'],
        windows: { supplier: { first: 1 } },
      },
      refused: /pages no relation/,
    },
  ])('refuses $request.fields by name', async ({ request, refused }) => {
    const error = await run(Effect.flip(read([request])))
    expect(error).toMatchObject({
      _tag: 'RemoteReadError',
      message: expect.stringMatching(refused),
    })
  })

  it('needs its target bound: a View that serves none of it fails the read by name', async () => {
    const seeded = shop()
    const layer = DomainRemote.layer(ShopApi, {
      views: [Products],
      commands: [],
      principal: Effect.succeedSome('ada'),
      denied: () => 'Unauthenticated',
    })
    const error = await Effect.runPromise(
      Effect.andThen(seeded.drain, Effect.flip(read([withSupplier('p1')]))).pipe(
        Effect.provide(layer),
        Effect.scoped,
        Effect.provide(seeded.layer),
      ),
    )
    expect(error).toMatchObject({
      _tag: 'RemoteReadError',
      message: 'No View is bound to Supplier',
    })
  })
})

describe('a View binding', () => {
  it("refuses an Entity whose one relation its View's state does not hold", () => {
    const Bare = Entity.define(
      'Product',
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        stock: Schema.Number,
        reserved: Schema.Number,
        revision: Schema.Number,
      }),
    )
    const Elsewhere = Entity.define('Elsewhere', Schema.Struct({ id: Schema.String }))
    const { Product } = Entity.relate(
      { Product: Bare, Elsewhere },
      { Product: { maker: Relation.one(Elsewhere) } },
    )
    expect(() =>
      DomainRemote.view(Product, ShopApi, 'ProductRow', { revision: 'revision' }),
    ).toThrow(/ProductRow's state has no field maker, the id Product's maker points at/)
  })
})
