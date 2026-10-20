/**
 * An image's facts read in a real browser, as an editor reads a file a reader
 * dropped: its size, its SHA-256, a ThumbHash, and alpha only where a pixel is
 * not opaque; and what the browser cannot decode, or is too large, refused.
 */
import { Effect, Exit, Option } from 'effect'
import { describe, Placeholder } from 'foldkit-media'
import { inspectorBrowser } from 'foldkit-media/browser'
import { expect, test } from 'vitest'

/** A teal PNG, optionally with transparency that downsampling may hide. */
const png = async (
  width: number,
  height: number,
  transparency: 'none' | 'area' | 'pixel' | 'corner' = 'none',
) => {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')!
  context.fillStyle = 'teal'
  context.fillRect(0, 0, width, height)
  if (transparency === 'area') context.clearRect(0, 0, width / 4, height / 4)
  if (transparency === 'pixel') {
    const pixel = context.getImageData(0, 0, 1, 1)
    pixel.data[3] = 254
    context.putImageData(pixel, 0, 0)
  }
  // The last pixel, in the last tile the inspector reads.
  if (transparency === 'corner') {
    const pixel = context.getImageData(width - 1, height - 1, 1, 1)
    pixel.data[3] = 254
    context.putImageData(pixel, width - 1, height - 1)
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

const read = (bytes: Uint8Array<ArrayBuffer>, maxPixels?: number) =>
  Effect.runPromiseExit(
    describe('dropped.png', bytes).pipe(
      Effect.provide(inspectorBrowser(maxPixels === undefined ? {} : { maxPixels })),
    ),
  )

const hex = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

test('reads a dropped file’s size, hash and ThumbHash, opaque where every pixel is', async () => {
  const bytes = await png(640, 320)
  const exit = await read(bytes)
  if (!Exit.isSuccess(exit)) throw new Error('expected the facts')
  const asset = exit.value
  expect([asset.key, asset.width, asset.height, asset.alpha]).toEqual([
    'dropped.png',
    640,
    320,
    false,
  ])
  expect(Option.getOrThrow(asset.hash)).toBe(await hex(bytes))
  const placeholder = Option.getOrThrow(asset.placeholder)
  expect(Placeholder.guards.ThumbHash(placeholder)).toBe(true)
})

test('reads alpha where any pixel is not opaque', async () => {
  for (const transparency of ['area', 'pixel'] as const) {
    const exit = await read(await png(400, 400, transparency))
    expect(Exit.isSuccess(exit) && exit.value.alpha).toBe(true)
  }
  // Wider and taller than one tile, so a reading of the first tile alone misses it.
  const exit = await read(await png(1100, 700, 'corner'))
  expect(Exit.isSuccess(exit) && exit.value.alpha).toBe(true)
})

test('refuses bytes the browser cannot decode, and a picture above the pixel limit', async () => {
  const garbage = await read(new TextEncoder().encode('not an image'))
  expect(Exit.isFailure(garbage) && JSON.stringify(garbage.cause)).toContain('TransformFailed')
  const large = await read(await png(200, 200), 100 * 100)
  expect(Exit.isFailure(large) && JSON.stringify(large.cause)).toContain('OriginalTooLarge')
})
