/**
 * A list read live (#270): `liveQuery(Data, …)` subscribes the
 * list as its read sends it, beside the rows read live, with no row of its
 * own to name.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteClient, Requirement, type RemoteMessage } from '../src/index.js'
import { liveQuery, liveStatus } from '../src/live.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const All = Query.define('All', { tag: Schema.String }, () =>
  Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.id))),
)
const Row = Entity.select(Item, { name: true })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], queries: [All] })

const listed = (tag: string, live: boolean) =>
  Data.active(`List ${tag} ${live}`, () =>
    Option.some(
      live
        ? liveQuery(Data, All, { tag }, { select: Row, first: 10 })
        : Data.query(All, { tag }, { select: Row, first: 10 }),
    ),
  )
const red = listed('red', true)
const blue = listed('blue', true)
const still = listed('red', false)
const entries = Data.subscriptions({ red, blue, still })
const initial: Model = { remote: Remote.initial }

/** The list as its read sends it, live. */
const asRead = (tag: string) => ({
  query: 'All',
  input: { tag },
  window: { first: 10 },
  // `id` too: the body orders by it, so the client can place a row there.
  select: { entity: 'Item', fields: ['name', 'id'] },
})

/** What one live entry asks the client, and the Messages it sends, for the Model given. */
const opened = async (entry: (typeof entries)['red.live'], model: Model) => {
  const asked: Array<unknown> = []
  const client = Layer.succeed(RemoteClient, {
    read: () => Effect.die('unused'),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: request => {
      asked.push(request)
      return Stream.make({
        _tag: 'ConnectionInvalidate',
        connection: All.ref({ tag: 'red' }).identity,
        cursor: 1,
      } as const)
    },
  })
  const dependencies = entry.modelToDependencies(model)
  const sent = await Effect.runPromise(
    Stream.runCollect(entry.dependenciesToStream(dependencies)).pipe(Effect.provide(client)),
  )
  return { asked, sent: [...sent] as ReadonlyArray<RemoteMessage> }
}

describe('a list read live', () => {
  it('subscribes the list as its read sends it, naming no row', async () => {
    expect(entries['red.live'].modelToDependencies(initial)).toMatchObject({
      requirements: [],
      queries: [asRead('red')],
    })
    const { asked } = await opened(entries['red.live'], initial)
    expect(asked).toEqual([{ requirements: [], queries: [asRead('red')], after: 0 }])
  })

  it('subscribes nothing for a list read without live', async () => {
    expect(entries['still.live'].modelToDependencies(initial)).toMatchObject({
      requirements: [],
      queries: [],
    })
    const { asked, sent } = await opened(entries['still.live'], initial)
    expect({ asked, sent }).toEqual({ asked: [], sent: [] })
  })

  it('keeps a cursor of its own for each list', async () => {
    const { sent } = await opened(entries['red.live'], initial)
    const heard = sent.reduce(Data.reduce, initial)
    expect(entries['red.live'].modelToDependencies(heard).cursor).toBe(1)
    expect(entries['blue.live'].modelToDependencies(heard).cursor).toBe(0)
  })

  it('is watched by Data.liveStatus, and a list read without live is idle', () => {
    expect(liveStatus(Data, initial, red)).toEqual({ _tag: 'Live' })
    expect(liveStatus(Data, initial, still)).toEqual({ _tag: 'Idle' })
  })

  it('needs a size, since it is read again every tick', () => {
    // @ts-expect-error a list read live needs `first`
    expect(() => liveQuery(Data, All, { tag: 'red' }, { select: Row })).toThrow(
      'is read live without first',
    )
  })

  it('stays live where two reads of one list merge, in either order', () => {
    const read = { identity: 'All', window: { first: 10 }, select: { entity: 'Item', fields: [] } }
    for (const pair of [
      [{ ...read, live: true }, read],
      [read, { ...read, live: true }],
    ])
      expect(Requirement.mergeConnections(pair)).toEqual([{ ...read, live: true }])
  })
})
