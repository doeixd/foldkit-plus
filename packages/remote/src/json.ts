/**
 * Remote's three calls as JSON: one request, `{ operation, payload }`, and one
 * answer, `{ result }` or `{ error }`. `RemoteServer.answer` is the other end.
 * The client takes any way of sending the request text and receiving the
 * answer, so the same client speaks HTTP (`http`), a worker, or a server
 * running in the page. There is no live stream over it.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import type { RemoteJsonClient } from './client.js'
import {
  RemoteForbidden,
  RemoteMutationError,
  RemoteQueryError,
  RemoteReadError,
  RemoteUnauthenticated,
  RemoteUnreachable,
} from './wire.js'

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
 * `signal` aborts when the call is interrupted: nobody waits on its answer
 * any more, or its deadline passed; stop the request then. A
 * value that is not a `RemoteJsonAnswer` is no answer either: a mutation fails
 * `RemoteUnreachable` for both, a read or a query its own error, which is
 * retried like any failed read.
 */
export type RemoteJsonSend = (request: string, signal: AbortSignal) => Promise<unknown>

const call = <A, E, U>(
  send: RemoteJsonSend,
  operation: RemoteJsonRequest['operation'],
  payload: unknown,
  fail: (answer: ErrorAnswer) => E,
  /** What no answer coming back is: the request was not sent, or what came back was no answer. */
  unreached: (message: string) => U,
): Effect.Effect<A, E | U> =>
  Effect.tryPromise({
    try: signal => send(JSON.stringify({ operation, payload }), signal),
    catch: error => unreached(error instanceof Error ? error.message : String(error)),
  }).pipe(
    Effect.flatMap(answer =>
      decodeAnswer(answer).pipe(
        // JSON that is not an answer came from something in front of Remote
        // (a gateway's `{}`), so the request may have reached the server.
        Effect.mapError(() =>
          unreached('The server answered with something that is not an answer'),
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

/**
 * An error answer as its call's failure: a refusal of who is asking, of
 * every call kind alike, or the call's own error.
 */
const failure =
  <E>(own: (answer: ErrorAnswer) => E) =>
  (answer: ErrorAnswer): E | RemoteUnauthenticated =>
    answer.unauthenticated === undefined
      ? own(answer)
      : new RemoteUnauthenticated({
          message: answer.error,
          ...(answer.unauthenticated.reason === undefined
            ? {}
            : { reason: answer.unauthenticated.reason }),
        })

/** Remote's client over `send`, for `Remote.clientLayer`. */
export const json = (send: RemoteJsonSend): RemoteJsonClient => ({
  FoldkitRemoteRead: payload =>
    call(
      send,
      'read',
      payload,
      failure(({ error }) => new RemoteReadError({ message: error })),
      message => new RemoteReadError({ message }),
    ),
  FoldkitRemoteQuery: payload =>
    call(
      send,
      'query',
      payload,
      failure(({ error }) => new RemoteQueryError({ message: error })),
      message => new RemoteQueryError({ message }),
    ),
  FoldkitRemoteMutate: payload =>
    call(
      send,
      'mutate',
      payload,
      failure(({ error, refusal, forbidden }) =>
        forbidden === undefined
          ? new RemoteMutationError({ message: error, refusal })
          : new RemoteForbidden({
              message: error,
              ...(forbidden.reason === undefined ? {} : { reason: forbidden.reason }),
            }),
      ),
      // A mutation that may not have reached the server is told apart, so a
      // durable one is sent again rather than settled.
      message => new RemoteUnreachable({ message }),
    ),
  FoldkitRemoteLive: () => Stream.empty,
})

/** A body that did not parse, told apart from every value one can parse to, `null` included. */
const notJson = Symbol('not JSON')

const Reason = Schema.Struct({ reason: Schema.optional(Schema.String) })
/** A refusal in Remote's own words, by the key it is given under. */
const ownRefusal: Record<
  'unauthenticated' | 'forbidden',
  (body: unknown) => Option.Option<Partial<RemoteJsonAnswer>>
> = {
  unauthenticated: Schema.decodeUnknownOption(
    Schema.Struct({ error: Schema.String, unauthenticated: Reason }),
  ),
  forbidden: Schema.decodeUnknownOption(Schema.Struct({ error: Schema.String, forbidden: Reason })),
}

/**
 * A 401's or 403's answer, whatever its body: Remote's own refusal as it is,
 * and anything else (`{ error }` from middleware, HTML, a shape of its own)
 * as the status alone, so it never reaches a decoder that would call it a
 * broken answer.
 */
const refusalOf = (
  body: unknown,
  kind: 'unauthenticated' | 'forbidden',
  status: string,
): Partial<RemoteJsonAnswer> =>
  Option.getOrElse(ownRefusal[kind](body), () => ({ error: status, [kind]: {} }))

/**
 * Statuses Remote's server never answers with, which say the request was not
 * served (yet): a body under one is a gateway's or a limiter's, never an answer.
 */
const unanswered: ReadonlySet<number> = new Set([408, 429, 502, 503, 504])

/**
 * Remote's client over HTTP: each call a `POST` of the request to `url`, the
 * answer its JSON body. A body that is not JSON, or one under 408, 429, 502,
 * 503 or 504, is no answer: a mutation fails `RemoteUnreachable`, so a
 * durable one is sent again. A 401 is answered as
 * unauthenticated, for every call kind, and a 403 as forbidden, whatever the
 * body says: the server's own says why, and middleware in front of Remote
 * may say anything.
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
): RemoteJsonClient =>
  json(async (request, signal) => {
    const via = options.fetch ?? fetch
    const response = await via(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers?.() },
      body: request,
      signal,
    })
    const status = `${response.status} ${response.statusText}`
    const body: unknown = await response.json().catch(() => notJson)
    if (response.status === 401) return refusalOf(body, 'unauthenticated', status)
    if (response.status === 403) return refusalOf(body, 'forbidden', status)
    if (body === notJson || unanswered.has(response.status)) throw new Error(status)
    return body
  })
