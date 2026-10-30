/**
 * A request refused for its size over Effect RPC (#360): `bodyLimit` in front
 * of an `RpcServer` route answers 413, and a client over
 * `Remote.rpcProtocolHttp` reads it as the call's own error, never as
 * `Unreachable`, so the outbox settles a durable write so refused rather
 * than sending it again for good.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import { RpcClient, RpcSerialization, RpcServer } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import {
  Mutation,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemoteRpc,
  type RemoteMessage,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { afterAll, describe, expect, it } from 'vitest'
import { RemoteServer, bodyLimit } from '../src/index.js'

const Price = Entity.define('Price', Schema.Struct({ id: Schema.String, cents: Schema.Number }))
const Note = Mutation.make('Note', { Input: { text: Schema.String }, Output: {} })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Price], mutations: [Note] })
const names = Array.from({ length: 300 }, (_, index) => `name${index}`)
const backend = RemoteServer.memory({
  domain: Data,
  rows: { Price: names.map((id, index) => ({ id, cents: index })) },
  mutations: () => [RemoteServer.mutation(Note, () => Effect.succeed({ output: {} }))],
  principal: {},
})

const limit = 4 * 1024
const routes = RpcServer.layer(RemoteRpc).pipe(
  Layer.provide(RemoteRpc.toLayer(RemoteServer.handlers(backend.server, {}))),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(HttpRouter.middleware(bodyLimit(limit)).layer),
)
const web = HttpRouter.toWebHandler(routes.pipe(Layer.provide(HttpServer.layerServices)), {
  disableLogger: true,
})
afterAll(() => web.dispose())

/** The status of every request that reached the endpoint. */
const statuses: Array<number> = []
const network: typeof fetch = async (input, init) => {
  const response = await web.handler(new Request(String(input), init))
  statuses.push(response.status)
  return response
}

/** Remote's client over Effect RPC, not told the server's limit: it keeps the default 1 MiB. */
const overRpc = Layer.unwrap(
  Effect.map(RpcClient.make(RemoteRpc), rpcClient => Remote.clientLayer(rpcClient)),
).pipe(
  Layer.provide(Remote.rpcProtocolHttp('http://worker.test/rpc')),
  Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, network)),
)

const failureOf = <A, E>(use: (client: RemoteClient['Service']) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.flip(
      Effect.gen(function* () {
        return yield* use(yield* RemoteClient)
      }),
    ).pipe(Effect.provide(overRpc)),
  )

describe('a request too large over Effect RPC', () => {
  it('fails a mutation refused for its size as refused, not unreachable', async () => {
    statuses.length = 0
    const error = await failureOf(client =>
      client.mutate({ requestId: 'r1', mutation: 'Note', input: { text: 'x'.repeat(limit) } }),
    )
    expect(statuses).toEqual([413])
    expect(error._tag).toBe('RemoteMutationError')
  })

  it('fails a read and a query refused for their size with their own errors', async () => {
    const read = await failureOf(client =>
      client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests: names.map(id => ({ entity: 'Price', id, fields: ['cents'] })),
      }),
    )
    expect(read._tag).toBe('RemoteReadError')
    const query = await failureOf(client =>
      client.query({ query: 'Q', input: { text: 'x'.repeat(limit) }, window: {} }),
    )
    expect(query._tag).toBe('RemoteQueryError')
  })

  it('fails a write a gateway answered 502 as unreachable, so it is sent again', async () => {
    const gateway = Layer.unwrap(
      Effect.map(RpcClient.make(RemoteRpc), rpcClient => Remote.clientLayer(rpcClient)),
    ).pipe(
      Layer.provide(Remote.rpcProtocolHttp('http://worker.test/rpc')),
      Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
      Layer.provide(
        Layer.succeed(
          FetchHttpClient.Fetch,
          async () =>
            new Response('<h1>Bad gateway</h1>', {
              status: 502,
            }),
        ),
      ),
    )
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          const client = yield* RemoteClient
          return yield* client.mutate({ requestId: 'r1', mutation: 'Note', input: { text: '' } })
        }),
      ).pipe(Effect.provide(gateway)),
    )
    expect(error._tag).toBe('Unreachable')
  })

  it('still reads a request within the limit', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Price', id: 'name1', fields: ['cents'] }],
        })
      }).pipe(Effect.provide(overRpc)),
    )
    expect(result.entities).toEqual([{ entity: 'Price', id: 'name1', values: { cents: 1 } }])
  })
})

describe('a durable write refused for its size', () => {
  const outbox = Data.outbox({
    key: () => 'outbox:ada',
    scope: () => 'ada',
    retry: { base: '1 millis', max: '2 millis' },
  })
  const entries = outbox.subscriptions!
  const kv = Effect.runSync(
    Effect.gen(function* () {
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
  /** What one outbox entry's stream sends for the Model, collected, as the runtime runs it. */
  const step = (name: 'outbox.save' | 'outbox.send', model: Model) => {
    const entry = entries[name]!
    const dependencies = entry.modelToDependencies(model)
    return Effect.runPromise(
      Stream.runCollect(
        entry.dependenciesToStream(dependencies as never, () => dependencies as never),
      ).pipe(Effect.provideService(KeyValueStore.KeyValueStore, kv), Effect.provide(overRpc)),
    ).then(collected => [...collected] as ReadonlyArray<RemoteMessage>)
  }

  it('is sent once and settled failed, not sent again', async () => {
    const start = await Effect.runPromise(
      outbox
        .restore({ remote: Remote.initial })
        .pipe(Effect.provideService(KeyValueStore.KeyValueStore, kv)),
    )
    const queued = Data.mutate(
      start,
      Note,
      { text: 'x'.repeat(limit) },
      { durable: true, now: Date.now() },
    )
    const saved = (await step('outbox.save', queued.model)).reduce(Data.reduce, queued.model)
    statuses.length = 0
    const messages = await step('outbox.send', saved)

    expect(statuses).toEqual([413])
    expect(messages.map(message => message._tag)).not.toContain('OutboxDelayed')
    const settled = messages.reduce(Data.reduce, saved)
    expect(Data.outboxStatus(settled)).toMatchObject({ waiting: 0, failed: 1 })
    expect(Data.mutation(settled, queued.requestId)._tag).toBe('Failed')
  })
})
