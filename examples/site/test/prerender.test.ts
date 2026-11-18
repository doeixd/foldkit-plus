// @vitest-environment jsdom
/**
 * The pages the build writes, read back through an HTML parser as a browser
 * reads them: the home page's cards and examples, the demos, a subsite's
 * sidebar, its API pages, and every link on every page leading somewhere that
 * exists.
 */
import { schemeScript } from 'foldkit-mixins/theme'
import { STATIC_ATTRIBUTE } from 'foldkit-ssr/client'
import { existsSync } from 'node:fs'
import { availableParallelism, freemem } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { beforeAll, describe, expect, test } from 'vitest'

import { allSubsites, subsites } from '../src/catalog.js'
import { GITHUB } from '../src/content/guides.js'
import { demos, onGitHub } from '../src/demos.js'
import { families } from '../src/gallery/primitives.js'
import { showcases } from '../src/gallery/showcases.js'
import { codeOf, defaults } from '../src/gallery/theme.js'
import type { Links, Share } from './prerendered.js'

const repository = join(import.meta.dirname, '../../..')

/**
 * The pages the tests read whole. Of every other page only its links are kept:
 * three thousand parsed documents do not fit in a test worker's memory.
 */
const READ = [
  '/remote/guides/server-state/mutations-and-live-data',
  '/',
  '/demos',
  '/404.html',
  '/remote/guides/live-data',
  '/ssr/api/ssr',
  '/ssr/api/ssr/ssr',
  '/primitives/api/primitives-time/throttle',
  '/primitives',
  '/components',
  '/primitives/gallery',
  '/components/button',
  '/components/tags-input',
  '/components/combobox',
  '/components/calendar',
  '/components/file-upload',
  '/components/radio-group',
  '/components/file-drop',
  '/components/alert',
  '/components/badge',
  '/components/checkbox',
  '/components/checkbox-group',
  '/components/steps',
  '/components/pagination',
  '/components/kbd',
  '/components/breadcrumb',
  '/components/scroll-area',
  '/components/date-picker',
  '/components/search-field',
  '/components/toolbar',
  '/components/file-input',
  '/components/menu',
  '/components/table',
  '/components/segmented',
  '/components/input',
  '/components/number-field',
  '/components/slider',
  '/components/toast',
  '/create',
]

const hrefs = (root: ParentNode, selector = 'a') =>
  Array.from(root.querySelectorAll(selector), a => a.getAttribute('href') ?? '')

let paths: ReadonlyArray<string>
let links: ReadonlyMap<string, Links>
let read: ReadonlyMap<string, Document>
let sitemap = ''

/** One share of the pages, rendered in a thread of its own (`prerender.worker.mjs`). */
const render = (index: number, count: number): Promise<Share> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(join(import.meta.dirname, 'prerender.worker.mjs'), {
      workerData: { index, count, read: READ },
    })
    worker.once('message', resolve)
    worker.once('error', reject)
    worker.once('exit', code => reject(new Error(`share ${index} of ${count} exited with ${code}`)))
  })

beforeAll(async () => {
  // Rendering every page took over eight minutes in one thread. Each share builds the library
  // again (about a minute, most of it reading the packages' types), so a share per core would
  // spend more memory than it saves time; each one holds about 1.5 GiB at its peak.
  const count = Math.max(
    1,
    Math.min(4, availableParallelism(), Math.floor(freemem() / (2 * 2 ** 30))),
  )
  const shares = await Promise.all(
    Array.from({ length: count }, (_, index) => render(index, count)),
  )
  paths = shares[0]!.paths
  // Each share reads the site for itself, and one that read another (a guide edited meanwhile)
  // was dealt other pages: some page would go unread.
  const same = (other: ReadonlyArray<string>) =>
    other.length === paths.length && other.every((path, at) => path === paths[at])
  if (!shares.every(share => same(share.paths)))
    throw new Error('the shares read different sites: was a page added or removed meanwhile?')
  links = new Map(shares.flatMap(share => share.links))
  // Each share's sitemap lists its own pages.
  sitemap = shares.map(share => share.sitemap).join('\n')
  const parser = new DOMParser()
  read = new Map(
    shares.flatMap(share =>
      share.read.map(([path, html]) => [path, parser.parseFromString(html, 'text/html')] as const),
    ),
  )
}, 1_500_000)

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

  test('the link check reads every page the build writes', () => {
    expect(links.size).toBe(paths.length)
    expect(new Set(links.keys())).toEqual(new Set(paths))
  })

  test("applies the reader's scheme in the head, before any style", () => {
    const head = page('/').head
    const first = head.querySelector('script:not([type]), style')
    expect(first?.tagName).toBe('SCRIPT')
    expect(first?.textContent).toBe(schemeScript())
  })

  test('the home page says the docs and the skill ship with the package, with the commands', () => {
    const setup = Array.from(page('/').querySelectorAll('p')).find(each =>
      each.textContent?.startsWith('The docs and the agent skill'),
    )
    expect(setup?.textContent).toBe(
      'The docs and the agent skill ship inside the npm package, at the version of your code. npx foldkit-plus docs <query> reads them offline; npx foldkit-plus skill installs the matching skill.',
    )
    expect(Array.from(setup?.querySelectorAll('code') ?? [], each => each.textContent)).toEqual([
      'npx foldkit-plus docs <query>',
      'npx foldkit-plus skill',
    ])
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
    expect(fence?.querySelector('pre code')?.textContent).toContain('liveQuery(Data, Notes')
    expect(hrefs(live, 'nav[aria-label="Documentation"] a')).toContain(
      '/remote/guides/remote-server',
    )
  })

  test('a guide draws its Mermaid fence as a diagram, its source folded beneath it', () => {
    const figure = page('/remote/guides/server-state/mutations-and-live-data').querySelector(
      'article figure.diagram',
    )
    const svg = figure?.querySelector(':scope > svg')
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(Array.from(svg?.querySelectorAll('text') ?? [], text => text.textContent)).toContain(
      'ClickedRename',
    )
    expect(figure?.querySelector('details pre code')?.textContent).toContain('sequenceDiagram')
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
    // The guides that name it are listed under it: "A first page" is a section of the package's first page now.
    expect(hrefs(ssr, '.mentions a')).toEqual(expect.arrayContaining(['/ssr']))
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

  test('the primitives gallery has a card for each module, grouped by family, and the guide stays', () => {
    const gallery = page('/primitives/gallery')
    expect(
      Array.from(gallery.querySelectorAll('main section[id]'), family =>
        hrefs(family, 'ul > li > a'),
      ),
    ).toEqual(families.map(family => family.cards.map(() => `/primitives/guides/${family.id}`)))
    expect(hrefs(gallery, 'nav[aria-label="Site"] [aria-current="page"]')).toEqual([
      '/primitives/gallery',
    ])
    // The README's guide keeps its address, and the gallery's rail leads to it.
    expect(links.has('/primitives')).toBe(true)
    expect(hrefs(gallery, 'nav[aria-label="Primitives"] a')).toContain('/primitives')
  })

  test('the rail lists every component by name, in alphabetical order', () => {
    const rail = page('/components/button').querySelector('nav[aria-label="Components"]')!
    const titles = Array.from(
      rail.querySelectorAll('section:last-of-type a'),
      link => link.textContent ?? '',
    )
    expect(titles).toEqual(
      showcases.map(showcase => showcase.title).sort((a, b) => a.localeCompare(b, 'en')),
    )
    // The definition order is not already alphabetical, so the sort is what puts it there.
    expect(titles).not.toEqual(showcases.map(showcase => showcase.title))
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
    expect(code?.textContent).toContain(
      "Button.view({ label: 'Save changes', icon: outline(h, 'M3 8.5l3 3 7-7'), style }, h)",
    )
    // The example's whole module is shown, from its imports.
    expect(code?.querySelector('[data-kind="syntax-keyword"]')?.textContent).toBe('import')
    expect(code?.textContent).toContain("from 'foldkit-mixins-ui'")
    expect(button.querySelector('main section > p code')?.textContent).toBe('recipe')
  })

  test('a showcase with examples shows each with its preview, code and link', () => {
    for (const [slug, examples] of [
      [
        'checkbox',
        [
          ['basic', 'Basic', 'checkbox'],
          ['indeterminate', 'Indeterminate', 'checkboxIndeterminate'],
          ['card', 'Card', 'checkboxCard'],
        ],
      ],
      [
        'checkbox-group',
        [
          ['alerts', 'Alerts', 'checkboxGroup'],
          ['described', 'Descriptions', 'checkboxGroupDescribed'],
          ['select-all', 'Select all', 'checkboxGroupSelectAll'],
          ['invalid', 'Invalid', 'checkboxGroupInvalid'],
        ],
      ],
      [
        'radio-group',
        [
          ['descriptions', 'Descriptions', 'radioGroup'],
          ['horizontal', 'Horizontal', 'radioGroupHorizontal'],
          ['cards', 'Cards', "Recipes.RadioGroup({ variant: 'card' })"],
        ],
      ],
      ['file-drop', [['basic', 'Dropped files', 'fileDrop']]],
      [
        'search-field',
        [
          ['basic', 'Basic', 'SearchField.view('],
          ['routes', 'Keys of your own', "Behaviors.Keys.chord('ArrowDown')"],
          ['busy', 'Busy, with a clear of your own', 'busy: model.query'],
          ['states', 'Invalid, disabled and with no clear', 'invalid: true'],
        ],
      ],
      [
        'toolbar',
        [
          ['basic', 'Formatting', 'Toolbar.view('],
          ['configure', 'Configure once', 'Toolbar.configure('],
        ],
      ],
      [
        'file-input',
        [
          ['multiple', 'Several files', 'multiple: true'],
          ['required', 'One file, required', 'required: true'],
        ],
      ],
      [
        'button',
        [
          [
            'basic',
            'Basic',
            "Button.view({ label: 'Save changes', icon: outline(h, 'M3 8.5l3 3 7-7'), style }, h)",
          ],
          ['icon', 'Icon only', "label: 'Reply'"],
          ['toggle', 'Toggle', 'pressed: model.on.includes(format)'],
          ['configure', 'Configure once', 'const AppButton = Button.configure({'],
          ['add', 'A look of your own', 'Recipes.Button.add({'],
        ],
      ],
      [
        'combobox',
        [
          ['basic', 'Basic', 'const City = Combobox.one(cities)'],
          ['multiple', 'Several, as chips', 'const Cities = Combobox.many(cities)'],
          ['empty', 'Empty and loading', "label: 'Still loading'"],
          ['creatable', 'Creatable', 'choice: Combobox.one(known)'],
          ['choice', 'A choice of your own: at most three', 'Choice<Item, ReadonlyArray<Item>>'],
        ],
      ],
      [
        'tags-input',
        [
          ['basic', 'Basic', "state: Bundles.TagsInput.with({ id: 'topics'"],
          ['max', 'A maximum', 'max: 3'],
          ['refusals', 'Refusals', "full: 'That makes more than {max}.'"],
          ['configure', 'Configure once', 'const Tags = TagsInput.configure({'],
        ],
      ],
      [
        'breadcrumb',
        [
          ['basic', 'Basic', 'Recipes.Breadcrumb'],
          ['icons', 'Icons', 'icon: outline(h'],
          ['separator', 'A separator of your own', "separator: h.span([], ['→'])"],
          ['trailing', 'Icon only, and a count', 'labelHidden: true'],
          ['collapsed', 'Collapsed', 'collapse: { max: 3, onExpand: onMessage('],
          ['menu', 'The hidden steps in a menu', 'collapse: BreadcrumbMenu.make({'],
          ['words', 'In another language', "words: { label: 'Fil d’Ariane'"],
          ['feature', 'A fold of your own', 'draw: ({ label, ellipsis, builders }, builder) =>'],
        ],
      ],
      [
        'scroll-area',
        [
          ['native', "The browser's bars", 'Recipes.ScrollArea.extend'],
          ['overlay', 'Overlay bars', 'mixins: ScrollArea.overlayBars'],
        ],
      ],
      [
        'date-picker',
        [
          ['range', 'A range', "id: 'stay'"],
          ['bundle', 'Placed as a Bundle', "state: Bundles.DatePicker.with({ id: 'due'"],
          ['presets', 'A range with presets', 'Calendar.lastDays(today, 30)'],
        ],
      ],
      [
        'file-upload',
        [
          ['basic', 'Basic', "state: Bundles.FileUpload.with({ id: 'logo'"],
          ['drop', 'Drag and drop', "words: { prompt: 'Drop files here or' }"],
          ['table', 'Composed: the files as a table', 'const drawn = FileUpload.parts('],
          ['cover', 'Cover', 'send: job => simulated(job).pipe(Stream.map(lift))'],
          ['configure', 'Configure once', 'const Upload = FileUpload.configure({'],
        ],
      ],
      [
        'calendar',
        [
          ['basic', 'A day', "state: Bundles.Calendar.with({ id: 'delivery'"],
          ['range', 'A range over two months, with presets', 'months: 2'],
          ['presets', 'Presets of your own', 'const weekendOf ='],
          ['appointment', 'Composed: a day and a time', 'aside: stack('],
          ['unavailable', 'Weekends, booked days and bounds', 'disabledDaysOfWeek'],
          ['several', 'Several days', "Calendar.empty('Multiple')"],
          ['prices', 'A price on each day', 'const priceOf ='],
          ['events', 'Events and a Today button', 'const eventsOn ='],
        ],
      ],
      [
        'kbd',
        [
          ['key', 'A key', "Kbd.view({ key: 'Enter', style }, h)"],
          ['combo', 'Combinations', "Kbd.combo({ keys: ['⌘', 'K'], style }, h)"],
          ['glyphs', 'Keys that are drawings', 'h.AriaLabel('],
          ['shortcut', 'Beside a button', 'trailing: Kbd.combo('],
        ],
      ],
      [
        'pagination',
        [
          ['numbered', 'Numbered', 'pageCount: 12'],
          ['simple', 'Previous and next', 'numbered: false'],
          ['ends', 'First and last', 'ends: true'],
          ['range', 'Rows and page size', 'sizes: [10, 20, 50]'],
          ['siblings', 'Siblings and boundaries', 'siblings: 2,'],
          ['compact', 'Compact', "pins: { compact: 'always' }"],
        ],
      ],
      [
        'steps',
        [
          ['basic', 'Basic', 'steps'],
          ['icons', 'Icons', 'icon: outline(h'],
          ['vertical', 'Vertical, with content', "pins: { orientation: 'vertical' }"],
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

  test('every drop zone on the file upload page says what to do, in a list or a grid', () => {
    const upload = page('/components/file-upload')
    const said = (name: string) =>
      upload
        .getElementById(name)
        ?.closest('section')
        ?.querySelector('[data-size="page"] label[for]')
        ?.textContent?.replace(/\s+/g, ' ')
    expect(['drop', 'gallery', 'progress', 'table', 'images', 'card'].map(said)).toEqual([
      'Drop files here or browse',
      'Drop images here or browse',
      'Drop files here or browse',
      'Drop files here or browse',
      'Drop images here or browse',
      'Drop files here or browse',
    ])
    expect(said('basic')).toBe('Choose an image')
  })

  test('each badge example shows its appearance on words of its own', () => {
    const words = Array.from(
      page('/components/badge').querySelectorAll('main section [data-size="page"]'),
      preview => preview.textContent,
    )
    expect(words).toHaveLength(7)
    expect(new Set(words).size).toBe(7)
  })

  test('the toggle buttons say which are pressed', () => {
    const toggles = page('/components/button').getElementById('toggle')?.closest('section')
    const pressed = Array.from(
      toggles?.querySelectorAll('[data-size="page"] [role="group"] button') ?? [],
      button => [button.textContent, button.getAttribute('aria-pressed')],
    )
    expect(pressed).toEqual([
      ['Bold', 'true'],
      ['Italic', 'false'],
      ['Underline', 'false'],
    ])
  })

  test('a long breadcrumb trail folds its middle into one button', () => {
    const trail = page('/components/breadcrumb').getElementById('collapsed')?.closest('section')
    const steps = Array.from(
      trail?.querySelectorAll('[data-size="page"] nav li') ?? [],
      step => step.querySelector('button')?.getAttribute('aria-label') ?? step.textContent,
    )
    expect(steps).toEqual(['Home', 'Show 3 more', 'Recipes', 'Breadcrumb'])
  })

  test('the invalid checkbox group says why while nothing is checked', () => {
    const invalid = page('/components/checkbox-group').getElementById('invalid')?.closest('section')
    const group = invalid?.querySelector('[data-size="page"] fieldset')
    const error = group?.getAttribute('aria-describedby') ?? ''
    expect(group?.querySelector(`[id="${error}"]`)?.textContent).toBe('Pick at least one.')
    const boxes = Array.from(group?.querySelectorAll('[role="checkbox"]') ?? [])
    expect(boxes.map(box => box.getAttribute('aria-invalid'))).toContain('true')
  })

  test('the range picker submits its dates under one name', () => {
    const range = page('/components/date-picker').getElementById('range')?.closest('section')
    expect(range?.querySelector('[data-size="page"] button')?.textContent).toBe(
      'Pick check-in and check-out',
    )
    expect(
      range?.querySelectorAll('[data-size="page"] input[type="hidden"][name="stay"]'),
    ).toHaveLength(1)
  })

  test('a key combination is one kbd holding a kbd per key', () => {
    const combo = page('/components/kbd').getElementById('combo')?.closest('section')
    const keys = Array.from(combo?.querySelectorAll('[data-size="page"] kbd > kbd') ?? [])
    expect(keys.map(key => key.textContent)).toEqual(['⌘', 'K', 'Ctrl', 'Shift', 'P'])
  })

  test('the file drop is a label around its hidden file input', () => {
    const zone = page('/components/file-drop').querySelector(
      'main [data-size="page"] label:has(> input[type="file"][multiple])',
    )
    expect(zone?.textContent).toContain('Drop files or click to browse')
    expect(zone?.hasAttribute('data-drag-over')).toBe(false)
  })

  test('the table names each row by its first cell, and draws a status as a badge', () => {
    const basic = page('/components/table').getElementById('basic')?.closest('section')
    const rows = Array.from(basic?.querySelectorAll('[data-size="page"] tbody tr') ?? [])
    expect(rows.map(row => row.querySelector('th[scope="row"]')?.textContent)).toEqual([
      'INV-001',
      'INV-002',
      'INV-003',
    ])
    expect(rows.map(row => row.querySelector('td [data-tone]')?.getAttribute('data-tone'))).toEqual(
      ['live', 'review', 'live'],
    )
  })

  test('the page menu draws icons, hints and a shortcut, and tells two rows of one label apart', () => {
    const actions = page('/components/menu').getElementById('actions')?.closest('section')
    const items = Array.from(
      actions?.querySelectorAll('[data-size="page"] [role="menuitem"]') ?? [],
    )
    const share = items.filter(item => item.textContent?.startsWith('Share'))
    expect(share.map(item => item.textContent)).toEqual(['Sharelink', 'Shareemail'])
    expect(new Set(share.map(item => item.id)).size).toBe(2)
    const rename = items.find(item => item.textContent?.startsWith('Rename'))
    expect(rename?.getAttribute('aria-keyshortcuts')).toBe('F2')
    expect(rename?.querySelector('svg')).not.toBeNull()
    expect(items.at(-1)?.getAttribute('data-tone')).toBe('destructive')
  })

  test('the multiple segmented control is a group of toggles that submits each chosen day', () => {
    const section = page('/components/segmented').getElementById('multiple')?.closest('section')
    const group = section?.querySelector('[data-size="page"] [role="group"]')
    expect(group?.getAttribute('aria-label')).toBe('Repeat on')
    const options = Array.from(group?.querySelectorAll('button') ?? [])
    expect(
      options.map(option => [option.textContent, option.getAttribute('aria-pressed')]),
    ).toEqual([
      ['Mon', 'true'],
      ['Tue', 'false'],
      ['Wed', 'true'],
      ['Thu', 'false'],
      ['Fri', 'false'],
    ])
    expect(
      Array.from(group?.querySelectorAll('input[type="hidden"][name="repeat"]') ?? [], input =>
        input.getAttribute('value'),
      ),
    ).toEqual(['mon', 'wed'])
    // A single choice is the radio group.
    const single = page('/components/segmented').getElementById('basic')?.closest('section')
    expect(single?.querySelector('[data-size="page"] [role="radiogroup"]')).not.toBeNull()
  })

  test('the input in a form says what it submits, asks for and offers', () => {
    const form = page('/components/input').getElementById('states')?.closest('section')
    const [phone, order] = Array.from(form?.querySelectorAll('[data-size="page"] input') ?? [])
    expect(phone?.getAttribute('name')).toBe('phone')
    expect(phone?.getAttribute('inputmode')).toBe('tel')
    expect(phone?.hasAttribute('required')).toBe(true)
    expect(order?.hasAttribute('readonly')).toBe(true)
    expect(order?.getAttribute('name')).toBe('order')
  })

  test('the number field with no value shows none, and the slider says what it is saved at', () => {
    const locale = page('/components/number-field').getElementById('locale')?.closest('section')
    const field = locale?.querySelector('[data-size="page"] input')
    expect((field as HTMLInputElement | null)?.value).toBe('1.234,5')
    expect(field?.getAttribute('aria-valuenow')).toBe('1234.5')
    expect(locale?.querySelector('[data-size="page"]')?.textContent).toContain('EUR')
    const commit = page('/components/slider').getElementById('commit')?.closest('section')
    expect(commit?.querySelector('[data-size="page"] p')?.textContent).toBe('Saved: 60%')
    const basic = page('/components/slider').getElementById('basic')?.closest('section')
    const described = basic?.querySelector('[data-size="page"] input[type="range"]')
    expect(
      basic?.querySelector(`[id="${described?.getAttribute('aria-describedby')}"]`)?.textContent,
    ).toBe('Applies to this device only.')
  })

  test('the pagination in German names its stops in German, and one page draws no stops', () => {
    const words = page('/components/pagination').getElementById('words')?.closest('section')
    const nav = words?.querySelector('[data-size="page"] nav')
    expect(nav?.getAttribute('aria-label')).toBe('Seitennavigation')
    expect(
      Array.from(nav?.querySelectorAll('button[aria-label]') ?? [], stop =>
        stop.getAttribute('aria-label'),
      ),
    ).toEqual(['Erste Seite', 'Zurück Seite', 'Weiter Seite', 'Letzte Seite'])
    const one = page('/components/pagination').getElementById('one-page')?.closest('section')
    expect(one?.querySelectorAll('[data-size="page"] button')).toHaveLength(0)
    expect(one?.querySelector('[data-size="page"] nav')?.textContent).toBe('1–7 of 7')
  })

  test('a component page links the guides on the mechanisms that apply to it', () => {
    const related = page('/components/search-field').getElementById('related')?.closest('section')
    const links = Array.from(related?.querySelectorAll('a') ?? [], a => [
      a.textContent,
      a.getAttribute('href') ?? '',
    ])
    expect(links.map(([text]) => text)).toEqual([
      'Keys of your own',
      'Keeping focus when something is removed',
    ])
    // Each leads to a page of the site, on the heading that explains it.
    for (const [, href] of links) {
      expect(href, href).toMatch(/^\/mixins\/guides\/.+#.+/)
    }
    expect(page('/components/button').getElementById('related')).toBeNull()
  })

  test('the search fields are search inputs named by their label, with no clear button while empty', () => {
    const basic = page('/components/search-field').getElementById('basic')?.closest('section')
    const input = basic?.querySelector('[data-size="page"] input[type="search"]')
    expect(input?.getAttribute('aria-label')).toBe('Search products')
    expect(basic?.querySelector('[data-size="page"] button')).toBeNull()
    const states = page('/components/search-field').getElementById('states')?.closest('section')
    const [invalid, disabled] = Array.from(
      states?.querySelectorAll('[data-size="page"] input[type="search"]') ?? [],
    )
    expect(invalid?.getAttribute('aria-invalid')).toBe('true')
    expect(disabled?.hasAttribute('disabled')).toBe(true)
    // These fields are given no `clear`: none draws the button.
    expect(states?.querySelectorAll('[data-size="page"] button')).toHaveLength(0)
  })

  test('the toolbar has one tab stop, groups its alignment and skips the disabled link', () => {
    const bar = page('/components/toolbar').querySelector(
      'main [data-size="page"] [role="toolbar"]',
    )
    expect(bar?.getAttribute('aria-label')).toBe('Text formatting')
    const buttons = Array.from(bar?.querySelectorAll('button') ?? [])
    expect(buttons.filter(button => button.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(bar?.querySelectorAll('[role="separator"]')).toHaveLength(1)
    const link = buttons.at(-1)
    expect(link?.textContent).toBe('Link')
    expect(link?.hasAttribute('disabled') || link?.getAttribute('aria-disabled') === 'true').toBe(
      true,
    )
  })

  test('the file inputs submit under their names, with the trigger as the input’s label', () => {
    const multiple = page('/components/file-input').getElementById('multiple')?.closest('section')
    const input = multiple?.querySelector('[data-size="page"] input[type="file"]')
    expect([input?.getAttribute('name'), input?.getAttribute('accept')]).toEqual([
      'attachments',
      'image/*',
    ])
    expect(input?.hasAttribute('multiple')).toBe(true)
    const label = multiple?.querySelector(`[data-size="page"] label[for="${input?.id}"]`)
    expect(label?.textContent).toBe('Attach files')
    const required = page('/components/file-input').getElementById('required')?.closest('section')
    const single = required?.querySelector('[data-size="page"] input[type="file"]')
    expect(single?.hasAttribute('required')).toBe(true)
    expect(single?.hasAttribute('multiple')).toBe(false)
    expect(single?.getAttribute('aria-invalid')).toBe('true')
    const described = single?.getAttribute('aria-describedby') ?? ''
    expect(required?.querySelector(`[id="${described}"]`)?.textContent).toBe(
      'A CSV file is required.',
    )
  })

  test("a press on a radio option's words presses its radio", () => {
    const groups = Array.from(
      page('/components/radio-group').querySelectorAll(
        'main [data-size="page"] [role="radiogroup"]',
      ),
    )
    expect(groups).toHaveLength(3)
    expect(
      groups.filter(group => group.getAttribute('aria-orientation') === 'horizontal'),
    ).toHaveLength(1)
    // Each row is the card slot, marked while its option is checked.
    expect(
      groups.map(group =>
        Array.from(group.querySelectorAll('label'), row => row.getAttribute('data-checked')),
      ),
    ).toEqual(groups.map(() => ['false', 'true', 'false']))
    for (const group of groups) {
      const radios = Array.from(group.querySelectorAll('[role="radio"]'))
      expect(radios).toHaveLength(3)
      // A label's `control` is the element a press on it is sent to.
      expect(radios.map(radio => radio.closest('label')?.control)).toEqual(radios)
    }
  })

  test('the theme creator draws its knobs, a preview in them, and the code they make', () => {
    const create = page('/create')
    const pressed = (selector: string) =>
      Array.from(create.querySelectorAll(`${selector} [aria-pressed="true"]`), button =>
        button.textContent?.trim(),
      )
    // The themes pane first, with the default theme chosen and no style that differs from it.
    expect(
      Array.from(
        create.querySelectorAll('[aria-label="Knobs"] [role="tab"][aria-selected="true"]'),
        tab => tab.textContent?.trim(),
      ),
    ).toEqual(['Themes'])
    expect(pressed('#theme-panes')).toEqual(['Default'])
    expect(create.getElementById('knob-hue')).toBeNull()
    const canvas = create.querySelector('[data-size="canvas"]')
    // The default theme is the preview's own rule: nothing to override inline.
    expect(canvas?.getAttribute('style')).toBe('color-scheme: light dark')
    expect(create.querySelector('main figure pre code')?.textContent).toBe(codeOf(defaults))
  })

  test('every element named by another on every page names one the page has', () => {
    const unnamed = Array.from(links, ([path, at]) => at.unnamed.map(miss => `${path}: ${miss}`))
    expect(unnamed.flat()).toEqual([])
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
