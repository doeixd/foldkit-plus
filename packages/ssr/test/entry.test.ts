/**
 * Phase 6: `SSR.entry` is the `renderPage` Foldkit's pipeline calls, so a
 * resumed page is served through `handleRequest` as any Foldkit page is. The
 * host owns the template: the entry answers `Rendered`, with the envelope in
 * the rendered root, and never splices markup into a template of its own.
 */
import { Effect } from 'effect'
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
    expect(result.application.html).toMatch(/data-foldkit-app="[^"]*" data-foldkit-plus-resume="/)
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
    expect(reported).toEqual([failed('https://example.test/', 'no policy today')])
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
