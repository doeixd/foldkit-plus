/**
 * The media server's services on Cloudflare: originals in R2, the Images
 * binding as the transformer, and variants kept in R2 behind the Cache API.
 * Each takes the binding it needs, so build them in `serveFetch`'s `layer`
 * from the request's environment.
 */
import type { Cache, ImagesBinding, R2Bucket } from '@cloudflare/workers-types'
import { Effect, Layer, Option } from 'effect'
import { OriginalNotFound, QuotaExhausted, TransformFailed } from '../server/errors.js'
import { Originals, Transformer, Variants, type Encoded, type Kept } from '../server/services.js'

/** Originals in an R2 bucket, each under its content hash. */
export const originalsR2 = (bucket: R2Bucket): Layer.Layer<Originals> =>
  Layer.succeed(Originals, {
    get: hash =>
      Effect.promise(() => bucket.get(hash)).pipe(
        Effect.flatMap(object =>
          object === null
            ? Effect.fail(new OriginalNotFound({ hash }))
            : Effect.succeed({
                // The two runtimes' stream types differ only in their declarations.
                body: object.body as unknown as ReadableStream<Uint8Array>,
                size: object.size,
              }),
        ),
      ),
  })

// Cloudflare's code for a spent transformation allowance.
const QUOTA_EXHAUSTED = 9422

const isImagesError = (cause: unknown): cause is { readonly code: number } =>
  typeof cause === 'object' && cause !== null && typeof Reflect.get(cause, 'code') === 'number'

/**
 * The Images binding as the transformer. It scales down, never up, and names
 * the format, so the variant is what its URL says. A spent allowance is
 * `QuotaExhausted`; any other refusal is `TransformFailed`, its reason logged.
 */
export const transformerImages = (images: ImagesBinding): Layer.Layer<Transformer> =>
  Layer.succeed(Transformer, {
    transform: (original, variant) =>
      Effect.tryPromise({
        try: async () => {
          const result = await images
            .input(original.body as unknown as Parameters<ImagesBinding['input']>[0])
            .transform({ width: variant.width, fit: 'scale-down' })
            .output({
              format: `image/${variant.format}`,
              ...Option.match(variant.quality, {
                onNone: () => ({}),
                onSome: quality => ({ quality }),
              }),
            })
          const response = result.response()
          return {
            bytes: new Uint8Array(await response.arrayBuffer()),
            contentType: result.contentType(),
          }
        },
        catch: cause => cause,
      }).pipe(
        Effect.catch((cause): Effect.Effect<never, QuotaExhausted | TransformFailed> =>
          isImagesError(cause) && cause.code === QUOTA_EXHAUSTED
            ? Effect.fail(new QuotaExhausted({}))
            : Effect.logWarning('Media.transform failed', cause).pipe(
                Effect.andThen(Effect.fail(new TransformFailed({}))),
              ),
        ),
      ),
  })

/**
 * Variants kept in R2 under `prefix`, so one made last month is not made, and
 * billed, again. With `cache` (`caches.default`), the Cache API is read first
 * and filled from R2, so a popular variant is served from the edge.
 */
export const variantsR2 = (
  bucket: R2Bucket,
  options: { readonly prefix?: string; readonly cache?: Cache } = {},
): Layer.Layer<Variants> => {
  const { prefix = 'variants/' } = options
  const cache = Option.fromNullishOr(options.cache)
  // The Cache API keys by request; this origin is never fetched.
  const cacheKey = (key: string) => `https://foldkit-media.invalid/${key}`
  const cached = (encoded: Encoded) =>
    new Response(encoded.bytes, {
      headers: {
        'content-type': encoded.contentType,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  const fromResponse = async (response: {
    arrayBuffer(): Promise<ArrayBuffer>
    headers: { get(name: string): string | null }
  }) => ({
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  })
  const fill = (key: string, encoded: Encoded) =>
    Option.match(cache, {
      onNone: () => Effect.void,
      onSome: edge => Effect.promise(() => edge.put(cacheKey(key), cached(encoded) as never)),
    })
  const fromBucket = (key: string) =>
    Effect.promise(async (): Promise<Option.Option<Kept>> => {
      const object = await bucket.get(prefix + key)
      if (object === null) return Option.none()
      return Option.some({
        encoded: {
          bytes: new Uint8Array(await object.arrayBuffer()),
          contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        },
        from: 'store' as const,
      })
    }).pipe(
      Effect.tap(found =>
        Option.match(found, { onNone: () => Effect.void, onSome: kept => fill(key, kept.encoded) }),
      ),
    )
  return Layer.succeed(Variants, {
    get: key =>
      Option.match(cache, {
        onNone: () => fromBucket(key),
        onSome: edge =>
          Effect.promise(() => edge.match(cacheKey(key))).pipe(
            Effect.flatMap(hit =>
              hit === undefined
                ? fromBucket(key)
                : Effect.promise(() => fromResponse(hit)).pipe(
                    Effect.map(encoded => Option.some({ encoded, from: 'edge' as const })),
                  ),
            ),
          ),
      }),
    put: (key, encoded) =>
      Effect.promise(() =>
        bucket.put(prefix + key, encoded.bytes, {
          httpMetadata: { contentType: encoded.contentType },
        }),
      ).pipe(Effect.andThen(fill(key, encoded))),
  })
}
