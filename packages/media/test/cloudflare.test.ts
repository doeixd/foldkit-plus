// @vitest-environment node
/**
 * The Cloudflare layers behind the server's route, run in Node against
 * miniflare's own R2, Images binding (its offline one, which honours width
 * and format) and Cache API: an original in R2 is resized to the width the
 * URL asks, never above its own, kept in R2 and at the edge, and what the
 * binding refuses is a 502, or a 503 when the allowance is spent.
 */
import { createHash } from 'node:crypto'
import type { Cache, ImagesBinding, R2Bucket } from '@cloudflare/workers-types'
import { Layer } from 'effect'
import { Miniflare, Response as WorkerResponse } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { originalsR2, transformerImages, variantsR2 } from 'foldkit-media/cloudflare'
import { Variant } from 'foldkit-media'
import { serveFetch } from 'foldkit-media/server'

interface Env {
  readonly MEDIA: R2Bucket
  readonly IMAGES: ImagesBinding
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
    expect(kept?.httpMetadata?.contentType).toBe('image/webp')
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
    const response = await get(`/_image/${hash}/w320.png`, { MEDIA: env.MEDIA, IMAGES: refusing })
    expect(response.status).toBe(503)
  })
})
