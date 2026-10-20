// @vitest-environment node
/**
 * The example worker's image route on miniflare, over real HTTP: an original
 * stored in R2 under its SHA-256 is served at the width and format of the
 * URL `Provider.hosted` writes for it, and kept in R2. The layers themselves
 * are tested in `packages/media/test/cloudflare.test.ts`; this proves the
 * worker routes `/_image/` and `/_media/upload` to them with its bindings.
 */
import { createHash } from 'node:crypto'
import type { ImagesBinding } from '@cloudflare/workers-types'
import { Option, Schema } from 'effect'
import { ImageAsset, Provider } from 'foldkit-media'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UPLOAD_TOKEN, startStack, type CloudflareStack } from '../src/stack.js'

let stack: CloudflareStack
let images: ImagesBinding
let asset: ImageAsset

const stream = (bytes: Uint8Array<ArrayBuffer> | string) =>
  new Blob([bytes]).stream() as unknown as Parameters<ImagesBinding['info']>[0]

beforeAll(async () => {
  stack = await startStack()
  images = (await stack.mf.getBindings<{ readonly IMAGES: ImagesBinding }>()).IMAGES
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="teal"/></svg>'
  const result = await images.input(stream(svg)).output({ format: 'image/png' })
  const original = new Uint8Array(await result.response().arrayBuffer())
  const hash = createHash('sha256').update(original).digest('hex')
  await (await stack.mf.getR2Bucket('MEDIA')).put(hash, original)
  asset = Schema.decodeUnknownSync(ImageAsset)({
    key: 'hero.png',
    width: 640,
    height: 320,
    alpha: false,
    hash,
    placeholder: null,
  })
}, 120_000)

afterAll(() => stack.stop(), 120_000)

describe('the image route', () => {
  it('serves the variant the page writes, resized, and keeps it in R2', async () => {
    const path = Option.getOrThrow(Provider.hosted().url(asset, { width: 320, encoding: 'webp' }))
    const response = await fetch(`${stack.origin}${path}`)
    expect(response.status).toBe(200)
    const info = await images.info(stream(new Uint8Array(await response.arrayBuffer())))
    expect(info).toMatchObject({ format: 'image/webp', width: 320 })
    const hash = Option.getOrThrow(asset.hash)
    expect(
      await (await stack.mf.getR2Bucket('MEDIA')).head(`variants/${hash}/w320.webp`),
    ).not.toBeNull()
  })

  it('takes an upload bearing the secret, answers its facts, and serves it', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="250"><rect width="500" height="250" fill="tomato"/></svg>'
    const png = await images.input(stream(svg)).output({ format: 'image/png' })
    const body = new Uint8Array(await png.response().arrayBuffer())
    const upload = (headers: Record<string, string>) =>
      fetch(`${stack.origin}/_media/upload`, {
        method: 'POST',
        body,
        headers: { 'content-type': 'image/png', ...headers },
      })
    // A name proves nothing, and neither does another token.
    for (const refused of [{ 'x-actor': 'editor' }, { authorization: 'Bearer guess' }]) {
      expect((await upload(refused)).status).toBe(403)
    }
    const preflight = await fetch(`${stack.origin}/_media/upload`, { method: 'OPTIONS' })
    expect(preflight.headers.get('access-control-allow-origin')).toBe(null)

    const response = await upload({ authorization: `Bearer ${UPLOAD_TOKEN}` })
    expect(response.status).toBe(201)
    const uploaded = Schema.decodeUnknownSync(ImageAsset)(await response.json())
    expect([uploaded.width, uploaded.height]).toEqual([500, 250])
    const path = Option.getOrThrow(
      Provider.hosted().url(uploaded, { width: 320, encoding: 'webp' }),
    )
    const variant = await fetch(`${stack.origin}${path}`)
    expect(variant.status).toBe(200)
    const info = await images.info(stream(new Uint8Array(await variant.arrayBuffer())))
    expect(info).toMatchObject({ format: 'image/webp', width: 320 })
  })

  it('answers an original it does not hold with a 404', async () => {
    expect((await fetch(`${stack.origin}/_image/${'0'.repeat(64)}/w320.webp`)).status).toBe(404)
  })
})
