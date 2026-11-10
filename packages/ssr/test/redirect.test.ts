/**
 * `SSR.entry`'s `redirect` (#235, H1): a page sent elsewhere from the Model
 * `prepare` made answers `303`, carries the entry's headers, is never drawn
 * and never kept, and goes nowhere but a path on its own origin.
 */
import { Duration, Effect, Option } from 'effect'
import type { EntryResult } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { CacheStore, CachedRead } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { config, plan, type Message, type Model } from './handoverFixture.js'
import { reads } from './pageReads.js'

/** The counter whose view, `prepare` and `redirect` each note when they run. */
const counted = (
  options: {
    readonly to?: (model: Model) => Option.Option<string>
    readonly headers?: HeadersInit
    readonly cache?: ReturnType<typeof CacheStore.memory>
  } = {},
) => {
  const ran: Array<string> = []
  const collected = Diagnostics.collect()
  const entry = SSR.entry(
    {
      ...config,
      view: (model: Model, h: HtmlBuilder<Message>) => {
        ran.push('view')
        return config.view(model, h)
      },
    },
    plan,
    {
      buildId: 'b',
      diagnostics: collected.report,
      prepare: (model, request) => {
        ran.push('prepare')
        const count = Number(new URL(request.url).searchParams.get('n') ?? model.count)
        // A public read, so a page drawn here is one the cache may keep.
        return reads(CachedRead.Public({ policy: { maxAge: Duration.minutes(1) }, tags: [] })).pipe(
          Effect.as({ ...model, count }),
        )
      },
      redirect: model => {
        ran.push(`redirect ${model.count}`)
        return (
          options.to ??
          (model => (model.count > 100 ? Option.some('/sign-in?next=%2F') : Option.none()))
        )(model)
      },
      ...(options.headers === undefined
        ? {}
        : {
            headers: (_request: Request, model: Option.Option<Model>) => {
              const headers = new Headers(options.headers)
              headers.set(
                'x-count',
                Option.match(model, { onNone: () => 'none', onSome: model => String(model.count) }),
              )
              return headers
            },
          }),
      ...(options.cache === undefined
        ? {}
        : { cache: { store: options.cache, maxAge: '5 minutes' } }),
    },
  )
  return { entry, ran, reported: collected.reported }
}

const get = (n: number, method = 'GET') =>
  new Request(`https://example.test/?n=${n}`, { method, headers: { accept: 'text/html' } })

const responseOf = (result: EntryResult): Response => {
  if (result._tag !== 'Responded') throw new Error(`expected a response, got ${result._tag}`)
  return result.response
}

describe('redirect', () => {
  it.each(['GET', 'HEAD'])(
    'answers a %s it sends elsewhere 303 to the path, never drawing it',
    async method => {
      const { entry, ran } = counted()
      const response = responseOf(await entry.renderPage(get(500, method)))
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/sign-in?next=%2F')
      expect(ran).toEqual(['prepare', 'redirect 500'])
    },
  )

  it('decides on the Model prepare made, after prepare and before the view', async () => {
    const { entry, ran } = counted()
    const result = await entry.renderPage(get(7))
    expect(result._tag).toBe('Rendered')
    // `init` gave 41; prepare made 7, and that is what redirect was asked about.
    // The view may be drawn more than once for a page; every drawing comes after.
    expect(ran.slice(0, 2)).toEqual(['prepare', 'redirect 7'])
    expect(ran.slice(2).length).toBeGreaterThan(0)
    expect(new Set(ran.slice(2))).toEqual(new Set(['view']))
  })

  it('carries the entry’s headers, given the Model, and says private, no-store over theirs', async () => {
    const { entry } = counted({
      headers: [
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
        ['vary', 'cookie'],
        ['cache-control', 'public, max-age=600'],
      ],
    })
    const response = responseOf(await entry.renderPage(get(500)))
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(response.headers.get('vary')).toBe('cookie')
    // Given the Model the redirect was decided on.
    expect(response.headers.get('x-count')).toBe('500')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('says private, no-store when headers set nothing', async () => {
    const { entry } = counted()
    expect(responseOf(await entry.renderPage(get(500))).headers.get('cache-control')).toBe(
      'private, no-store',
    )
  })

  it('is never kept, though every read was public: the next request is decided again', async () => {
    const store = CacheStore.memory()
    const { entry, ran } = counted({ cache: store })
    expect(responseOf(await entry.renderPage(get(500))).status).toBe(303)
    expect(store.size()).toBe(0)
    const again = responseOf(await entry.renderPage(get(500)))
    expect(again.status).toBe(303)
    expect(again.headers.get('cache-control')).toBe('private, no-store')
    expect(ran.filter(step => step === 'prepare')).toHaveLength(2)
    // A page drawn from the same reads is kept, so the store is not refusing everything.
    expect((await entry.renderPage(get(7)))._tag).toBe('Rendered')
    expect(store.size()).toBe(1)
  })

  it.each([
    ['another origin', 'https://elsewhere.test/'],
    ['a protocol-relative address', '//elsewhere.test/'],
    ['a backslash a browser reads as a slash', '/\\elsewhere.test/'],
    ['dot segments that resolve to two slashes', '/.//elsewhere.test/'],
    ['a relative path', 'sign-in'],
    ['a scheme', 'javascript:alert(1)'],
  ])('refuses %s, answering 500 and reporting it', async (_, path) => {
    const { entry, ran, reported } = counted({ to: () => Option.some(path) })
    const response = responseOf(await entry.renderPage(get(500)))
    expect(response.status).toBe(500)
    expect(response.headers.get('location')).toBeNull()
    expect(ran).not.toContain('view')
    expect(reported).toEqual([
      expect.objectContaining({
        _tag: 'PageFailed',
        message: expect.stringContaining('no path on this origin'),
      }),
    ])
  })

  it('answers a redirect that throws 500, reporting it, and draws nothing', async () => {
    const { entry, ran, reported } = counted({
      to: () => {
        throw new Error('no access rule')
      },
    })
    expect(responseOf(await entry.renderPage(get(500))).status).toBe(500)
    expect(ran).not.toContain('view')
    expect(reported).toEqual([
      expect.objectContaining({
        _tag: 'PageFailed',
        message: expect.stringContaining('no access rule'),
      }),
    ])
  })

  it('takes this origin’s own address written whole only as a path', async () => {
    // Same origin, but not a path: the rule is a path, so the address is refused too.
    const { entry } = counted({ to: () => Option.some('https://example.test/sign-in') })
    expect(responseOf(await entry.renderPage(get(500))).status).toBe(500)
  })
})
