/**
 * `Remote.clientLayer` over the client `RpcClient.make(RemoteRpc)` builds, as
 * an application wires a real transport. That client also fails with
 * `RpcClientError` when the transport does; it reaches the application as
 * `RemoteUnreachable` (a live stream's `RemoteLiveError`), which it shows and
 * retries, never as a defect.
 */
import { Effect, Layer, Result, Stream } from 'effect'
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http'
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

/** A network whose every request is answered `body` under `status`, as a gateway in front would. */
const answering = (status: number, body: string) =>
  HttpClient.make(request =>
    Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status }))),
  )

/** The stock client over HTTP, handed to `Remote.clientLayer` as it is. */
const stockClientLayer = (network: HttpClient.HttpClient) =>
  Layer.unwrap(Effect.map(RpcClient.make(RemoteRpc), client => Remote.clientLayer(client))).pipe(
    Layer.provide(
      Layer.effect(RpcClient.Protocol, RpcClient.makeProtocolHttp(network)).pipe(
        Layer.provide(RpcSerialization.layerJson),
      ),
    ),
  )

/**
 * The call's failure, if it failed. A defect is not caught by `Effect.result`,
 * so it rejects the promise and fails the test on its own.
 */
const failureOf = <A, E>(
  use: (client: RemoteClient['Service']) => Effect.Effect<A, E>,
  network: HttpClient.HttpClient = offline,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        return yield* Effect.result(use(yield* RemoteClient))
      }).pipe(Effect.provide(stockClientLayer(network))),
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
      failureOf(client =>
        Stream.runDrain(client.live({ requirements: [], queries: [], after: 0 })),
      ),
    ])
    // Nothing answered a call, so it is told apart from one the server refused.
    expect(failures.map(failure => failure?._tag)).toEqual([
      'Unreachable',
      'Unreachable',
      'Unreachable',
      'RemoteLiveError',
    ])
    expect(failures.every(failure => (failure?.message ?? '').length > 0)).toBe(true)
  })

  it.each([
    [502, '<h1>Bad gateway</h1>'],
    [503, '{"error":"Service Unavailable"}'],
    [200, ''],
    [200, '{}'],
    [200, '[]'],
  ])('fails a write answered %i %j, which is no answer, as unreached', async (status, body) => {
    const failure = await failureOf(
      client => client.mutate({ requestId: 'r1', mutation: 'M', input: {} }),
      answering(status, body),
    )
    expect(failure?._tag).toBe('Unreachable')
  })
})
