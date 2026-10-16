// @vitest-environment jsdom
/**
 * The pages the build writes, read back through an HTML parser as a browser
 * reads them: the home page's cards and examples, the demos, a subsite's
 * sidebar, its API pages, and every link on every page leading somewhere that
 * exists.
 */
import { Effect } from 'effect'
import { schemeScript } from 'foldkit-mixins/theme'
import { STATIC_ATTRIBUTE } from 'foldkit-ssr/client'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'

import { allSubsites, subsites } from '../src/catalog.js'
import { GITHUB } from '../src/content/guides.js'
import { demos, onGitHub } from '../src/demos.js'
import { showcases } from '../src/gallery/showcases.js'
import { codeOf, defaults } from '../src/gallery/theme.js'
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
  '/primitives/api/primitives-time/throttle',
  '/primitives',
  '/components',
  '/components/button',
  '/components/radio-group',
  '/components/alert',
  '/components/badge',
  '/components/checkbox',
  '/create',
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

  test("applies the reader's scheme in the head, before any style", () => {
    const head = page('/').head
    const first = head.querySelector('script:not([type]), style')
    expect(first?.tagName).toBe('SCRIPT')
    expect(first?.textContent).toBe(schemeScript())
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
    expect(panels[1]?.querySelector('pre [data-kind="syntax-keyword"]')?.textContent).toBe('import')
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
    // A fence is a code block: named by its language, with a button the page's script answers.
    // Code that names an export leads to it.
    expect(hrefs(live, 'article a.code-link')).toContain('/remote/api/remote/remotemodel#streams')
    const fence = live.querySelector('article figure')
    expect(fence?.querySelector('[data-copy-code]')?.textContent).toBe('Copy')
    expect(fence?.querySelector('pre code')?.textContent).toContain('break -> gap marked')
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
    // The guides that name it are listed under it.
    expect(hrefs(ssr, '.mentions a')).toEqual(expect.arrayContaining(['/ssr/guides/a-first-page']))
    // Before the members, where a reader looking for it at work stops first.
    expect(
      Array.from(ssr.querySelectorAll('article h2[id]'), heading => heading.id).slice(0, 2),
    ).toEqual(['in-the-guides', 'members'])
    const plan = ssr.getElementById('plan')
    expect(plan?.textContent).toContain('SSR.plan')
    expect(plan?.parentElement?.querySelector('pre')?.textContent).toContain('plan<Model')
    expect(plan?.parentElement?.textContent).toContain('A resume plan for an application.')
  })

  test('an export two entry points share has one page, under the entry point beside it', () => {
    const at = (path: string) => links.get(path)?.hrefs ?? []
    expect(links.has('/primitives/api/primitives-time/timer')).toBe(true)
    expect(links.has('/primitives/api/primitives/timer')).toBe(false)
    // The root's index still lists it, and leads there.
    expect(at('/primitives/api/primitives')).toContain('/primitives/api/primitives-time/timer')
    // With one page, the name links from prose: the subpath's guide is on the site.
    expect(at('/primitives/guides/time')).toContain('/primitives/api/primitives-time/timer')
  })

  test("a Bundle's page says what placing it involves before its full type", () => {
    const throttle = page('/primitives/api/primitives-time/throttle')
    const rows = Array.from(throttle.querySelectorAll('article .bundle tr'), row => [
      row.querySelector('th')?.textContent,
      row.querySelector('td')?.textContent,
    ])
    expect(rows).toEqual([
      ['Args', '{ intervalMs: number }'],
      ['Model', '{ lastAt: number | null }'],
      ['Messages', 'Attempted, Evaluated { now: number }'],
      ['OutMessages', 'Throttled { at: number }'],
    ])
    expect(throttle.querySelector('article details.full-type pre')?.textContent).toContain(
      'Bundle.Bundle<',
    )
  })

  test('the Primitives overview runs two primitives between its article and its pager', () => {
    const overview = page('/primitives')
    const parts = Array.from(overview.querySelector('article')?.children ?? [], part =>
      part.tagName === 'SECTION' ? 'live' : (part.getAttribute(STATIC_ATTRIBUTE) ?? ''),
    )
    expect(parts).toEqual(['article', 'live', 'pager'])
    const live = overview.querySelector('article > section')
    expect(live?.textContent).toContain('model.dark = { matches: false }')
    expect(live?.querySelector('button')?.textContent).toBe('Start')
    // Only there: another page has its pager straight after its article.
    expect(page('/remote/guides/live-data').querySelector('article > section')).toBeNull()
  })

  test('the gallery has a card for each component, its preview shown but out of reach', () => {
    const gallery = page('/components')
    expect(hrefs(gallery, 'main > ul > li > a')).toEqual(
      showcases.map(showcase => `/components/${showcase.slug}`),
    )
    const thumbs = Array.from(gallery.querySelectorAll('main > ul > li > [data-size="thumb"]'))
    expect(thumbs).toHaveLength(showcases.length)
    expect(thumbs.every(thumb => thumb.hasAttribute('inert'))).toBe(true)
    expect(hrefs(gallery, 'nav[aria-label="Site"] [aria-current="page"]')).toEqual(['/components'])
  })

  test("a component's page offers its recipe's variants, previews it and shows its code", () => {
    const button = page('/components/button')
    expect(button.title).toBe('Button · Components · Foldkit Plus')
    expect(hrefs(button, 'nav[aria-label="Components"] [aria-current="page"]')).toEqual([
      '/components/button',
    ])
    const pressed = Array.from(button.querySelectorAll('main fieldset'), axis => [
      axis.querySelector('legend')?.textContent,
      axis.querySelector('[aria-pressed="true"]')?.textContent,
    ])
    expect(pressed).toEqual([
      ['tone', 'accent'],
      ['variant', 'solid'],
      ['size', 'md'],
      ['scheme', 'System'],
      ['direction', 'LTR'],
    ])
    expect(button.querySelector('[data-size="page"] button')?.textContent).toBe('Save changes')
    const code = button.querySelector('main figure pre code')
    expect(code?.textContent).toContain("Button.view({ label: 'Save changes', style }, h)")
    expect(code?.querySelector('[data-kind="syntax-keyword"]')?.textContent).toBe('export')
  })

  test('a showcase with examples shows each with its preview, code and link', () => {
    for (const [slug, examples] of [
      [
        'alert',
        [
          ['inline', 'Inline', 'alertInline'],
          ['banner', 'Banner', 'alertBanner'],
        ],
      ],
      [
        'badge',
        [
          ['tinted', 'Tinted', 'badgesTinted'],
          ['dot', 'Dot', 'badgesDot'],
          ['outline', 'Outline', 'badgesOutline'],
          ['solid', 'Solid', 'badgesSolid'],
        ],
      ],
      [
        'checkbox',
        [
          ['basic', 'Basic', 'checkbox'],
          ['indeterminate', 'Indeterminate', 'checkboxIndeterminate'],
          ['card', 'Card', 'checkboxCard'],
        ],
      ],
    ] as const) {
      const generated = page(`/components/${slug}`)
      for (const [name, title, snippet] of examples) {
        const heading = generated.getElementById(name)
        expect(heading?.tagName, `${slug}#${name}`).toBe('H2')
        expect(heading?.textContent, `${slug}#${name}`).toContain(title)
        const section = heading?.closest('section')
        expect(section?.querySelector(`a[href="#${name}"]`), `${slug}#${name}`).not.toBeNull()
        expect(section?.querySelector('[data-size="page"]'), `${slug}#${name}`).not.toBeNull()
        expect(section?.querySelector('pre code')?.textContent, `${slug}#${name}`).toContain(
          snippet,
        )
      }
    }
  })

  test("a press on a radio option's words presses its radio", () => {
    const radios = Array.from(
      page('/components/radio-group').querySelectorAll('main [data-size="page"] [role="radio"]'),
    )
    expect(radios).toHaveLength(3)
    // A label's `control` is the element a press on it is sent to.
    expect(radios.map(radio => radio.closest('label')?.control)).toEqual(radios)
  })

  test('the theme creator draws its knobs, a preview in them, and the code they make', () => {
    const create = page('/create')
    const hue = create.getElementById('knob-hue')
    expect([hue?.getAttribute('min'), hue?.getAttribute('max')]).toEqual(['0', '360'])
    expect(create.querySelector('label[for="knob-hue"]')?.textContent).toBe('Hue')
    const canvas = create.querySelector('[data-size="canvas"]')
    expect(canvas?.getAttribute('style')).toContain('--fk-knob-accent-h: 264')
    expect(create.querySelector('main figure pre code')?.textContent).toBe(codeOf(defaults))
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
