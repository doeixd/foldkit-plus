/**
 * `Remote.clientLayer` over the client `RpcClient.make(RemoteRpc)` builds, as
 * an application wires a real transport. That client also fails with
 * `RpcClientError` when the transport does; it reaches the application as the
 * Remote error of the call, which it shows and retries, never as a defect.
 */
import { Effect, Layer, Result, Stream } from 'effect'
import { HttpClient, HttpClientError } from 'effect/http'
import { RpcClient, RpcSerialization } from 'effect/rpc'
import { describe, expect, it } from 'vitest'
import { REMOTE_PROTOCOL_VERSION, Remote, RemoteClient, RemoteRpc } from '../src/index.js'

/** A network that refuses every request, as one does when the server is down. */
const offline = HttpClient.make(request =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({ request, description: 'offline' }),
    }),
  ),
)

/** The stock client over HTTP, handed to `Remote.clientLayer` as it is. */
const stockClientLayer = Layer.unwrap(
  Effect.map(RpcClient.make(RemoteRpc), client => Remote.clientLayer(client)),
).pipe(
  Layer.provide(
    Layer.effect(RpcClient.Protocol, RpcClient.makeProtocolHttp(offline)).pipe(
      Layer.provide(RpcSerialization.layerJson),
    ),
  ),
)

/**
 * The call's failure, if it failed. A defect is not caught by `Effect.result`,
 * so it rejects the promise and fails the test on its own.
 */
const failureOf = <A, E>(use: (client: RemoteClient['Service']) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        return yield* Effect.result(use(yield* RemoteClient))
      }).pipe(Effect.provide(stockClientLayer)),
    ),
  ).then(result => (Result.isFailure(result) ? result.failure : undefined))

describe('Remote.clientLayer with the stock RpcClient', () => {
  it('turns a failed transport into the Remote error of each call', async () => {
    const failures = await Promise.all([
      failureOf(client =>
        client.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'User', id: 'u1', fields: ['name'] }],
        }),
      ),
      failureOf(client => client.query({ query: 'Q', input: {}, window: {} })),
      failureOf(client => client.mutate({ requestId: 'r1', mutation: 'M', input: {} })),
      failureOf(client => Stream.runDrain(client.live({ requirements: [], after: 0 }))),
    ])
    expect(failures.map(failure => failure?._tag)).toEqual([
      'RemoteReadError',
      'RemoteQueryError',
      'RemoteMutationError',
      'RemoteLiveError',
    ])
    expect(failures.every(failure => (failure?.message ?? '').length > 0)).toBe(true)
  })
})
