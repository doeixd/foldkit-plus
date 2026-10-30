/**
 * A request body read up to a limit, refused past it before anything decodes
 * it: what `serveFetch` and `bodyLimit` share. The limit is checked against
 * `content-length` before a byte is read, and against the bytes as they
 * arrive, so a body without one, or with one that lies, is cancelled the
 * moment it passes the limit rather than buffered whole.
 */
import { Data, Effect } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import { DEFAULT_MAX_BODY_BYTES, type RemoteJsonAnswer } from 'foldkit-remote'

/** The body passed the limit; nothing past it was kept. */
class BodyTooLarge extends Error {}

/** Remote's answer to a body over `limit`, sent as a 413. */
export const tooLargeAnswer = (limit: number): RemoteJsonAnswer => ({
  error: `The request body is larger than ${limit} bytes`,
  tooLarge: { limit },
})

/** Whether `request` says it is larger than `limit`, before any of it is read. */
export const declaresTooLarge = (request: Request, limit: number): boolean => {
  const length = Number(request.headers.get('content-length') ?? Number.NaN)
  return Number.isFinite(length) && length > limit
}

/**
 * `request`'s body, at most `limit` bytes of it. Rejects with `BodyTooLarge`
 * once more arrive, having cancelled the rest, or with the stream's own error.
 */
const readBounded = async (request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
  if (declaresTooLarge(request, limit)) throw new BodyTooLarge()
  if (request.body === null) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new BodyTooLarge()
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/** What a body read up to a limit came to: its bytes, or why there are none. */
type BoundedBody = Data.TaggedEnum<{
  Read: { readonly bytes: Uint8Array<ArrayBuffer> }
  TooLarge: {}
  Unreadable: {}
}>
const BoundedBody = Data.taggedEnum<BoundedBody>()

/** `request`'s body read up to `limit` bytes; never fails. */
const readBody = (request: Request, limit: number): Effect.Effect<BoundedBody> =>
  Effect.tryPromise(() => readBounded(request, limit)).pipe(
    Effect.match({
      onSuccess: bytes => BoundedBody.Read({ bytes }),
      onFailure: error =>
        error.cause instanceof BodyTooLarge ? BoundedBody.TooLarge() : BoundedBody.Unreadable(),
    }),
  )

/** A body refused before any handler: the status and Remote's answer. */
export class BodyRefused extends Data.TaggedError('BodyRefused')<{
  readonly status: 400 | 413
  readonly answer: RemoteJsonAnswer
}> {}

/** Decodes a body as UTF-8, refusing bytes that are not, as `JSON.parse` would refuse the text. */
const utf8 = new TextDecoder('utf-8', { fatal: true })

/** `request`'s body read up to `limit` bytes and parsed as JSON, or refused. */
export const readJson = (request: Request, limit: number): Effect.Effect<unknown, BodyRefused> => {
  const notJson = new BodyRefused({ status: 400, answer: { error: 'The body is not JSON' } })
  return Effect.flatMap(readBody(request, limit), body =>
    BoundedBody.$match(body, {
      Read: ({ bytes }) =>
        Effect.try({ try: (): unknown => JSON.parse(utf8.decode(bytes)), catch: () => notJson }),
      TooLarge: () => Effect.fail(new BodyRefused({ status: 413, answer: tooLargeAnswer(limit) })),
      Unreadable: () => Effect.fail(notJson),
    }),
  )
}

/**
 * Effect HTTP middleware refusing a request body over `maxBytes` (default
 * 1 MiB, `serveFetch`'s) with a 413 and Remote's `tooLarge` answer, before
 * the endpoint reads it. For an endpoint that serves `RemoteRpc` through
 * `RpcServer`, where Effect's own `MaxBodySize` fails the body read as a
 * defect, a 500:
 *
 * ```ts
 * HttpRouter.add('POST', '/rpc', bodyLimit(64 * 1024)(rpcHttpEffect))
 * ```
 *
 * A body within the limit reaches the endpoint whole, read once.
 */
export const bodyLimit =
  (maxBytes: number = DEFAULT_MAX_BODY_BYTES) =>
  <E, R>(
    endpoint: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  ): Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    R | HttpServerRequest.HttpServerRequest
  > =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const web = yield* Effect.orDie(HttpServerRequest.toWeb(request))
      const body = yield* readBody(web, maxBytes)
      return yield* BoundedBody.$match(body, {
        TooLarge: () =>
          Effect.succeed(HttpServerResponse.jsonUnsafe(tooLargeAnswer(maxBytes), { status: 413 })),
        Unreadable: () =>
          Effect.succeed(
            HttpServerResponse.jsonUnsafe({ error: 'The body could not be read' }, { status: 400 }),
          ),
        Read: ({ bytes }) =>
          Effect.provideService(
            endpoint,
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(new Request(web, { body: bytes })),
          ),
      })
    })
