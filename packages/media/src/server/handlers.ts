import { Cache, Effect, Layer, Option, Schema } from 'effect'
import { HttpRouter, HttpServer, HttpServerResponse, type HttpServerRequest } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import * as Variant from '../variant.js'
import { MediaApi } from './api.js'
import { Admission } from './admission.js'
import { OriginalTooLarge } from './errors.js'
import { Answer, headersFor, matches, statusOf, type From } from './headers.js'
import { Originals, Transformer, Variants, type Encoded } from './services.js'

/** The Cloudflare Images binding reads at most 20 MB; a store's own limit may be lower. */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export interface Options {
  /** Every variant this server makes: the same value `Provider.hosted` writes URLs in. */
  readonly space?: Variant.Space
  /** The largest original read, in bytes; larger ones are a 413. */
  readonly maxBytes?: number
  /**
   * Concurrent misses for one variant share one transform and one write.
   * Only where requests may wait on one another's work: on by default for
   * `layer` (a Node server), off for `serveFetch`, since a Worker request
   * cannot wake another's.
   */
  readonly coalesce?: boolean
  /**
   * Who is asking, for `Admission`: by default Cloudflare's `CF-Connecting-IP`,
   * else the connection's address. `X-Forwarded-For` is the client's to write,
   * so read it here only behind a proxy that sets it.
   */
  readonly clientOf?: (request: HttpServerRequest.HttpServerRequest) => string
}

const defaultClientOf = (request: HttpServerRequest.HttpServerRequest): string =>
  request.headers['cf-connecting-ip'] ?? Option.getOrElse(request.remoteAddress, () => 'unknown')

const optionsOf = (answer: Answer) => ({ status: statusOf(answer), headers: headersFor(answer) })

const served = (etag: string, from: From, encoded: Encoded) =>
  HttpServerResponse.uint8Array(encoded.bytes, {
    ...optionsOf(Answer.cases.Variant.make({ etag, from })),
    contentType: encoded.contentType,
  })

const notModified = (etag: string) =>
  HttpServerResponse.empty(optionsOf(Answer.cases.NotModified.make({ etag })))

// A refusal names its kind, and nothing of the server's internals.
const refused = (answer: Answer) =>
  HttpServerResponse.jsonUnsafe({ error: answer._tag }, optionsOf(answer))

/**
 * The handlers of `MediaApi`'s one route. The path is decoded against the
 * space; a variant kept is served as kept, and one the request already holds
 * (`If-None-Match`) is a 304 before the store is read; otherwise the original
 * is read, transformed, kept and served. Every answer, a refusal included,
 * goes through `headersFor`, and a failure is never the original in the
 * variant's place.
 */
export const handlers = (options: Options = {}) => {
  const {
    space = Variant.standard,
    maxBytes = DEFAULT_MAX_BYTES,
    coalesce = false,
    clientOf = defaultClientOf,
  } = options
  const decodeHash = Schema.decodeUnknownOption(Variant.ContentHash)
  const decodeVariant = Schema.decodeUnknownOption(space.schema)
  const spell = Schema.encodeSync(space.schema)
  return HttpApiBuilder.group(MediaApi, 'images', group =>
    Effect.gen(function* () {
      // Resolved once, when the route is built, so a store kept in memory lives as long as the server.
      const originals = yield* Originals
      const transformer = yield* Transformer
      const variants = yield* Variants
      const admit = Option.match(yield* Effect.serviceOption(Admission), {
        onNone: () => (_client: string) => Effect.void,
        onSome: admission => admission.admit,
      })
      const make = Effect.fn('Media.make')(function* (hash: string, variant: Variant.Variant) {
        const original = yield* originals.get(hash)
        if (original.size > maxBytes) {
          return yield* new OriginalTooLarge({
            size: original.size,
            limit: maxBytes,
            unit: 'bytes',
          })
        }
        return yield* transformer.transform(original, variant)
      })
      const makeAndKeep = (key: string, hash: string, variant: Variant.Variant) =>
        make(hash, variant).pipe(Effect.tap(made => variants.put(key, made)))
      // In flight only: an entry expires as it settles, so nothing is kept here and no failure is remembered.
      const shared = yield* Cache.make({
        capacity: 10_000,
        timeToLive: 0,
        lookup: (key: string) => {
          // The key is the hash, a slash, and the spelling: neither holds a slash of its own.
          const at = key.indexOf('/')
          const variant = Schema.decodeUnknownSync(space.schema)(key.slice(at + 1))
          return makeAndKeep(key, key.slice(0, at), variant)
        },
      })
      const serve = Effect.fn('Media.serve')(function* (
        hash: string,
        variant: Variant.Variant,
        ifNoneMatch: string | undefined,
        client: string,
      ) {
        // The decoded request spelled again: one request, one key, one ETag.
        const key = `${hash}/${spell(variant)}`
        const etag = `"${key}"`
        if (matches(ifNoneMatch, etag)) return notModified(etag)
        return yield* Option.match(yield* variants.get(key), {
          onSome: ({ encoded, from }) => Effect.succeed(served(etag, from, encoded)),
          onNone: () =>
            admit(client).pipe(
              Effect.andThen(coalesce ? Cache.get(shared, key) : makeAndKeep(key, hash, variant)),
              Effect.map(made => served(etag, 'made', made)),
              Effect.catchTags({
                OriginalNotFound: () => Effect.succeed(refused(Answer.cases.NotFound.make({}))),
                OriginalTooLarge: () => Effect.succeed(refused(Answer.cases.TooLarge.make({}))),
                TransformFailed: () => Effect.succeed(refused(Answer.cases.Failed.make({}))),
                QuotaExhausted: () => Effect.succeed(refused(Answer.cases.Exhausted.make({}))),
                RateLimited: ({ retryAfterSeconds }) =>
                  Effect.succeed(refused(Answer.cases.RateLimited.make({ retryAfterSeconds }))),
              }),
            ),
        })
      })
      return group.handle('variant', ({ params, request }) =>
        Option.match(Option.all([decodeHash(params.hash), decodeVariant(params.variant)]), {
          onNone: () => Effect.succeed(refused(Answer.cases.Malformed.make({}))),
          onSome: ([hash, variant]) =>
            serve(hash, variant, request.headers['if-none-match'], clientOf(request)),
        }),
      )
    }),
  )
}

/**
 * The media server as an Effect HTTP application: its route registered with
 * the `HttpRouter`, needing `Originals`, `Transformer` and `Variants`.
 */
export const layer = (options: Options = {}) =>
  HttpApiBuilder.layer(MediaApi).pipe(Layer.provide(handlers({ coalesce: true, ...options })))

/**
 * A Worker's fetch handler over `app`, built from each environment's bindings
 * once and kept, since a Worker hands every request the same bindings. A
 * layer that fails to build answers a 500.
 */
export const fetchOf = <Env extends object>(
  app: (
    env: Env,
  ) => Layer.Layer<
    never,
    unknown,
    HttpRouter.HttpRouter | Layer.Success<typeof HttpServer.layerServices>
  >,
): ((request: Request, env: Env) => Promise<Response>) => {
  const built = new WeakMap<Env, (request: Request) => Promise<Response>>()
  return (request, env) => {
    const known = built.get(env)
    if (known !== undefined) return known(request)
    const { handler } = HttpRouter.toWebHandler(
      app(env).pipe(Layer.provide(HttpServer.layerServices)),
      { disableLogger: true },
    )
    const answer = (incoming: Request) => handler(incoming)
    built.set(env, answer)
    return answer(request)
  }
}

/**
 * The media server as a Worker's fetch handler, its services from each
 * environment's bindings. It answers its own route and 404s anything else, so
 * route to it by path (`/_image/`).
 */
export const serveFetch = <Env extends object>(
  options: Options & {
    /** The services, from the request's bindings. A layer that fails to build answers a 500. */
    readonly layer: (env: Env) => Layer.Layer<Originals | Transformer | Variants, unknown>
  },
): ((request: Request, env: Env) => Promise<Response>) =>
  fetchOf(env => layer(options).pipe(Layer.provide(options.layer(env))))
