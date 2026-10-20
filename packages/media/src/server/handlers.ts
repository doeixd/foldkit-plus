import { Effect, Layer, Option, Schema } from 'effect'
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import * as Variant from '../variant.js'
import { makeApi, type MediaApi } from './api.js'
import { OriginalTooLarge } from './errors.js'
import { Originals, Transformer, Variants, type Encoded } from './services.js'

/** What a variant URL promises: its path names the original's bytes and the request, so it never changes. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** The Cloudflare Images binding reads at most 20 MB; a store's own limit may be lower. */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export interface Options {
  /** Every variant this server makes: the same value `Provider.hosted` writes URLs in. */
  readonly space?: Variant.Space
  /** The largest original read, in bytes; larger ones are a 413. */
  readonly maxBytes?: number
}

/**
 * The handlers of `api`'s one route: a variant already made is served as
 * kept; otherwise the original is read, transformed, kept, and served. A
 * failure is its own response (404, 413, 502, 503), never cached, and never
 * the original in the variant's place.
 */
export const handlers = (api: MediaApi, options: Options = {}) => {
  const { space = Variant.standard, maxBytes = DEFAULT_MAX_BYTES } = options
  const spell = Schema.encodeSync(space.schema)
  return HttpApiBuilder.group(api, 'images', group =>
    Effect.gen(function* () {
      // Resolved once, when the route is built, so a store kept in memory lives as long as the server.
      const originals = yield* Originals
      const transformer = yield* Transformer
      const variants = yield* Variants
      const make = Effect.fn('Media.make')(function* (hash: string, variant: Variant.Variant) {
        const original = yield* originals.get(hash)
        if (original.size > maxBytes) {
          return yield* new OriginalTooLarge({ hash, bytes: original.size, limit: maxBytes })
        }
        return yield* transformer.transform(original, variant)
      })
      return group.handle(
        'variant',
        Effect.fn('Media.variant')(function* ({ params }) {
          // The decoded request spelled again: one request, one key.
          const key = `${params.hash}/${spell(params.variant)}`
          const encoded: Encoded = yield* Option.match(yield* variants.get(key), {
            onSome: Effect.succeed,
            onNone: () =>
              make(params.hash, params.variant).pipe(Effect.tap(made => variants.put(key, made))),
          })
          return HttpServerResponse.uint8Array(encoded.bytes, {
            contentType: encoded.contentType,
            headers: { 'cache-control': IMMUTABLE },
          })
        }),
      )
    }),
  )
}

/**
 * The media server as an Effect HTTP application: its route registered with
 * the `HttpRouter`, needing `Originals`, `Transformer` and `Variants`.
 */
export const layer = (options: Options = {}) => {
  const api = makeApi(options.space ?? Variant.standard)
  return HttpApiBuilder.layer(api).pipe(Layer.provide(handlers(api, options)))
}

/**
 * The media server as a Worker's fetch handler. A Worker's bindings arrive
 * with each request, so `layer` builds the services from them; the router is
 * built once per environment and kept, since a Worker hands every request the
 * same one. It answers its own route and 404s anything else, so route to it
 * by path (`/_image/`).
 */
export const serveFetch = <Env extends object>(
  options: Options & {
    readonly layer: (env: Env) => Layer.Layer<Originals | Transformer | Variants>
  },
): ((request: Request, env: Env) => Promise<Response>) => {
  const built = new WeakMap<Env, (request: Request) => Promise<Response>>()
  return (request, env) => {
    const known = built.get(env)
    if (known !== undefined) return known(request)
    const { handler } = HttpRouter.toWebHandler(
      layer(options).pipe(
        Layer.provide(options.layer(env)),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    const answer = (incoming: Request) => handler(incoming)
    built.set(env, answer)
    return answer(request)
  }
}
