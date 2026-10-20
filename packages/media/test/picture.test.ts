import { Option, Schema } from 'effect'
import { rgbaToThumbHash } from 'thumbhash'
import { describe, expect, it } from 'vitest'
import { ImageAsset, Layout, Picture, Provider, Variant } from 'foldkit-media'

const asset = Schema.decodeUnknownSync(ImageAsset)({
  key: 'hero.jpg',
  width: 1000,
  height: 500,
  alpha: false,
  hash: null,
  placeholder: null,
})

const file = (width: number, format: 'avif' | 'webp') => ({
  width,
  format,
  url: `/hero-${width}.${format}`,
})

const provider = Provider.fromFiles(
  [
    file(100, 'webp'),
    file(200, 'webp'),
    file(400, 'webp'),
    file(800, 'webp'),
    file(200, 'avif'),
    file(400, 'avif'),
  ],
  { sources: ['avif'], fallback: 'webp' },
)

const derive = (input: Partial<Picture.Input>) =>
  Option.getOrThrow(
    Picture.derive({ asset, provider, layout: Layout.Constrained({ width: 300 }), ...input }),
  )

describe('Picture.derive', () => {
  it('writes each format the provider offers, leaving out the variants it lacks', () => {
    const picture = derive({})
    expect(picture.sources).toEqual([
      { type: 'image/avif', srcset: '/hero-200.avif 200w, /hero-400.avif 400w' },
    ])
    expect(picture.img.srcset).toBe(
      '/hero-100.webp 100w, /hero-200.webp 200w, /hero-400.webp 400w, /hero-800.webp 800w',
    )
  })

  it('reserves the box at the drawn size, in the original’s ratio', () => {
    const { img, ratio } = derive({})
    expect([img.width, img.height, ratio]).toEqual([300, 150, '1000 / 500'])
  })

  it.each([
    ['a constrained image', Layout.Constrained({ width: 300 }), '/hero-400.webp'],
    ['a full-width image', Layout.FullWidth(), '/hero-800.webp'],
  ])('gives %s the first width that covers it as its src', (_, layout, src) => {
    expect(derive({ layout }).img.src).toBe(src)
  })

  it('loads a lazy image late, and lets the browser use its laid-out width', () => {
    const { img } = derive({})
    expect([img.loading, img.decoding, img.fetchPriority]).toEqual([
      'lazy',
      Option.some('async'),
      Option.none(),
    ])
    expect(img.sizes).toBe('auto, (min-width: 300px) 300px, 100vw')
  })

  it('fetches a priority image first, with the sizes it was given', () => {
    const { img } = derive({ priority: true, sizes: '50vw' })
    expect([img.loading, img.decoding, img.fetchPriority, img.sizes]).toEqual([
      'eager',
      Option.none(),
      Option.some('high'),
      '50vw',
    ])
  })

  it('does not repeat an `auto` the page already wrote', () => {
    expect(derive({ sizes: 'auto, 50vw' }).img.sizes).toBe('auto, 50vw')
  })

  it('has nothing to draw when the provider has no variant in the img’s own encoding', () => {
    const avifOnly = Provider.fromFiles([file(200, 'avif')], { sources: [], fallback: 'webp' })
    expect(Picture.derive({ asset, provider: avifOnly, layout: Layout.FullWidth() })).toEqual(
      Option.none(),
    )
  })
})

describe('Picture.derive placeholder', () => {
  const withPlaceholder = (placeholder: unknown, alpha = false) =>
    Schema.decodeUnknownSync(ImageAsset)({
      key: 'hero.jpg',
      width: 1000,
      height: 500,
      alpha,
      hash: null,
      placeholder,
    })

  const placeholderOf = (
    placeholder: unknown,
    options: { alpha?: boolean; provider?: Provider.Provider } = {},
  ) =>
    Option.flatMap(
      Picture.derive({
        asset: withPlaceholder(placeholder, options.alpha),
        provider: options.provider ?? provider,
        layout: Layout.FullWidth(),
      }),
      picture => picture.placeholder,
    )

  it.each([
    ['a color as itself', { _tag: 'Color', value: '#123456' }, '#123456'],
    ['the provider’s smallest width as a url', { _tag: 'LowRes' }, 'url("/hero-100.webp")'],
  ])('paints %s', (_, placeholder, expected) => {
    expect(placeholderOf(placeholder)).toEqual(Option.some(expected))
  })

  const thumbHash = { _tag: 'ThumbHash', hash: 'XQgOFITodogFp3lnVHgPYPW7Gg==' }

  it('paints a ThumbHash’s average color for an image that is not the priority', () => {
    // A ThumbHash of a solid teal picture: its average is that teal.
    const pixels = new Uint8Array(8 * 8 * 4).map((_, index) => [0, 128, 128, 255][index % 4]!)
    const hash = btoa(String.fromCharCode(...rgbaToThumbHash(8, 8, pixels)))
    const painted = Option.getOrThrow(placeholderOf({ _tag: 'ThumbHash', hash }))
    const [r, g, b, a] = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/
      .exec(painted)!
      .slice(1)
      .map(Number)
    // Within a few steps of 0, 128, 128: ThumbHash quantizes.
    expect([r, g, b].map(channel => Math.round(channel! / 8))).toEqual([0, 16, 16])
    expect(a).toBe(1)
  })

  it.each([
    ['for the priority image', { priority: true }],
    ['when asked to', { placeholder: 'detail' as const }],
  ])('paints a ThumbHash as a PNG drawn from it %s', (_, options) => {
    const painted = Option.getOrThrow(
      Option.flatMap(
        Picture.derive({
          asset: withPlaceholder(thumbHash),
          provider,
          layout: Layout.FullWidth(),
          ...options,
        }),
        picture => picture.placeholder,
      ),
    )
    expect(painted.startsWith('url("data:image/png;base64,')).toBe(true)
  })

  it('escapes what would end the url', () => {
    const quoted = Provider.fromFiles(
      [{ width: 100, format: 'webp', url: String.raw`/a"b\c.webp` }],
      { sources: [], fallback: 'webp' },
    )
    expect(placeholderOf({ _tag: 'LowRes' }, { provider: quoted })).toEqual(
      Option.some('url("/a%22b%5Cc.webp")'),
    )
  })

  it('paints nothing behind a transparent image', () => {
    expect(placeholderOf({ _tag: 'Color', value: '#123456' }, { alpha: true })).toEqual(
      Option.none(),
    )
  })

  it('paints nothing for an image without one', () => {
    expect(placeholderOf(null)).toEqual(Option.none())
  })
})

describe('Picture.preload', () => {
  it('preloads the first source’s candidates, typed, at the img’s sizes', () => {
    expect(Picture.preload(derive({ priority: true }))).toBe(
      '<link rel="preload" as="image" type="image/avif" imagesrcset="/hero-200.avif 200w, /hero-400.avif 400w" imagesizes="(min-width: 300px) 300px, 100vw" fetchpriority="high">',
    )
  })

  it('preloads the img’s candidates when there is no source', () => {
    const webpOnly = Provider.fromFiles([file(400, 'webp')], { sources: [], fallback: 'webp' })
    const picture = Option.getOrThrow(
      Picture.derive({
        asset,
        provider: webpOnly,
        layout: Layout.Fixed({ width: 400 }),
        priority: true,
      }),
    )
    expect(Picture.preload(picture)).toBe(
      '<link rel="preload" as="image" imagesrcset="/hero-400.webp 400w" imagesizes="400px" fetchpriority="high">',
    )
  })

  it('escapes what would end an attribute', () => {
    const quoted = Provider.fromFiles([{ width: 400, format: 'webp', url: '/a"<b>&c.webp' }], {
      sources: [],
      fallback: 'webp',
    })
    const picture = Option.getOrThrow(
      Picture.derive({
        asset,
        provider: quoted,
        layout: Layout.Fixed({ width: 400 }),
        priority: true,
      }),
    )
    expect(Picture.preload(picture)).toContain('imagesrcset="/a&quot;&lt;b&gt;&amp;c.webp 400w"')
  })
})

describe('Picture.ogImage', () => {
  const big = Schema.decodeUnknownSync(ImageAsset)({
    key: 'photos/hero.jpg',
    width: 3000,
    height: 1500,
    alpha: false,
    hash: 'a'.repeat(64),
    placeholder: null,
  })

  it.each([
    [
      'leaves the format to a provider that picks it',
      Provider.cdnCgi(),
      'https://site.test/cdn-cgi/image/width=1280,format=auto,fit=scale-down/photos/hero.jpg',
    ],
    [
      'falls back to WebP where its server makes no JPEG',
      Provider.hosted(),
      `https://site.test/_image/${'a'.repeat(64)}/w1280.webp`,
    ],
    [
      'takes JPEG where its server makes it',
      Provider.hosted({ space: Variant.space({ formats: ['avif', 'jpeg', 'webp'] }) }),
      `https://site.test/_image/${'a'.repeat(64)}/w1280.jpeg`,
    ],
  ])('%s, as an absolute URL at least 1200 wide', (_, ogProvider, expected) => {
    expect(Picture.ogImage(big, ogProvider, 'https://site.test')).toEqual(Option.some(expected))
  })

  it('has none from a provider with only AVIF', () => {
    const avifOnly = Provider.fromFiles([{ width: 1280, format: 'avif', url: '/a.avif' }], {
      sources: [],
      fallback: 'avif',
    })
    expect(Picture.ogImage(big, avifOnly, 'https://site.test')).toEqual(Option.none())
  })
})
