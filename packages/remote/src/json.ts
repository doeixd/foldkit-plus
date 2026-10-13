/**
 * Remote's three calls as JSON: one request, `{ operation, payload }`, and one
 * answer, `{ result }` or `{ error }`. `RemoteServer.answer` is the other end.
 * The client takes any way of sending the request text and receiving the
 * answer, so the same client speaks HTTP (`http`), a worker, or a server
 * running in the page. There is no live stream over it.
 */
import { Effect, Schema, Stream } from 'effect'
import type { RemoteRpcClient } from './client.js'
import { RemoteForbidden, RemoteMutationError, RemoteQueryError, RemoteReadError } from './wire.js'

/** A request: which of Remote's calls, and its payload as the RPC protocol encodes it. */
export const RemoteJsonRequest = Schema.Struct({
  operation: Schema.Literals(['read', 'query', 'mutate']),
  payload: Schema.Unknown,
})
export type RemoteJsonRequest = typeof RemoteJsonRequest.Type

/** An answer: the call's result, or why there is none. */
export const RemoteJsonAnswer = Schema.Union([
  Schema.Struct({ result: Schema.Unknown }),
  Schema.Struct({
    error: Schema.String,
    refusal: Schema.optional(Schema.Unknown),
    /** Who is asking was refused, with the application's reason when it gave one. */
    forbidden: Schema.optional(Schema.Struct({ reason: Schema.optional(Schema.String) })),
    /** Who is asking could not be told, with the reason when one was given; a 401. */
    unauthenticated: Schema.optional(Schema.Struct({ reason: Schema.optional(Schema.String) })),
  }),
])
export type RemoteJsonAnswer = typeof RemoteJsonAnswer.Type

type ErrorAnswer = Extract<RemoteJsonAnswer, { readonly error: string }>

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
  fail: (answer: ErrorAnswer) => E,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: () => send(JSON.stringify({ operation, payload })),
    catch: error => fail({ error: error instanceof Error ? error.message : String(error) }),
  }).pipe(
    Effect.flatMap(answer =>
      decodeAnswer(answer).pipe(
        Effect.mapError(() =>
          fail({ error: 'The server answered with something that is not an answer' }),
        ),
      ),
    ),
    Effect.flatMap(answer =>
      'error' in answer
        ? Effect.fail(fail(answer))
        : // The answer is to the request this call sent, so its result is this call's.
          Effect.succeed(answer.result as A),
    ),
  )

/** Remote's client over `send`, for `Remote.clientLayer`. */
export const json = (send: RemoteJsonSend): RemoteRpcClient => ({
  FoldkitRemoteRead: payload =>
    call(send, 'read', payload, ({ error }) => new RemoteReadError({ message: error })),
  FoldkitRemoteQuery: payload =>
    call(send, 'query', payload, ({ error }) => new RemoteQueryError({ message: error })),
  FoldkitRemoteMutate: payload =>
    call(send, 'mutate', payload, ({ error, refusal, forbidden }) =>
      forbidden === undefined
        ? new RemoteMutationError({ message: error, refusal })
        : new RemoteForbidden({
            message: error,
            ...(forbidden.reason === undefined ? {} : { reason: forbidden.reason }),
          }),
    ),
  FoldkitRemoteLive: () => Stream.empty,
})

/** A body that did not parse, told apart from every value one can parse to, `null` included. */
const notJson = Symbol('not JSON')

/**
 * Remote's client over HTTP: each call a `POST` of the request to `url`, the
 * answer its JSON body whatever its status. A 403 is answered as forbidden
 * unless its body says so itself, as the server's own does: one from
 * middleware in front of Remote (a refused session) may say only `{ error }`.
 * `headers` is read per request, so a token that changes reaches the next
 * call. `fetch` defaults to the global one; pass it to route calls through
 * another implementation in tests.
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
    const status = `${response.status} ${response.statusText}`
    const body: unknown = await response.json().catch(() => notJson)
    const saysForbidden =
      typeof body === 'object' && body !== null && Object.hasOwn(body, 'forbidden')
    if (response.status === 403 && !saysForbidden) return { error: status, forbidden: {} }
    if (body === notJson) throw new Error(status)
    return body
  })
