/**
 * `SSR.entry`'s page cache (#428): a page is kept only when it was drawn
 * from its URL alone (every read public, every header read absent, no
 * cookie set), by its build and URL; it serves only requests lacking the
 * headers it read; and the checker draws a kept page again for each request
 * it serves.
 */
import { Duration, Effect, Option } from 'effect'
import type { EntryResult, RenderedApplication } from 'foldkit/experimental/server'
import { CacheStore, CachedRead, type CachePolicy } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { FALLBACK_FIELD, SSR } from 'foldkit-ssr'
import { config as todos, plan as todosPlan } from './fallbackFixture.js'
import { config, plan, type Model } from './handoverFixture.js'
import { reads } from './pageReads.js'

const minute: CachePolicy = { maxAge: Duration.minutes(1) }

/** The page's count, and whether the cached page or a new render answered. */
const counted = (
  options: {
    readonly prepare?: (model: Model, request: Request) => Effect.Effect<Model>
    readonly headers?: (request: Request) => HeadersInit
    readonly status?: () => number
    readonly buildId?: string
    readonly store?: ReturnType<typeof CacheStore.memory>
  } = {},
) => {
  const store = options.store ?? CacheStore.memory()
  let renders = 0
  const entry = SSR.entry(config, plan, {
    buildId: options.buildId ?? 'b1',
    prepare: (model, request) => {
      renders += 1
      return (
        options.prepare ??
        (() =>
          reads(CachedRead.Public({ policy: minute, tags: ['row:Price:a'] })).pipe(
            Effect.as(model),
          ))
      )(model, request)
    },
    ...(options.headers === undefined ? {} : { headers: request => options.headers!(request) }),
    ...(options.status === undefined ? {} : { status: options.status }),
    cache: { store, maxAge: '5 minutes' },
  })
  return { store, entry, renders: () => renders }
}

const get = (headers: HeadersInit = {}) => new Request('https://example.test/', { headers })

const headersOf = (result: EntryResult) =>
  new Headers(result._tag === 'Rendered' ? result.headers : result.response.headers)

describe('a page drawn from its URL alone', () => {
  it('is kept, and served to the next request without a render', async () => {
    const { entry, renders } = counted()
    const first = await entry.renderPage(get())
    const second = await entry.renderPage(get({ accept: 'text/html' }))
    expect(renders()).toBe(1)
    expect(second).toEqual(first)
    expect(headersOf(second).get('cache-control')).toBe('public, max-age=60')
  })

  it('is kept by its build: another build renders its own', async () => {
    const store = CacheStore.memory()
    const one = counted({ store, buildId: 'b1' })
    const two = counted({ store, buildId: 'b2' })
    await one.entry.renderPage(get())
    await two.entry.renderPage(get())
    expect(two.renders()).toBe(1)
    expect(store.size()).toBe(2)
  })

  it('is kept by its full URL', async () => {
    const { entry, renders } = counted()
    await entry.renderPage(new Request('https://example.test/?q=a'))
    await entry.renderPage(new Request('https://example.test/?q=b'))
    expect(renders()).toBe(2)
  })

  it('is dropped by a purge of a row it read', async () => {
    const { entry, renders, store } = counted()
    await entry.renderPage(get())
    await Effect.runPromise(store.purge(['row:Price:a']))
    await entry.renderPage(get())
    expect(renders()).toBe(2)
  })

  it('is kept for its own maxAge when it read nothing', async () => {
    const { entry } = counted({ prepare: model => Effect.succeed(model) })
    expect(headersOf(await entry.renderPage(get())).get('cache-control')).toBe(
      'public, max-age=300',
    )
  })
})

describe('a page drawn from more than its URL is not kept', () => {
  const host = SSR.requestContext<string>('pageCache-test')
  const cases: ReadonlyArray<
    readonly [string, Parameters<typeof counted>[0], HeadersInit, string]
  > = [
    [
      'after a private read',
      { prepare: model => Effect.as(reads(CachedRead.Private({ read: 'Price a' })), model) },
      {},
      'private, no-store',
    ],
    [
      'when a header it read was there',
      {
        prepare: (model, request) =>
          Effect.succeed({ ...model, count: request.headers.has('cookie') ? 1 : 0 }),
      },
      { cookie: 'cart=a' },
      'private, no-store',
    ],
    [
      'when it read every header',
      {
        prepare: (model, request) =>
          Effect.succeed({ ...model, report: [...request.headers.keys()].join() }),
      },
      {},
      'private, no-store',
    ],
    [
      'when it cloned its request',
      {
        prepare: (model, request) =>
          Effect.as(
            Effect.sync(() => request.clone()),
            model,
          ),
      },
      {},
      'private, no-store',
    ],
    [
      'when it set a cookie',
      { headers: () => ({ 'set-cookie': 'seen=1' }) },
      {},
      'private, no-store',
    ],
    [
      'when it said a cache-control of its own',
      { headers: () => ({ 'cache-control': 'no-cache' }) },
      {},
      'no-cache',
    ],
    ['when it is not found', { status: () => 404 }, {}, 'private, no-store'],
    [
      'when it read a request context, which may say who asks',
      {
        prepare: (model, request) =>
          Effect.succeed({ ...model, report: Option.getOrElse(host.of(request), () => '') }),
      },
      {},
      'private, no-store',
    ],
  ]

  it.each(cases)('%s', async (_, options, headers, control) => {
    const { entry, renders, store } = counted(options)
    const first = await entry.renderPage(host.attach(get(headers), 'binding'))
    await entry.renderPage(host.attach(get(headers), 'binding'))
    expect(renders()).toBe(2)
    expect(store.size()).toBe(0)
    expect(headersOf(first).get('cache-control')).toBe(control)
  })

  it('and a request context is still the host’s', async () => {
    const host = SSR.requestContext<string>('pageCache-host')
    const seen: Array<Option.Option<string>> = []
    const { entry } = counted({
      prepare: (model, request) => Effect.sync(() => (seen.push(host.of(request)), model)),
    })
    await entry.renderPage(host.attach(get(), 'the binding'))
    expect(seen).toEqual([Option.some('the binding')])
  })
})

describe('a page that read an absent header', () => {
  const cart = {
    prepare: (model: Model, request: Request) =>
      Effect.succeed({ ...model, count: Number(request.headers.get('cookie')?.length ?? 0) }),
  }

  it('says so in vary, and serves no request that carries it', async () => {
    const { entry, renders } = counted(cart)
    const visitor = await entry.renderPage(get())
    expect(headersOf(visitor).get('vary')).toBe('cookie')
    const someone = await entry.renderPage(get({ cookie: 'cart=abc' }))
    expect(renders()).toBe(2)
    expect(someone).not.toEqual(visitor)
    expect(headersOf(someone).get('cache-control')).toBe('private, no-store')
    await entry.renderPage(get())
    expect(renders()).toBe(2)
  })
})

describe('SSR.keptDocuments', () => {
  const applicationOf = (result: EntryResult) => {
    if (result._tag !== 'Rendered') throw new Error('no page was rendered')
    return result.application
  }

  it('draws a kept page into its document once for each set of assets', async () => {
    let drawn = 0
    const draw = SSR.keptDocuments((application: RenderedApplication, assets: string) => {
      drawn += 1
      return `${assets}${application.html}`
    })
    const { entry } = counted()
    for (const _ of [1, 2, 3]) draw(applicationOf(await entry.renderPage(get())), 'a')
    expect(drawn).toBe(1)
    draw(applicationOf(await entry.renderPage(get())), 'b')
    expect(drawn).toBe(2)
  })

  it('draws a page that was not kept every time', async () => {
    let drawn = 0
    const draw = SSR.keptDocuments((application: RenderedApplication) => {
      drawn += 1
      return application.html
    })
    const { entry } = counted({
      prepare: model => Effect.as(reads(CachedRead.Private({ read: 'Price a' })), model),
    })
    for (const _ of [1, 2]) draw(applicationOf(await entry.renderPage(get())), undefined)
    expect(drawn).toBe(2)
  })

  it('forgets the oldest document past its room', async () => {
    let drawn = 0
    const draw = SSR.keptDocuments((application: RenderedApplication, assets: number) => {
      drawn += 1
      return `${assets}${application.html}`
    })
    const { entry } = counted()
    const application = applicationOf(await entry.renderPage(get()))
    for (let assets = 0; assets <= 32; assets++) draw(application, assets)
    draw(application, 0)
    expect(drawn).toBe(34)
  })
})

describe('a posted form', () => {
  it('is handled, not served the page kept for its address, nor kept', async () => {
    let prepared = 0
    const entry = SSR.entry(todos, todosPlan, {
      buildId: 'b',
      origins: ['https://example.test'],
      prepare: model => Effect.sync(() => ((prepared += 1), model)),
      cache: { store: CacheStore.memory(), maxAge: '5 minutes' },
    })
    await entry.renderPage(new Request('https://example.test/todos'))
    const posted = await entry.renderPage(
      new Request('https://example.test/todos', {
        method: 'POST',
        headers: { origin: 'https://example.test' },
        body: new URLSearchParams({
          [FALLBACK_FIELD]: JSON.stringify({ _tag: 'Added', title: 'Milk' }),
        }),
      }),
    )
    expect(posted._tag === 'Rendered' && posted.application.html).toContain('Milk')
    expect(headersOf(posted).get('cache-control')).toBe('private, no-store')
    await entry.renderPage(new Request('https://example.test/todos'))
    expect(prepared).toBe(2)
  })
})

describe('the entry', () => {
  it('refuses a maxAge Cache-Control cannot say', () => {
    expect(() =>
      SSR.entry(config, plan, {
        buildId: 'b',
        cache: { store: CacheStore.memory(), maxAge: '0 seconds' },
      }),
    ).toThrow(/at least one second/)
  })
})

describe('SSR.checkCache', () => {
  const requests = [() => get(), () => get({ cookie: 'cart=abc', authorization: 'Bearer u1' })]

  it('passes a page drawn from its URL alone', async () => {
    await SSR.checkCache(options => SSR.entry(config, plan, { buildId: 'b', ...options }), requests)
  })

  it('refuses a page drawn from something it did not read of the request', async () => {
    // Who asks, as a host might keep it outside the request: the cache cannot see it.
    let asking = 0
    await expect(
      SSR.checkCache(
        options =>
          SSR.entry(config, plan, {
            buildId: 'b',
            ...options,
            prepare: model => Effect.sync(() => ({ ...model, count: (asking += 1) })),
          }),
        requests,
      ),
    ).rejects.toThrow(/drawn otherwise for a request it served/)
  })

  it('passes a page stamped with the time it was drawn', async () => {
    await SSR.checkCache(
      options =>
        SSR.entry(config, plan, {
          buildId: 'b',
          ...options,
          prepare: model => Effect.sync(() => ({ ...model, count: Date.now() })),
        }),
      requests,
    )
  })

  it('refuses a page that differs by a long number that is no time of now', async () => {
    let asking = 1_000_000_000_000
    await expect(
      SSR.checkCache(
        options =>
          SSR.entry(config, plan, {
            buildId: 'b',
            ...options,
            prepare: model => Effect.sync(() => ({ ...model, count: (asking += 1) })),
          }),
        requests,
      ),
    ).rejects.toThrow(/drawn otherwise for a request it served/)
  })

  it('refuses to check nothing', async () => {
    await expect(
      SSR.checkCache(
        options =>
          SSR.entry(config, plan, {
            buildId: 'b',
            ...options,
            headers: () => ({ 'cache-control': 'no-cache' }),
          }),
        requests,
      ),
    ).rejects.toThrow(/nothing was checked/)
  })
})
