/**
 * Phase 6: `SSR.entry` is the `renderPage` Foldkit's pipeline calls, so a
 * resumed page is served through `handleRequest` as any Foldkit page is. The
 * host owns the template: the entry answers `Rendered`, with the envelope in
 * the rendered root, and never splices markup into a template of its own.
 */
import { Effect, Option } from 'effect'
import { handleRequest } from 'foldkit/experimental/server'
import { Projection } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESUME_ATTRIBUTE, SSR, type Diagnostic } from 'foldkit-ssr'
import { config as themed, plan as themedPlan } from './flagsFixture.js'
import { App, calls, config, plan, template } from './handoverFixture.js'

const html = { accept: 'text/html' }
const serve = (request: Request, entry = SSR.entry(config, plan, { buildId: 'b' })) =>
  handleRequest(request, { renderPage: entry.renderPage, template })

afterEach(() => {
  vi.restoreAllMocks()
})

/** An entry's `diagnostics`, keeping each diagnostic with its request's URL. */
const collecting = () => {
  const reported: Array<readonly [Diagnostic, string]> = []
  return {
    reported,
    diagnostics: (diagnostic: Diagnostic, request: Request) =>
      Effect.sync(() => void reported.push([diagnostic, request.url])),
  }
}

const failed = (url: string, text: string) => [
  expect.objectContaining({
    _tag: 'PageFailed',
    source: 'foldkit-ssr',
    level: 'error',
    url,
    message: expect.stringContaining(text),
  }),
  url,
]

describe('SSR.entry through handleRequest', () => {
  it('answers GET with the resumable page', async () => {
    const response = await serve(new Request('https://example.test/', { headers: html }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const body = await response.text()
    expect(body).toContain(RESUME_ATTRIBUTE)
    expect(body).toContain('id="count"')
    expect(body).not.toContain('HUGE server-only report')
  })

  it('carries the envelope on the rendered root, as `Rendered`', async () => {
    const entry = SSR.entry(config, plan, { buildId: 'b' })
    const result = await entry.renderPage(new Request('https://example.test/'))
    expect(result._tag).toBe('Rendered')
    if (result._tag !== 'Rendered') throw new Error('unreachable')
    expect(result.application.html).toMatch(/data-foldkit-app="[^"]*" data-foldkit-plus-resume='/)
    expect(result.headers).toBeUndefined()
  })

  it('carries `styles` as the rendered root’s last child', async () => {
    const entry = SSR.entry(config, plan, {
      buildId: 'b',
      styles: () => '<style>p{color:red}</style>',
    })
    const body = await (
      await serve(new Request('https://example.test/', { headers: html }), entry)
    ).text()
    expect(body).toMatch(/<style>p\{color:red\}<\/style><\/[^<>]+>/)
  })

  it('refuses a plan with `meta`, which is written into a template the host owns', () => {
    const said = SSR.plan(App, {
      id: 'counter',
      state: Projection.pick(App.model.count),
      meta: () => ({ description: 'a counter' }),
    })
    expect(() => SSR.entry(config, said, { buildId: 'b' })).toThrow(
      'serve it with SSR.generate, not SSR.entry',
    )
  })

  it('answers HEAD with the same status and no body', async () => {
    const response = await serve(
      new Request('https://example.test/', { method: 'HEAD', headers: html }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('answers any other method 405, POST included while the plan has no fallback', async () => {
    const response = await serve(
      new Request('https://example.test/', { method: 'POST', headers: html, body: 'x' }),
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
  })

  it('answers OPTIONS 204 with the methods it answers, rendering nothing', async () => {
    const before = calls.init
    const response = await serve(new Request('https://example.test/', { method: 'OPTIONS' }))
    expect(response.status).toBe(204)
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(calls.init).toBe(before)
  })

  it('sets `headers(request)` over its own on every response, a preflight included', async () => {
    const entry = SSR.entry(config, plan, {
      buildId: 'b',
      headers: request => {
        const headers = new Headers({ 'cache-control': 'no-store', 'content-type': 'text/x-page' })
        headers.append('set-cookie', 'a=1')
        headers.append('set-cookie', 'b=2')
        if (request.method === 'OPTIONS')
          headers.set('access-control-allow-origin', 'https://a.test')
        return headers
      },
    })
    const page = await serve(new Request('https://example.test/', { headers: html }), entry)
    expect(page.status).toBe(200)
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(page.headers.get('content-type')).toBe('text/x-page')
    expect(page.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(page.headers.get('access-control-allow-origin')).toBeNull()
    const preflight = await serve(
      new Request('https://example.test/', { method: 'OPTIONS' }),
      entry,
    )
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://a.test')
    expect(preflight.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    const refused = await serve(new Request('https://example.test/', { method: 'PUT' }), entry)
    expect(refused.headers.get('cache-control')).toBe('no-store')
  })

  it('gives `headers` the Model a rendered page reached, and none where nothing rendered', async () => {
    const seen: Array<readonly [string, Option.Option<number>]> = []
    const entry = SSR.entry(config, plan, {
      buildId: 'b',
      headers: (request, model) => {
        seen.push([request.method, Option.map(model, ({ count }) => count)])
        return Option.match(model, {
          onNone: () => ({}),
          onSome: ({ count }) => ({ 'set-cookie': `count=${count}` }),
        })
      },
    })
    const page = await serve(new Request('https://example.test/', { headers: html }), entry)
    // The server's Model, from `init`: the browser's would not have 41.
    expect(page.headers.getSetCookie()).toEqual(['count=41'])
    await serve(new Request('https://example.test/', { method: 'OPTIONS' }), entry)
    await serve(new Request('https://example.test/', { method: 'PUT' }), entry)
    expect(seen).toEqual([
      ['GET', Option.some(41)],
      ['OPTIONS', Option.none()],
      ['PUT', Option.none()],
    ])
  })

  it.each([
    ['a value holding CR and LF', { 'set-cookie': 'a=1\r\nlocation: https://evil.test' }],
    ['a name that is no token', { 'set cookie': 'a=1' }],
    ['location, which only the entry writes', { location: 'https://evil.test' }],
    ['a header that frames the response', { 'Content-Length': '0' }],
  ])('answers `headers` giving %s 500, reporting it', async (_, given) => {
    const { reported, diagnostics } = collecting()
    const entry = SSR.entry(config, plan, {
      buildId: 'b',
      diagnostics,
      headers: (_request, model) => (Option.isSome(model) ? given : {}),
    })
    const response = await serve(new Request('https://example.test/', { headers: html }), entry)
    expect(response.status).toBe(500)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(reported).toEqual([
      expect.arrayContaining([expect.objectContaining({ _tag: 'PageFailed' })]),
    ])
  })

  it('answers `headers` that throw 500, reporting why with the request', async () => {
    const { reported, diagnostics } = collecting()
    const entry = SSR.entry(config, plan, {
      buildId: 'b',
      diagnostics,
      headers: () => {
        throw new Error('no policy today')
      },
    })
    const response = await serve(new Request('https://example.test/', { headers: html }), entry)
    expect(response.status).toBe(500)
    // An answer that rendered nothing calls them too.
    const preflight = await serve(
      new Request('https://example.test/other', { method: 'OPTIONS' }),
      entry,
    )
    expect(preflight.status).toBe(500)
    expect(reported).toEqual([
      failed('https://example.test/', 'no policy today'),
      failed('https://example.test/other', 'no policy today'),
    ])
  })

  it('leaves a hashed-asset miss to handleRequest, rendering nothing', async () => {
    const before = calls.init
    const response = await serve(new Request('https://example.test/assets/app-3f2a.js'))
    expect(response.status).toBe(404)
    expect(calls.init).toBe(before)
  })

  it('answers a plan the render refuses with 500, reporting why, never a page', async () => {
    const { reported, diagnostics } = collecting()
    const starting = {
      ...config,
      init: () => ({
        model: { count: 1, report: '' },
        commands: [{ name: 'LoadPreferences', effect: Effect.never }],
      }),
    }
    const unbooted = SSR.plan(App, { id: 'counter', state: Projection.pick(App.model.count) })
    const response = await serve(
      new Request('https://example.test/', { headers: html }),
      SSR.entry(starting, unbooted, { buildId: 'b', diagnostics }),
    )
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('The page could not be rendered.')
    expect(reported).toEqual([
      failed('https://example.test/', 'ResumeUnsafe: init returned LoadPreferences'),
    ])
  })

  it('answers 500 when the view throws or the Flags cannot be had, never rejecting', async () => {
    const { reported, diagnostics } = collecting()
    const throwing = {
      ...config,
      view: (): never => {
        throw new Error('the view broke')
      },
    }
    const broken = await serve(
      new Request('https://example.test/', { headers: html }),
      SSR.entry(throwing, plan, { buildId: 'b', diagnostics }),
    )
    expect(broken.status).toBe(500)

    const flagless = await serve(
      new Request('https://example.test/', { headers: html }),
      SSR.entry(themed, themedPlan, {
        buildId: 'b',
        flags: () => Promise.reject(new Error('the database is down')),
        diagnostics,
      }),
    )
    expect(flagless.status).toBe(500)
    expect(reported).toEqual([
      failed('https://example.test/', 'the view broke'),
      failed('https://example.test/', 'the database is down'),
    ])
  })

  it('gives each request its own Flags, which stay out of the page', async () => {
    const entry = SSR.entry(themed, themedPlan, {
      buildId: 'b',
      flags: request => ({
        theme: new URL(request.url).searchParams.get('theme') ?? 'light',
        secret: 'server-only token',
      }),
    })
    const response = await serve(
      new Request('https://example.test/?theme=dark', { headers: html }),
      entry,
    )
    const body = await response.text()
    expect(body).toMatch(/<p id="theme"[^>]*>dark<\/p>/)
    expect(body).not.toContain('server-only token')
  })
})

describe('SSR.entry status (#364)', () => {
  // `report` is the server's alone: the browser's Model never holds it, so a
  // status read from it proves which Model `status` is given.
  const missing = SSR.entry(config, plan, {
    buildId: 'b',
    status: (model, request) =>
      model.report !== '' && new URL(request.url).pathname === '/missing' ? 404 : 200,
  })

  it('answers the status the server’s Model and the request give, with the page', async () => {
    const response = await serve(
      new Request('https://example.test/missing', { headers: html }),
      missing,
    )
    expect(response.status).toBe(404)
    expect(await response.text()).toContain(RESUME_ATTRIBUTE)
    const found = await serve(new Request('https://example.test/', { headers: html }), missing)
    expect(found.status).toBe(200)
  })

  it('carries no status without one, so the page stays generatable', async () => {
    const result = await SSR.entry(config, plan, { buildId: 'b' }).renderPage(
      new Request('https://example.test/'),
    )
    expect(result).not.toHaveProperty('status')
  })

  it.each([
    {
      given: 'no status a response can have',
      status: () => 99,
      reason: 'status gave 99 for the page',
    },
    {
      given: 'a fraction',
      status: () => 404.5,
      reason: 'status gave 404.5 for the page',
    },
    {
      given: 'a status that throws',
      status: () => {
        throw new Error('no route today')
      },
      reason: 'no route today',
    },
  ])('answers $given 500, reporting why', async ({ status, reason }) => {
    const { reported, diagnostics } = collecting()
    const entry = SSR.entry(config, plan, { buildId: 'b', diagnostics, status })
    const response = await serve(new Request('https://example.test/', { headers: html }), entry)
    expect(response.status).toBe(500)
    expect(reported).toEqual([failed('https://example.test/', reason)])
  })
})

describe('SSR.entry prerendered (#373)', () => {
  const matchOf = async (entry: ReturnType<typeof SSR.entry>, url: string) => {
    const result = await entry.renderPage(new Request(url))
    if (result._tag !== 'Rendered') throw new Error('not rendered')
    const carried = new RegExp(`${RESUME_ATTRIBUTE}='([^']*)'`).exec(result.application.html)?.[1]
    return JSON.parse((carried ?? '{}').replaceAll('&#39;', "'").replaceAll('&amp;', '&')).match
  }

  it('records the path alone for a prerendered path with no query, and the route otherwise', async () => {
    const entry = SSR.entry(config, plan, { buildId: 'b', prerendered: ['/', '/docs/'] })
    expect(await matchOf(entry, 'https://example.test/')).toBe('path')
    expect(await matchOf(entry, 'https://example.test/docs')).toBe('path')
    expect(await matchOf(entry, 'https://example.test/?q=a')).toBeUndefined()
    expect(await matchOf(entry, 'https://example.test/other')).toBeUndefined()
  })

  it.each(['about', '/about?x=1', '/about#top'])('refuses %s, which no file is served at', path => {
    expect(() => SSR.entry(config, plan, { buildId: 'b', prerendered: [path] })).toThrow(
      `"${path}" in prerendered is not a path a file can be served at`,
    )
  })
})
