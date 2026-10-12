// @vitest-environment jsdom
/**
 * The pages the build writes, read back through an HTML parser as a browser
 * reads them: the home page's cards and examples, the demos, a subsite's
 * sidebar, its API pages, and every link on every page leading somewhere that
 * exists.
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

/** What the link check needs of a page: the ids it carries and where it links. */
interface Links {
  readonly ids: ReadonlySet<string>
  readonly hrefs: ReadonlyArray<string>
}

/**
 * The pages the tests read whole. Of every other page only its links are kept:
 * three thousand parsed documents do not fit in a test worker's memory.
 */
const READ = [
  '/',
  '/demos',
  '/404.html',
  '/remote/guides/live-data',
  '/ssr/api/ssr',
  '/ssr/api/ssr/ssr',
]

const hrefs = (root: ParentNode, selector = 'a') =>
  Array.from(root.querySelectorAll(selector), a => a.getAttribute('href') ?? '')

let links: ReadonlyMap<string, Links>
let read: ReadonlyMap<string, Document>
let sitemap = ''

beforeAll(async () => {
  const built = await Effect.runPromise(
    generateStaticSite({ ...site, buildId: 'test-build', template }),
  )
  sitemap = built.sitemap ?? ''
  const parser = new DOMParser()
  const kept = new Map<string, Document>()
  links = new Map(
    built.pages.map(page => {
      const document = parser.parseFromString(page.html, 'text/html')
      if (READ.includes(page.path)) kept.set(page.path, document)
      const ids = new Set(Array.from(document.querySelectorAll('[id]'), element => element.id))
      return [page.path, { ids, hrefs: hrefs(document) }] as const
    }),
  )
  read = kept
}, 600_000)

const page = (path: string): Document => {
  const found = read.get(path)
  if (found === undefined) throw new Error(`no page read at ${path}`)
  return found
}

describe('the generated site', () => {
  test('has a home page, the demos, a not-found page and every subsite, with a sitemap', () => {
    for (const path of [
      '/',
      '/demos',
      '/404.html',
      ...allSubsites.map(subsite => `/${subsite.id}`),
    ])
      expect(links.has(path), path).toBe(true)
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

  test("a subsite's API lists its entry points, each leading to a page per export", () => {
    const entry = page('/ssr/api/ssr')
    const sidebar = (at: Document) => hrefs(at, 'nav[aria-label="Documentation"] a')
    expect(sidebar(entry)).toEqual(
      expect.arrayContaining(['/ssr/api/ssr', '/ssr/api/ssr-client', '/ssr/api/ssr-vite']),
    )
    // An export's page is not in the sidebar; its entry point is marked instead.
    expect(sidebar(entry)).not.toContain('/ssr/api/ssr/ssr')
    expect(hrefs(entry, 'article table a')).toContain('/ssr/api/ssr/ssr')

    const ssr = page('/ssr/api/ssr/ssr')
    expect(ssr.querySelector('article h1')?.textContent).toBe('SSR')
    expect(hrefs(ssr, 'nav[aria-label="Documentation"] [aria-current="location"]')).toEqual([
      '/ssr/api/ssr',
    ])
    const plan = ssr.getElementById('plan')
    expect(plan?.textContent).toContain('SSR.plan')
    expect(plan?.parentElement?.querySelector('pre')?.textContent).toContain('plan<Model')
    expect(plan?.parentElement?.textContent).toContain('A resume plan for an application.')
  })

  test('every link on every page leads to a page the build wrote, or a file in the repository', () => {
    const broken: Array<string> = []
    for (const [path, at] of links)
      for (const href of at.hrefs) {
        if (href.startsWith('/') || href.startsWith('#')) {
          const [target = '', anchor] = href.split('#')
          const to = target === '' ? at : links.get(target)
          if (to === undefined) broken.push(`${path} -> ${href}`)
          else if (anchor !== undefined && anchor !== '' && !to.ids.has(anchor))
            broken.push(`${path} -> ${href} (no #${anchor})`)
        } else if (href.startsWith(`${GITHUB}/blob/`) || href.startsWith(`${GITHUB}/tree/`)) {
          const file = href.slice(`${GITHUB}/blob/main/`.length).split('#')[0]!
          if (!existsSync(join(repository, decodeURIComponent(file))))
            broken.push(`${path} -> ${href}`)
        }
      }
    expect(broken).toEqual([])
  })
})
