/**
 * The site as built, in Chromium: the page the build served is taken over
 * element by element, with none rebuilt. Foldkit warns of a hydration mismatch
 * in development only (its warning is gated on `import.meta.hot`, which a build
 * strips), so a production build says nothing of one; what it rebuilt shows as
 * a served element no longer in the document. Held for a guide, the home
 * page, and two component pages, which are the second application's, loaded
 * as a chunk of their own before the page is taken over.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { build, mergeConfig, preview, type PreviewServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which resolves the workspace sources (see theme.e2e.ts).
import config from '../vite.config.js'

declare global {
  interface Window {
    served?: ReadonlyArray<Element>
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
let out: string
let server: PreviewServer
let browser: Browser
let url: string

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'site-adoption-'))
  process.env['FOLDKIT_BUILD_ID'] = 'adoption'
  const building = await config({ command: 'build', mode: 'production', isPreview: false })
  await build(
    mergeConfig(building, { root, configFile: false, logLevel: 'error', build: { outDir: out } }),
  )
  const previewing = await config({ command: 'serve', mode: 'production', isPreview: true })
  server = await preview(
    mergeConfig(previewing, {
      root,
      configFile: false,
      logLevel: 'error',
      build: { outDir: out },
      preview: { port: 0 },
    }),
  )
  url = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
}, 900_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
  if (out !== undefined) rmSync(out, { recursive: true, force: true })
})

/** The elements of the page as parsed, before any script runs (a module script runs after). */
const recordServed = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      const app = document.querySelector('[data-foldkit-app]')
      window.served = app === null ? [] : [app, ...app.querySelectorAll('*')]
    })
  })

const PAGES = [
  '/',
  '/remote',
  '/mixins/guides/authoring',
  '/entity/api/entity/query',
  '/components',
  '/components/button',
  '/components/tags-input',
  '/components/combobox',
  '/components/calendar',
  '/components/date-picker',
  '/components/file-upload',
  '/components/otp-field',
  '/components/disclosure',
  '/components/code-block',
  '/components/drawer',
  '/components/app-shell',
  '/create',
  '/404.html',
]

const open = async (path: string) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    if (message.type() !== 'debug')
      errors.push(`${message.type()}: ${message.text().slice(0, 300)}`)
  })
  await recordServed(page)
  await page.goto(`${url}${path}`)
  // Taken over: the menu button answers, which only the runtime does.
  const menu = page.locator('#rail button[aria-expanded]')
  await menu.waitFor()
  // The runtime removes the stamp the server put on the root as it boots: a press before is lost.
  await page.waitForFunction(
    () => document.querySelector('[data-foldkit-app]') === null,
    undefined,
    {
      timeout: 60_000,
    },
  )
  await menu.click()
  await expect
    .poll(() => menu.getAttribute('aria-expanded'), {
      timeout: 30_000,
      message: `the page logged ${JSON.stringify(errors)}`,
    })
    .toBe('true')
  return { page, errors }
}

// The gallery and the theme creator draw things only the running page settles (a virtual list's
// rows, a menu held open), so what they keep is counted by the adoption test below.
const SETTLED = PAGES.filter(path => path !== '/components' && path !== '/create')

test.each(SETTLED)(
  'the served page %s keeps its markup and its structure when the browser takes it over',
  async path => {
    const { page, errors } = await open(path)
    const served = await page.evaluate(() => {
      const kept = window.served ?? []
      return kept.map(element => `${element.tagName}.${element.getAttribute('class') ?? ''}`)
    })
    const now = await page.evaluate(() => {
      const root = document.querySelector('#rail')?.parentElement
      return root === null || root === undefined
        ? []
        : [root, ...root.querySelectorAll('*')].map(
            element => `${element.tagName}.${element.getAttribute('class') ?? ''}`,
          )
    })
    expect(served.length).toBeGreaterThan(30)
    // The same elements, in the same order, with the same classes: what the server drew is what shows.
    expect(now).toEqual(served)
    expect(errors).toEqual([])
    await page.close()
  },
  120_000,
)

// Foldkit warns of a mismatch in development only, and a production build rebuilds silently: the
// build's own server once drew views without the view-identity branding the client carries, so the
// markers never matched and every element of every page was replaced (`vite.config.ts`).
test.each(PAGES)(
  'the served page %s is adopted, not rebuilt',
  async path => {
    const { page } = await open(path)
    const rebuilt = await page.evaluate(
      () =>
        (window.served ?? []).filter(element => !element.isConnected && element.tagName !== 'STYLE')
          .length,
    )
    expect(rebuilt).toBe(0)
    await page.close()
  },
  120_000,
)

// A page that looks doubled is usually a capture artefact: Chrome's `fullPage` screenshot wraps
// past 16,384px, so the 18,000px file-upload page showed its top again below its end. The
// document itself is counted here: one heading, one rail and the declared previews, after the
// browser has taken the page over.
test.each([
  ['button', 5],
  ['tags-input', 4],
  ['combobox', 7],
  ['calendar', 9],
  ['date-picker', 3],
  ['file-upload', 10],
  ['switch', 1],
  ['otp-field', 2],
] as const)(
  'the hydrated component page %s holds one heading, one rail and %i previews',
  async (slug, previews) => {
    const { page } = await open(`/components/${slug}`)
    const counted = await page.evaluate(() => ({
      headings: document.querySelectorAll('h1').length,
      rails: document.querySelectorAll('#rail').length,
      previews: document.querySelectorAll('[data-size="page"]').length,
    }))
    expect(counted).toEqual({ headings: 1, rails: 1, previews })
    await page.close()
  },
  120_000,
)

// A press on a preview before the second application has taken the page over is heard by nothing:
// the served markup carries no handler. The previews are held inert and busy until the takeover
// (`view/components.ts`), so a control never looks live and does nothing.
test('a preview is busy and cannot be pressed until the gallery application has loaded, then it works', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route(/\/assets\/entryGallery[^/]*\.js$/, async route => {
    await held
    await route.continue()
  })
  try {
    await page.goto(`${url}/components/switch`, { waitUntil: 'domcontentloaded' })
    const preview = page.locator('[data-size="page"]').first()
    await preview.waitFor()
    const control = preview.locator('[role="switch"]').first()
    expect(await preview.getAttribute('aria-busy')).toBe('true')
    expect(await preview.getAttribute('inert')).toBe('')
    const before = await control.getAttribute('aria-checked')
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    expect(await control.getAttribute('aria-checked')).toBe(before)
    release()
    await expect.poll(() => preview.getAttribute('aria-busy'), { timeout: 60_000 }).toBeNull()
    expect(await preview.getAttribute('inert')).toBeNull()
    await control.click()
    await expect
      .poll(() => control.getAttribute('aria-checked'), { timeout: 30_000 })
      .not.toBe(before)
  } finally {
    release()
    await page.close()
  }
}, 120_000)
