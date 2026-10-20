// @vitest-environment node
/**
 * The media server behind its HTTP route, over memory stores and a fake
 * transformer that refuses what a real one refuses (bytes that are not an
 * image): a variant is made once and kept, a failure is its own response and
 * is never kept, and the original is never sent in a variant's place.
 */
import { Effect, Layer } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import { afterEach, describe, expect, it } from 'vitest'
import { memoryStores } from './stores.js'
import { Variant, Widths } from 'foldkit-media'
import {
  Originals,
  QuotaExhausted,
  Transformer,
  TransformFailed,
  layer,
  serveFetch,
  variantsKeyValueStore,
  type Options,
} from 'foldkit-media/server'

const IMAGE = 'a'.repeat(64)
const NOT_AN_IMAGE = 'b'.repeat(64)
const HUGE = 'c'.repeat(64)
const SPENT = 'd'.repeat(64)
const MISSING = 'e'.repeat(64)

const bytes = (text: string) => new TextEncoder().encode(text)

const YEAR = 'public, max-age=31536000, immutable'

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
      return Layer.mergeAll(memoryStores(originals), fakeTransformer)
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
  ])(
    'answers %s with its own status, never the original, and tries again',
    async (_, hash, status) => {
      const server = serve()
      for (const _attempt of [1, 2]) {
        const response = await server.get(`/_image/${hash}/w640.webp`)
        expect(response.status).toBe(status)
        expect(await response.text()).not.toContain('IMAGE')
      }
      // Not kept: the second request tried again.
      expect(transforms).toEqual(hash === MISSING ? [] : ['640.webp', '640.webp'])
    },
  )

  // §25.1 of the design, row by row.
  it.each([
    ['a variant', `/_image/${IMAGE}/w640.webp`, {}, 200, YEAR, null, null],
    ['a URL off the ladder', `/_image/${IMAGE}/w1080.webp`, {}, 400, YEAR, null, null],
    ['a URL of no hash', '/_image/not-a-hash/w640.webp', {}, 400, YEAR, null, null],
    [
      'an unknown original',
      `/_image/${MISSING}/w640.webp`,
      {},
      404,
      'no-store',
      'public, max-age=60',
      null,
    ],
    ['an original too large', `/_image/${HUGE}/w640.webp`, { maxBytes: 50 }, 413, YEAR, null, null],
    ['a failed transform', `/_image/${NOT_AN_IMAGE}/w640.webp`, {}, 502, 'no-store', null, null],
    ['a spent allowance', `/_image/${SPENT}/w640.webp`, {}, 503, 'no-store', null, '3600'],
  ])('sends %s its headers', async (_, path, options, status, cache, cdn, retry) => {
    const response = await serve(options).get(path)
    expect(response.status).toBe(status)
    expect(
      ['cache-control', 'cdn-cache-control', 'retry-after'].map(name => response.headers.get(name)),
    ).toEqual([cache, cdn, retry])
    expect(
      Object.fromEntries(
        [
          'x-content-type-options',
          'access-control-allow-origin',
          'cross-origin-resource-policy',
          'timing-allow-origin',
          'vary',
        ].map(name => [name, response.headers.get(name)]),
      ),
    ).toEqual({
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      'timing-allow-origin': '*',
      vary: null,
    })
  })

  it('says where a variant came from', async () => {
    const server = serve()
    const first = await server.get(`/_image/${IMAGE}/w640.webp`)
    const second = await server.get(`/_image/${IMAGE}/w640.webp`)
    expect([first.headers.get('server-timing'), second.headers.get('server-timing')]).toEqual([
      'media;desc="made"',
      'media;desc="store"',
    ])
  })

  it.each([
    ['its own ETag', `"${IMAGE}/w640.webp"`],
    ['its ETag, weakly', `W/"${IMAGE}/w640.webp"`],
    ['its ETag among others', `"other", "${IMAGE}/w640.webp"`],
    ['any', '*'],
  ])(
    'answers a request that already holds %s with a 304, reading nothing',
    async (_, ifNoneMatch) => {
      const server = serve()
      const response = await server.fetch(
        new Request(`http://media.test/_image/${IMAGE}/w640.webp`, {
          headers: { 'if-none-match': ifNoneMatch },
        }),
        { name: 'one' },
      )
      expect(response.status).toBe(304)
      expect(response.headers.get('etag')).toBe(`"${IMAGE}/w640.webp"`)
      expect(transforms).toEqual([])
    },
  )

  it('sends the variant to a request holding another ETag', async () => {
    const response = await serve().fetch(
      new Request(`http://media.test/_image/${IMAGE}/w640.webp`, {
        headers: { 'if-none-match': `"${IMAGE}/w320.webp"` },
      }),
      { name: 'one' },
    )
    expect([response.status, response.headers.get('etag')]).toEqual([200, `"${IMAGE}/w640.webp"`])
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
      layer: () =>
        Layer.mergeAll(
          counting,
          fakeTransformer,
          variantsKeyValueStore().pipe(Layer.provide(KeyValueStore.layerMemory)),
        ),
    })
    const response = await fetch(new Request(`http://media.test/_image/${IMAGE}/w1280.webp`), {})
    expect(response.status).toBe(400)
    expect(read).toBe(0)
  })

  it('reads a kept variant back with the media type its key names', async () => {
    const server = serve()
    await server.get(`/_image/${IMAGE}/w640.avif`)
    const kept = await server.get(`/_image/${IMAGE}/w640.avif`)
    expect([kept.headers.get('server-timing'), kept.headers.get('content-type')]).toEqual([
      'media;desc="store"',
      'image/avif',
    ])
  })

  it('answers when its variant store fails, by making the variant', async () => {
    const failing = KeyValueStore.make({
      get: key =>
        Effect.fail(new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'get', key })),
      getUint8Array: key =>
        Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'getUint8Array', key }),
        ),
      set: key =>
        Effect.fail(new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'set', key })),
      remove: key =>
        Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'remove', key }),
        ),
      clear: Effect.void,
      size: Effect.succeed(0),
    })
    const fetch = serveFetch<object>({
      layer: () =>
        Layer.mergeAll(
          memoryStores(originals),
          fakeTransformer,
          variantsKeyValueStore().pipe(
            Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, failing)),
          ),
        ),
    })
    for (const _attempt of [1, 2]) {
      const response = await fetch(new Request(`http://media.test/_image/${IMAGE}/w640.webp`), {})
      expect([response.status, await response.text()]).toEqual([200, '640.webp'])
    }
    expect(transforms).toEqual(['640.webp', '640.webp'])
  })

  describe('coalescing', () => {
    // A transformer slow enough that three requests overlap.
    const slow = Layer.succeed(Transformer, {
      transform: (_original, variant) =>
        Effect.sleep('30 millis').pipe(
          Effect.andThen(
            Effect.sync(() => {
              transforms.push(`${variant.width}.${variant.format}`)
              return { bytes: bytes('made'), contentType: 'image/webp' }
            }),
          ),
        ),
    })
    const three = (fetch: (request: Request) => Promise<Response>) =>
      Promise.all(
        [1, 2, 3].map(() => fetch(new Request(`http://media.test/_image/${IMAGE}/w640.webp`))),
      )

    it.each([
      ['shares one transform among concurrent misses when asked', true, ['640.webp']],
      ['makes each miss its own when not', false, ['640.webp', '640.webp', '640.webp']],
    ])('%s', async (_, coalesce, expected) => {
      const fetch = serveFetch<object>({
        coalesce,
        layer: () => Layer.mergeAll(memoryStores(originals), slow),
      })
      // One environment, as a Worker hands every request: a router per environment.
      const env = {}
      const answers = await three(request => fetch(request, env))
      expect(answers.map(answer => answer.status)).toEqual([200, 200, 200])
      expect(transforms).toEqual(expected)
    })

    it('is on for a Node server’s layer by default', async () => {
      const { handler, dispose } = HttpRouter.toWebHandler(
        layer().pipe(
          Layer.provide(Layer.mergeAll(memoryStores(originals), slow)),
          Layer.provide(HttpServer.layerServices),
        ),
        { disableLogger: true },
      )
      try {
        await three(request => handler(request))
        expect(transforms).toEqual(['640.webp'])
      } finally {
        await dispose()
      }
    })
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
