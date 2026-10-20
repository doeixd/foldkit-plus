/**
 * An image's facts read in the browser, where it is chosen: `describe(key,
 * bytes)` over `inspectorBrowser()` gives its `ImageAsset`, size, hash and
 * ThumbHash included, before it is uploaded or stored, with no server to ask.
 * The browser's own decoder reads it, so what it cannot show is refused here.
 */
import { Effect, Layer, Option } from 'effect'
import { Inspector } from '../describe.js'
import { OriginalTooLarge, TransformFailed } from '../server/errors.js'

// A ThumbHash is made from at most 100 pixels a side.
const THUMBNAIL_SIDE = 100

// About 50 megapixels, as the Node inspector: a photograph decodes, a decompression bomb does not.
const DEFAULT_MAX_PIXELS = 50_000_000

/**
 * The `Inspector` in a browser or a web worker: the size from the decoded
 * picture, a thumbnail drawn on an `OffscreenCanvas`, and alpha where any of
 * the thumbnail's pixels is not opaque. A file the browser cannot decode is
 * `TransformFailed`; one above `maxPixels` is `OriginalTooLarge`, its pixels
 * released at once.
 */
export const inspectorBrowser = (
  options: { readonly maxPixels?: number } = {},
): Layer.Layer<Inspector> => {
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS
  return Layer.succeed(Inspector, {
    inspect: bytes =>
      Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () => createImageBitmap(new Blob([bytes])),
          catch: () => new TransformFailed({}),
        }),
        bitmap =>
          Effect.gen(function* () {
            const { width, height } = bitmap
            if (width * height > maxPixels) {
              return yield* new OriginalTooLarge({
                size: width * height,
                limit: maxPixels,
                unit: 'pixels',
              })
            }
            const scale = Math.min(1, THUMBNAIL_SIDE / Math.max(width, height))
            const side = (length: number) => Math.max(1, Math.round(length * scale))
            const canvas = new OffscreenCanvas(side(width), side(height))
            const context = canvas.getContext('2d')
            if (context === null) return yield* new TransformFailed({})
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
            const rgba = new Uint8Array(
              context.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
            )
            let alpha = false
            for (let at = 3; at < rgba.length && !alpha; at += 4) alpha = rgba[at]! < 255
            return {
              width,
              height,
              alpha,
              thumbnail: Option.some({ width: canvas.width, height: canvas.height, rgba }),
            }
          }),
        bitmap => Effect.sync(() => bitmap.close()),
      ),
  })
}
