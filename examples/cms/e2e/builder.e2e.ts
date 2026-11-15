/**
 * The page builder in the published demo's build mode (the server in a SharedWorker), driven with
 * a real pointer: at 1280px it has its three panels, a drag from the palette shows what it
 * carries and follows the pointer, Escape puts it down with the page untouched, and at 390px the
 * editor does not scroll sideways.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Page, chromium } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, as `cms.e2e.ts` does.
import config from '../vite.config.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer(
    mergeConfig(config, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      mode: 'sandbox',
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/** The first page of the pages list, open in the builder. */
const openPage = async (page: Page) => {
  await page.goto(`${url}/pages?as=edda&reset`)
  const first = page.locator('#sitePages button').first()
  await first.waitFor({ timeout: 120_000 })
  await first.click()
  await page.getByRole('button', { name: 'Add Heading' }).waitFor({ timeout: 60_000 })
}

const layers = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-builder-row]'), row => row.textContent),
  )

test('at 1280px the builder has its three panels, and a drag shows what it carries and can be put down', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await openPage(page)

  // The palette, the layers and the inspector stand side by side (one panel at a time is the narrow layout).
  const tile = page.getByRole('button', { name: 'Add Heading' })
  expect(await page.locator('ul[aria-label="Layers"]').isVisible()).toBe(true)
  expect(await page.getByText('Select a block on the page').isVisible()).toBe(true)
  const before = await layers(page)

  const from = (await tile.boundingBox())!
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const preview = page.locator('[popover]:popover-open')
  await page.mouse.move(start.x + 40, start.y + 60, { steps: 6 })
  await page.mouse.move(start.x + 200, start.y + 160, { steps: 8 })
  await expect.poll(() => preview.textContent()).toMatch(/Heading/)
  const near = (await preview.boundingBox())!
  // Beside the pointer, not under it.
  expect(near.x).toBeGreaterThan(start.x + 200)
  expect(near.x).toBeLessThan(start.x + 200 + 40)
  expect(near.y).toBeGreaterThan(start.y + 160)
  expect(near.y).toBeLessThan(start.y + 160 + 40)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-fk-drag'))).toBe(
    'mouse',
  )

  // It tracks the pointer.
  await page.mouse.move(start.x + 260, start.y + 100, { steps: 6 })
  const moved = (await preview.boundingBox())!
  expect(Math.abs(moved.x - near.x - 60)).toBeLessThan(4)
  expect(Math.abs(moved.y - near.y + 60)).toBeLessThan(4)

  // Escape puts it down: nothing is carried, and the page is as it was.
  await page.keyboard.press('Escape')
  await expect.poll(() => preview.count()).toBe(0)
  expect(
    await page.evaluate(() => document.documentElement.getAttribute('data-fk-drag')),
  ).toBeNull()
  await page.mouse.up()
  expect(await layers(page)).toEqual(before)
  expect(errors).toEqual([])
  await context.close()
})

test('at 390px the page editor does not scroll sideways, and its panels are reachable', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await openPage(page)
  // The layout viewport: a phone zooms out to fit a page that overflows, so `innerWidth` would lie.
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scroll).toBeLessThanOrEqual(client)
  for (const name of ['Add', 'Layers', 'Settings'])
    expect(await page.getByRole('button', { name, exact: true }).isVisible()).toBe(true)
  await context.close()
})
