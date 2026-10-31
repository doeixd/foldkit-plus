/**
 * A request refused over Effect RPC: `bodyLimit` in front of an `RpcServer`
 * route answers 413 (#360), and session middleware 401 or 403 (#366). A
 * client over `Remote.rpcProtocolHttp` reads each as `Remote.http` does,
 * never as `Unreachable`, so the outbox settles a durable write so refused
 * rather than sending it again for good.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import {
  FetchHttpClient,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http'
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
import { outbox, outboxStatus } from 'foldkit-remote/outbox'
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
/** Session middleware in front of the route: a session gone is a 401, another person's a 403. */
const session = <E, R>(
  endpoint: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  E,
  R | HttpServerRequest.HttpServerRequest
> =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, request => {
    const token = request.headers['x-session']
    if (token === 'gone') {
      return Effect.succeed(
        HttpServerResponse.jsonUnsafe({ error: 'Session expired' }, { status: 401 }),
      )
    }
    if (token === 'other') return Effect.succeed(HttpServerResponse.text('No', { status: 403 }))
    return endpoint
  })
const routes = RpcServer.layer(RemoteRpc).pipe(
  Layer.provide(RemoteRpc.toLayer(RemoteServer.handlers(backend.server, {}))),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(HttpRouter.middleware(bodyLimit(limit)).layer),
  Layer.provide(HttpRouter.middleware(session).layer),
)
const web = HttpRouter.toWebHandler(routes.pipe(Layer.provide(HttpServer.layerServices)), {
  disableLogger: true,
})
afterAll(() => web.dispose())

/** The status of every request that reached the endpoint. */
const statuses: Array<number> = []
/** The network as the browser of whoever holds `token` sends it. */
const networkAs =
  (token: string): typeof fetch =>
  async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('x-session', token)
    const response = await web.handler(new Request(String(input), { ...init, headers }))
    statuses.push(response.status)
    return response
  }

/** Remote's client over Effect RPC, not told the server's limit: it keeps the default 1 MiB. */
const clientOver = (network: typeof fetch) =>
  Layer.unwrap(
    Effect.map(RpcClient.make(RemoteRpc), rpcClient => Remote.clientLayer(rpcClient)),
  ).pipe(
    Layer.provide(Remote.rpcProtocolHttp('http://worker.test/rpc')),
    Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, network)),
  )
const overRpc = clientOver(networkAs('ada'))

const failureOf = <A, E>(
  use: (client: RemoteClient['Service']) => Effect.Effect<A, E>,
  client = overRpc,
) =>
  Effect.runPromise(
    Effect.flip(
      Effect.gen(function* () {
        return yield* use(yield* RemoteClient)
      }),
    ).pipe(Effect.provide(client)),
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
    const gateway = clientOver(async () => new Response('<h1>Bad gateway</h1>', { status: 502 }))
    const error = await failureOf(
      client => client.mutate({ requestId: 'r1', mutation: 'Note', input: { text: '' } }),
      gateway,
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

describe('a request middleware refused for who is asking', () => {
  const calls: ReadonlyArray<
    (client: RemoteClient['Service']) => Effect.Effect<unknown, { readonly _tag: string }>
  > = [
    client =>
      client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [{ entity: 'Price', id: 'name1', fields: ['cents'] }],
      }),
    client => client.query({ query: 'Q', input: {}, window: {} }),
    client => client.mutate({ requestId: 'r1', mutation: 'Note', input: { text: '' } }),
  ]
  /** The tag each of a read, a query and a mutation fails with for whoever holds `token`. */
  const failuresAs = async (token: string) => {
    const client = clientOver(networkAs(token))
    const tags: Array<string> = []
    for (const call of calls) tags.push((await failureOf(call, client))._tag)
    return tags
  }

  it('fails every call kind under a 401 as unauthenticated, whatever the body', async () => {
    statuses.length = 0
    expect(await failuresAs('gone')).toEqual([
      'Unauthenticated',
      'Unauthenticated',
      'Unauthenticated',
    ])
    expect(statuses).toEqual([401, 401, 401])
  })

  it('fails a mutation under a 403 as forbidden, and a read and a query as their own', async () => {
    statuses.length = 0
    expect(await failuresAs('other')).toEqual(['RemoteReadError', 'RemoteQueryError', 'Forbidden'])
    expect(statuses).toEqual([403, 403, 403])
  })
})

describe('a durable write refused', () => {
  const durable = outbox(Data, {
    key: () => 'outbox:ada',
    scope: () => 'ada',
    retry: { base: '1 millis', max: '2 millis' },
  })
  const entries = durable.subscriptions!
  /** An outbox over a store of its own, its writes sent as whoever holds `token`. */
  const outboxAs = (token: string) => {
    const kv = Effect.runSync(
      Effect.gen(function* () {
        return yield* KeyValueStore.KeyValueStore
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    const client = clientOver(networkAs(token))
    return {
      restore: () =>
        Effect.runPromise(
          durable
            .restore({ remote: Remote.initial })
            .pipe(Effect.provideService(KeyValueStore.KeyValueStore, kv)),
        ),
      /** What one outbox entry's stream sends for the Model, collected, as the runtime runs it. */
      step: (name: 'outbox.save' | 'outbox.send', model: Model) => {
        const entry = entries[name]!
        const dependencies = entry.modelToDependencies(model)
        return Effect.runPromise(
          Stream.runCollect(
            entry.dependenciesToStream(dependencies as never, () => dependencies as never),
          ).pipe(Effect.provideService(KeyValueStore.KeyValueStore, kv), Effect.provide(client)),
        ).then(collected => [...collected] as ReadonlyArray<RemoteMessage>)
      },
    }
  }

  it.each([
    { why: 'for its size', token: 'ada', text: 'x'.repeat(limit), status: 413 },
    { why: 'for a session gone', token: 'gone', text: '', status: 401 },
    { why: 'for another person', token: 'other', text: '', status: 403 },
  ])('$why is sent once and settled failed, not sent again', async ({ token, text, status }) => {
    const { restore, step } = outboxAs(token)
    const start = await restore()
    const queued = Data.mutate(start, Note, { text }, { durable: true, now: Date.now() })
    const saved = (await step('outbox.save', queued.model)).reduce(Data.reduce, queued.model)
    statuses.length = 0
    const messages = await step('outbox.send', saved)

    expect(statuses).toEqual([status])
    expect(messages.map(message => message._tag)).not.toContain('OutboxDelayed')
    const settled = messages.reduce(Data.reduce, saved)
    expect(outboxStatus(Data, settled)).toMatchObject({ waiting: 0, failed: 1 })
    expect(Data.mutation(settled, queued.requestId)._tag).toBe('Failed')
  })
})
