// @vitest-environment node
/**
 * The upload route beside the variant server, over one memory store and real
 * sharp: an upload answers its facts and is served as variants at once; the
 * policy is asked before any byte is read; and what is not an image, too
 * large, or not allowed is refused with nothing kept.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ImageAsset } from 'foldkit-media'
import {
  UploadForbidden,
  UploadPolicy,
  layer,
  originalsKeyValueStore,
  serveUploadFetch,
  uploadLayer,
  uploadsKeyValueStore,
  variantsKeyValueStore,
} from 'foldkit-media/server'
import { inspectorSharp, transformerSharp } from 'foldkit-media/sharp'

const MAX_BYTES = 64 * 1024

/** Admits a request bearing `Bearer ok`, and counts every request it is asked about. */
const policy = () => {
  const asked = { count: 0 }
  const service = Layer.succeed(UploadPolicy, {
    admit: request =>
      Effect.suspend(() => {
        asked.count++
        return request.headers['authorization'] === 'Bearer ok'
          ? Effect.void
          : Effect.fail(new UploadForbidden({}))
      }),
  })
  return { asked, service }
}

const server = () => {
  const allowed = policy()
  const kept = new Map<string, Uint8Array>()
  // One memory store under both routes, watched so a test sees what was kept.
  const store = Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.gen(function* () {
      const inner = yield* KeyValueStore.KeyValueStore
      return KeyValueStore.make({
        ...inner,
        get: key => inner.get(key),
        getUint8Array: key => inner.getUint8Array(key),
        set: (key, value) =>
          Effect.suspend(() => {
            if (typeof value !== 'string' && !key.startsWith('variants/')) kept.set(key, value)
            return inner.set(key, value)
          }),
        remove: key => inner.remove(key),
        clear: inner.clear,
        size: inner.size,
      })
    }),
  ).pipe(Layer.provide(KeyValueStore.layerMemory))
  const { handler } = HttpRouter.toWebHandler(
    Layer.mergeAll(uploadLayer({ maxBytes: MAX_BYTES }), layer()).pipe(
      Layer.provide(
        Layer.mergeAll(
          uploadsKeyValueStore(),
          originalsKeyValueStore(),
          variantsKeyValueStore(),
          inspectorSharp(),
          transformerSharp(),
          allowed.service,
        ),
      ),
      Layer.provide(store),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  const upload = (body: BodyInit, headers: Record<string, string> = {}) =>
    handler(
      new Request('http://media.test/_media/upload', {
        method: 'POST',
        body,
        headers: { authorization: 'Bearer ok', 'content-type': 'image/png', ...headers },
        // A stream body needs this in Node's fetch.
        ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
      }),
    )
  return {
    upload,
    get: (path: string) => handler(new Request(`http://media.test${path}`)),
    kept,
    asked: allowed.asked,
  }
}

const png = () =>
  sharp({ create: { width: 400, height: 200, channels: 3, background: '#2a6f97' } })
    .png()
    .toBuffer()

describe('serveUploadFetch', () => {
  it('answers an upload in a Worker, its services from the environment', async () => {
    const fetch = serveUploadFetch<{ readonly name: string }>({
      layer: () =>
        Layer.mergeAll(uploadsKeyValueStore(), inspectorSharp(), policy().service).pipe(
          Layer.provide(KeyValueStore.layerMemory),
        ),
    })
    const response = await fetch(
      new Request('http://media.test/_media/upload', {
        method: 'POST',
        body: new Uint8Array(await png()),
        headers: { authorization: 'Bearer ok', 'content-type': 'image/png' },
      }),
      { name: 'one' },
    )
    expect(response.status).toBe(201)
  }, 60_000)
})

describe('the upload route', () => {
  it('keeps an upload under its hash, answers its facts, and serves it as variants at once', async () => {
    const { upload, get, kept } = server()
    const response = await upload(new Uint8Array(await png()))
    expect([response.status, response.headers.get('cache-control')]).toEqual([201, 'no-store'])
    const asset = Schema.decodeUnknownSync(ImageAsset)(await response.json())
    expect([asset.width, asset.height, asset.alpha]).toEqual([400, 200, false])
    expect(Option.getOrThrow(asset.hash)).toBe(asset.key)
    expect([...kept.keys()]).toEqual([asset.key])

    const variant = await get(`/_image/${asset.key}/w320.webp`)
    expect(variant.status).toBe(200)
    const { width, format } = await sharp(new Uint8Array(await variant.arrayBuffer())).metadata()
    expect([width, format]).toEqual([320, 'webp'])
  }, 60_000)

  it('asks the policy before reading a byte, and keeps nothing it refuses', async () => {
    const { upload, kept, asked } = server()
    let pulled = false
    // No high-water mark: only a read pulls it, never the stream's own filling.
    const body = new ReadableStream<Uint8Array>(
      {
        pull: controller => {
          pulled = true
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const response = await upload(body, { authorization: 'Bearer no' })
    expect([response.status, response.headers.get('cache-control')]).toEqual([403, 'no-store'])
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect([asked.count, pulled, kept.size]).toEqual([1, false, 0])
  })

  it.each([
    ['a body that is not declared an image', 'text/plain', async () => new Uint8Array(await png())],
    [
      'an image type over bytes that are not one',
      'image/png',
      async () => new TextEncoder().encode('not'),
    ],
  ])(
    'refuses %s as unsupported, keeping nothing',
    async (_, type, body) => {
      const { upload, kept } = server()
      const response = await upload(await body(), { 'content-type': type })
      expect([
        response.status,
        response.headers.get('cache-control'),
        await response.json(),
      ]).toEqual([415, 'no-store', { error: 'Unsupported' }])
      expect(kept.size).toBe(0)
    },
    60_000,
  )

  it('answers a body that breaks off with a 400, keeping nothing', async () => {
    const { upload, kept } = server()
    let sent = false
    const broken = new ReadableStream<Uint8Array>({
      pull: controller => {
        if (sent) return controller.error(new Error('the connection closed'))
        sent = true
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const response = await upload(broken)
    expect([response.status, await response.json()]).toEqual([400, { error: 'Malformed' }])
    expect(kept.size).toBe(0)
  })

  it('refuses a body larger than it reads, of a known length or not, keeping nothing', async () => {
    const { upload, kept } = server()
    const large = new Uint8Array(MAX_BYTES + 1)
    expect((await upload(large)).status).toBe(413)
    // No length declared: the body is counted as it arrives.
    let sent = 0
    const streamed = new ReadableStream<Uint8Array>({
      pull: controller => {
        if (sent > MAX_BYTES) return controller.close()
        sent += 16 * 1024
        controller.enqueue(new Uint8Array(16 * 1024))
      },
    })
    expect((await upload(streamed)).status).toBe(413)
    expect(kept.size).toBe(0)
  })
})
