/**
 * Phase 6: `SSR.entry` is the `renderPage` Foldkit's fetch handler calls, so a
 * resumed page is served through `handleRequest` as any Foldkit page is.
 */
import { Effect } from 'effect'
import { handleRequest } from 'foldkit/experimental/server'
import { Projection } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESUME_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { config as themed, plan as themedPlan } from './flagsFixture.js'
import { App, calls, config, plan, template } from './handoverFixture.js'

const html = { accept: 'text/html' }
const serve = (request: Request, entry = SSR.entry(config, plan, { buildId: 'b', template })) =>
  handleRequest(request, { renderPage: entry.renderPage, template })

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('answers HEAD with the same status and no body', async () => {
    const response = await serve(
      new Request('https://example.test/', { method: 'HEAD', headers: html }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('answers any other method 405, until the server fallback exists', async () => {
    const response = await serve(
      new Request('https://example.test/', { method: 'POST', headers: html, body: 'x' }),
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  it('leaves a hashed-asset miss to handleRequest, rendering nothing', async () => {
    const before = calls.init
    const response = await serve(new Request('https://example.test/assets/app-3f2a.js'))
    expect(response.status).toBe(404)
    expect(calls.init).toBe(before)
  })

  it('answers a plan the render refuses with 500, logging why, never a page', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
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
      SSR.entry(starting, unbooted, { buildId: 'b', template }),
    )
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('The page could not be rendered.')
    expect(logged.mock.calls.flat().join(' ')).toContain(
      'https://example.test/ was not rendered: init returned LoadPreferences',
    )
  })

  it('gives each request its own Flags, which stay out of the page', async () => {
    const entry = SSR.entry(themed, themedPlan, {
      buildId: 'b',
      template,
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
