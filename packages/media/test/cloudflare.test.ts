// @vitest-environment node
/**
 * The Cloudflare layers behind the server's route, run in Node against
 * miniflare's own R2, Images binding (its offline one, which honours width
 * and format) and Cache API: an original in R2 is resized to the width the
 * URL asks, never above its own, kept in R2 and at the edge, and what the
 * binding refuses is a 502, or a 503 when the allowance is spent.
 */
import { createHash } from 'node:crypto'
import type { Cache, ImagesBinding, R2Bucket, RateLimit } from '@cloudflare/workers-types'
import { Effect, Exit, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Miniflare, Response as WorkerResponse } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  admissionRateLimit,
  inspectorImages,
  keyValueStoreR2,
  originalsR2,
  transformerImages,
  uploadsR2,
  variantsR2,
} from 'foldkit-media/cloudflare'
import { Variant } from 'foldkit-media'
import { Inspector, Originals, Uploads, serveFetch } from 'foldkit-media/server'

interface Env {
  readonly MEDIA: R2Bucket
  readonly IMAGES: ImagesBinding
  readonly LIMITER: RateLimit
}

let mf: Miniflare
let env: Env
let edge: Cache

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch: () => new Response(null) }',
    r2Buckets: ['MEDIA'],
    images: { binding: 'IMAGES' },
    ratelimits: { LIMITER: { namespace_id: '1001', simple: { limit: 2, period: 60 } } },
  })
  env = await mf.getBindings<Env>()
  const caches = await mf.getCaches()
  // In a Worker the global Response is workerd's own; from Node, a response
  // must be miniflare's to cross into its cache. The cache itself is real.
  edge = {
    match: (key: string) => caches.default.match(key),
    put: async (key: string, response: Response) =>
      caches.default.put(
        key,
        new WorkerResponse(await response.arrayBuffer(), {
          headers: Object.fromEntries(response.headers),
        }),
      ),
  } as unknown as Cache
}, 60_000)

afterAll(() => mf.dispose())

const stream = (bytes: Uint8Array<ArrayBuffer> | string) =>
  new Blob([bytes]).stream() as unknown as Parameters<ImagesBinding['info']>[0]

/** A `width`×`height` PNG, drawn by the binding from an SVG. */
const png = async (width: number, height: number) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="teal"/></svg>`
  const result = await env.IMAGES.input(stream(svg)).output({ format: 'image/png' })
  return new Uint8Array(await result.response().arrayBuffer())
}

/** Stores an original under its hash, as an upload would. */
const store = async (bytes: Uint8Array<ArrayBuffer>) => {
  const hash = createHash('sha256').update(bytes).digest('hex')
  await env.MEDIA.put(hash, bytes)
  return hash
}

// PNG beside the standard formats: a PNG's width is in its header.
const server = serveFetch<Env>({
  space: Variant.space({ formats: ['avif', 'webp', 'png'] }),
  layer: bindings =>
    Layer.mergeAll(
      originalsR2(bindings.MEDIA),
      transformerImages(bindings.IMAGES),
      variantsR2(bindings.MEDIA, { cache: edge }),
    ),
})
const get = (path: string, bindings: Env = env) =>
  server(new Request(`https://media.test${path}`), bindings)
const infoOf = async (response: Response) =>
  env.IMAGES.info(stream(new Uint8Array(await response.arrayBuffer())))

describe('the Cloudflare layers', () => {
  it('resize an original in R2 to the width and format the URL names, and keep it', async () => {
    const hash = await store(await png(640, 320))
    const response = await get(`/_image/${hash}/w320.webp`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(await infoOf(response)).toMatchObject({ format: 'image/webp', width: 320, height: 160 })
    const kept = await env.MEDIA.head(`variants/${hash}/w320.webp`)
    // Kept by its key alone: the key's extension names the media type.
    expect(kept).not.toBeNull()
  })

  it('never enlarge: a width above the original answers with the original’s', async () => {
    const hash = await store(await png(400, 200))
    expect(await infoOf(await get(`/_image/${hash}/w1080.png`))).toMatchObject({ width: 400 })
  })

  it('serve from the edge cache what R2 has lost', async () => {
    const hash = await store(await png(500, 100))
    expect((await get(`/_image/${hash}/w320.png`)).status).toBe(200)
    await env.MEDIA.delete([hash, `variants/${hash}/w320.png`])
    const again = await get(`/_image/${hash}/w320.png`)
    expect(again.status).toBe(200)
    expect(again.headers.get('server-timing')).toBe('media;desc="edge"')
    expect(await infoOf(again)).toMatchObject({ width: 320 })
  })

  it('answer an original R2 does not hold with a 404', async () => {
    expect((await get(`/_image/${'0'.repeat(64)}/w320.png`)).status).toBe(404)
  })

  it('answer an original the binding cannot read with a 502, keeping nothing', async () => {
    const hash = await store(new TextEncoder().encode('not an image'))
    expect((await get(`/_image/${hash}/w320.png`)).status).toBe(502)
    expect(await env.MEDIA.head(`variants/${hash}/w320.png`)).toBeNull()
  })

  it('answer a spent allowance with a 503', async () => {
    const hash = await store(await png(100, 100))
    // The binding's own error for it, which the offline one never raises.
    const spent = Object.assign(new Error('Exceeded transformation allowance'), { code: 9422 })
    const refusing: ImagesBinding = {
      ...env.IMAGES,
      input: () =>
        ({
          transform: () => ({ output: () => Promise.reject(spent) }),
        }) as unknown as ReturnType<ImagesBinding['input']>,
    }
    const response = await get(`/_image/${hash}/w320.png`, { ...env, IMAGES: refusing })
    expect(response.status).toBe(503)
  })
})

describe('admissionRateLimit', () => {
  it('refuses a client past the binding’s limit, after the period it is told', async () => {
    const limited = serveFetch<Env>({
      space: Variant.space({ formats: ['avif', 'webp', 'png'] }),
      layer: bindings =>
        Layer.mergeAll(
          originalsR2(bindings.MEDIA),
          transformerImages(bindings.IMAGES),
          variantsR2(bindings.MEDIA),
          admissionRateLimit(bindings.LIMITER, { retryAfterSeconds: 60 }),
        ),
    })
    const hash = await store(await png(300, 100))
    const statuses: Array<number> = []
    for (const width of [320, 480, 640]) {
      const response = await limited(
        new Request(`https://media.test/_image/${hash}/w${width}.webp`, {
          headers: { 'cf-connecting-ip': 'limited-client' },
        }),
        env,
      )
      statuses.push(response.status)
      if (response.status === 429) expect(response.headers.get('retry-after')).toBe('60')
    }
    expect(statuses).toEqual([200, 200, 429])
  })
})

describe('uploadsR2', () => {
  it('keeps an upload where originalsR2 reads it', async () => {
    const hash = 'f'.repeat(64)
    const read = await Effect.runPromise(
      Effect.gen(function* () {
        yield* Uploads.use(uploads => uploads.put(hash, new Uint8Array([7, 8, 9])))
        const original = yield* Originals.use(originals => originals.get(hash))
        return Array.from(
          new Uint8Array(yield* Effect.promise(() => new Response(original.body).arrayBuffer())),
        )
      }).pipe(Effect.provide(Layer.mergeAll(uploadsR2(env.MEDIA), originalsR2(env.MEDIA)))),
    )
    expect(read).toEqual([7, 8, 9])
  })
})

describe('keyValueStoreR2', () => {
  it('keeps text and bytes, and counts and clears past one page of listing', async () => {
    const run = <A>(effect: Effect.Effect<A, unknown, KeyValueStore.KeyValueStore>) =>
      Effect.runPromise(effect.pipe(Effect.provide(keyValueStoreR2(env.MEDIA))))
    await run(
      Effect.gen(function* () {
        const store = yield* KeyValueStore.KeyValueStore
        yield* store.clear
        yield* store.set('text', 'hello')
        yield* store.set('bytes', new Uint8Array([1, 2, 3]))
        // More than R2's 1,000 keys a listing or a delete.
        for (let index = 0; index < 1003; index++) yield* store.set(`many/${index}`, 'x')
      }),
    )
    const read = await run(
      Effect.gen(function* () {
        const store = yield* KeyValueStore.KeyValueStore
        return {
          text: yield* store.get('text'),
          bytes: Array.from((yield* store.getUint8Array('bytes')) ?? []),
          missing: yield* store.get('missing'),
          size: yield* store.size,
        }
      }),
    )
    expect(read).toEqual({ text: 'hello', bytes: [1, 2, 3], missing: undefined, size: 1005 })
    expect(
      await run(
        Effect.gen(function* () {
          const store = yield* KeyValueStore.KeyValueStore
          yield* store.clear
          return yield* store.size
        }),
      ),
    ).toBe(0)
  }, 120_000)
})

describe('inspectorImages', () => {
  const inspect = (bytes: Uint8Array<ArrayBuffer>) =>
    Effect.runPromise(
      Effect.exit(
        Inspector.use(inspector => inspector.inspect(bytes)).pipe(
          Effect.provide(inspectorImages(env.IMAGES)),
        ),
      ),
    )
  const encoded = async (format: 'image/png' | 'image/jpeg') => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120" fill="teal"/></svg>'
    const result = await env.IMAGES.input(stream(svg)).output({ format })
    return new Uint8Array(await result.response().arrayBuffer())
  }

  it.each([
    ['a PNG, taken to be transparent', 'image/png', true],
    ['a JPEG, which cannot be', 'image/jpeg', false],
  ] as const)('reads the size of %s, with no thumbnail', async (_, format, alpha) => {
    const exit = await inspect(await encoded(format))
    expect(Exit.isSuccess(exit) ? exit.value : undefined).toEqual({
      width: 300,
      height: 120,
      alpha,
      thumbnail: Option.none(),
    })
  })

  it('refuses an SVG, which has no size in pixels', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    )
    expect(Exit.isFailure(await inspect(svg))).toBe(true)
  })
})
