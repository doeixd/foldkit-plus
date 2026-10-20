// @vitest-environment node
/**
 * The Node host: sharp behind the server's route, over memory stores. A
 * variant is resized to the width its URL asks and encoded in its format at
 * its quality, never above the original's width; an original that inflates
 * past the pixel limit is a 413 before it is decoded; bytes that are not an
 * image are a 502. `limitTransforms` holds transforms in flight to its count.
 */
import { createHash } from 'node:crypto'
import { Effect, Exit, Layer, Option, Ref } from 'effect'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { Variant } from 'foldkit-media'
import {
  Transformer,
  describe as describeOriginal,
  limitTransforms,
  serveFetch,
} from 'foldkit-media/server'
import { inspectorSharp, transformerSharp } from 'foldkit-media/sharp'
import { memoryStores } from './stores.js'

const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** A 640×320 photograph-like PNG: noise, so encoders and qualities differ. */
const original = new Uint8Array(
  await sharp({
    create: {
      width: 640,
      height: 320,
      channels: 3,
      background: '#2a6',
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .png()
    .toBuffer(),
)
const notAnImage = new TextEncoder().encode('not an image')

const space = Variant.space({ formats: ['avif', 'webp', 'jpeg'], qualities: [40, 90] })

const serve = (options: { readonly maxPixels?: number } = {}) => {
  const fetch = serveFetch<object>({
    space,
    layer: () =>
      Layer.mergeAll(
        memoryStores(
          new Map([
            [hashOf(original), original],
            [hashOf(notAnImage), notAnImage],
          ]),
        ),
        transformerSharp({ ...options, concurrency: 2 }),
      ),
  })
  return (hash: string, spelling: string) =>
    fetch(new Request(`http://media.test/_image/${hash}/${spelling}`), {})
}

const metadataOf = async (response: Response) =>
  sharp(new Uint8Array(await response.arrayBuffer())).metadata()

describe('transformerSharp', () => {
  const get = serve()

  it.each([
    ['avif', 'heif'],
    ['webp', 'webp'],
    ['jpeg', 'jpeg'],
  ])('resizes to the width asked and encodes %s', async (format, read) => {
    const response = await get(hashOf(original), `w320.${format}`)
    expect(response.headers.get('content-type')).toBe(`image/${format}`)
    const { width, height, format: encoded } = await metadataOf(response)
    expect([width, height, encoded]).toEqual([320, 160, read])
  })

  it('never enlarges: a width above the original answers with its own', async () => {
    expect((await metadataOf(await get(hashOf(original), 'w1080.webp'))).width).toBe(640)
  })

  it('encodes at the quality the URL names', async () => {
    const low = (await (await get(hashOf(original), 'w640q40.jpeg')).arrayBuffer()).byteLength
    const high = (await (await get(hashOf(original), 'w640q90.jpeg')).arrayBuffer()).byteLength
    expect(low).toBeLessThan(high * 0.7)
  })

  it('answers bytes that are not an image with a 502', async () => {
    expect((await get(hashOf(notAnImage), 'w320.webp')).status).toBe(502)
  })

  it('refuses an original above the pixel limit with a 413, before decoding it', async () => {
    const response = await serve({ maxPixels: 640 * 320 - 1 })(hashOf(original), 'w320.webp')
    expect([response.status, response.headers.get('cache-control')]).toEqual([
      413,
      'public, max-age=31536000, immutable',
    ])
  })
})

describe('limitTransforms', () => {
  /** A transformer that takes a while, and the most transforms ever in flight at once. */
  const counting = Effect.gen(function* () {
    const now = yield* Ref.make(0)
    const most = yield* Ref.make(0)
    const layer = Layer.succeed(Transformer, {
      transform: () =>
        Effect.gen(function* () {
          const running = yield* Ref.updateAndGet(now, count => count + 1)
          yield* Ref.update(most, highest => Math.max(highest, running))
          yield* Effect.sleep('20 millis')
          yield* Ref.update(now, count => count - 1)
          return { bytes: new Uint8Array(), contentType: 'image/webp' }
        }),
    })
    return { layer, most }
  })

  const runFour = (limit: (layer: Layer.Layer<Transformer>) => Layer.Layer<Transformer>) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { layer, most } = yield* counting
        yield* Effect.gen(function* () {
          const transformer = yield* Transformer
          const original = { body: new Blob([]).stream(), size: 0 }
          const variant = { width: 320, format: 'webp' as const, quality: Option.none() }
          yield* Effect.all(
            Array.from({ length: 4 }, () => transformer.transform(original, variant)),
            { concurrency: 'unbounded' },
          )
        }).pipe(Effect.provide(limit(layer)))
        return yield* Ref.get(most)
      }),
    )

  it('holds transforms in flight to its count', async () => {
    expect(await runFour(limitTransforms(2))).toBe(2)
  })

  it('runs them all at once without it', async () => {
    expect(await runFour(layer => layer)).toBe(4)
  })
})

describe('inspectorSharp and describe', () => {
  const describeWith = (bytes: Uint8Array<ArrayBuffer>, maxPixels?: number) =>
    Effect.runPromise(
      Effect.exit(
        describeOriginal('photo.png', bytes).pipe(
          Effect.provide(inspectorSharp(maxPixels === undefined ? {} : { maxPixels })),
        ),
      ),
    )

  it('reads an opaque photograph’s size, hash and ThumbHash', async () => {
    const exit = await describeWith(original)
    const asset = Exit.isSuccess(exit) ? exit.value : expect.unreachable()
    expect([asset.key, asset.width, asset.height, asset.alpha]).toEqual([
      'photo.png',
      640,
      320,
      false,
    ])
    expect(asset.hash).toEqual(Option.some(hashOf(original)))
    expect(Option.map(asset.placeholder, placeholder => placeholder._tag)).toEqual(
      Option.some('ThumbHash'),
    )
  })

  it.each([
    ['transparent', 0.5, true],
    ['opaque, though it has an alpha channel', 1, false],
  ])('reads a PNG that is %s', async (_, alpha, transparent) => {
    const png = new Uint8Array(
      await sharp({
        create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 128, b: 128, alpha } },
      })
        .png()
        .toBuffer(),
    )
    const exit = await describeWith(png)
    expect(Exit.isSuccess(exit) && exit.value.alpha).toBe(transparent)
  })

  it('refuses an original above the pixel limit, and bytes that are not an image', async () => {
    const tooLarge = await describeWith(original, 1000)
    const garbage = await describeWith(notAnImage)
    expect(
      [tooLarge, garbage].map(exit =>
        Exit.isFailure(exit)
          ? Option.map(Exit.findErrorOption(exit), error => error._tag)
          : Option.none(),
      ),
    ).toEqual([Option.some('OriginalTooLarge'), Option.some('TransformFailed')])
  })
})
