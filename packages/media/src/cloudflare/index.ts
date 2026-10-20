/**
 * The media server's services on Cloudflare: originals in R2, the Images
 * binding as the transformer, and variants kept in R2 behind the Cache API.
 * Each takes the binding it needs, so build them in `serveFetch`'s `layer`
 * from the request's environment.
 */
import type { Cache, ImagesBinding, R2Bucket, RateLimit } from '@cloudflare/workers-types'
import { Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Admission, RateLimited } from '../server/admission.js'
import { Inspector } from '../describe.js'
import { OriginalNotFound, QuotaExhausted, TransformFailed } from '../server/errors.js'
import { Originals, Transformer, Variants, type Encoded } from '../server/services.js'
import { Uploads } from '../server/upload.js'
import { makeVariants } from '../server/stores.js'

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

/** Uploads into an R2 bucket, each under its content hash: what `originalsR2` reads. */
export const uploadsR2 = (bucket: R2Bucket): Layer.Layer<Uploads> =>
  Layer.succeed(Uploads, {
    put: (hash, bytes) => Effect.promise(() => bucket.put(hash, bytes)).pipe(Effect.asVoid),
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
 * An R2 bucket as an Effect `KeyValueStore`, for anything that keeps bytes by
 * key: `variantsKeyValueStore`, `originalsKeyValueStore`, or the
 * application's own. `clear` and `size` list the whole bucket.
 */
export const keyValueStoreR2 = (bucket: R2Bucket): Layer.Layer<KeyValueStore.KeyValueStore> =>
  Layer.succeed(KeyValueStore.KeyValueStore, r2Store(bucket))

const r2Store = (bucket: R2Bucket): KeyValueStore.KeyValueStore => {
  const attempt = <A>(method: string, key: string | undefined, run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: cause =>
        new KeyValueStore.KeyValueStoreError({
          message: `R2 ${method} failed`,
          method,
          ...(key === undefined ? {} : { key }),
          cause,
        }),
    })
  // Every key in the bucket, a page of listing at a time.
  const keys = async () => {
    const found: Array<string> = []
    let cursor: string | undefined
    do {
      const page = await bucket.list(cursor === undefined ? {} : { cursor })
      found.push(...page.objects.map(object => object.key))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor !== undefined)
    return found
  }
  return KeyValueStore.make({
    get: key => attempt('get', key, async () => (await bucket.get(key))?.text()),
    getUint8Array: key =>
      attempt('getUint8Array', key, async () => {
        const object = await bucket.get(key)
        return object === null ? undefined : new Uint8Array(await object.arrayBuffer())
      }),
    set: (key, value) => attempt('set', key, async () => void (await bucket.put(key, value))),
    remove: key => attempt('remove', key, () => bucket.delete(key)),
    clear: attempt('clear', undefined, async () => {
      const all = await keys()
      // R2 deletes at most 1,000 keys a call.
      for (let at = 0; at < all.length; at += 1000) await bucket.delete(all.slice(at, at + 1000))
    }),
    size: attempt('size', undefined, async () => (await keys()).length),
  })
}

// The Cache API keys by request; this origin is never fetched.
const edgeKey = (key: string) => `https://foldkit-media.invalid/${key}`

/**
 * Variants with the edge's Cache API in front: read there first, and filled
 * from what is kept behind it, so a popular variant is served from the edge.
 */
const withEdge = (behind: Variants['Service'], edge: Cache): Variants['Service'] => {
  const fill = (key: string, encoded: Encoded) =>
    Effect.promise(() =>
      edge.put(
        edgeKey(key),
        // The page's Response and workers-types' differ only in their declarations.
        new Response(encoded.bytes, {
          headers: {
            'content-type': encoded.contentType,
            'cache-control': 'public, max-age=31536000, immutable',
          },
        }) as never,
      ),
    )
  return {
    get: key =>
      Effect.promise(() => edge.match(edgeKey(key))).pipe(
        Effect.flatMap(hit =>
          hit === undefined
            ? behind.get(key).pipe(
                Effect.tap(found =>
                  Option.match(found, {
                    onNone: () => Effect.void,
                    onSome: kept => fill(key, kept.encoded),
                  }),
                ),
              )
            : Effect.promise(async () =>
                Option.some({
                  encoded: {
                    bytes: new Uint8Array(await hit.arrayBuffer()),
                    contentType: hit.headers.get('content-type') ?? 'application/octet-stream',
                  },
                  from: 'edge' as const,
                }),
              ),
        ),
      ),
    put: (key, encoded) => behind.put(key, encoded).pipe(Effect.andThen(fill(key, encoded))),
  }
}

/**
 * Variants kept in R2 under `prefix`, so one made last month is not made, and
 * billed, again: `variantsKeyValueStore` over `keyValueStoreR2`. With `cache`
 * (`caches.default`), the Cache API stands in front of it.
 */
export const variantsR2 = (
  bucket: R2Bucket,
  options: { readonly prefix?: string; readonly cache?: Cache } = {},
): Layer.Layer<Variants> => {
  const kept = makeVariants(KeyValueStore.prefix(r2Store(bucket), options.prefix ?? 'variants/'))
  return Layer.succeed(
    Variants,
    Option.match(Option.fromNullishOr(options.cache), {
      onNone: () => kept,
      onSome: edge => withEdge(kept, edge),
    }),
  )
}

/**
 * Admission through a Workers rate-limit binding (`[[ratelimits]]`), whose
 * limit and period are its configuration. It answers yes or no, not when, so
 * a refusal says to retry after `retryAfterSeconds` (the binding's period, 60
 * by default). A binding that fails admits the request, logged.
 */
export const admissionRateLimit = (
  binding: RateLimit,
  options: { readonly retryAfterSeconds?: number } = {},
): Layer.Layer<Admission> =>
  Layer.succeed(Admission, {
    admit: client =>
      Effect.tryPromise(() => binding.limit({ key: `foldkit-media:${client}` })).pipe(
        Effect.catch(error =>
          Effect.logWarning('Media: the rate limit binding failed; admitting', error).pipe(
            Effect.as({ success: true }),
          ),
        ),
        Effect.flatMap(({ success }) =>
          success
            ? Effect.void
            : Effect.fail(new RateLimited({ retryAfterSeconds: options.retryAfterSeconds ?? 60 })),
        ),
      ),
  })

/**
 * The `Inspector` through the Images binding: an original's size from `info`,
 * which costs no transformation. It makes no thumbnail, since raw pixels are
 * not offered offline and could not be tested, so an original described here
 * has no ThumbHash; and as `info` does not say whether pixels are
 * transparent, every format but JPEG is taken to be, which costs a
 * placeholder, never shows a wrong one. An SVG, which has no size in pixels,
 * is refused.
 */
export const inspectorImages = (images: ImagesBinding): Layer.Layer<Inspector> =>
  Layer.succeed(Inspector, {
    inspect: bytes =>
      Effect.tryPromise({
        try: () =>
          images.info(
            new Blob([bytes]).stream() as unknown as Parameters<ImagesBinding['info']>[0],
          ),
        catch: cause => cause,
      }).pipe(
        Effect.flatMap(info =>
          // An SVG's answer has no width: it has no size in pixels.
          'width' in info
            ? Effect.succeed({
                width: info.width,
                height: info.height,
                alpha: info.format !== 'image/jpeg',
                thumbnail: Option.none(),
              })
            : Effect.fail(info),
        ),
        Effect.catch(cause =>
          Effect.logWarning('Media.inspect failed', cause).pipe(
            Effect.andThen(Effect.fail(new TransformFailed({}))),
          ),
        ),
      ),
  })
