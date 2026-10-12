// @vitest-environment jsdom
/**
 * The pages the build writes, read back through an HTML parser as a browser
 * reads them: the home page's cards and examples, the demos, a subsite's
 * sidebar, and every link on every page leading somewhere that exists.
 */
import { Effect } from 'effect'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'

import { allSubsites, subsites } from '../src/catalog.js'
import { GITHUB } from '../src/content/guides.js'
import { demos, onGitHub } from '../src/demos.js'
import { site } from '../src/site.js'

const repository = join(import.meta.dirname, '../../..')
const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

let pages: ReadonlyMap<string, Document>
let sitemap = ''

beforeAll(async () => {
  const built = await Effect.runPromise(
    generateStaticSite({ ...site, buildId: 'test-build', template }),
  )
  sitemap = built.sitemap ?? ''
  pages = new Map(
    built.pages.map(page => [page.path, new DOMParser().parseFromString(page.html, 'text/html')]),
  )
}, 240_000)

const page = (path: string): Document => {
  const found = pages.get(path)
  if (found === undefined) throw new Error(`no page at ${path}`)
  return found
}
const hrefs = (root: ParentNode, selector = 'a') =>
  Array.from(root.querySelectorAll(selector), a => a.getAttribute('href') ?? '')

describe('the generated site', () => {
  test('has a home page, the demos, a not-found page and every subsite, with a sitemap', () => {
    for (const path of [
      '/',
      '/demos',
      '/404.html',
      ...allSubsites.map(subsite => `/${subsite.id}`),
    ])
      expect(pages.has(path), path).toBe(true)
    expect(sitemap).toContain('<loc>https://foldkit-plus.pages.dev/remote</loc>')
    expect(page('/404.html').querySelector('h1')?.textContent).toContain('Not found')
  })

  test('the home page has a card for each package family, leading to its subsite', () => {
    expect(hrefs(page('/'), '#packages a')).toEqual(subsites.map(subsite => `/${subsite.id}`))
  })

  test('the home page shows one example at a time, each coloured by the build', () => {
    const home = page('/')
    const tabs = Array.from(home.querySelectorAll('[role="tab"]'))
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])
    const panels = Array.from(home.querySelectorAll('[role="tabpanel"]'))
    expect(panels.map(panel => panel.hasAttribute('hidden'))).toEqual([false, true, true, true])
    expect(panels[1]?.querySelector('pre')?.textContent).toContain('Agent.forApplication(App)')
    expect(panels[1]?.querySelector('pre span[style*="light-dark"]')).not.toBeNull()
  })

  test('the demos page has a row for each demo, with the way in, its code and its packages', () => {
    const rows = Array.from(page('/demos').querySelectorAll('main ul > li'))
    expect(rows.map(row => row.querySelector('h3')?.textContent)).toEqual(
      demos.map(demo => demo.title),
    )
    rows.forEach((row, index) => {
      const demo = demos[index]!
      expect(hrefs(row)).toEqual([
        demo.url,
        ...demo.packages.map(name => onGitHub(`packages/${name}/README.md`)),
        demo.url,
        onGitHub(demo.readFirst),
      ])
    })
  })

  test('a subsite page lists its guides, marks itself, and names its family in the title', () => {
    const live = page('/remote/guides/live-data')
    expect(live.title).toBe('Live data · Remote · Foldkit Plus')
    expect(hrefs(live, 'nav[aria-label="Site"] [aria-current="page"]')).toEqual(['/#packages'])
    expect(hrefs(live, 'nav[aria-label="Documentation"] [aria-current="page"]')).toEqual([
      '/remote/guides/live-data',
    ])
    expect(live.querySelector('article h1')?.textContent).toBe('Live data')
    expect(hrefs(live, 'nav[aria-label="Documentation"] a')).toContain(
      '/remote/guides/remote-server',
    )
  })

  test('every link on every page leads to a page the build wrote, or a file in the repository', () => {
    const broken: Array<string> = []
    for (const [path, document] of pages)
      for (const href of hrefs(document)) {
        if (href.startsWith('/')) {
          const [target = '', anchor] = href.split('#')
          const at = target === '' ? document : pages.get(target)
          if (at === undefined) broken.push(`${path} -> ${href}`)
          else if (anchor !== undefined && anchor !== '' && at.getElementById(anchor) === null)
            broken.push(`${path} -> ${href} (no #${anchor})`)
        } else if (href.startsWith('#')) {
          if (href.length > 1 && document.getElementById(href.slice(1)) === null)
            broken.push(`${path} -> ${href}`)
        } else if (href.startsWith(`${GITHUB}/blob/`) || href.startsWith(`${GITHUB}/tree/`)) {
          const file = href.replace(/^.*?\/(blob|tree)\/main\//, '').split('#')[0]!
          if (!existsSync(join(repository, decodeURIComponent(file))))
            broken.push(`${path} -> ${href}`)
        }
      }
    expect(broken).toEqual([])
  })
})
