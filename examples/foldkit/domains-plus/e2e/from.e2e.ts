/**
 * A page opened at a row of All Results (`?from=`) in a browser that runs
 * scripts (#392). The served page draws that row first, under the filters,
 * as a page without scripts does; when the runtime takes it over, the rows
 * above it take their room and the window scrolls by as much, so the row
 * stays where the reader saw it.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let origin: string

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0, strictPort: false },
  })
  await onFreePort(() => vite.listen())
  origin = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const FROM = 30

test('the row a page opened at stays in place as the runtime takes the page over', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const warnings: Array<string> = []
  page.on('console', message => {
    if (message.type() === 'error' || message.text().includes('did not match')) {
      warnings.push(message.text())
    }
  })
  page.on('pageerror', error => warnings.push(String(error)))
  // The served page, held before its script runs.
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  await page.route('**/src/client/entry.ts', async route => {
    await held
    await route.continue()
  })
  await page.goto(`${origin}/?q=acme&from=${FROM}`, { waitUntil: 'commit' })
  const row = page.locator(`#domain-results > [aria-posinset="${FROM + 1}"]`)
  await row.waitFor({ timeout: 60_000 })
  const placed = async () => ({
    scrollY: await page.evaluate(() => window.scrollY),
    top: (await row.boundingBox())!.y,
  })
  // Served: the row is the list's first, in view at the window's top.
  expect(
    await page.locator('#domain-results > [role="listitem"]').first().getAttribute('aria-posinset'),
  ).toBe(`${FROM + 1}`)
  const before = await placed()
  expect(before.scrollY).toBe(0)
  expect(before.top).toBeGreaterThan(0)
  expect(before.top).toBeLessThan(800)

  release()
  await page.locator('#domains-app:not([data-foldkit-plus-resume])').waitFor({ timeout: 60_000 })
  // Placed: the row above it is drawn, in the overscan.
  await page.locator(`#domain-results > [aria-posinset="${FROM}"]`).waitFor()
  await expect
    .poll(() => page.evaluate(() => new URL(location.href).searchParams.has('from')))
    .toBe(false)
  // Two frames for any measure the placing set off.
  await page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const after = await placed()
  expect(after.top).toBeCloseTo(before.top, 0)
  // The rows above took their room, and the window scrolled by it.
  expect(after.scrollY).toBeGreaterThan(FROM * 100)
  expect(warnings).toEqual([])
  await page.close()
})
