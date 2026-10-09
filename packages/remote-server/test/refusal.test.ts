/**
 * A mutation refused as data: the Source refuses with a value of the
 * mutation's `Refusal`, the server sends it encoded, and the client reads it
 * decoded with `Data.refusal`, over JSON as over RPC.
 */
import { Effect, Option, Schema } from 'effect'
import { RpcTest } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Mutation, Refusal, Remote, RemoteRpc } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type MutationRefused } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, price: Schema.Number }))

/** A price below the floor is refused, naming the floor: encoded as text, read as a number. */
const SetPrice = Mutation.make('SetPrice', {
  Input: { id: Schema.String, price: Schema.Number },
  Output: {},
  Refusal: Schema.Union([Refusal.field('price', Schema.NumberFromString), Refusal.conflict]),
})
const Other = Mutation.make('Other', { Input: {}, Output: {}, Refusal: Refusal.conflict })

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [SetPrice] })

/** How the Source refuses, set per test. */
let refusing: () => Effect.Effect<never, MutationRefused> = () => Effect.never
const server = RemoteServer.make({
  entities: [],
  mutations: [
    RemoteServer.mutation(SetPrice, ({ input }) =>
      input.price < 10
        ? Effect.fail(RemoteServer.refuse(SetPrice, { _tag: 'Field', key: 'price', reason: 10 }))
        : refusing(),
    ),
  ],
})
const handlers = RemoteServer.handlers(server, undefined)

const answer = (body: unknown) => Effect.runPromise(RemoteServer.answer(handlers, body))
const viaJson = Remote.clientLayer(
  Remote.json(request => answer(JSON.parse(request)).then(answered => answered.body)),
)

/** Runs `Data.mutate` over JSON and reduces what it settles with. */
const mutated = async (input: { readonly id: string; readonly price: number }) => {
  const started = Data.mutate({ remote: Remote.initial }, SetPrice, input)
  const settled = await Effect.runPromise(started.command.effect.pipe(Effect.provide(viaJson)))
  return { model: Data.reduce(started.model, settled), requestId: started.requestId }
}

describe('A refused mutation', () => {
  it('is read back as the value the Source refused with, decoded', async () => {
    const { model, requestId } = await mutated({ id: 'a', price: 3 })
    expect(Data.mutation(model, requestId)._tag).toBe('Failed')
    expect(Data.refusal(model, requestId, SetPrice)).toEqual(
      Option.some({ _tag: 'Field', key: 'price', reason: 10 }),
    )
  })

  it('crosses the wire encoded by the mutation’s own Refusal', async () => {
    const answered = await answer({
      operation: 'mutate',
      payload: { requestId: 'r1', mutation: 'SetPrice', input: { id: 'a', price: 3 } },
    })
    expect(answered).toEqual({
      status: 422,
      body: {
        error: 'Mutation SetPrice was refused',
        refusal: { _tag: 'Field', key: 'price', reason: '10' },
      },
    })
  })

  it('crosses RPC too, as a field of the mutation error', async () => {
    const failed = await Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(RpcTest.makeClient(RemoteRpc), client =>
          client.FoldkitRemoteMutate({
            requestId: 'r4',
            mutation: 'SetPrice',
            input: { id: 'a', price: 3 },
          }),
        ),
      ).pipe(Effect.provide(RemoteRpc.toLayer(handlers)), Effect.flip),
    )
    expect(failed).toMatchObject({
      _tag: 'RemoteMutationError',
      refusal: { _tag: 'Field', key: 'price', reason: '10' },
    })
  })

  it('is none for a mutation that failed without one, or did not fail', async () => {
    refusing = () => Effect.die('boom')
    const failed = await mutated({ id: 'a', price: 50 })
    expect(Data.mutation(failed.model, failed.requestId)._tag).toBe('Failed')
    expect(Data.refusal(failed.model, failed.requestId, SetPrice)).toEqual(Option.none())
    const started = Data.mutate({ remote: Remote.initial }, SetPrice, { id: 'a', price: 50 })
    expect(Data.refusal(started.model, started.requestId, SetPrice)).toEqual(Option.none())
  })
})

describe('A refusal the server cannot stand behind', () => {
  it('is refused as invalid when it was made for another mutation', async () => {
    refusing = () => Effect.fail(RemoteServer.refuse(Other, { _tag: 'Conflict' }))
    const answered = await answer({
      operation: 'mutate',
      payload: { requestId: 'r2', mutation: 'SetPrice', input: { id: 'a', price: 50 } },
    })
    expect(answered).toEqual({ status: 500, body: { error: 'Invalid mutation refusal' } })
  })

  it('is refused as invalid when it is not a value the mutation declares', async () => {
    refusing = () =>
      Effect.fail(
        // @ts-expect-error a value the mutation does not declare
        RemoteServer.refuse(SetPrice, { _tag: 'Nope' }),
      )
    const answered = await answer({
      operation: 'mutate',
      payload: { requestId: 'r3', mutation: 'SetPrice', input: { id: 'a', price: 50 } },
    })
    expect(answered).toEqual({ status: 500, body: { error: 'Invalid mutation refusal' } })
  })
})
