// @vitest-environment node
/**
 * Scenarios over the declared writes: given rows, one write, and what every
 * backend must say of it. The ones the laws report implies run beside
 * hand-written ones, through the example's own SQLite server.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Layer, Optic, Option, Schema } from 'effect'
import { Write } from 'foldkit-entity'
import { Evidence } from 'foldkit-metadata'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { Remote } from 'foldkit-remote'
import { Scenario } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { ModelRef } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Product, Publish, Rename, Restock, Revert, Sell, type User } from '../src/domain.js'
import { report } from '../src/laws.js'
import { schema, server } from '../src/server.js'

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type

const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<Model>().key('remote'), ['remote']),
  entities: [Product],
  mutations: [Rename, Publish, Revert, Restock, Sell],
})

const columns = ['id', 'ownerId', 'name', 'status', 'stock', 'reserved', 'revision'] as const

/** A server over exactly the rows given: a database of its own for each call. */
const remote = Scenario.remote<Model, User>({
  data: Data,
  model: { remote: Remote.initial },
  backend: (rows, principal) => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(schema)
    const insert = sqlite.prepare('insert into products values (?, ?, ?, ?, ?, ?, ?)')
    for (const { row } of rows) insert.run(...columns.map(key => row[key] as string | number))
    return Remote.clientLayer(RemoteServer.handlers(server, principal)).pipe(
      Layer.provide(databaseLayer(drizzle({ client: sqlite }))),
    )
  },
})

const ada = Option.some<User>({ id: 'ada' })
const draft = {
  id: 'p1',
  ownerId: 'ada',
  name: 'Bolt',
  status: 'draft',
  stock: 10,
  reserved: 2,
  revision: 1,
}
const published = {
  id: 'p2',
  ownerId: 'ada',
  name: 'Rivet',
  status: 'published',
  stock: 5,
  reserved: 0,
  revision: 1,
}

const verdict = (scenario: Parameters<typeof Scenario.run<User>>[0], withReport = true) =>
  Effect.runPromise(Scenario.run(scenario, [remote], withReport ? { report } : {}))

const handWritten = [
  Scenario.write<User>({
    name: 'a rename lands',
    given: [{ entity: Product, row: draft }],
    principal: ada,
    now: 0,
    when: [Rename, { id: 'p1', name: 'Bolt, M6' }],
    operation: 'op-rename',
    expect: Scenario.accepted({ name: 'Bolt, M6' }),
  }),
  Scenario.write<User>({
    name: 'a published product does not go back to draft',
    given: [{ entity: Product, row: published }],
    principal: ada,
    now: 0,
    when: [Revert, { id: 'p2', status: 'draft' }],
    operation: 'op-revert',
    expect: Scenario.refused({ entity: 'Product', id: 'publishedStaysPublished' }),
  }),
  Scenario.write<User>({
    name: 'a sale that leaves nothing unreserved is refused by its becomes',
    given: [{ entity: Product, row: draft }],
    principal: ada,
    now: 0,
    when: [Sell, { id: 'p1', quantity: -8 }],
    operation: 'op-sell',
    expect: Scenario.refused({ entity: 'Product', id: Write.ensured(Sell.write).id }),
  }),
  Scenario.write<User>({
    name: 'someone else cannot rename it',
    given: [{ entity: Product, row: draft }],
    principal: Option.some({ id: 'bob' }),
    now: 0,
    when: [Rename, { id: 'p1', name: 'Mine' }],
    operation: 'op-forbidden',
    expect: Scenario.forbidden,
  }),
  Scenario.write<User>({
    name: 'a visitor cannot rename it',
    given: [{ entity: Product, row: draft }],
    principal: Option.none(),
    now: 0,
    when: [Rename, { id: 'p1', name: 'Mine' }],
    operation: 'op-visitor',
    expect: Scenario.unauthenticated,
  }),
]

describe('hand-written scenarios, run through the example server', () => {
  it.each(handWritten.map(scenario => ({ name: scenario.name, scenario })))(
    '$name',
    async ({ scenario }) => {
      const result = await verdict(scenario)
      expect(result.mismatches).toEqual([])
      expect(result.steps.length).toBeGreaterThan(0)
    },
  )

  it('a wrong expectation is a mismatch naming its backend and step', async () => {
    const wrong = Scenario.write<User>({
      ...handWritten[0]!,
      name: 'a rename that expects the wrong name',
      expect: Scenario.accepted({ name: 'Bolt, M8' }),
    })
    const result = await verdict(wrong)
    expect(result.mismatches).toEqual([
      {
        backend: 'remote',
        step: 'row',
        expected: { name: 'Bolt, M8' },
        actual: { name: 'Bolt, M6' },
      },
    ])
    expect(result.evidence).toEqual([])
  })

  it('a refusal expected of the wrong invariant is a mismatch on the decision', async () => {
    const wrong = Scenario.write<User>({
      ...handWritten[1]!,
      expect: Scenario.refused({ entity: 'Product', id: 'reservedWithinStock' }),
    })
    const result = await verdict(wrong, false)
    expect(result.mismatches.map(({ backend, step }) => ({ backend, step }))).toEqual([
      { backend: 'remote', step: 'decision' },
    ])
  })

  it('a scenario expecting published to draft to land throws before running, naming the invariant', () => {
    const lands = Scenario.write<User>({
      ...handWritten[1]!,
      name: 'a revert that expects to land',
      expect: Scenario.accepted({ status: 'draft' }),
    })
    expect(() => Effect.runPromise(Scenario.run(lands, [remote], { report }))).toThrow(
      /publishedStaysPublished/,
    )
  })

  it('a refusal expected of an invariant the write never reads is refused before running', () => {
    const wrong = Scenario.write<User>({
      ...handWritten[0]!,
      expect: Scenario.refused({ entity: 'Product', id: 'publishedStaysPublished' }),
    })
    expect(() => Effect.runPromise(Scenario.run(wrong, [remote], { report }))).toThrow(/kept it/)
  })

  it('issues one Scenario record per runner with no mismatch, for the laws the write could break, and none with one', async () => {
    const publish = Scenario.write<User>({
      name: 'a draft is published',
      given: [{ entity: Product, row: draft }],
      principal: ada,
      now: 0,
      when: [Publish, { id: 'p1', status: 'published' }],
      operation: 'op-publish',
      expect: Scenario.accepted({ status: 'published' }),
    })
    const ok = await verdict(publish)
    expect(ok.evidence.map(record => ({ ...record }))).toEqual([
      {
        _tag: 'Scenario',
        transition: 'write:Publish',
        law: 'Product.publishedStaysPublished',
        name: 'a draft is published',
        runner: 'remote',
      },
    ])
    expect(ok.evidence.map(record => Option.isSome(Evidence.issuedBy(record)))).toEqual([true])
    const wrong = await verdict(
      Scenario.write<User>({ ...publish, expect: Scenario.accepted({ status: 'archived' }) }),
    )
    expect(wrong.evidence).toEqual([])
  })
})

describe('the scenarios the laws report implies', () => {
  const generated = Scenario.fromReport(report, {
    writes: [Rename, Publish, Revert, Restock, Sell],
    starts: [
      { entity: Product, row: draft },
      { entity: Product, row: published },
    ],
    principal: ada,
    now: 0,
  })

  it('are one per holding arrow and one per refused pair', () => {
    expect(generated.map(scenario => scenario.name)).toEqual([
      'Publish: Draft -> Published',
      'Revert x publishedStaysPublished: refused',
    ])
  })

  it.each(generated.map(scenario => ({ name: scenario.name, scenario })))(
    '$name runs green through the server',
    async ({ scenario }) => {
      const result = await verdict(scenario)
      expect(result.mismatches).toEqual([])
    },
  )
})
