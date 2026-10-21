// @vitest-environment node
/**
 * The upload route beside the variant server, over one memory store and real
 * sharp: an upload answers its facts and is served as variants at once; the
 * policy is asked before any byte is read; and what is not an image, too
 * large, or not allowed is refused with nothing kept.
 */
import { Effect, Exit, Layer, Option, Schema } from 'effect'
import { HttpRouter, HttpServer, HttpServerRequest } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ImageAsset } from 'foldkit-media'
import {
  UploadForbidden,
  UploadPolicy,
  UploadUnauthenticated,
  type UploadRoute,
  layer,
  originalsKeyValueStore,
  serveFetch,
  uploadLayer,
  uploadPolicyBearer,
  uploadsKeyValueStore,
  type UploadOptions,
  variantsKeyValueStore,
} from 'foldkit-media/server'
import { inspectorSharp, transformerSharp } from 'foldkit-media/sharp'

const MAX_BYTES = 64 * 1024

/**
 * Admits `Bearer ok` on either route and `Bearer uploader` on uploads alone; takes `Bearer
 * gone` for a session that ended; and counts every request, keeping the routes it was asked.
 */
const policy = () => {
  const asked = { count: 0, routes: [] as Array<UploadRoute> }
  const service = Layer.succeed(UploadPolicy, {
    admit: (request, route) =>
      Effect.suspend((): Effect.Effect<void, UploadForbidden | UploadUnauthenticated> => {
        asked.count++
        asked.routes.push(route)
        const authorization = request.headers['authorization']
        if (authorization === 'Bearer gone') return Effect.fail(new UploadUnauthenticated({}))
        return authorization === 'Bearer ok' ||
          (authorization === 'Bearer uploader' && route === 'Upload')
          ? Effect.void
          : Effect.fail(new UploadForbidden({}))
      }),
  })
  return { asked, service }
}

const server = (facts: UploadOptions['facts'] = {}) => {
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
    Layer.mergeAll(uploadLayer({ maxBytes: MAX_BYTES, facts }), layer()).pipe(
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
    handle: (request: Request) => handler(request),
    kept,
    asked: allowed.asked,
  }
}

const png = () =>
  sharp({ create: { width: 400, height: 200, channels: 3, background: '#2a6f97' } })
    .png()
    .toBuffer()

describe('serveFetch', () => {
  // One layer value under both sides: a build makes it once, so an upload is where the variants read.
  const images = {
    layer: () =>
      Layer.mergeAll(originalsKeyValueStore(), variantsKeyValueStore(), transformerSharp()).pipe(
        Layer.provide(KeyValueStore.layerMemory),
      ),
  }
  const uploads = {
    layer: () =>
      Layer.mergeAll(uploadsKeyValueStore(), inspectorSharp(), policy().service).pipe(
        Layer.provide(KeyValueStore.layerMemory),
      ),
  }
  const request = (path: string, init: RequestInit = {}) =>
    new Request(`http://media.test${path}`, init)
  const uploadOf = async () =>
    request('/_media/upload', {
      method: 'POST',
      body: new Uint8Array(await png()),
      headers: { authorization: 'Bearer ok', 'content-type': 'image/png' },
    })

  it('answers an upload and then its variants, from one handler', async () => {
    const fetch = serveFetch<object>({ images, uploads })
    const env = {}
    const answer = await fetch(await uploadOf(), env)
    expect(answer.status).toBe(201)
    const { key } = Schema.decodeUnknownSync(ImageAsset)(await answer.json())
    expect((await fetch(request(`/_image/${key}/w320.webp`), env)).status).toBe(200)
  }, 60_000)

  it.each([
    ['another path under its routes', request('/_media/elsewhere')],
    ['a preflight for an upload', request('/_media/upload', { method: 'OPTIONS' })],
  ])('refuses %s with a 404, never passing it on', async (_, refused) => {
    let passed = 0
    const fetch = serveFetch<object>({
      images,
      uploads,
      otherwise: async () => {
        passed++
        return new Response('app')
      },
    })
    expect([(await fetch(refused, {})).status, passed]).toEqual([404, 0])
  })

  it('passes every other path to `otherwise`, and answers it 404 without one', async () => {
    const withApp = serveFetch<object>({ images, otherwise: async () => new Response('app') })
    expect(await (await withApp(request('/todos'), {})).text()).toBe('app')
    expect((await serveFetch<object>({ images })(request('/todos'), {})).status).toBe(404)
  })

  it('answers no upload when given only the images', async () => {
    const fetch = serveFetch<object>({ images })
    expect((await fetch(await uploadOf(), {})).status).toBe(404)
  }, 60_000)

  it('refuses to be made with neither side', () => {
    expect(() => serveFetch<object>({})).toThrow(/serveFetch/)
  })
})

describe('uploadPolicyBearer', () => {
  const admits = (token: string | undefined, headers: Record<string, string>) =>
    Effect.runPromise(
      UploadPolicy.use(policy =>
        policy.admit(
          HttpServerRequest.fromWeb(new Request('http://media.test/', { headers })),
          'Upload',
        ),
      ).pipe(Effect.provide(uploadPolicyBearer(token)), Effect.exit, Effect.map(Exit.isSuccess)),
    )

  it.each([
    ['the secret', 'secret', { authorization: 'Bearer secret' }, true],
    ['another token', 'secret', { authorization: 'Bearer guess' }, false],
    ['the secret without its scheme', 'secret', { authorization: 'secret' }, false],
    ['no header', 'secret', {}, false],
    [
      'the unset secret spelt out, with none set',
      undefined,
      { authorization: 'Bearer undefined' },
      false,
    ],
    ['an empty bearer, with an empty secret', '', { authorization: 'Bearer ' }, false],
  ])('given %s, admits it: %s', async (_, token, headers, admitted) => {
    expect(await admits(token, headers)).toBe(admitted)
  })
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

  it('asks about the upload route, so a policy may admit uploads alone', async () => {
    const { upload, asked } = server()
    const response = await upload(new Uint8Array(await png()), { authorization: 'Bearer uploader' })
    expect([response.status, asked.routes]).toEqual([201, ['Upload']])
  }, 60_000)

  it('answers a session the policy cannot tell 401, reading nothing and kept by no one', async () => {
    const { upload, kept } = server()
    const response = await upload(new Uint8Array(await png()), { authorization: 'Bearer gone' })
    expect([
      response.status,
      response.headers.get('cache-control'),
      await response.json(),
      kept.size,
    ]).toEqual([401, 'no-store', { error: 'Unauthenticated' }, 0])
  }, 60_000)

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

describe('the facts route', () => {
  /** An allowed host serving one PNG, and the URLs it was asked for. */
  const host = async () => {
    const bytes = new Uint8Array(await png())
    const asked: Array<string> = []
    const fetch = async (request: Request) => {
      asked.push(request.url)
      return new URL(request.url).pathname === '/hero.png'
        ? new Response(bytes, { headers: { 'content-type': 'image/png' } })
        : new Response('missing', { status: 404 })
    }
    return { asked, facts: { allow: ['images.test'], fetch } }
  }
  const factsOf = (served: ReturnType<typeof server>, url: string, authorization = 'Bearer ok') =>
    served.handle(
      new Request(`http://media.test/_media/facts?url=${encodeURIComponent(url)}`, {
        headers: { authorization },
      }),
    )

  it('answers the facts of an image on an allowed host, keyed by its URL', async () => {
    const { facts } = await host()
    const response = await factsOf(server(facts), 'https://images.test/hero.png')
    expect([response.status, response.headers.get('cache-control')]).toEqual([200, 'no-store'])
    const asset = Schema.decodeUnknownSync(ImageAsset)(await response.json())
    expect([asset.key, asset.width, asset.height]).toEqual([
      'https://images.test/hero.png',
      400,
      200,
    ])
  }, 60_000)

  it.each([
    ['a host not allowed', 'https://elsewhere.test/hero.png', 'Bearer ok', 422, 'Unavailable'],
    ['an image that is not there', 'https://images.test/gone.png', 'Bearer ok', 422, 'Unavailable'],
    ['a request the policy refuses', 'https://images.test/hero.png', 'Bearer no', 403, 'Forbidden'],
    [
      'an uploader, admitted to upload alone',
      'https://images.test/hero.png',
      'Bearer uploader',
      403,
      'Forbidden',
    ],
    ['a session that ended', 'https://images.test/hero.png', 'Bearer gone', 401, 'Unauthenticated'],
  ])(
    'refuses %s, saying only its kind',
    async (_, url, authorization, status, error) => {
      const { asked, facts } = await host()
      const response = await factsOf(server(facts), url, authorization)
      expect([
        response.status,
        response.headers.get('cache-control'),
        await response.json(),
      ]).toEqual([status, 'no-store', { error }])
      if (status < 422 || url.includes('elsewhere')) expect(asked).toEqual([])
    },
    60_000,
  )

  it('refuses a request naming no URL, and every URL when it allows no host', async () => {
    const { facts } = await host()
    const named = server(facts).handle(
      new Request('http://media.test/_media/facts', { headers: { authorization: 'Bearer ok' } }),
    )
    expect((await named).status).toBe(400)
    expect(
      (await factsOf(server({ fetch: facts.fetch }), 'https://images.test/hero.png')).status,
    ).toBe(422)
  }, 60_000)
})
