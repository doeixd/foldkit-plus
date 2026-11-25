import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { expect, test, vi } from 'vitest'
import { ConnectionChange, Query, Remote, terminal } from '../src/index.js'
import { Maintained } from '../src/maintained/index.js'
import { overlay } from '../src/overlay.js'

let comparisons = 0
vi.mock(import('foldkit-entity'), async original => {
  const entity = await original()
  return {
    ...entity,
    compareRows: (...args: Parameters<typeof entity.compareRows>) => {
      comparisons += 1
      return entity.compareRows(...args)
    },
  }
})

const Entry = Entity.define('Entry', Schema.Struct({ id: Schema.String, rank: Schema.Number }))
const Ranked = Query.define('Ranked', {}, () =>
  Query.from(Entry).pipe(Query.orderBy(Order.asc(Entry.fields.rank))),
)
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Entry], queries: [Ranked] })
const list = Data.query(
  Ranked,
  {},
  { select: Entity.select(Entry, { id: true, rank: true }), first: 25 },
)

test('places one pending insert near the end of a 100,000-row maintained list', async ({
  bench,
}) => {
  const count = 100_000
  const rows = Array.from({ length: count }, (_, rank) => ({
    entity: 'Entry',
    id: String(rank),
    values: { id: String(rank), rank },
  }))
  const extra = { entity: 'Entry', id: 'pending' }
  const loaded = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [...rows, extra].map(({ entity, id }) => ({ entity, id, fields: ['id', 'rank'] })),
      result: {
        settled: [],
        entities: [...rows, { ...extra, values: { id: extra.id, rank: count - 1.5 } }],
      },
      now: 1,
    },
  )
  const start = Data.reduce(loaded, {
    _tag: 'ConnectionMerged',
    connection: list.ref.identity,
    page: {
      start: terminal,
      end: terminal,
      edges: rows.map(({ entity, id }) => ({ key: `${entity}:${id}`, ref: { entity, id } })),
    },
  })
  Maintained.value(Data, start, list, Maintained.list)
  let pending = start
  let run = 0
  let tail: ReadonlyArray<string> = []
  const counts = new Set<number>()
  const result = await bench(
    'pending insert and maintained list read',
    {
      beforeEach: () => {
        pending = overlay(Data, start, `insert${run++}`, [ConnectionChange.append(list.ref, extra)])
        comparisons = 0
      },
      afterEach: () => {
        counts.add(comparisons)
        expect(tail).toEqual(['99998', 'pending', '99999'])
      },
    },
    () => {
      tail = Maintained.value(Data, pending, list, Maintained.list)
        .value.slice(-3)
        .map(row => row.id)
    },
  ).run({ iterations: 5, time: 0, warmupIterations: 2, warmupTime: 0 })
  console.info(
    `Placement comparisons per read: ${[...counts].join(', ')}. Median ${result.latency.p50.toFixed(1)} ms.`,
  )
}, 60_000)
