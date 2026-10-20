import { Effect, Layer, Option, Schema } from 'effect'
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { afterAll, describe, expect, it } from 'vitest'
import { ImageAsset, Layout, Picture, Provider, Variant, Widths } from 'foldkit-media'
import { makeApi } from 'foldkit-media/server'

const HASH = 'a'.repeat(64)

const assetWith = (hash: string | null): ImageAsset =>
  Schema.decodeUnknownSync(ImageAsset)({
    key: 'hero.jpg',
    width: 3000,
    height: 2000,
    alpha: false,
    hash,
    placeholder: null,
  })

const asset = assetWith(HASH)

describe('Variant.schema', () => {
  const variant = Variant.schema(Widths.standard)

  it.each([
    ['w640.avif', { width: 640, format: 'avif', quality: Option.none() }],
    ['w1080q75.webp', { width: 1080, format: 'webp', quality: Option.some(75) }],
    ['w320q100.jpeg', { width: 320, format: 'jpeg', quality: Option.some(100) }],
  ])('reads %s, and spells it back the same', (spelling, decoded) => {
    expect(Schema.decodeUnknownSync(variant)(spelling)).toEqual(decoded)
    expect(Schema.encodeSync(variant)(Schema.decodeUnknownSync(variant)(spelling))).toBe(spelling)
  })

  it.each([
    ['a width off the ladder', 'w300.avif'],
    ['a leading zero', 'w0640.avif'],
    ['a format it does not make', 'w640.gif'],
    ['a quality of zero', 'w640q0.avif'],
    ['a quality above 100', 'w640q101.avif'],
    ['a quality with a leading zero', 'w640q075.avif'],
  ])('refuses %s', (_, spelling) => {
    expect(() => Schema.decodeUnknownSync(variant)(spelling)).toThrow()
  })
})

describe('Provider.hosted', () => {
  it.each([
    ['a variant under the page’s origin', {}, `/_image/w640.avif/${HASH}`],
    [
      'a variant under a named origin, with quality',
      { baseUrl: 'https://img.example.com', quality: 75 },
      `https://img.example.com/_image/w640q75.avif/${HASH}`,
    ],
  ])('writes %s', (_, options, expected) => {
    expect(Provider.hosted(options).url(asset, { width: 640, encoding: 'avif' })).toEqual(
      Option.some(expected),
    )
  })

  it.each([
    ['an asset never hashed', assetWith(null), 640, 'avif'],
    ['a width off its ladder', asset, 300, 'avif'],
    ['`auto`, which it never reads', asset, 640, 'auto'],
  ] as const)('has no URL for %s', (_, image, width, encoding) => {
    expect(Provider.hosted().url(image, { width, encoding })).toEqual(Option.none())
  })

  it.each([
    ['an origin with a path', { baseUrl: 'https://img.example.com/x' }],
    ['an origin with a trailing slash', { baseUrl: 'https://img.example.com/' }],
    ['a quality of 0', { quality: 0 }],
  ])('refuses %s', (_, options) => {
    expect(() => Provider.hosted(options)).toThrow(/Provider\.hosted/)
  })
})

describe('the server reads what the provider writes', () => {
  const widths = Widths.make([320, 640, 1280])
  const Api = makeApi(widths)
  // Echo the decoded request, so the test sees what the router decoded.
  const Echo = HttpApiBuilder.group(Api, 'images', handlers =>
    handlers.handle('variant', ({ params }) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe({
          width: params.variant.width,
          format: params.variant.format,
          quality: Option.getOrNull(params.variant.quality),
          hash: params.hash,
        }),
      ),
    ),
  )
  const { handler, dispose } = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(Layer.provide(Echo), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  )
  afterAll(() => dispose())

  const fetchPath = (path: string) => handler(new Request(`http://media.test${path}`))

  it('answers every URL a picture writes with the request it was written from', async () => {
    const provider = Provider.hosted({ widths, sources: ['avif'], fallback: 'webp', quality: 80 })
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
      const [, , spelling] = url.split('/')
      const { width, format, quality } = Schema.decodeUnknownSync(Variant.schema(widths))(spelling)
      expect(await response.json()).toEqual({
        width,
        format,
        quality: Option.getOrNull(quality),
        hash: HASH,
      })
    }
  })

  it.each([
    ['a width off the ladder', `/_image/w1080.avif/${HASH}`],
    ['a leading zero', `/_image/w0640.avif/${HASH}`],
    ['a hash that is not one', '/_image/w640.avif/not-a-hash'],
    ['an uppercase hash', `/_image/w640.avif/${HASH.toUpperCase()}`],
  ])('refuses %s with a 400', async (_, path) => {
    expect((await fetchPath(path)).status).toBe(400)
  })
})
