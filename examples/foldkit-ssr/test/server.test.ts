// @vitest-environment jsdom
/**
 * `entry.server.ts` answering requests in process, and its pages read back
 * through an HTML parser, as a browser reads them: a server markup the parser
 * rebuilds differently is one the browser cannot adopt.
 */
import { describe, expect, test, vi } from 'vitest'

import { COUNT_COOKIE } from '../src/cookie.js'
import { buildId, pageRequest, respond } from './helpers.js'

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html')

const rootOf = (page: Document): HTMLElement => {
  const root = page.querySelector<HTMLElement>('[data-foldkit-app]')
  if (root === null) throw new Error('no rendered application')
  return root
}

const pageFor = async (
  cookie?: string,
): Promise<{ readonly html: string; readonly page: Document }> => {
  const response = await respond(pageRequest(cookie === undefined ? {} : { cookie }))
  expect(response.status).toBe(200)
  const html = await response.text()
  return { html, page: parse(html) }
}

const envelopeOf = (page: Document): unknown =>
  JSON.parse(rootOf(page).getAttribute('data-foldkit-plus-resume') ?? 'null')

describe('a page request', () => {
  test.each([
    ['with no cookie', undefined, 0],
    ['with a count cookie', `${COUNT_COOKIE}=12`, 12],
    ['with a count cookie that is not a count', `${COUNT_COOKIE}=twelve`, 0],
  ])('%s renders that count, titled with it', async (_case, cookie, count) => {
    const { page } = await pageFor(cookie)
    expect(page.getElementById('count')?.textContent).toBe(String(count))
    expect(page.title).toBe(`Count ${count}`)
  })

  test('says the server rendered it, and when', async () => {
    const before = Date.now()
    const { page } = await pageFor()
    const provenance = page.getElementById('provenance')?.textContent ?? ''
    const at = /^Rendered on the Server at (.+)$/.exec(provenance)?.[1] ?? ''
    expect(Date.parse(at)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(at)).toBeLessThanOrEqual(Date.now())
  })

  test('carries the Model it rendered, and not the Flags', async () => {
    const { page } = await pageFor(`${COUNT_COOKIE}=5`)
    const provenance = page.getElementById('provenance')?.textContent ?? ''
    expect(envelopeOf(page)).toEqual({
      v: 1,
      plan: 'ssr',
      state: {
        count: 5,
        renderedAt: provenance.replace('Rendered on the Server at ', ''),
        renderedOn: 'Server',
      },
      route: '/',
    })
    expect(page.querySelector('[data-foldkit-flags]')).toBeNull()
  })

  test('is the markup a parser builds from it', async () => {
    const { html, page } = await pageFor(`${COUNT_COOKIE}=3`)
    // Except for the one newline a parser drops after <pre> and <textarea>,
    // which the server writes so the text keeps the newline it starts with.
    const parsed = html.replace(/(<(?:pre|textarea)\b[^>]*>)\n/g, '$1')
    expect(parsed).toContain(rootOf(page).outerHTML)
  })

  test('keeps the parse-equivalence elements as the browser reads them', async () => {
    const { page } = await pageFor()
    expect(page.querySelector('pre')?.textContent).toBe('\nleading')
    expect(page.querySelector('textarea')?.value).toBe('\nleading')
    expect(page.querySelector('select')?.value).toBe('a')
  })

  test('is stamped with the build both entries were compiled as', async () => {
    const { page } = await pageFor()
    expect(rootOf(page).getAttribute('data-foldkit-build')).toBe(buildId)
  })

  test('entry.server.ts exposes the pipeline renderPage', async () => {
    vi.stubEnv('FOLDKIT_BUILD_ID', buildId)
    const { renderPage } = await import('../src/entry.server.js')
    const result = await renderPage(new Request('http://localhost/'))
    expect(result._tag).toBe('Rendered')
    vi.unstubAllEnvs()
  })

  test('styles its first paint from the rendered root, with no head styles', async () => {
    const { page } = await pageFor()
    expect(Array.from(page.head.querySelectorAll('style'))).toEqual([])
    const root = rootOf(page)
    const css = Array.from(
      root.querySelectorAll(':scope > style'),
      style => style.textContent ?? '',
    ).join('')
    const drawn = new Set(
      Array.from(root.querySelectorAll('[class]')).flatMap(element =>
        Array.from(element.classList),
      ),
    )
    expect(drawn.size).toBeGreaterThan(0)
    expect([...drawn].filter(name => !css.includes(`.${name}{`))).toEqual([])
  })

  test('may be kept by no cache, since it is one visitor’s count', async () => {
    const response = await respond(pageRequest())
    expect(
      ['cache-control', 'vary', 'x-content-type-options'].map(name => response.headers.get(name)),
    ).toEqual(['private, no-store', 'cookie', 'nosniff'])
  })
})

describe('other methods', () => {
  test('a preflight is answered by the entry, allowing nothing', async () => {
    const response = await respond(pageRequest({ method: 'OPTIONS' }))
    expect(response.status).toBe(204)
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  test('HEAD answers the page’s headers without its body', async () => {
    const response = await respond(pageRequest({ method: 'HEAD' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await response.text()).toBe('')
  })

  test.each(['POST', 'PUT', 'DELETE'])('%s is refused: the page answers no form', async method => {
    const response = await respond(pageRequest({ method }))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
  })
})
