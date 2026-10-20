/**
 * A reader's theme end to end, on the Vite dev server in Chromium: every link
 * is a page load of its own, so the theme a link to `/create` carries is kept,
 * the component pages draw their previews in it and say so, and the way back
 * to the default holds on the next page. A kept theme is drawn before the
 * application starts at all: the head script draws the first frame.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { Theme } from 'foldkit-mixins/theme'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which compiles it and resolves the workspace sources:
// Vite loading the file itself hands `foldkit-ssr/vite` to Node, which finds
// only a build CI's e2e job never makes.
import config from '../vite.config.js'
import { defaults } from '../src/gallery/theme.js'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  const serving = await config({ command: 'serve', mode: 'development', isPreview: false })
  vite = await createServer(
    mergeConfig(serving, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const NOTICE = 'Previews are drawn in the theme you made.'

/** The accent hue the page's first preview is drawn with. */
const previewHue = (page: Page) =>
  page
    .locator('[data-size="page"]')
    .first()
    .evaluate(element => getComputedStyle(element).getPropertyValue('--fk-knob-accent-h').trim())

const DEFAULT_HUE = Theme.variables(Theme.make(defaults))['accent-h']

const open = async (page: Page, path: string) => {
  // A first load pre-bundles the workspace, which takes a while.
  await page.goto(`${url}${path}`, { timeout: 120_000 })
  await page.waitForSelector('[data-size="page"], [data-size="canvas"]', { timeout: 120_000 })
}

test('a theme made on /create follows the reader to every component page', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))

  // A shared link's theme is the one kept.
  await open(page, '/create?accent.hue=30')
  await open(page, '/components/button')
  await expect.poll(() => previewHue(page), { timeout: 15_000 }).toBe('30')
  await expect(page.getByText(NOTICE).isVisible()).resolves.toBe(true)

  // A reload is another page load, which reads the kept theme again.
  await page.reload({ timeout: 120_000 })
  await page.waitForSelector('[data-size="page"]', { timeout: 60_000 })
  await expect.poll(() => previewHue(page), { timeout: 15_000 }).toBe('30')

  // The notice keeps its place once hidden, so the previews below it stay put.
  const previewTop = () =>
    page
      .locator('[data-size="page"]')
      .first()
      .evaluate(e => e.getBoundingClientRect().top)
  const top = await previewTop()
  await page.getByRole('button', { name: 'Use the default' }).click()
  await expect.poll(() => page.getByText(NOTICE).isVisible(), { timeout: 15_000 }).toBe(false)
  expect(await previewTop()).toBe(top)
  expect(await previewHue(page)).toBe(DEFAULT_HUE)

  // The default keeps nothing, so the next page has no theme to draw.
  const kept = () => page.evaluate(() => localStorage.getItem('foldkit-site-theme'))
  await expect.poll(kept, { timeout: 15_000 }).toBe(null)
  await open(page, '/components/badge')
  expect(await kept()).toBe(null)
  expect(await page.getByText(NOTICE).isVisible()).toBe(false)
  expect(errors).toEqual([])
  await context.close()
})

test('a kept theme is drawn in the first frame, before the application starts', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await open(page, '/create?accent.hue=30')
  const knobs = () => page.evaluate(() => localStorage.getItem('foldkit-site-knobs'))
  await expect.poll(knobs, { timeout: 15_000 }).not.toBe(null)

  // The application's script answered with nothing: no Model, no Command, only the head.
  await page.route('**/src/entry.ts*', route =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  )
  await open(page, '/components/button')
  expect(await previewHue(page)).toBe('30')

  // Nothing kept, the head draws nothing over the default. (The dev server
  // styles the page from its script, which is blocked, so only the build's
  // first frame has the default theme to show.)
  await page.evaluate(() => localStorage.clear())
  await open(page, '/components/badge')
  expect(await page.locator('style[data-fk-knobs]').count()).toBe(0)
  expect(await previewHue(page)).not.toBe('30')
  await context.close()
})
