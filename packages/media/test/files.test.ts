// @vitest-environment node
/**
 * The file routes over a memory store: an upload is asked of its policy,
 * held to its type, name, size, rate and slots, and kept; a download is asked
 * of its policy before the store, answered as an attachment that cannot run
 * here, and refused alike for a file that is not there and one not yours.
 */
import { Effect, Exit, Layer, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { HttpRouter, HttpServer } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import { FileAsset } from 'foldkit-media'
import {
  Admission,
  FileRefused,
  FileUnauthenticated,
  FileUploadPolicy,
  RateLimited,
  UploadForbidden,
  UploadUnauthenticated,
  fileLayer,
  fileReadPolicy,
  filesKeyValueStore,
  originalsKeyValueStore,
  Originals,
  type FileOptions,
  serveFetch,
  Transformer,
  variantsNone,
} from 'foldkit-media/server'
import { Diagnostics, type ReportDiagnostic } from 'foldkit-surface'

const transformerNone = Layer.succeed(Transformer, { transform: () => Effect.die('unused') })

const pdf = new TextEncoder().encode('%PDF-1.7 a small document')

interface Setup {
  readonly options?: Partial<FileOptions>
  readonly report?: ReportDiagnostic
  readonly extra?: Layer.Layer<never>
  readonly admission?: Layer.Layer<Admission>
  readonly clock?: Layer.Layer<never>
}

/**
 * `Bearer <id>` uploads as `<id>`, `Bearer gone` is a session that ended,
 * `Bearer nobody` an empty owner, and no header is refused. A file is
 * readable by whom `readable` says; every step of a download is logged.
 */
const server = (setup: Setup = {}) => {
  const log: Array<string> = []
  const probe: { originals?: Originals['Service'] } = {}
  const readable = new Map<string, ReadonlySet<string>>()
  const store = Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.map(KeyValueStore.KeyValueStore, inner =>
      KeyValueStore.make({
        ...inner,
        get: key =>
          Effect.sync(() => log.push(`store ${key}`)).pipe(Effect.andThen(inner.get(key))),
      }),
    ),
  ).pipe(Layer.provide(KeyValueStore.layerMemory))
  const uploads = Layer.succeed(FileUploadPolicy, {
    admit: request =>
      Effect.suspend((): Effect.Effect<string, UploadForbidden | UploadUnauthenticated> => {
        log.push('upload policy')
        const authorization = request.headers['authorization'] ?? ''
        if (authorization === 'Bearer gone') return Effect.fail(new UploadUnauthenticated({}))
        if (authorization === 'Bearer nobody') return Effect.succeed('')
        return authorization.startsWith('Bearer ')
          ? Effect.succeed(authorization.slice('Bearer '.length))
          : Effect.fail(new UploadForbidden({}))
      }),
  })
  const reads = fileReadPolicy({
    resolve: request =>
      Effect.suspend(() => {
        log.push('resolve')
        const authorization = request.headers['authorization']
        return authorization === 'Bearer gone'
          ? Effect.fail(new FileUnauthenticated({}))
          : Effect.succeed(authorization?.slice('Bearer '.length) ?? 'visitor')
      }),
    read: (asker, key) =>
      Effect.sync(() => {
        log.push('read')
        return readable.get(key)?.has(asker) ?? false
      }),
  })
  const services = Layer.mergeAll(
    filesKeyValueStore(),
    originalsKeyValueStore({ prefix: '' }),
    uploads,
    reads,
    Layer.succeed(Diagnostics.Reporter, setup.report ?? Diagnostics.log),
    setup.admission ?? Layer.empty,
    setup.clock ?? Layer.empty,
  ).pipe(Layer.provideMerge(store), Layer.provide(SecureRandom.layerWebCrypto))
  const { handler } = HttpRouter.toWebHandler(
    Layer.mergeAll(
      fileLayer({ accept: ['application/pdf', 'image/*'], ...setup.options }),
      Layer.effectDiscard(
        Effect.gen(function* () {
          const originals = yield* Originals
          probe.originals = originals
        }),
      ),
    ).pipe(Layer.provideMerge(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  )
  const upload = (
    body: BodyInit,
    headers: Record<string, string> = {},
    owner: string | null = 'ada',
  ) =>
    handler(
      new Request('http://media.test/_media/files', {
        method: 'POST',
        body,
        headers: {
          ...(owner === null ? {} : { authorization: `Bearer ${owner}` }),
          'content-type': 'application/octet-stream',
          'x-foldkit-file-name': encodeURIComponent('Q1 report.pdf'),
          'x-foldkit-file-type': 'application/pdf',
          ...headers,
        },
        ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
      }),
    )
  const download = (path: string, asker?: string) =>
    handler(
      new Request(`http://media.test/_media/files/${path}`, {
        headers: asker === undefined ? {} : { authorization: `Bearer ${asker}` },
      }),
    )
  return { upload, download, log, readable, probe }
}

const assetOf = async (response: Response) =>
  Schema.decodeUnknownSync(FileAsset)(await response.json())

/** A body that sends `first` and then holds the request open until `end` is called. */
const held = (first: Uint8Array = pdf) => {
  let end = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first)
      end = () => controller.close()
    },
  })
  return { body, end: () => end() }
}

const SERVED = {
  'content-type': 'application/octet-stream',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'private, no-store',
}

const headersOf = (response: Response) => {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    if (name !== 'content-length') headers[name] = value
  })
  return headers
}

describe('upload', () => {
  it('keeps a file and answers its facts, which its owner may download', async () => {
    const files = server()
    const answer = await files.upload(pdf, { 'x-foldkit-file-type': 'Application/PDF' })
    expect([answer.status, answer.headers.get('cache-control')]).toEqual([201, 'no-store'])
    const asset = await assetOf(answer)
    expect(asset).toEqual({
      key: asset.key,
      name: 'Q1 report.pdf',
      type: 'application/pdf',
      size: pdf.byteLength,
    })
    files.readable.set(asset.key, new Set(['ada']))
    const downloaded = await files.download(asset.key, 'ada')
    expect(downloaded.status).toBe(200)
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(pdf)
    expect(headersOf(downloaded)).toEqual({
      ...SERVED,
      'content-disposition': `attachment; filename="Q1 report.pdf"; filename*=UTF-8''Q1%20report.pdf`,
    })
  })

  it('keeps two uploads of the same bytes as two files', async () => {
    const files = server()
    const first = await assetOf(await files.upload(pdf))
    const second = await assetOf(await files.upload(pdf))
    expect(first.key).not.toBe(second.key)
  })

  it.each([
    ['a policy that refuses', {}, null, 403, 'Forbidden'],
    ['a session that ended', {}, 'gone', 401, 'Unauthenticated'],
    ['a text body', { 'content-type': 'text/plain' }, 'ada', 415, 'Unsupported'],
    ['a form', { 'content-type': 'multipart/form-data; boundary=x' }, 'ada', 415, 'Unsupported'],
    [
      'an encoded form',
      { 'content-type': 'application/x-www-form-urlencoded' },
      'ada',
      415,
      'Unsupported',
    ],
    ['an image body', { 'content-type': 'image/png' }, 'ada', 415, 'Unsupported'],
    ['no name', { 'x-foldkit-file-name': '' }, 'ada', 400, 'Malformed'],
    ['a malformed name', { 'x-foldkit-file-name': 'a%E6%97' }, 'ada', 400, 'Malformed'],
    ['a name with a slash', { 'x-foldkit-file-name': '..%2Fetc' }, 'ada', 400, 'Malformed'],
    ['a name with a control', { 'x-foldkit-file-name': 'a%0Ab' }, 'ada', 400, 'Malformed'],
    ['a name over 255 bytes', { 'x-foldkit-file-name': 'a'.repeat(256) }, 'ada', 400, 'Malformed'],
    ['a type outside accept', { 'x-foldkit-file-type': 'text/html' }, 'ada', 415, 'Unsupported'],
    [
      'html dressed as an image',
      { 'x-foldkit-file-type': 'text/html;x=image/png' },
      'ada',
      415,
      'Unsupported',
    ],
    ['no type', { 'x-foldkit-file-type': '' }, 'ada', 415, 'Unsupported'],
  ])('refuses %s, keeping nothing', async (_, headers, owner, status, error) => {
    const files = server()
    const answer = await files.upload(pdf, headers, owner)
    expect([answer.status, answer.headers.get('cache-control'), await answer.json()]).toEqual([
      status,
      'no-store',
      { error },
    ])
    expect(files.log.filter(line => line.startsWith('store'))).toEqual([])
  })

  it('refuses an upload by an empty owner, and reports why', async () => {
    const collected = Diagnostics.collect()
    const files = server({ report: collected.report })
    expect((await files.upload(pdf, {}, 'nobody')).status).toBe(403)
    expect(collected.reported).toMatchObject([{ _tag: 'OwnerMissing', level: 'error' }])
  })

  it('asks the policy before anything else', async () => {
    const files = server()
    await files.upload(pdf, { 'content-type': 'text/plain' })
    expect(files.log[0]).toBe('upload policy')
  })

  it('stops reading a body past maxBytes, as it streams', async () => {
    const files = server({ options: { maxBytes: 64 * 1024 } })
    // A megabyte in 1 KB chunks: a limit counted as it streams stops long before the end.
    let pulled = 0
    const large = new ReadableStream<Uint8Array>({
      pull: controller => {
        if (++pulled > 1024) controller.close()
        else controller.enqueue(new Uint8Array(1024))
      },
    })
    const answer = await files.upload(large)
    expect([answer.status, await answer.json()]).toEqual([413, { error: 'TooLarge' }])
    expect(pulled).toBeLessThan(256)
  })

  it('cuts off a body slower than minBytesPerSecond', async () => {
    let clock: TestClock.TestClock | undefined
    const files = server({
      clock: Layer.effectDiscard(
        TestClock.testClockWith(testClock => Effect.sync(() => (clock = testClock))),
      ).pipe(Layer.provideMerge(TestClock.layer())),
    })
    const trickle = held(new Uint8Array(1024))
    let settled: Response | undefined
    const answering = files.upload(trickle.body).then(answer => (settled = answer))
    for (let turns = 0; settled === undefined && turns < 200; turns++) {
      await Effect.runPromise(clock!.adjust('10 seconds'))
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    const answer = await answering
    expect([answer.status, await answer.json()]).toEqual([408, { error: 'TooSlow' }])
  })

  it('answers 503 at once past maxConcurrent, and frees the slot after', async () => {
    const files = server({ options: { maxConcurrent: 1 } })
    const first = held()
    const firstAnswer = files.upload(first.body, {}, 'ada')
    // Until the first has its slot, a second could take it.
    await new Promise(resolve => setTimeout(resolve, 20))
    const busy = await files.upload(pdf, {}, 'grace')
    expect([busy.status, await busy.json()]).toEqual([503, { error: 'Busy' }])
    first.end()
    expect((await firstAnswer).status).toBe(201)
    expect((await files.upload(pdf, {}, 'grace')).status).toBe(201)
  })

  it('answers 503 to a second upload from one owner while the first is in flight', async () => {
    const files = server({ options: { maxConcurrent: 2 } })
    const first = held()
    const firstAnswer = files.upload(first.body, {}, 'ada')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect((await files.upload(pdf, {}, 'ada')).status).toBe(503)
    expect((await files.upload(pdf, {}, 'grace')).status).toBe(201)
    first.end()
    expect((await firstAnswer).status).toBe(201)
    expect((await files.upload(pdf, {}, 'ada')).status).toBe(201)
  })

  it('asks Admission by owner, and answers its refusal 429', async () => {
    const asked: Array<string> = []
    const files = server({
      admission: Layer.succeed(Admission, {
        admit: client =>
          Effect.suspend(() => {
            asked.push(client)
            return client === 'files:ada'
              ? Effect.fail(new RateLimited({ retryAfterSeconds: 7 }))
              : Effect.void
          }),
      }),
    })
    const limited = await files.upload(pdf, {}, 'ada')
    expect([limited.status, limited.headers.get('retry-after')]).toEqual([429, '7'])
    expect((await files.upload(pdf, {}, 'grace')).status).toBe(201)
    expect(asked).toEqual(['files:ada', 'files:grace'])
  })

  it("answers an inspect refusal 415, keeping nothing, and passes it the upload's facts", async () => {
    const inspected: Array<unknown> = []
    const files = server({
      options: {
        inspect: (bytes, declared) =>
          Effect.suspend(() => {
            inspected.push({ size: bytes.byteLength, ...declared })
            return Effect.fail(new FileRefused({}))
          }),
      },
    })
    const answer = await files.upload(pdf)
    expect([answer.status, await answer.json()]).toEqual([415, { error: 'Unsupported' }])
    expect(inspected).toEqual([
      { size: pdf.byteLength, name: 'Q1 report.pdf', type: 'application/pdf' },
    ])
    expect(files.log.filter(line => line.startsWith('store'))).toEqual([])
  })

  it('keeps no file where the variant server reads originals', async () => {
    const files = server()
    const { key } = await assetOf(await files.upload(pdf))
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pdf)), byte =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    for (const name of [key, hash, `bytes/${key}`]) {
      const exit = await Effect.runPromise(Effect.exit(files.probe.originals!.get(name)))
      expect(Exit.isFailure(exit)).toBe(true)
    }
  })
})

describe('download', () => {
  const kept = async () => {
    const files = server()
    const asset = await assetOf(await files.upload(pdf))
    files.readable.set(asset.key, new Set(['ada']))
    files.log.length = 0
    return { files, key: asset.key }
  }

  it('refuses an unknown key and one not yours alike', async () => {
    const { files, key } = await kept()
    const unknown = await files.download('f'.repeat(32), 'ada')
    const notYours = await files.download(key, 'grace')
    const visitor = await files.download(key)
    for (const answer of [unknown, notYours, visitor]) {
      expect([answer.status, headersOf(answer), await answer.text()]).toEqual([404, SERVED, ''])
    }
  })

  it('asks the policy before the store, and reads no store for a refusal', async () => {
    const { files, key } = await kept()
    await files.download(key, 'grace')
    expect(files.log).toEqual(['resolve', 'read'])
    files.log.length = 0
    await files.download(key, 'ada')
    expect(files.log.slice(0, 3)).toEqual(['resolve', 'read', `store files/records/${key}`])
  })

  it('answers 401 when the policy cannot tell who asks', async () => {
    const { files, key } = await kept()
    const answer = await files.download(key, 'gone')
    expect([answer.status, headersOf(answer)]).toEqual([401, SERVED])
  })

  it.each(['XYZ', 'F'.repeat(32), `facts%2F${'0'.repeat(26)}`, `..%2F${'0'.repeat(29)}`])(
    'refuses the key %j before asking anyone',
    async path => {
      const { files } = await kept()
      const answer = await files.download(path, 'ada')
      expect([answer.status, headersOf(answer)]).toEqual([404, SERVED])
      expect(files.log).toEqual([])
    },
  )

  it('names a download by its record, whatever the query says', async () => {
    const { files, key } = await kept()
    const answer = await files.download(`${key}?name=evil.html`, 'ada')
    expect(answer.headers.get('content-disposition')).toContain('filename="Q1 report.pdf"')
    expect(answer.headers.get('access-control-allow-origin')).toBe(null)
    expect(answer.headers.get('timing-allow-origin')).toBe(null)
    expect(answer.headers.get('cdn-cache-control')).toBe(null)
  })
})

describe('serveFetch', () => {
  const files = {
    accept: '*' as const,
    layer: () =>
      Layer.mergeAll(
        filesKeyValueStore(),
        Layer.succeed(FileUploadPolicy, { admit: () => Effect.succeed('ada') }),
        fileReadPolicy({ resolve: () => Effect.succeed('ada'), read: () => Effect.succeed(true) }),
      ).pipe(Layer.provide(KeyValueStore.layerMemory), Layer.provide(SecureRandom.layerWebCrypto)),
  }
  const uploadOf = () =>
    new Request('http://media.test/_media/files', {
      method: 'POST',
      body: pdf,
      headers: {
        'content-type': 'application/octet-stream',
        'x-foldkit-file-name': 'a.pdf',
        'x-foldkit-file-type': 'application/pdf',
      },
    })

  it('keeps and serves a file given only the files', async () => {
    const fetch = serveFetch<object>({ files })
    // One environment: its services are built once, so the download reads the upload's store.
    const env = {}
    const { key } = await assetOf(await fetch(uploadOf(), env))
    const downloaded = await fetch(new Request(`http://media.test/_media/files/${key}`), env)
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(pdf)
  })

  it('answers no file route when not given the files', async () => {
    const images = {
      layer: () =>
        Layer.mergeAll(originalsKeyValueStore(), variantsNone, transformerNone).pipe(
          Layer.provide(KeyValueStore.layerMemory),
        ),
    }
    expect((await serveFetch<object>({ images })(uploadOf(), {})).status).toBe(404)
  })
})

describe('fileLayer', () => {
  it('refuses an accept pattern outside the grammar where it is made', () => {
    expect(() => fileLayer({ accept: ['*/*'] })).toThrow('*/*')
  })
})
