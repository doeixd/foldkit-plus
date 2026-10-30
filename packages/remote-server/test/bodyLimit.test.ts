/**
 * Request body limits on the Remote endpoint (#359): `serveFetch`'s
 * `maxBodyBytes` and `bodyLimit` over an `RpcServer` route refuse a body over
 * the limit with a 413 and Remote's `tooLarge` answer, before decoding it and
 * before reading more of it than the limit; the clients read that refusal as
 * the call's own error, and cut their reads to fit a limit they know.
 */
import { Effect, Layer, Schema } from 'effect'
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/http'
import { RpcClient, RpcSerialization, RpcServer } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Mutation, REMOTE_PROTOCOL_VERSION, Remote, RemoteClient, RemoteRpc } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { afterAll, describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer, bodyLimit } from '../src/index.js'

const Price = Entity.define('Price', Schema.Struct({ id: Schema.String, cents: Schema.Number }))
const Note = Mutation.make('Note', { Input: { text: Schema.String }, Output: {} })
const Model = Schema.Struct({ remote: Remote.Model })
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
/** What the endpoint did before answering. */
const seen = { principals: 0, layers: 0 }
const served = serveFetch({
  server: backend.server,
  resolvePrincipal: () => Effect.sync(() => void seen.principals++).pipe(Effect.as({})),
  layer: () => {
    seen.layers++
    return Layer.empty as Layer.Layer<never>
  },
  maxBodyBytes: limit,
})

const readOf = (count: number) => ({
  operation: 'read',
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requests: names.slice(0, count).map(id => ({ entity: 'Price', id, fields: ['cents'] })),
  },
})

/** A body of `text` that says nothing of its length, sent in `chunk`-byte pieces as they are pulled. */
const streamed = (text: string, chunk: number) => {
  const bytes = new TextEncoder().encode(text)
  const state = { pulled: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>(
    {
      pull: controller => {
        const start = state.pulled * chunk
        state.pulled++
        if (start >= bytes.length) controller.close()
        else controller.enqueue(bytes.slice(start, start + chunk))
      },
      cancel: () => {
        state.cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { body, state }
}

/** Node needs it to send a stream as a body; the DOM's `RequestInit` does not name it. */
const streaming = { duplex: 'half' }

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  served(
    new Request('http://worker.test/remote', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      ...streaming,
    }),
    {},
  )

describe('serveFetch’s maxBodyBytes', () => {
  it('refuses a body whose content-length is over the limit, before the layer or the principal', async () => {
    seen.principals = 0
    seen.layers = 0
    const text = JSON.stringify(readOf(300))
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(limit)
    // A runtime's own Request has no content-length until sent; a Worker's has the client's.
    const response = await post(text, {
      'content-length': String(new TextEncoder().encode(text).length),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: `The request body is larger than ${limit} bytes`,
      tooLarge: { limit },
    })
    expect(seen).toEqual({ principals: 0, layers: 0 })
  })

  it('stops reading a body with no length once it passes the limit', async () => {
    const chunk = 512
    const { body, state } = streamed(JSON.stringify(readOf(300)), chunk)
    const response = await post(body)
    expect(response.status).toBe(413)
    expect((await response.json()).tooLarge).toEqual({ limit })
    expect(state.cancelled).toBe(true)
    // At most the pieces that reach the limit and the one that passes it, and what the reader buffers ahead.
    expect(state.pulled * chunk).toBeLessThan(limit + 4 * chunk)
  })

  it('answers a body at the limit', async () => {
    const text = JSON.stringify(readOf(60))
    const padded = text + ' '.repeat(limit - new TextEncoder().encode(text).length)
    expect(new TextEncoder().encode(padded).length).toBe(limit)
    const { body } = streamed(padded, 700)
    const response = await post(body)
    expect(response.status).toBe(200)
    expect((await response.json()).result.entities).toHaveLength(60)
  })

  it('refuses bytes that are not UTF-8 as a body that is not JSON', async () => {
    // A JSON string holding a byte no UTF-8 text has: read leniently it would parse.
    const response = await post(new Uint8Array([0x22, 0xff, 0x22]))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'The body is not JSON' })
  })

  it('takes 1 MiB by default', async () => {
    const unlimited = serveFetch({
      server: backend.server,
      resolvePrincipal: () => Effect.succeed({}),
      layer: () => Layer.empty as Layer.Layer<never>,
    })
    const claiming = (bytes: number) =>
      unlimited(
        new Request('http://worker.test/remote', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': String(bytes) },
          body: '{}',
        }),
        {},
      )
    expect((await claiming(1024 * 1024 + 1)).status).toBe(413)
    expect((await claiming(1024 * 1024)).status).not.toBe(413)
  })
})

const viaFetch =
  (handler: (request: Request) => Promise<Response>): typeof fetch =>
  (input, init) =>
    handler(new Request(String(input), init))

describe('Remote.http over the limit', () => {
  const http = Remote.http('http://worker.test/remote', {
    fetch: viaFetch(request => served(request, {})),
  })
  const clientOver = (options: Parameters<typeof Remote.clientLayer>[1] = {}) =>
    Remote.clientLayer(http, options)

  it('cuts a read to the limit it knows, and every row is answered', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.read(readOf(300).payload)
      }).pipe(Effect.provide(clientOver({ maxBodyBytes: limit }))),
    )
    expect(result.entities).toHaveLength(300)
  })

  it('reads a 413 as a refused mutation, not an unreachable one', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        http.FoldkitRemoteMutate({
          requestId: 'r1',
          mutation: 'Note',
          input: { text: 'x'.repeat(limit) },
        }),
      ),
    )
    expect(error._tag).toBe('RemoteMutationError')
    expect(error.message).toBe(`The request body is larger than ${limit} bytes`)
  })

  it('reads a gateway’s 413, whatever its body, the same way', async () => {
    const gateway = Remote.http('http://gateway.test/remote', {
      fetch: async () =>
        new Response('<html>Request Entity Too Large</html>', {
          status: 413,
          statusText: 'Payload Too Large',
        }),
    })
    const error = await Effect.runPromise(
      Effect.flip(gateway.FoldkitRemoteMutate({ requestId: 'r1', mutation: 'Note', input: {} })),
    )
    expect(error._tag).toBe('RemoteMutationError')
  })
})

describe('bodyLimit over an RpcServer route', () => {
  // Effect's own RPC endpoint, with the limit in front of it as the application would put it.
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
  const rpcLayer = (maxBodyBytes: number) =>
    Layer.unwrap(
      Effect.map(RpcClient.make(RemoteRpc), rpcClient =>
        Remote.clientLayer(rpcClient, { maxBodyBytes }),
      ),
    ).pipe(
      Layer.provide(RpcClient.layerProtocolHttp({ url: 'http://worker.test/rpc' })),
      Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
      Layer.provide(
        Layer.succeed(
          FetchHttpClient.Fetch,
          viaFetch(request => web.handler(request)),
        ),
      ),
    )

  it('refuses a body over the limit with Remote’s 413 answer', async () => {
    const response = await web.handler(
      new Request('http://worker.test/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'x'.repeat(limit + 1),
      }),
    )
    expect(response.status).toBe(413)
    expect((await response.json()).tooLarge).toEqual({ limit })
  })

  it('refuses by content-length without reading the body', async () => {
    const { body, state } = streamed('x'.repeat(limit + 1), 256)
    const response = await web.handler(
      new Request('http://worker.test/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(limit + 1) },
        body,
        ...streaming,
      }),
    )
    expect(response.status).toBe(413)
    expect(state.pulled).toBe(0)
  })

  it('passes a body within the limit whole, and a client that knows it cuts its reads', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.read(readOf(300).payload)
      }).pipe(Effect.provide(rpcLayer(limit))),
    )
    expect(result.entities).toHaveLength(300)
  })
})
