// @vitest-environment node
/**
 * Versions of the variant URL. Every spelling a release has written is read by
 * every later one (the golden list only grows); a change to what variants are
 * is a new revision, so it gets a new URL; and the server answers an earlier
 * revision with what it kept, else a redirect to the current URL, and a later
 * one as a server of the next release would want, briefly.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ImageAsset, Provider, Variant, Widths } from 'foldkit-media'
import { Transformer, TransformFailed, serveFetch } from 'foldkit-media/server'
import { memoryStores } from './stores.js'

const HASH = 'a'.repeat(64)
const YEAR = 'public, max-age=31536000, immutable'

/** Every spelling a release has written, and the space that reads it. Add to it; never remove. */
const golden: ReadonlyArray<readonly [spelling: string, space: Variant.Space]> = [
  ['w640.avif', Variant.standard],
  ['w320.webp', Variant.standard],
  ['w640q75.webp', Variant.space({ qualities: [75] })],
  ['w640.r1.avif', Variant.space({ revision: 1 })],
  ['w640q75.r2.webp', Variant.space({ qualities: [75], revision: 2 })],
]

describe('the variant spellings every release reads', () => {
  it.each(golden)('reads %s, and writes it back as it was', (spelling, space) => {
    const decoded = Schema.decodeUnknownSync(space.schema)(spelling)
    expect(Schema.encodeSync(space.schema)(decoded)).toBe(spelling)
  })

  it('writes no revision at 0, so a URL written before revisions keeps its spelling', () => {
    expect(Variant.respell('w640.r3.avif', 0)).toBe('w640.avif')
    expect(Variant.respell('w640q75.webp', 2)).toBe('w640q75.r2.webp')
    expect([Variant.revisionOf('w640.avif'), Variant.revisionOf('w640.r12.avif')]).toEqual([0, 12])
  })

  it('reads a space’s own revision and no other', () => {
    const second = Variant.space({ revision: 2 })
    expect(Option.isNone(Schema.decodeUnknownOption(second.schema)('w640.avif'))).toBe(true)
    expect(Option.isNone(Schema.decodeUnknownOption(Variant.standard.schema)('w640.r2.avif'))).toBe(
      true,
    )
  })

  it.each([-1, 1.5, 10_000])('refuses a revision of %s', revision => {
    expect(() => Variant.space({ revision })).toThrow(/revision/)
  })

  it('has the hosted provider write the current revision', () => {
    const asset = Schema.decodeUnknownSync(ImageAsset)({
      key: 'hero.jpg',
      width: 1000,
      height: 500,
      alpha: false,
      hash: HASH,
      placeholder: null,
    })
    const provider = Provider.hosted({ space: Variant.space({ revision: 2 }) })
    expect(Option.getOrThrow(provider.url(asset, { width: 640, encoding: 'avif' }))).toBe(
      `/_image/${HASH}/w640.r2.avif`,
    )
  })
})

const transformer = Layer.succeed(Transformer, {
  transform: (original, variant) =>
    Effect.gen(function* () {
      const text = yield* Effect.promise(() => new Response(original.body).text())
      if (!text.startsWith('IMAGE')) return yield* new TransformFailed({})
      return {
        bytes: new TextEncoder().encode(`made ${variant.width}.${variant.format}`),
        contentType: `image/${variant.format}`,
      }
    }),
})

/** A server at revision 2, its store holding the original and one variant kept from revision 0. */
const serverAtRevision2 = () => {
  const encode = (text: string) => new TextEncoder().encode(text)
  const fetch = serveFetch<object>({
    space: Variant.space({ widths: Widths.make([320, 640]), revision: 2 }),
    layer: () =>
      Layer.mergeAll(
        memoryStores(
          new Map([
            [HASH, encode('IMAGE')],
            [`variants/${HASH}/w320.webp`, encode('kept from revision 0')],
          ]),
        ),
        transformer,
      ),
  })
  return (path: string) => fetch(new Request(`http://media.test${path}`), {})
}

describe('a server of a later revision', () => {
  it('makes its own revision', async () => {
    const response = await serverAtRevision2()(`/_image/${HASH}/w640.r2.avif`)
    expect([response.status, await response.text()]).toEqual([200, 'made 640.avif'])
  })

  it('serves an earlier revision’s variant while it is kept', async () => {
    const response = await serverAtRevision2()(`/_image/${HASH}/w320.webp`)
    expect([response.status, await response.text()]).toEqual([200, 'kept from revision 0'])
  })

  it('sends an earlier revision it no longer keeps to the current URL, for good', async () => {
    const response = await serverAtRevision2()(`/_image/${HASH}/w640.avif`)
    expect([
      response.status,
      response.headers.get('location'),
      response.headers.get('cache-control'),
    ]).toEqual([301, `/_image/${HASH}/w640.r2.avif`, YEAR])
  })

  it.each([
    ['a later revision', `/_image/${HASH}/w640.r3.avif`],
    ['an earlier revision of a width it does not make', `/_image/${HASH}/w1080.avif`],
  ])('answers %s as another release’s, briefly', async (_, path) => {
    const response = await serverAtRevision2()(path)
    expect([response.status, response.headers.get('cache-control')]).toEqual([404, 'no-store'])
  })
})
