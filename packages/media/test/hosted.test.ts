import { Effect, Layer, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { HashedAsset, ImageAsset, Layout, Picture, Provider, Variant, Widths } from 'foldkit-media'
import { Transformer, serveFetch } from 'foldkit-media/server'
import { memoryStores } from './stores.js'

const HASH = 'a'.repeat(64)

const facts = (hash: string | null) => ({
  key: 'hero.jpg',
  width: 3000,
  height: 2000,
  alpha: false,
  hash,
  placeholder: null,
})

const asset = Schema.decodeUnknownSync(HashedAsset)(facts(HASH))

describe('HashedAsset', () => {
  it('decodes facts with a hash, and refuses facts without one', () => {
    expect(Schema.decodeUnknownSync(ImageAsset)(facts(null)).hash).toEqual(Option.none())
    expect(() => Schema.decodeUnknownSync(HashedAsset)(facts(null))).toThrow()
  })

  it('takes no unhashed facts into a hosted picture', () => {
    const unhashed = Schema.decodeUnknownSync(ImageAsset)(facts(null))
    const provider = Provider.hosted()
    // @ts-expect-error: `Provider.hosted` names an original by its hash, which these facts lack.
    Picture.derive({ asset: unhashed, provider, layout: Layout.FullWidth() })
    // @ts-expect-error: the same, for a single URL.
    provider.url(unhashed, { width: 640, encoding: 'avif' })
    // A provider that reads no hash takes the same facts.
    expect(
      Option.isSome(
        Picture.derive({
          asset: unhashed,
          provider: Provider.cdnCgi(),
          layout: Layout.FullWidth(),
        }),
      ),
    ).toBe(true)
  })
})

describe('Variant.space', () => {
  const space = Variant.space({ formats: ['avif', 'webp', 'jpeg'], qualities: [60, 100] })

  it.each([
    ['w640.avif', { width: 640, format: 'avif', quality: Option.none() }],
    ['w1080q60.webp', { width: 1080, format: 'webp', quality: Option.some(60) }],
    ['w320q100.jpeg', { width: 320, format: 'jpeg', quality: Option.some(100) }],
  ])('reads %s, and spells it back the same', (spelling, decoded) => {
    expect(Schema.decodeUnknownSync(space.schema)(spelling)).toEqual(decoded)
    expect(Schema.encodeSync(space.schema)(Schema.decodeUnknownSync(space.schema)(spelling))).toBe(
      spelling,
    )
  })

  it.each([
    ['a width off the ladder', 'w300.avif'],
    ['a leading zero', 'w0640.avif'],
    ['a format no space makes', 'w640.gif'],
    ['a format outside this space', 'w640.png'],
    ['a quality outside this space', 'w640q75.avif'],
    ['a quality with a leading zero', 'w640q060.avif'],
  ])('refuses %s', (_, spelling) => {
    expect(() => Schema.decodeUnknownSync(space.schema)(spelling)).toThrow()
  })

  it('names no quality when it has none', () => {
    expect(() => Schema.decodeUnknownSync(Variant.standard.schema)('w640q60.avif')).toThrow()
    expect(Schema.decodeUnknownSync(Variant.standard.schema)('w640.avif').width).toBe(640)
  })

  it('counts the variants one original can have', () => {
    expect(space.size).toBe(8 * 3 * 3)
    expect(Variant.standard.size).toBe(16)
  })

  it.each([
    ['no formats', { formats: [] }],
    ['a repeated format', { formats: ['avif', 'avif'] }],
    ['a repeated quality', { qualities: [60, 60] }],
    ['a quality of 0', { qualities: [0] }],
    ['a width the spelling cannot name', { widths: Widths.make([100_000]) }],
  ] as const)('refuses %s', (_, options) => {
    expect(() => Variant.space(options)).toThrow(/Variant\.space/)
  })
})

describe('Provider.hosted', () => {
  it.each([
    ['a variant under the page’s origin', {}, `/_image/${HASH}/w640.avif`],
    [
      'a variant under a named origin, with quality',
      {
        baseUrl: 'https://img.example.com',
        space: Variant.space({ qualities: [75] }),
        quality: 75,
      },
      `https://img.example.com/_image/${HASH}/w640q75.avif`,
    ],
  ])('writes %s', (_, options, expected) => {
    expect(Provider.hosted(options).url(asset, { width: 640, encoding: 'avif' })).toEqual(
      Option.some(expected),
    )
  })

  it.each([
    ['a width off its ladder', asset, 300, 'avif'],
    ['`auto`, which it never reads', asset, 640, 'auto'],
  ] as const)('has no URL for %s', (_, image, width, encoding) => {
    expect(Provider.hosted().url(image, { width, encoding })).toEqual(Option.none())
  })

  it.each([
    ['an origin with a path', { baseUrl: 'https://img.example.com/x' }],
    ['an origin with a trailing slash', { baseUrl: 'https://img.example.com/' }],
    ['an origin with an empty query', { baseUrl: 'https://img.example.com?' }],
    ['an origin with an empty fragment', { baseUrl: 'https://img.example.com#' }],
    ['an invalid host', { baseUrl: 'https://not a host' }],
    ['an origin with credentials', { baseUrl: 'https://user:secret@img.example.com' }],
    ['a quality outside its space', { quality: 75 }],
    ['a source outside its space', { sources: ['png'] }],
    ['a fallback outside its space', { fallback: 'jpeg' }],
  ] as const)('refuses %s', (_, options) => {
    expect(() => Provider.hosted(options)).toThrow(/Provider\.hosted/)
  })
})

describe('the server reads what the provider writes', () => {
  const space = Variant.space({ widths: Widths.make([320, 640, 1280]), qualities: [80] })
  // Echo the decoded request, so the test sees what the handler decoded.
  const echo = Layer.succeed(Transformer, {
    transform: (_original, variant) =>
      Effect.succeed({
        bytes: new TextEncoder().encode(
          JSON.stringify({ ...variant, quality: Option.getOrNull(variant.quality) }),
        ),
        contentType: 'application/json',
      }),
  })
  const server = serveFetch<object>({
    images: {
      provider: Provider.hosted({ space }),
      layer: () => Layer.mergeAll(memoryStores(new Map([[HASH, new Uint8Array(1)]])), echo),
    },
  })
  const env = {}
  const fetchPath = (path: string) => server(new Request(`http://media.test${path}`), env)

  it('answers every URL a picture writes with the request it was written from', async () => {
    const provider = Provider.hosted({ space, quality: 80 })
    const picture = Option.getOrThrow(
      Picture.derive({ asset, provider, layout: Layout.FullWidth() }),
    )
    const urls = [picture.img.srcset, ...picture.sources.map(source => source.srcset)]
      .flatMap(srcset => srcset.split(', '))
      .map(entry => entry.split(' ')[0]!)
    expect(urls).toHaveLength(6)
    for (const url of urls) {
      const response = await fetchPath(url)
      expect(response.status).toBe(200)
      const [, , , spelling] = url.split('/')
      const { width, format, quality } = Schema.decodeUnknownSync(space.schema)(spelling)
      expect(await response.json()).toEqual({ width, format, quality: Option.getOrNull(quality) })
    }
  })

  it.each([
    ['a leading zero', `/_image/${HASH}/w0640.avif`],
    ['a hash that is not one', '/_image/not-a-hash/w640.avif'],
    ['an uppercase hash', `/_image/${HASH.toUpperCase()}/w640.avif`],
  ])('refuses %s, which no release could write, with a 400', async (_, path) => {
    expect((await fetchPath(path)).status).toBe(400)
  })

  it.each([
    ['a width off the ladder', `/_image/${HASH}/w1080.avif`],
    ['a quality outside the space', `/_image/${HASH}/w640q75.avif`],
  ])('refuses %s, which another release may offer, with a 404', async (_, path) => {
    expect((await fetchPath(path)).status).toBe(404)
  })
})
