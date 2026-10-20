// @vitest-environment node
/**
 * The media server behind its HTTP route, over memory stores and a fake
 * transformer that refuses what a real one refuses (bytes that are not an
 * image): a variant is made once and kept, a failure is its own response and
 * is never kept, and the original is never sent in a variant's place.
 */
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { Variant, Widths } from 'foldkit-media'
import {
  Originals,
  QuotaExhausted,
  Transformer,
  TransformFailed,
  originalsMemory,
  serveFetch,
  variantsMemory,
  type Options,
} from 'foldkit-media/server'

const IMAGE = 'a'.repeat(64)
const NOT_AN_IMAGE = 'b'.repeat(64)
const HUGE = 'c'.repeat(64)
const SPENT = 'd'.repeat(64)
const MISSING = 'e'.repeat(64)

const bytes = (text: string) => new TextEncoder().encode(text)

const originals = new Map([
  [IMAGE, bytes('IMAGE:1000')],
  [NOT_AN_IMAGE, bytes('plain text')],
  [HUGE, bytes(`IMAGE:1000${'.'.repeat(100)}`)],
  [SPENT, bytes('IMAGE:QUOTA')],
])

let transforms: Array<string> = []
afterEach(() => {
  transforms = []
})

/** Reads `IMAGE:<width>`; answers with the width it made, never above the original's. */
const fakeTransformer = Layer.succeed(Transformer, {
  transform: (original, variant) =>
    Effect.gen(function* () {
      const text = yield* Effect.promise(() => new Response(original.body).text())
      transforms.push(`${variant.width}.${variant.format}`)
      if (text === 'IMAGE:QUOTA') return yield* new QuotaExhausted({})
      const match = /^IMAGE:(\d+)/.exec(text)
      if (match === null) return yield* new TransformFailed({})
      const width = Math.min(variant.width, Number(match[1]))
      return { bytes: bytes(`${width}.${variant.format}`), contentType: `image/${variant.format}` }
    }),
})

const serve = (options: Options = {}) => {
  let built = 0
  const fetch = serveFetch<{ readonly name: string }>({
    space: Variant.space({ widths: Widths.make([320, 640, 1280]) }),
    ...options,
    layer: () => {
      built++
      return Layer.mergeAll(originalsMemory(originals), fakeTransformer, variantsMemory())
    },
  })
  const env = { name: 'one' }
  return {
    get: (path: string) => fetch(new Request(`http://media.test${path}`), env),
    fetch,
    builds: () => built,
  }
}

describe('serveFetch', () => {
  it('makes a variant, serves it as immutable, and keeps it', async () => {
    const server = serve()
    const first = await server.get(`/_image/${IMAGE}/w640.webp`)
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/webp')
    expect(first.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await first.text()).toBe('640.webp')
    const second = await server.get(`/_image/${IMAGE}/w640.webp`)
    expect(await second.text()).toBe('640.webp')
    expect(transforms).toEqual(['640.webp'])
  })

  it('keeps each variant of one original apart', async () => {
    const server = serve()
    await server.get(`/_image/${IMAGE}/w640.webp`)
    expect(await (await server.get(`/_image/${IMAGE}/w320.webp`)).text()).toBe('320.webp')
    expect(await (await server.get(`/_image/${IMAGE}/w320.avif`)).text()).toBe('320.avif')
  })

  it('answers a width above the original with the original’s width', async () => {
    expect(await (await serve().get(`/_image/${IMAGE}/w1280.avif`)).text()).toBe('1000.avif')
  })

  it.each([
    ['an unknown original', MISSING, 404],
    ['an original that is not an image', NOT_AN_IMAGE, 502],
    ['a spent allowance', SPENT, 503],
  ])('answers %s with its own status, uncached and never the original', async (_, hash, status) => {
    const server = serve()
    for (const _attempt of [1, 2]) {
      const response = await server.get(`/_image/${hash}/w640.webp`)
      expect(response.status).toBe(status)
      expect(response.headers.get('cache-control')).toBeNull()
      expect(await response.text()).not.toContain('IMAGE')
    }
    // Not kept: the second request tried again.
    expect(transforms).toEqual(hash === MISSING ? [] : ['640.webp', '640.webp'])
  })

  it('refuses an original above the byte limit before transforming it', async () => {
    const response = await serve({ maxBytes: 50 }).get(`/_image/${HUGE}/w640.webp`)
    expect(response.status).toBe(413)
    expect(transforms).toEqual([])
  })

  it('refuses a request off the ladder before reading anything', async () => {
    let read = 0
    const counting = Layer.succeed(Originals, {
      get: hash =>
        Effect.suspend(() => {
          read++
          return Effect.die(`unexpected read of ${hash}`)
        }),
    })
    const fetch = serveFetch<object>({
      space: Variant.space({ widths: Widths.make([320, 640]) }),
      layer: () => Layer.mergeAll(counting, fakeTransformer, variantsMemory()),
    })
    const response = await fetch(new Request(`http://media.test/_image/${IMAGE}/w1280.webp`), {})
    expect(response.status).toBe(400)
    expect(read).toBe(0)
  })

  it('builds its services once per environment', async () => {
    const server = serve()
    await server.get(`/_image/${IMAGE}/w640.webp`)
    await server.get(`/_image/${IMAGE}/w320.webp`)
    expect(server.builds()).toBe(1)
    await server.fetch(new Request(`http://media.test/_image/${IMAGE}/w640.webp`), { name: 'two' })
    expect(server.builds()).toBe(2)
  })
})
