/**
 * The site as built, in Chromium: the "On this page" list marks the section the
 * reader is in (`aria-current="location"`), follows the scroll and a click on a
 * link, and at the end of the page marks the last section. Served, the list
 * marks nothing.
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
import { mutation } from '../../../scripts/mutation-plugin.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
let out: string
let server: PreviewServer
let browser: Browser
let url: string

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'site-spy-'))
  process.env['FOLDKIT_BUILD_ID'] = 'spy'
  const building = await config({ command: 'build', mode: 'production', isPreview: false })
  await build(
    mergeConfig(building, {
      root,
      configFile: false,
      logLevel: 'error',
      build: { outDir: out },
      plugins: [mutation()],
    }),
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

const LINKS = '[aria-label="On this page"] a[href^="#"]'

/** The ids the outline links to, in the page's order. */
const sectionsOf = (page: Page) =>
  page.$$eval(LINKS, links => links.map(link => (link as HTMLAnchorElement).hash.slice(1)))

/** The ids of the links marked as the reader's place. */
const marked = (page: Page) =>
  page.$$eval(LINKS, links =>
    links
      .filter(link => link.getAttribute('aria-current') !== null)
      .map(link => (link as HTMLAnchorElement).hash.slice(1)),
  )

const open = async (path: string, width = 1600) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  await page.goto(`${url}${path}`)
  // Taken over: the runtime removes the stamp the server put on the root.
  await page.waitForFunction(
    () => document.querySelector('[data-foldkit-app]') === null,
    undefined,
    {
      timeout: 60_000,
    },
  )
  return page
}

const GUIDE = '/remote'

const nth = (ids: ReadonlyArray<string>, at: number): string => {
  const id = ids[at]
  if (id === undefined) throw new Error(`the outline has no section ${at}`)
  return id
}

test('the served outline marks nothing', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } })
  await page.route('**/*.js', route => route.abort())
  await page.goto(`${url}${GUIDE}`)
  expect(await marked(page)).toEqual([])
  await page.close()
})

test('scrolling to a section marks its link, and only its link', async () => {
  const page = await open(GUIDE)
  const ids = await sectionsOf(page)
  expect(ids.length).toBeGreaterThan(3)
  const second = nth(ids, 1)
  const third = nth(ids, 2)
  await page.evaluate(id => document.getElementById(id)?.scrollIntoView(), second)
  await expect.poll(() => marked(page), { timeout: 15_000 }).toEqual([second])
  await page.evaluate(id => document.getElementById(id)?.scrollIntoView(), third)
  await expect.poll(() => marked(page), { timeout: 15_000 }).toEqual([third])
  expect(await page.getAttribute(`${LINKS}[aria-current]`, 'aria-current')).toBe('location')
  await page.close()
})

test('a click on a link marks the section it scrolled to', async () => {
  const page = await open(GUIDE)
  const second = nth(await sectionsOf(page), 1)
  await page.click(`${LINKS}[href="#${second}"]`)
  await expect.poll(() => marked(page), { timeout: 15_000 }).toEqual([second])
  await page.close()
})

test('at the end of the page the last section is marked', async () => {
  const page = await open(GUIDE)
  const ids = await sectionsOf(page)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => marked(page), { timeout: 15_000 }).toEqual([ids.at(-1)])
  await page.close()
})

test('a page opened again at its top starts unmarked', async () => {
  const page = await open(GUIDE)
  const second = nth(await sectionsOf(page), 1)
  await page.evaluate(id => document.getElementById(id)?.scrollIntoView(), second)
  await expect.poll(() => marked(page), { timeout: 15_000 }).toEqual([second])
  await page.reload()
  await page.waitForFunction(() => document.querySelector('[data-foldkit-app]') === null)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(() => marked(page), { timeout: 15_000 }).toEqual([])
  await page.close()
})
