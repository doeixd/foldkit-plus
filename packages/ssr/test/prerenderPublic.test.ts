/**
 * #469: a path `SSR.entry` is told a build prerenders is one file every
 * visitor is given, so its render is held to the rule `cache` keeps a page
 * by (#428), and stricter on headers: every read public, no request header
 * read at all, nothing set by `headers`, status `200`. A render that breaks
 * it rejects, naming what broke it, so the build fails.
 */
import { Duration, Effect, Option } from 'effect'
import {
  handleRequest,
  renderDocument,
  type DocumentAssets,
  type EntryResult,
} from 'foldkit/experimental/server'
import { CacheStore, CachedRead } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan, type Model } from './handoverFixture.js'
import { reads } from './pageReads.js'
import { Data, config as authorConfig, initial, plan as authorPlan } from './remoteFixture.js'

const publicRead = CachedRead.Public({ policy: { maxAge: Duration.minutes(1) }, tags: [] })

const host = SSR.requestContext<string>('prerenderPublic-test')

/** The entry, prerendering `/`, with or without a page cache. */
const prerendering = (
  options: {
    readonly prepare?: (model: Model, request: Request) => Effect.Effect<Model>
    readonly headers?: () => HeadersInit
    readonly status?: () => number
    readonly store?: ReturnType<typeof CacheStore.memory>
  } = {},
) =>
  SSR.entry(config, plan, {
    buildId: 'b1',
    prerendered: ['/'],
    prepare: options.prepare ?? (model => Effect.as(reads(publicRead), model)),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.store === undefined
      ? {}
      : { cache: { store: options.store, maxAge: '5 minutes' } }),
  })

const at = (url: string, headers: HeadersInit = {}) =>
  new Request(`https://example.test${url}`, { headers })

describe('a prerendered page drawn from its URL alone', () => {
  it.each([
    ['without a page cache', undefined],
    ['beside a page cache, which it leaves alone', CacheStore.memory()],
  ])('%s is rendered with no headers or status, as a file carries', async (_, store) => {
    // `headers` that set nothing and `status` 200 still leave the result's keys empty.
    const result = await prerendering({
      headers: () => ({}),
      status: () => 200,
      ...(store === undefined ? {} : { store }),
    }).renderPage(at('/'))
    expect(result._tag).toBe('Rendered')
    expect(result).not.toHaveProperty('headers')
    expect(result).not.toHaveProperty('status')
    expect(store?.size() ?? 0).toBe(0)
  })
})

describe('a prerendered page drawn from more than its URL is refused, naming why', () => {
  const cases: ReadonlyArray<readonly [string, Parameters<typeof prerendering>[0], RegExp]> = [
    [
      'a private read',
      { prepare: model => Effect.as(reads(CachedRead.Private({ read: 'Price a' })), model) },
      /it read Price a, which is not public/,
    ],
    [
      'a header it read, though absent',
      {
        prepare: (model, request) =>
          Effect.succeed({ ...model, count: request.headers.has('cookie') ? 1 : 0 }),
      },
      /it read the request's cookie header;/,
    ],
    [
      'two headers it read',
      {
        prepare: (model, request) =>
          Effect.succeed({
            ...model,
            report: `${request.headers.get('cookie')}${request.headers.get('Accept-Language')}`,
          }),
      },
      /it read the request's cookie and accept-language headers;/,
    ],
    [
      'every header',
      {
        prepare: (model, request) =>
          Effect.succeed({ ...model, report: [...request.headers.keys()].join() }),
      },
      /it read every header of its request/,
    ],
    [
      'a request context, which may say who asks',
      {
        prepare: (model, request) =>
          Effect.succeed({ ...model, report: Option.getOrElse(host.of(request), () => '') }),
      },
      /it read every header of its request/,
    ],
    [
      'headers it sets',
      { headers: () => ({ 'x-frame-options': 'deny', 'cache-control': 'no-cache' }) },
      /its headers set cache-control and x-frame-options;/,
    ],
    ['a status other than 200', { status: () => 404 }, /it was answered 404/],
  ]

  it.each(cases)('%s', async (_, options, reason) => {
    const refusal = prerendering(options).renderPage(host.attach(at('/'), 'binding'))
    await expect(refusal).rejects.toThrow(reason)
    await expect(refusal).rejects.toThrow(
      /^foldkit-ssr: \/ is prerendered, a file every visitor is given, but /,
    )
  })

  it('and beside a page cache too', async () => {
    const refusal = prerendering({
      store: CacheStore.memory(),
      prepare: model => Effect.as(reads(CachedRead.Private({ read: 'Price a' })), model),
    }).renderPage(at('/'))
    await expect(refusal).rejects.toThrow(/it read Price a/)
  })
})

describe('what the rule leaves alone', () => {
  const cookieRead = {
    prepare: (model: Model, request: Request) =>
      Effect.succeed({ ...model, count: request.headers.has('cookie') ? 1 : 0 }),
  }

  it('a prerendered path at a query is rendered per request', async () => {
    const result = await prerendering(cookieRead).renderPage(at('/?q=a', { cookie: 'c=1' }))
    expect(result._tag).toBe('Rendered')
  })

  it('a path not prerendered is rendered per request', async () => {
    const result = await prerendering(cookieRead).renderPage(at('/about', { cookie: 'c=1' }))
    expect(result._tag).toBe('Rendered')
  })

  it('a method other than GET or HEAD at a prerendered path is not held to it', async () => {
    const result = await prerendering(cookieRead).renderPage(
      new Request('https://example.test/', { method: 'OPTIONS' }),
    )
    expect(result._tag).toBe('Responded')
  })
})

describe('the file a build writes for /', () => {
  const assets: DocumentAssets = { entryScript: '/entry.js', stylesheets: [], modulePreloads: [] }

  /** The author fixture, read through a public `pageReader` read stamped now. */
  const entry = SSR.entry(authorConfig, authorPlan, {
    buildId: 'b1',
    prerendered: ['/'],
    prepare: () =>
      Effect.as(
        reads(publicRead),
        Data.reduce(initial, {
          _tag: 'ReadReceived',
          requests: [{ entity: 'User', id: 'u1', fields: ['name'] }],
          result: {
            entities: [{ entity: 'User', id: 'u1', values: { name: 'Ada', email: 'a@b.test' } }],
            settled: [],
          },
          now: Date.now(),
        }),
      ),
  })

  /** As Foldkit's plugin writes it: a `Rendered` with no headers or status, drawn into the document. */
  const built = (result: EntryResult): string => {
    if (result._tag !== 'Rendered' || result.headers !== undefined || result.status !== undefined)
      throw new Error('not a page a file can hold')
    return renderDocument(result.application, assets)
  }

  /** A time stamped on the page, as a read's `updatedAt`, which a later render stamps later. */
  const unstamped = (document: string) => document.replace(/\b\d{13}\b/g, 'T')

  it('is the page the Worker answers / with, a browser’s headers and all', async () => {
    const file = built(await entry.renderPage(new Request('https://example.test/')))
    expect(file).toMatch(/\b\d{13}\b/)
    const response = await handleRequest(
      new Request('https://example.test/', {
        headers: { accept: 'text/html', cookie: 'cart=a', 'accept-language': 'fr' },
      }),
      {
        renderPage: entry.renderPage,
        renderDocument: application => renderDocument(application, assets),
      },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBeNull()
    expect(unstamped(await response.text())).toBe(unstamped(file))
  })
})
