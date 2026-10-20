import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ImageAsset, Provider } from 'foldkit-media'

const decodeAsset = Schema.decodeUnknownSync(ImageAsset)

/** An asset as it is stored, before decoding. */
const stored = (facts: Record<string, unknown> = {}) => ({
  key: 'a.jpg',
  width: 2000,
  height: 1000,
  alpha: false,
  hash: null,
  placeholder: null,
  ...facts,
})

const assetAt = (key: string): ImageAsset => decodeAsset(stored({ key }))

describe('ImageAsset', () => {
  it('reads absent facts as none', () => {
    const asset = assetAt('a.jpg')
    expect(Option.isNone(asset.hash)).toBe(true)
    expect(Option.isNone(asset.placeholder)).toBe(true)
  })

  it.each([
    ['a hex color', { _tag: 'Color', value: '#1a2b3c' }],
    ['a functional color', { _tag: 'Color', value: 'oklch(70% 0.1 250 / 0.5)' }],
    ['a ThumbHash', { _tag: 'ThumbHash', hash: '1QcSHQRnh493V4dIh4eXh1h4kJUI' }],
    ['a low-res stand-in', { _tag: 'LowRes' }],
  ])('accepts %s as a placeholder', (_, placeholder) => {
    expect(() => decodeAsset(stored({ placeholder }))).not.toThrow()
  })

  it.each([
    ['a second declaration', { _tag: 'Color', value: 'rgb(0 0 0); background: url(x)' }],
    ['a url', { _tag: 'Color', value: 'url(https://example.com/x.png)' }],
    ['markup as a ThumbHash', { _tag: 'ThumbHash', hash: '<script>' }],
  ])('refuses %s as a placeholder', (_, placeholder) => {
    expect(() => decodeAsset(stored({ placeholder }))).toThrow()
  })

  it.each([
    ['without a focal point', {}, Option.none()],
    ['with a null one', { focus: null }, Option.none()],
    ['with one', { focus: { x: 0.25, y: 1 } }, Option.some({ x: 0.25, y: 1 })],
  ])('reads an asset %s', (_, facts, focus) => {
    expect(decodeAsset(stored(facts)).focus).toEqual(focus)
  })

  it('refuses a focal point outside the image', () => {
    expect(() => decodeAsset(stored({ focus: { x: 1.5, y: 0 } }))).toThrow()
  })

  it('refuses an image with no pixels', () => {
    expect(() => decodeAsset(stored({ width: 0 }))).toThrow()
  })
})

describe('Provider.fromFiles', () => {
  const provider = Provider.fromFiles(
    [
      { width: 200, format: 'webp', url: '/a-200.webp' },
      { width: 400, format: 'webp', url: '/a-400.webp' },
      { width: 400, format: 'avif', url: '/a-400.avif' },
    ],
    { sources: ['avif'], fallback: 'webp' },
  )

  it('has the widths it was given, and answers only the variants it has', () => {
    expect(provider.widths.values).toEqual([200, 400])
    expect(provider.url(assetAt('a'), { width: 400, encoding: 'avif' })).toEqual(
      Option.some('/a-400.avif'),
    )
    expect(provider.url(assetAt('a'), { width: 200, encoding: 'avif' })).toEqual(Option.none())
  })
})

describe('Provider.fromFiles refuses', () => {
  it.each([
    ['no files', []],
    [
      'two files for one variant',
      [
        { width: 200, format: 'webp', url: '/a.webp' },
        { width: 200, format: 'webp', url: '/b.webp' },
      ],
    ],
  ] as const)('%s', (_, files) => {
    expect(() => Provider.fromFiles(files, { sources: [], fallback: 'webp' })).toThrow(
      /Provider\.fromFiles/,
    )
  })
})

describe('Provider.cdnCgi', () => {
  const url = (provider: Provider.Provider, key: string) =>
    provider.url(assetAt(key), { width: 640, encoding: 'auto' })

  it.each([
    [
      'a path on the page’s zone',
      {},
      '/photos/a.jpg',
      '/cdn-cgi/image/width=640,format=auto,fit=scale-down/photos/a.jpg',
    ],
    [
      'a path on a named zone, with quality',
      { zone: 'media.example.com', quality: 70 },
      'photos/a.jpg',
      'https://media.example.com/cdn-cgi/image/width=640,format=auto,fit=scale-down,quality=70/photos/a.jpg',
    ],
    [
      'an absolute source',
      {},
      'https://cdn.example.com/a.jpg',
      '/cdn-cgi/image/width=640,format=auto,fit=scale-down/https://cdn.example.com/a.jpg',
    ],
    [
      'an absolute source with a query',
      {},
      'https://cdn.example.com/a.jpg?v=2',
      '/cdn-cgi/image/width=640,format=auto,fit=scale-down/https%3A%2F%2Fcdn.example.com%2Fa.jpg%3Fv%3D2',
    ],
  ])('writes %s', (_, options, key, expected) => {
    expect(url(Provider.cdnCgi(options), key)).toEqual(Option.some(expected))
  })

  it.each([
    ['a zone that is not a host', { zone: 'example.com/evil' }],
    ['a quality of 0', { quality: 0 }],
    ['a fractional quality', { quality: 50.5 }],
  ])('refuses %s', (_, options) => {
    expect(() => Provider.cdnCgi(options)).toThrow(/Provider\.cdnCgi/)
  })
})
