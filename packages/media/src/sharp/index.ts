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
import { Inspector } from '../describe.js'
import { nonNegativeInteger } from '../limits.js'
import { Transformer, limitTransforms } from '../server/services.js'

// About 50 megapixels: a 9000×5500 photograph decodes; a decompression bomb does not.
const DEFAULT_MAX_PIXELS = 50_000_000

/** What a failed sharp call ends in: logged under `label`, and answered as a 502. */
const failedAs = (label: string) => (cause: unknown) =>
  Effect.logWarning(`${label} failed`, cause).pipe(
    Effect.andThen(Effect.fail(new TransformFailed({}))),
  )

/**
 * An original's size from its header alone, refused above `maxPixels` before
 * anything is decoded: a small file that inflates to a huge picture is a 413,
 * never an exhausted heap. The size is as shown, after its EXIF orientation:
 * a phone's portrait photograph is stored landscape and turned when drawn.
 */
const measure = (
  input: Uint8Array,
  maxPixels: number,
  failed: (cause: unknown) => Effect.Effect<never, TransformFailed>,
) =>
  Effect.gen(function* () {
    const { autoOrient } = yield* Effect.tryPromise({
      try: () => sharp(input).metadata(),
      catch: cause => cause,
    }).pipe(Effect.catch(failed))
    const { width, height } = autoOrient
    if (width * height > maxPixels) {
      return yield* new OriginalTooLarge({ size: width * height, limit: maxPixels, unit: 'pixels' })
    }
    return { width, height }
  })

export const transformerSharp = (
  options: {
    /** Transforms run at once; by default the machine's cores. */
    readonly concurrency?: number
    /** The largest original decoded, in pixels. */
    readonly maxPixels?: number
  } = {},
): Layer.Layer<Transformer> => {
  const maxPixels = nonNegativeInteger('maxPixels', options.maxPixels ?? DEFAULT_MAX_PIXELS)
  const failed = failedAs('Media.transform')
  return Layer.succeed(Transformer, {
    transform: (original, variant) =>
      Effect.gen(function* () {
        const input = yield* Effect.promise(
          async () => new Uint8Array(await new Response(original.body).arrayBuffer()),
        )
        yield* measure(input, maxPixels, failed)
        const bytes = yield* Effect.tryPromise({
          try: () =>
            // Turned as shown, since a variant carries no orientation of its own.
            sharp(input, { limitInputPixels: maxPixels, failOn: 'error', autoOrient: true })
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

// A ThumbHash is made from at most 100 pixels a side.
const THUMBNAIL_SIDE = 100

/**
 * The `Inspector` on a Node server: an original's size and alpha from sharp,
 * and a thumbnail for its ThumbHash. Alpha is whether any pixel is not opaque
 * (`stats().isOpaque`), not whether the format has an alpha channel, so an
 * opaque PNG still gets a placeholder. An original above `maxPixels` is a 413.
 */
export const inspectorSharp = (
  options: { readonly maxPixels?: number } = {},
): Layer.Layer<Inspector> => {
  const maxPixels = nonNegativeInteger('maxPixels', options.maxPixels ?? DEFAULT_MAX_PIXELS)
  const failed = failedAs('Media.inspect')
  return Layer.succeed(Inspector, {
    inspect: bytes =>
      Effect.gen(function* () {
        const { width, height } = yield* measure(bytes, maxPixels, failed)
        const { stats, thumbnail } = yield* Effect.tryPromise({
          try: async () => ({
            stats: await sharp(bytes, { limitInputPixels: maxPixels }).stats(),
            thumbnail: await sharp(bytes, { limitInputPixels: maxPixels, autoOrient: true })
              .resize(THUMBNAIL_SIDE, THUMBNAIL_SIDE, { fit: 'inside' })
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true }),
          }),
          catch: cause => cause,
        }).pipe(Effect.catch(failed))
        return {
          width,
          height,
          alpha: !stats.isOpaque,
          thumbnail: Option.some({
            width: thumbnail.info.width,
            height: thumbnail.info.height,
            rgba: new Uint8Array(thumbnail.data),
          }),
        }
      }).pipe(Effect.withSpan('Media.inspect')),
  })
}
