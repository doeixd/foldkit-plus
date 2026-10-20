/**
 * Images on a host that resizes them itself: the candidates are that host's
 * own URLs, by unpic, and the provider never writes a URL it cannot keep (a
 * format the host ignores, an image on another host).
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ImageAsset, Layout, Picture, Widths } from 'foldkit-media'
import { detect } from 'foldkit-media/unpic'

const shopify = 'https://cdn.shopify.com/s/files/1/0/products/shirt.jpg?v=1'
const cloudinary = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'

const assetAt = (key: string) =>
  Schema.decodeUnknownSync(ImageAsset)({
    key,
    width: 1200,
    height: 800,
    alpha: false,
    hash: null,
    placeholder: null,
  })

const pictureOf = (key: string, provider: ReturnType<typeof detect>) =>
  Option.getOrThrow(
    Picture.derive({
      asset: assetAt(key),
      provider: Option.getOrThrow(provider),
      layout: Layout.Fixed({ width: 320 }),
    }),
  )

describe('detect', () => {
  it('knows no provider for a host unpic does not', () => {
    expect(Option.isNone(detect('https://example.com/a.jpg'))).toBe(true)
  })

  it('writes the host’s own URL for each candidate, its format left to the host', () => {
    const picture = pictureOf(shopify, detect(shopify, { widths: Widths.make([320, 640]) }))
    expect(picture.sources).toEqual([])
    expect(picture.img.srcset).toBe(`${shopify}&width=320 320w, ${shopify}&width=640 640w`) // A host that takes formats is asked for none either, unless the page asks.
    expect(pictureOf(cloudinary, detect(cloudinary)).sources).toEqual([])
  })

  it('offers a format as a source only where the host takes one', () => {
    const options = { widths: Widths.make([320, 640]), sources: ['avif'] as const, quality: 60 }
    expect(pictureOf(shopify, detect(shopify, options)).sources).toEqual([])
    const [source] = pictureOf(cloudinary, detect(cloudinary, options)).sources
    expect(source?.type).toBe('image/avif')
    expect(source?.srcset).toContain('f_avif')
    expect(source?.srcset).toContain('q_60')
  })

  it('writes nothing for an image on another host', () => {
    const provider = Option.getOrThrow(detect(shopify))
    expect(Option.isNone(provider.url(assetAt(cloudinary), { width: 320, encoding: 'auto' }))).toBe(
      true,
    )
  })
})
