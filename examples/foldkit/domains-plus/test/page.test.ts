// @vitest-environment node
/**
 * The page as the Worker serves it, read as a browser with scripts off
 * would: everything shown is in the HTML.
 */
import { parse } from 'parse5'
import { beforeAll, describe, expect, test, vi } from 'vitest'
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

const all = (node: Node): ReadonlyArray<Node> => [
  node,
  ...(node.childNodes ?? []).flatMap(child => all(child)),
]
const attr = (node: Node, name: string) => node.attrs?.find(a => a.name === name)?.value
const classes = (node: Node) => (attr(node, 'class') ?? '').split(/\s+/)
const textOf = (node: Node): string =>
  node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(textOf).join('')

/** The served page's application markup, parsed as a browser would. */
const served = async (path: string, init?: RequestInit) => {
  const result = await renderPage(new Request(`https://domains.test${path}`, init))
  if (result._tag !== 'Rendered') throw new Error(`${path} was answered without a page`)
  return { status: result.status ?? 200, nodes: all(parse(result.application.html) as Node) }
}

describe('a search served without scripts', () => {
  test('prices every card and row it shows, and draws no pending row', async () => {
    const { status, nodes } = await served('/?q=acme')
    expect(status).toBe(200)
    const cards = nodes.filter(node => classes(node).includes('domain-card'))
    const list = nodes.find(node => attr(node, 'id') === 'domain-results')!
    const rows = all(list).filter(node => classes(node).includes('domain-row'))
    expect(cards).toHaveLength(4)
    // The rows of the list's first window: more than one screen's worth.
    expect(rows.length).toBeGreaterThan(30)
    for (const shown of [...cards, ...rows]) {
      const text = textOf(shown)
      expect(text.includes('$') || text.includes('Not available'), text).toBe(true)
    }
    expect(textOf(nodes[0]!)).toMatch(/\d+ of 556 domains checked/)
  })
})
