/**
 * Phase E: a form works with scripts off. The server writes the Message into
 * the form, and a POST of it runs Foldkit's loop once on the server and
 * answers with the page that results.
 */
import { Effect } from 'effect'
import { handleRequest } from 'foldkit/experimental/server'
import { describe, expect, it, vi } from 'vitest'
import type { HtmlBuilder } from 'foldkit/html'
import { FALLBACK_FIELD, Resume, SSR } from 'foldkit-ssr'
import { App, Message, config, plan, template, type Model } from './fallbackFixture.js'

const html = { accept: 'text/html' }
const entry = SSR.entry(config, plan, { buildId: 'b', template })
const serve = (request: Request, used = entry) =>
  handleRequest(request, { renderPage: used.renderPage, template })

const post = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields)
  return new Request('https://example.test/todos?view=all', {
    method: 'POST',
    headers: { ...html, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
}

const added = JSON.stringify({ _tag: 'Added', title: '' })

describe('the form the server writes', () => {
  it('posts its Message to its own URL, with the Message in a hidden input', async () => {
    const { rendered } = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    expect(rendered.html).toMatch(/<form[^>]* method="post"/)
    expect(rendered.html).not.toContain('action=')
    expect(rendered.html).toContain(
      `<input type="hidden" name="${FALLBACK_FIELD}" value="{&quot;_tag&quot;:&quot;Added&quot;,&quot;title&quot;:&quot;&quot;}">`,
    )
  })

  it('leaves a form with no submit handler alone', async () => {
    const closing = {
      ...config,
      view: (model: Model, h: HtmlBuilder<Message>) => {
        const rh = Resume.builder(h)
        return {
          title: 'Todos',
          body: rh.form([rh.Id('plain')], [rh.p([], [model.draft])]),
        }
      },
    }
    const { rendered } = await Effect.runPromise(SSR.render(closing, plan, { buildId: 'b' }))
    expect(rendered.html).not.toContain('method=')
    expect(rendered.html).not.toContain(FALLBACK_FIELD)
  })

  it('is a plain form when the plan has no fallback', async () => {
    const eager = SSR.plan(App, { id: 'todos', state: plan.state, surfaces: plan.surfaces })
    const { rendered } = await Effect.runPromise(SSR.render(config, eager, { buildId: 'b' }))
    expect(rendered.html).not.toContain('method=')
    expect(rendered.html).not.toContain(FALLBACK_FIELD)
  })
})

describe('SSR.handle through handleRequest', () => {
  it('runs update, its Command under resources, and boot, then answers with the page', async () => {
    const response = await serve(post({ title: 'Milk', [FALLBACK_FIELD]: added }))
    expect(response.status).toBe(200)
    const body = await response.text()
    // The posted title overrode the Message's empty one.
    expect(body).toContain('<li>Served</li><li>Milk</li>')
    // The Command ran with the Counter service and its Message was folded in.
    expect(body).toContain('<p id="noted">20</p>')
    // The plan's boot ran before the Message did.
    expect(body).toContain('<p id="booted">true</p>')
    // The page is a resumable one, for the browser that gets it.
    expect(body).toContain('"plan":"todos"')
    expect(body).toContain('"todos":["Served","Milk"]')
  })

  it('folds nothing for a Command that yields no Message, and still answers the page', async () => {
    const response = await serve(post({ [FALLBACK_FIELD]: JSON.stringify(Message.Pinged()) }))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<li>Served</li>')
  })

  it('answers 500, naming the Command, when the Commands never settle', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await serve(post({ [FALLBACK_FIELD]: JSON.stringify(Message.Polled()) }))
    expect(response.status).toBe(500)
    expect(String(logged.mock.calls[0]?.[0])).toContain('the last Command run was "Poll"')
    logged.mockRestore()
  })

  it('refuses a Message no active Surface lists', async () => {
    const response = await serve(post({ [FALLBACK_FIELD]: JSON.stringify(Message.Cleared()) }))
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Cleared is not one an active Surface lists')
  })

  it('refuses a post without the Message, or one that is not a Message', async () => {
    expect((await serve(post({ title: 'Milk' }))).status).toBe(400)
    const broken = await serve(post({ [FALLBACK_FIELD]: '{"_tag":"Added"}' }))
    expect(broken.status).toBe(400)
    expect(await broken.text()).toContain('does not decode')
    expect((await serve(post({ [FALLBACK_FIELD]: 'not json' }))).status).toBe(400)
    // The posted Message must be one before a field is set into it.
    const patched = await serve(
      post({ title: 'Milk', [FALLBACK_FIELD]: '{"_tag":"Added","title":5}' }),
    )
    expect(patched.status).toBe(400)
    const deep = await serve(post({ [FALLBACK_FIELD]: added, 'foldkit-plus-depth': '-1' }))
    expect(deep.status).toBe(400)
    expect(await deep.text()).toContain('foldkit-plus-depth is not a depth')
  })

  it('answers POST 405 for a plan with no fallback', async () => {
    const eager = SSR.plan(App, { id: 'todos', state: plan.state, surfaces: plan.surfaces })
    const response = await serve(
      post({ [FALLBACK_FIELD]: added }),
      SSR.entry(config, eager, { buildId: 'b', template }),
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  it('still answers GET, and names POST among the allowed methods', async () => {
    const page = await serve(new Request('https://example.test/todos', { headers: html }))
    expect(page.status).toBe(200)
    const other = await serve(
      new Request('https://example.test/todos', { method: 'PUT', headers: html }),
    )
    expect(other.status).toBe(405)
    expect(other.headers.get('allow')).toBe('GET, HEAD, POST')
  })
})
