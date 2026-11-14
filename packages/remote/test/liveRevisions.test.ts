/**
 * A live stream names the revision it holds each row at (`LiveRequirement.revisions`),
 * so a server can leave out a frame the store has: a page resumed from a server render
 * opens its stream without being sent back what it was handed (A-WP9).
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Remote, RemoteClient } from '../src/index.js'
import { live } from '../src/live.js'
import { liveReads } from '../src/liveReads.js'
import type { EntityEntry } from '../src/store.js'
import { MAX_READ_AFTER, REMOTE_PROTOCOL_VERSION } from '../src/wire.js'

const Product = Entity.make(
  'Product',
  Schema.Struct({ id: Schema.String, name: Schema.String, stock: Schema.Number }),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Product] })
const watched = live(Data, Product.select({ name: true, stock: true }), 'p1')
const entry = Data.subscriptions({
  watched: Data.active('watched', () => Option.some(watched)),
})['watched.live']

/** The store holding p1 whole at revision 4, then as `change` leaves it. */
const holding = (change: (entry: EntityEntry) => EntityEntry = held => held): Model => {
  const read = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Product', id: 'p1', fields: ['name', 'stock'] }],
      result: {
        entities: [
          { entity: 'Product', id: 'p1', values: { name: 'Lamp', stock: 5 }, revision: 4 },
        ],
        settled: [],
      },
      now: 0,
    },
  )
  const held = read.remote.entities['Product:p1']
  if (held === undefined) throw new Error('the read wrote no Product:p1')
  return {
    remote: { ...read.remote, entities: { ...read.remote.entities, 'Product:p1': change(held) } },
  }
}

const revisionsOf = (model: Model) => entry.modelToDependencies(model).revisions

/** `model` after a read of p1's `values` answered at `revision`. */
const readAt = (model: Model, values: Readonly<Record<string, unknown>>, revision: number): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Product', id: 'p1', fields: Object.keys(values) }],
    result: { entities: [{ entity: 'Product', id: 'p1', values, revision }], settled: [] },
    now: 0,
  })

describe('A live stream over rows the store holds', () => {
  it('names the revision of a row held whole', () => {
    expect(revisionsOf(holding())).toEqual([{ entity: 'Product', id: 'p1', revision: 4 }])
  })

  it('sends it with the subscription', async () => {
    const sent: Array<{ readonly revisions?: unknown }> = []
    const model = holding()
    await Effect.runPromise(
      Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model))).pipe(
        Effect.provide(
          Layer.succeed(RemoteClient, {
            read: () => Effect.die('no read'),
            query: () => Effect.die('no query'),
            mutate: () => Effect.die('no mutate'),
            live: request => (sent.push(request), Stream.empty),
          }),
        ),
      ),
    )
    expect(sent.map(request => request.revisions)).toEqual([
      [{ entity: 'Product', id: 'p1', revision: 4 }],
    ])
  })

  it('reaches the server over an RPC client, at the protocol version', async () => {
    const payloads: Array<unknown> = []
    const model = holding()
    await Effect.runPromise(
      Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model))).pipe(
        Effect.provide(
          Remote.clientLayer({
            FoldkitRemoteRead: () => Effect.die('no read'),
            FoldkitRemoteQuery: () => Effect.die('no query'),
            FoldkitRemoteMutate: () => Effect.die('no mutate'),
            FoldkitRemoteLive: payload => (payloads.push(payload), Stream.empty),
          }),
        ),
      ),
    )
    expect(payloads).toEqual([
      expect.objectContaining({
        version: REMOTE_PROTOCOL_VERSION,
        revisions: [{ entity: 'Product', id: 'p1', revision: 4 }],
      }),
    ])
  })

  it.each([
    [
      'a field the stream follows is missing',
      (held: EntityEntry) => ({
        ...held,
        present: new Set(['name']),
      }),
    ],
    ['a field is stale', (held: EntityEntry) => ({ ...held, stale: new Set(['stock']) })],
    ['the row is held to a write', (held: EntityEntry) => ({ ...held, floor: 'Product/p1@3' })],
    ['the row is gone', (held: EntityEntry) => ({ ...held, tombstone: true })],
    ['no answer carried a revision', ({ revision: _, ...held }: EntityEntry) => held],
  ])('names none when %s', (_, change) => {
    expect(revisionsOf(holding(change))).toEqual([])
  })

  // A detail read whole at 3, `stock` changed at 4, a list reading `name` at 5:
  // the store holds `stock` from 3 under revision 5, and the rev-5 frame is
  // the one carrying the stock the page lacks.
  it('names none when a partial write moved the revision past a field asked', () => {
    const partial = readAt(
      readAt({ remote: Remote.initial }, { name: 'Lamp', stock: 5 }, 3),
      {
        name: 'Lamp',
      },
      5,
    )
    expect(partial.remote.entities['Product:p1']?.revision).toBe(5)
    expect(revisionsOf(partial)).toEqual([])
    expect(revisionsOf(readAt(partial, { stock: 4 }, 5))).toEqual([
      { entity: 'Product', id: 'p1', revision: 5 },
    ])
  })

  it('names one held at a revision read in parts', () => {
    const parts = readAt(readAt({ remote: Remote.initial }, { name: 'Lamp' }, 3), { stock: 5 }, 3)
    expect(revisionsOf(parts)).toEqual([{ entity: 'Product', id: 'p1', revision: 3 }])
  })

  it('names none when a write with no revision changed a field asked', () => {
    const overlaid = Data.reduce(holding(), {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Product', id: 'p1', fields: ['stock'] }],
      result: { entities: [{ entity: 'Product', id: 'p1', values: { stock: 2 } }], settled: [] },
      now: 0,
    })
    expect(overlaid.remote.entities['Product:p1']?.revision).toBe(4)
    expect(revisionsOf(overlaid)).toEqual([])
  })

  it('names at most as many as the wire takes', () => {
    const many = Array.from({ length: MAX_READ_AFTER + 1 }, (_, at) => `p${at}`)
    const model = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: many.map(id => ({ entity: 'Product', id, fields: ['name'] })),
        result: {
          entities: many.map(id => ({ entity: 'Product', id, values: { name: id }, revision: 1 })),
          settled: [],
        },
        now: 0,
      },
    )
    const requirements = many.map(id => ({ entity: 'Product', id, fields: ['name'] }))
    expect(liveReads.heldRevisions(model.remote.entities, requirements)).toHaveLength(
      MAX_READ_AFTER,
    )
  })

  it('does not restart the stream when a revision moves', () => {
    const same = Schema.toEquivalence(entry.dependenciesSchema)
    const at = entry.modelToDependencies(holding())
    const moved = entry.modelToDependencies(holding(held => ({ ...held, revision: 5 })))
    expect(moved.revisions).not.toEqual(at.revisions)
    expect(same(at, moved)).toBe(true)
  })
})
