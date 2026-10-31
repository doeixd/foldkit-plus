// @vitest-environment node
/**
 * The page as the Worker serves it, read as a browser with scripts off
 * would: everything shown is in the HTML, the search and the filters are the
 * address, the list pages by `?from=`, and the cart is a form the server
 * answers by running `update`.
 */
import { parse } from 'parse5'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { FALLBACK_FIELD } from 'foldkit-ssr'
import { renderPage } from '../src/server/entry.js'

// The build's id, which `vite build` gives both bundles; the entry reads it per request.
beforeAll(() => {
  vi.stubEnv('FOLDKIT_BUILD_ID', 'page-test')
})

type Node = {
  readonly nodeName: string
  readonly attrs?: ReadonlyArray<{ readonly name: string; readonly value: string }>
  readonly childNodes?: ReadonlyArray<Node>
  readonly value?: string
}

const ORIGIN = 'https://domains.test'

const all = (node: Node): ReadonlyArray<Node> => [
  node,
  ...(node.childNodes ?? []).flatMap(child => all(child)),
]
const attr = (node: Node, name: string) => node.attrs?.find(a => a.name === name)?.value
const classes = (node: Node) => (attr(node, 'class') ?? '').split(/\s+/)
const textOf = (node: Node): string =>
  node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(textOf).join('')

/** A page as the entry answers it: its status, headers and parsed application markup. */
const answer = async (path: string, init?: RequestInit) => {
  const result = await renderPage(new Request(`${ORIGIN}${path}`, init))
  if (result._tag !== 'Rendered') {
    return { status: result.response.status, headers: result.response.headers, nodes: [] }
  }
  return {
    status: result.status ?? 200,
    headers: new Headers(result.headers),
    nodes: all(parse(result.application.html) as Node),
  }
}

const byId = (nodes: ReadonlyArray<Node>, id: string) => nodes.find(node => attr(node, 'id') === id)
/** The rows of All Results drawn, as their names. */
const rowNames = (nodes: ReadonlyArray<Node>) =>
  all(byId(nodes, 'domain-results')!)
    .filter(node => classes(node).includes('domain-row'))
    .map(node => /^[a-z0-9-]+(?:[.][a-z]+)+/.exec(textOf(node))?.[0])
const pagingLinks = (nodes: ReadonlyArray<Node>) =>
  Object.fromEntries(
    nodes
      .filter(node => node.nodeName === 'a' && attr(node, 'rel') !== undefined)
      .map(node => [attr(node, 'rel'), attr(node, 'href')]),
  )

/** A cart form's post, as a browser without scripts sends it from this site. */
const post = (path: string, message: unknown, headers: Record<string, string> = {}) =>
  answer(path, {
    method: 'POST',
    headers: { origin: ORIGIN, ...headers },
    body: new URLSearchParams({ [FALLBACK_FIELD]: JSON.stringify(message) }),
  })

describe('a search served without scripts', () => {
  test('prices every card and row it shows, and draws no pending row', async () => {
    const { status, nodes } = await answer('/?q=acme')
    expect(status).toBe(200)
    const cards = nodes.filter(node => classes(node).includes('domain-card'))
    const rows = all(byId(nodes, 'domain-results')!).filter(node =>
      classes(node).includes('domain-row'),
    )
    expect(cards).toHaveLength(4)
    // The rows of the list's first window: more than one screen's worth.
    expect(rows.length).toBeGreaterThan(30)
    for (const shown of [...cards, ...rows]) {
      const text = textOf(shown)
      expect(text.includes('$') || text.includes('Not available'), text).toBe(true)
    }
    expect(textOf(nodes[0]!)).toMatch(/\d+ of 556 domains checked/)
  })

  test('the filters are read from the address, and their selects say what is chosen', async () => {
    const { nodes } = await answer('/?q=acme&availability=Available&sort=PriceDescending')
    const chosen = nodes
      .filter(node => node.nodeName === 'option' && attr(node, 'selected') !== undefined)
      .map(node => attr(node, 'value'))
    expect(chosen).toEqual(['All', 'Available', 'PriceDescending'])
    const prices = all(byId(nodes, 'domain-results')!)
      .filter(node => classes(node).includes('price'))
      .map(node => Number(textOf(node).replace(/[^\d.]/g, '')))
    expect(prices.length).toBeGreaterThan(30)
    expect(prices).toEqual([...prices].sort((a, b) => b - a))
    expect(textOf(byId(nodes, 'domain-results')!)).not.toContain('Not available')
  })

  test('the list draws from ?from=, with links to the rows before and after', async () => {
    const first = await answer('/?q=acme')
    const links = pagingLinks(first.nodes)
    expect(links.prev).toBeUndefined()
    expect(links.next).toBe('/?q=acme&from=11')
    const opened = await answer(links.next!)
    const rows = all(byId(opened.nodes, 'domain-results')!).filter(
      node => attr(node, 'role') === 'listitem',
    )
    // The twelfth row first, and no name the first page drew.
    expect(attr(rows[0]!, 'aria-posinset')).toBe('12')
    const drawn = new Set(rowNames(first.nodes))
    expect(rowNames(opened.nodes).filter(name => drawn.has(name))).toEqual([])
    expect(pagingLinks(opened.nodes)).toEqual({ prev: '/?q=acme', next: '/?q=acme&from=24' })
  })

  test('an address past the last row draws the last rows, and no next', async () => {
    const { status, nodes } = await answer('/?q=acme&from=9999')
    expect(status).toBe(200)
    const rows = all(byId(nodes, 'domain-results')!).filter(
      node => attr(node, 'role') === 'listitem',
    )
    // The list's last row is drawn: 556 names in rows of six.
    expect(rows.map(row => attr(row, 'aria-posinset'))).toContain('93')
    expect(pagingLinks(nodes).next).toBeUndefined()
    expect(pagingLinks(nodes).prev).toMatch(/^\/\?q=acme&from=\d+$/)
  })
})

describe('the cart without scripts', () => {
  const add = { _tag: 'ClickedAddDomain', name: 'acme.com' }

  test('a post adds the name at the price the server read, and keeps it in a cookie', async () => {
    const { status, headers, nodes } = await post('/?q=acme', add)
    expect(status).toBe(200)
    expect(headers.get('set-cookie')).toMatch(/^cart=acme\.com; Path=\/; HttpOnly; SameSite=Lax/)
    expect(headers.get('cache-control')).toBe('private, no-store')
    expect(textOf(byId(nodes, 'cart')!)).toContain('acme.com')
    expect(textOf(byId(nodes, 'cart')!)).toContain('$12')
  })

  test('the cookie brings the cart to the next page, priced again by the server', async () => {
    const { headers, nodes } = await answer('/?q=other', {
      headers: { cookie: 'cart=acme.com|vercel.com|acme.nope|acme.com' },
    })
    expect(headers.get('cache-control')).toBe('private, no-store')
    // A name the demo marks taken, one it does not know, and a repeat are dropped.
    const items = all(byId(nodes, 'cart')!).filter(node => node.nodeName === 'li')
    expect(items.map(item => textOf(item).split('$')[0])).toEqual(['acme.com'])
  })

  test('a removal posted with the cookie takes the name out and clears the cookie', async () => {
    const { headers, nodes } = await post(
      '/?q=acme',
      { _tag: 'ClickedRemoveDomain', name: 'acme.com' },
      { cookie: 'cart=acme.com' },
    )
    expect(headers.get('set-cookie')).toMatch(/^cart=; .*Max-Age=0/)
    expect(textOf(byId(nodes, 'cart')!)).not.toContain('acme.com')
  })

  test('a post naming a name the page did not read as available adds nothing', async () => {
    const { headers } = await post('/?q=acme', { _tag: 'ClickedAddDomain', name: 'vercel.com' })
    expect(headers.get('set-cookie')).toMatch(/^cart=; /)
  })

  test.each([
    ['another origin', add, { origin: 'https://elsewhere.test' }, 403],
    ['a Message no control posts', { _tag: 'ClickedCart' }, {}, 400],
    ['a name too long to be one', { ...add, name: 'a'.repeat(500) }, {}, 400],
  ] as const)('a post from %s is refused', async (_, message, headers, status) => {
    expect((await post('/?q=acme', message, headers)).status).toBe(status)
  })
})
