/**
 * A client call that dies (a throw, an `Effect.die`) is heard as a failure:
 * the read, list or write it belonged to settles as failed, where before the
 * stream ended with no Message and the read stayed `Loading` for good.
 */
import { Effect, Exit, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Query, Remote, RemoteClient, type RemoteMessage } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const Bump = Mutation.make('Bump', { Input: { id: Schema.String }, Output: {} })
const ItemsByOwner = Query.make('ItemsByOwner', { Input: { ownerId: Schema.String }, Result: Item })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Item],
  mutations: [Bump],
  queries: [ItemsByOwner],
})
const Counted = Entity.select(Item, { count: true })
const initial: Model = { remote: Remote.initial }

/** A client every call of which dies. */
const dying = Layer.succeed(RemoteClient, {
  read: () => Effect.die(new Error('read broke')),
  query: () => Effect.die(new Error('query broke')),
  mutate: () => Effect.die(new Error('mutate broke')),
  live: () => Stream.empty,
})

/** What a read entry's stream emits, run over the dying client. */
const emitted = async (
  stream: Stream.Stream<RemoteMessage, never, RemoteClient>,
): Promise<ReadonlyArray<RemoteMessage>> => [
  ...(await Effect.runPromise(Stream.runCollect(stream).pipe(Effect.provide(dying)))),
]

describe('a client call that dies', () => {
  it('fails the read, which then reads Failed rather than Loading', async () => {
    const read = Remote.observe(
      Data,
      App.surface('One', { model: () => ({ item: Data.get(Counted, 'i1') }) }),
      undefined,
    )
    const messages = await emitted(read.dependenciesToStream(read.modelToDependencies(initial)))
    expect(messages.at(-1)).toMatchObject({
      _tag: 'ReadFailed',
      error: { _tag: 'Defect', message: 'read broke' },
    })
    const settled = messages.reduce(Data.reduce, initial)
    expect(Data.get(Counted, 'i1').read(settled)._tag).toBe('Failed')
  })

  it('fails the list', async () => {
    const items = Data.query(ItemsByOwner, { ownerId: 'u1' }, { select: Counted, first: 2 })
    const read = Remote.observe(Data, App.surface('List', { model: () => ({ items }) }), undefined)
    const messages = await emitted(read.dependenciesToStream(read.modelToDependencies(initial)))
    expect(messages.at(-1)).toMatchObject({
      _tag: 'QueryFailed',
      error: { _tag: 'Defect', message: 'query broke' },
    })
  })

  it('fails the write, so it is no longer pending', async () => {
    const started = Data.mutate(initial, Bump, { id: 'i1' })
    // Read through the exit: unguarded, the Command itself dies.
    const exit = await Effect.runPromiseExit(started.command.effect.pipe(Effect.provide(dying)))
    const message = Exit.match(exit, { onSuccess: sent => sent, onFailure: () => undefined })
    expect(message).toMatchObject({
      _tag: 'MutationFailed',
      error: { _tag: 'Defect', message: 'mutate broke' },
    })
    expect(
      message === undefined ? [] : Data.failedWrites(Data.reduce(started.model, message)),
    ).toHaveLength(1)
  })
})
