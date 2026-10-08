/**
 * Remote's three calls as JSON: one request, `{ operation, payload }`, and one
 * answer, `{ result }` or `{ error }`. `RemoteServer.answer` is the other end.
 * The client takes any way of sending the request text and receiving the
 * answer, so the same client speaks HTTP (`http`), a worker, or a server
 * running in the page. There is no live stream over it.
 */
import { Effect, Schema, Stream } from 'effect'
import type { RemoteRpcClient } from './client.js'
import { RemoteMutationError, RemoteQueryError, RemoteReadError } from './wire.js'

/** A request: which of Remote's calls, and its payload as the RPC protocol encodes it. */
export const RemoteJsonRequest = Schema.Struct({
  operation: Schema.Literals(['read', 'query', 'mutate']),
  payload: Schema.Unknown,
})
export type RemoteJsonRequest = typeof RemoteJsonRequest.Type

/** An answer: the call's result, or why there is none. */
export const RemoteJsonAnswer = Schema.Union([
  Schema.Struct({ result: Schema.Unknown }),
  Schema.Struct({ error: Schema.String }),
])
export type RemoteJsonAnswer = typeof RemoteJsonAnswer.Type

const decodeAnswer = Schema.decodeUnknownEffect(RemoteJsonAnswer)

/**
 * Sends one request's text and resolves with its answer as parsed JSON. It
 * rejects when nothing came back, and the call fails with that message.
 */
export type RemoteJsonSend = (request: string) => Promise<unknown>

const call = <A, E>(
  send: RemoteJsonSend,
  operation: RemoteJsonRequest['operation'],
  payload: unknown,
  fail: (message: string) => E,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: () => send(JSON.stringify({ operation, payload })),
    catch: error => fail(error instanceof Error ? error.message : String(error)),
  }).pipe(
    Effect.flatMap(answer =>
      decodeAnswer(answer).pipe(
        Effect.mapError(() => fail('The server answered with something that is not an answer')),
      ),
    ),
    Effect.flatMap(answer =>
      'error' in answer
        ? Effect.fail(fail(answer.error))
        : // The answer is to the request this call sent, so its result is this call's.
          Effect.succeed(answer.result as A),
    ),
  )

/** Remote's client over `send`, for `Remote.clientLayer`. */
export const json = (send: RemoteJsonSend): RemoteRpcClient => ({
  FoldkitRemoteRead: payload =>
    call(send, 'read', payload, message => new RemoteReadError({ message })),
  FoldkitRemoteQuery: payload =>
    call(send, 'query', payload, message => new RemoteQueryError({ message })),
  FoldkitRemoteMutate: payload =>
    call(send, 'mutate', payload, message => new RemoteMutationError({ message })),
  FoldkitRemoteLive: () => Stream.empty,
})

/**
 * Remote's client over HTTP: each call a `POST` of the request to `url`, the
 * answer its JSON body whatever its status. `headers` is read per request, so
 * a token that changes reaches the next call. `fetch` defaults to the global
 * one; pass it to route calls through another implementation in tests.
 */
export const http = (
  url: string,
  options: {
    readonly headers?: (() => Readonly<Record<string, string>>) | undefined
    readonly fetch?: typeof fetch | undefined
  } = {},
): RemoteRpcClient =>
  json(async request => {
    const via = options.fetch ?? fetch
    const response = await via(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers?.() },
      body: request,
    })
    return response.json().catch(() => {
      throw new Error(`${response.status} ${response.statusText}`)
    })
  })
