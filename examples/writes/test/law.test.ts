// @vitest-environment node
/**
 * The law over the declared writes: each run through a page's own
 * `Data.mutate` and through the server, as the product's owner, over SQLite.
 * What a page shows while a write is pending must be what the server then
 * stores: a computed stock, a moved revision, a refusal.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Layer, Optic, Option, Schema } from 'effect'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { ModelRef } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Product, Publish, Rename, Restock, Revert, Sell } from '../src/domain.js'
import { schema, server } from '../src/server.js'

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type

/** A page that writes products: nothing but Remote's store. */
const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<Model>().key('remote'), ['remote']),
  entities: [Product],
  mutations: [Rename, Publish, Revert, Restock, Sell],
})

const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(`insert into products values
    ('p1', 'ada', 'Bolt', 'draft', 10, 2, 1),
    ('p2', 'ada', 'Rivet', 'published', 5, 0, 1)`)
  return databaseLayer(drizzle({ client: sqlite }))
}

const checked = (mutation: Parameters<typeof Law.check>[1]['mutation'], input: unknown) =>
  Effect.runPromise(
    Law.check(Data, {
      model: { remote: Remote.initial },
      holds: [{ entity: Product, ids: ['p1', 'p2'] }],
      lists: [],
      mutation,
      input,
      now: 0,
    }).pipe(
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(server, Option.some({ id: 'ada' }))).pipe(
          Layer.provide(seeded()),
        ),
      ),
    ),
  )

describe('the law over the declared writes', () => {
  it.each([
    {
      what: 'a rename',
      mutation: Rename,
      input: { id: 'p1', name: 'Bolt, M6' },
      compares: ['Product:p1.name'],
    },
    {
      what: 'a publish from a draft',
      mutation: Publish,
      input: { id: 'p1', status: 'published' },
      compares: ['Product:p1.status'],
    },
    {
      what: 'a restock at the revision read: the stock computed where it commits',
      mutation: Restock,
      input: { id: 'p1', revision: 1, quantity: 5 },
      compares: ['Product:p1.stock'],
    },
    {
      what: 'a sale',
      mutation: Sell,
      input: { id: 'p1', quantity: -3 },
      compares: ['Product:p1.stock'],
    },
    {
      what: 'a published product put back to draft: refused alike',
      mutation: Revert,
      input: { id: 'p2', status: 'draft' },
      compares: ['Revert'],
    },
  ])('$what', async ({ mutation, input, compares }) => {
    const report = await checked(mutation, input)
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(compares))
  })
})
