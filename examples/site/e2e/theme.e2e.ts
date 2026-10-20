/**
 * A reader's theme end to end, on the Vite dev server in Chromium: every link
 * is a page load of its own, so the theme a link to `/create` carries is kept,
 * the component pages draw their previews in it and say so, and the way back
 * to the default holds on the next page.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which compiles it and resolves the workspace sources:
// Vite loading the file itself hands `foldkit-ssr/vite` to Node, which finds
// only a build CI's e2e job never makes.
import config from '../vite.config.js'

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

/** The accent hue the page's first preview is drawn with, if it sets one. */
const previewHue = (page: Page) =>
  page
    .locator('[data-size="page"]')
    .first()
    .evaluate(element => (element as HTMLElement).style.getPropertyValue('--fk-knob-accent-h'))

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

  await page.getByRole('button', { name: 'Use the default' }).click()
  await expect.poll(() => page.getByText(NOTICE).count(), { timeout: 15_000 }).toBe(0)
  expect(await previewHue(page)).toBe('')

  // The default keeps nothing, so the next page has no theme to draw.
  const kept = () => page.evaluate(() => localStorage.getItem('foldkit-site-theme'))
  await expect.poll(kept, { timeout: 15_000 }).toBe(null)
  await open(page, '/components/badge')
  expect(await kept()).toBe(null)
  expect(await page.getByText(NOTICE).count()).toBe(0)
  expect(errors).toEqual([])
  await context.close()
})
