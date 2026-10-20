import { Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Format, mimeType } from '../format.js'
import { OriginalNotFound } from './errors.js'
import { Originals, Variants } from './services.js'

// A key ends in its variant's spelling (`<hash>/w640.avif`), which names the format.
const mediaTypeOf = (key: string): string => {
  const extension = key.slice(key.lastIndexOf('.') + 1)
  return Schema.is(Format)(extension) ? mimeType(extension) : 'application/octet-stream'
}

/**
 * `Variants` over a `KeyValueStore`. A variant's bytes are its value and its
 * media type is its key's extension, so nothing else is stored. A store that
 * fails is logged and read as a miss, or a write it drops: a variant is a
 * cache, and the request is answered either way.
 */
export const makeVariants = (store: KeyValueStore.KeyValueStore): Variants['Service'] => ({
  get: key =>
    store.getUint8Array(key).pipe(
      Effect.map(bytes =>
        Option.map(Option.fromNullishOr(bytes), value => ({
          encoded: { bytes: new Uint8Array(value), contentType: mediaTypeOf(key) },
          from: 'store' as const,
        })),
      ),
      Effect.catch(error =>
        Effect.logWarning('Media: the variant store failed a read', error).pipe(
          Effect.as(Option.none()),
        ),
      ),
    ),
  put: (key, encoded) =>
    store
      .set(key, encoded.bytes)
      .pipe(
        Effect.catch(error => Effect.logWarning('Media: the variant store failed a write', error)),
      ),
})

/**
 * Variants kept in the application's `KeyValueStore`, under `prefix`:
 * `KeyValueStore.layerMemory` for tests, `layerFileSystem` on a disk,
 * `layerSql` over SQLite or D1.
 */
export const variantsKeyValueStore = (
  options: { readonly prefix?: string } = {},
): Layer.Layer<Variants, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    Variants,
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore
      return makeVariants(KeyValueStore.prefix(store, options.prefix ?? 'variants/'))
    }),
  )

/**
 * Originals in the application's `KeyValueStore`, each under its content
 * hash after `prefix`. A store that fails is a defect, not a missing
 * original: the original is the data, and a 404 would say it is gone.
 */
export const originalsKeyValueStore = (
  options: { readonly prefix?: string } = {},
): Layer.Layer<Originals, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    Originals,
    Effect.gen(function* () {
      const store = KeyValueStore.prefix(yield* KeyValueStore.KeyValueStore, options.prefix ?? '')
      return {
        get: (hash: string) =>
          store.getUint8Array(hash).pipe(
            Effect.orDie,
            Effect.flatMap(bytes =>
              bytes === undefined
                ? Effect.fail(new OriginalNotFound({ hash }))
                : Effect.succeed({
                    body: new Blob([new Uint8Array(bytes)]).stream(),
                    size: bytes.byteLength,
                  }),
            ),
          ),
      }
    }),
  )
