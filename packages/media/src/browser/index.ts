/**
 * An image's facts read in the browser, where it is chosen: `describe(key,
 * bytes)` over `inspectorBrowser()` gives its `ImageAsset`, size, hash and
 * ThumbHash included, before it is uploaded or stored, with no server to ask.
 * The browser's own decoder reads it, so what it cannot show is refused here.
 */
import { Effect, Layer, Option } from 'effect'
import { Inspector } from '../describe.js'
import { nonNegativeInteger } from '../limits.js'
import { OriginalTooLarge, TransformFailed } from '../server/errors.js'

// A ThumbHash is made from at most 100 pixels a side.
const THUMBNAIL_SIDE = 100

// Bound each canvas readback while still checking every decoded pixel.
const ALPHA_TILE_SIDE = 512

// About 50 megapixels, as the Node inspector: a photograph decodes, a decompression bomb does not.
const DEFAULT_MAX_PIXELS = 50_000_000

/**
 * The `Inspector` in a browser or a web worker: the size from the decoded
 * picture, a thumbnail drawn on an `OffscreenCanvas`, and alpha where any
 * decoded pixel is not opaque. A file the browser cannot decode is
 * `TransformFailed`; one above `maxPixels` is `OriginalTooLarge`, its pixels
 * released at once.
 */
export const inspectorBrowser = (
  options: { readonly maxPixels?: number } = {},
): Layer.Layer<Inspector> => {
  const maxPixels = nonNegativeInteger('maxPixels', options.maxPixels ?? DEFAULT_MAX_PIXELS)
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
            const alphaCanvas = new OffscreenCanvas(
              Math.min(width, ALPHA_TILE_SIDE),
              Math.min(height, ALPHA_TILE_SIDE),
            )
            const alphaContext = alphaCanvas.getContext('2d')
            if (alphaContext === null) return yield* new TransformFailed({})
            let alpha = false
            for (let top = 0; top < height && !alpha; top += ALPHA_TILE_SIDE) {
              for (let left = 0; left < width && !alpha; left += ALPHA_TILE_SIDE) {
                const tileWidth = Math.min(ALPHA_TILE_SIDE, width - left)
                const tileHeight = Math.min(ALPHA_TILE_SIDE, height - top)
                alphaCanvas.width = tileWidth
                alphaCanvas.height = tileHeight
                alphaContext.drawImage(
                  bitmap,
                  left,
                  top,
                  tileWidth,
                  tileHeight,
                  0,
                  0,
                  tileWidth,
                  tileHeight,
                )
                const pixels = alphaContext.getImageData(0, 0, tileWidth, tileHeight).data
                for (let at = 3; at < pixels.length && !alpha; at += 4) alpha = pixels[at]! < 255
              }
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
