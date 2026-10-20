/**
 * The media server's `Transformer` on a Node server, through sharp. At most
 * `concurrency` transforms run at once (`limitTransforms`), and an original
 * is measured from its header before it is decoded, so a small file that
 * inflates to a huge picture is a 413, never an exhausted heap.
 */
import { availableParallelism } from 'node:os'
import { Effect, Layer, Option } from 'effect'
import sharp from 'sharp'
import { OriginalTooLarge, TransformFailed } from '../server/errors.js'
import { Transformer, limitTransforms } from '../server/services.js'

// About 50 megapixels: a 9000×5500 photograph decodes; a decompression bomb does not.
const DEFAULT_MAX_PIXELS = 50_000_000

export const transformerSharp = (
  options: {
    /** Transforms run at once; by default the machine's cores. */
    readonly concurrency?: number
    /** The largest original decoded, in pixels. */
    readonly maxPixels?: number
  } = {},
): Layer.Layer<Transformer> => {
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS
  const failed = (cause: unknown) =>
    Effect.logWarning('Media.transform failed', cause).pipe(
      Effect.andThen(Effect.fail(new TransformFailed({}))),
    )
  return Layer.succeed(Transformer, {
    transform: (original, variant) =>
      Effect.gen(function* () {
        const input = yield* Effect.promise(
          async () => new Uint8Array(await new Response(original.body).arrayBuffer()),
        )
        // The header alone: nothing is decoded yet.
        const { width = 0, height = 0 } = yield* Effect.tryPromise({
          try: () => sharp(input).metadata(),
          catch: cause => cause,
        }).pipe(Effect.catch(failed))
        if (width * height > maxPixels) {
          return yield* new OriginalTooLarge({
            size: width * height,
            limit: maxPixels,
            unit: 'pixels',
          })
        }
        const bytes = yield* Effect.tryPromise({
          try: () =>
            sharp(input, { limitInputPixels: maxPixels, failOn: 'error' })
              .resize({ width: variant.width, withoutEnlargement: true })
              .toFormat(
                variant.format,
                Option.match(variant.quality, {
                  onNone: () => ({}),
                  onSome: quality => ({ quality }),
                }),
              )
              .toBuffer(),
          catch: cause => cause,
        }).pipe(Effect.catch(failed))
        return { bytes: new Uint8Array(bytes), contentType: `image/${variant.format}` }
      }).pipe(Effect.withSpan('Media.transform')),
  }).pipe(limitTransforms(options.concurrency ?? availableParallelism()))
}
