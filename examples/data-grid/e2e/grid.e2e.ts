/**
 * The data grid demo end to end: its Vite dev server started here and
 * Chromium driving the page, as a visitor follows the demo's first step. A
 * price edited in the grid is the cell's; one that is no price is refused in
 * the cell. The page throws nothing and has the Foldkit plugin answering.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0 },
  })
  await onFreePort(() => vite.listen())
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/** What a step waits for on a loaded machine, where a frame can take a while. */
const slow = { timeout: 10_000 }

const cell = (page: Page, row: string, column: string) =>
  page.locator(`[id="products:${row}:${column}"]`)

/**
 * Makes a cell the active one and opens its editor. Enter waits for the click
 * to be drawn: a key that lands before it meets the grid's last frame, where
 * another cell, or none, is active (a loaded CI runner does this).
 */
const edit = async (page: Page, row: string, column: string) => {
  await cell(page, row, column).click()
  await expect
    .poll(() => page.locator('#products').getAttribute('aria-activedescendant'), slow)
    .toBe(`products:${row}:${column}`)
  await page.keyboard.press('Enter')
  await page.locator('#products input').waitFor()
}

test('a price edited in the grid is the cell’s, and one that is no price is refused', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.text().includes('No response from @foldkit/vite-plugin'))
      problems.push(message.text())
  })
  await page.goto(vite.resolvedUrls!.local[0]!)
  await cell(page, 'p2', 'price').waitFor({ timeout: 120_000 })

  await edit(page, 'p2', 'price')
  const editor = page.locator('#products input')
  await editor.fill('12.50')
  await editor.press('Enter')
  await expect.poll(() => cell(page, 'p2', 'price').textContent(), slow).toBe('12.50')

  const before = await cell(page, 'p3', 'price').textContent()
  await edit(page, 'p3', 'price')
  await editor.fill('4.999')
  await editor.press('Enter')
  await expect.poll(() => editor.getAttribute('aria-invalid'), slow).toBe('true')
  await editor.press('Escape')
  await expect.poll(() => editor.count(), slow).toBe(0)
  expect(await cell(page, 'p3', 'price').textContent()).toBe(before)

  expect(problems).toEqual([])
  await page.close()
})

test('a filter shows how many products match, and Clear filters takes it off', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(vite.resolvedUrls!.local[0]!)
  await cell(page, 'p0', 'line').waitFor({ timeout: 120_000 })
  // The counts are plain text; only what an action did is the live region.
  const counts = page.getByText(/products.*selected./)
  const status = page.getByRole('status')
  await expect.poll(() => counts.textContent(), slow).toContain('100,000 products, 0 selected')

  await cell(page, 'p0', 'line').click()
  await expect
    .poll(() => page.locator('#products').getAttribute('aria-activedescendant'), slow)
    .toBe('products:p0:line')
  // Up from the first row is the column's header, where Alt+ArrowDown opens its filter.
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(() => page.locator('#products').getAttribute('aria-activedescendant'), slow)
    .toBe('products:line')
  await page.keyboard.press('Alt+ArrowDown')
  await page.locator('#products input').waitFor()
  await page.keyboard.type('Paint')
  await expect.poll(() => status.textContent(), slow).toContain('line filter:')
  await expect.poll(() => status.textContent(), slow).toContain('of 100,000 products match')
  await expect.poll(() => counts.textContent(), slow).toContain('of 100,000 products match')

  const clear = page.getByRole('button', { name: 'Clear filters' })
  await expect.poll(() => clear.getAttribute('aria-disabled'), slow).toBe('false')
  await clear.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => status.textContent(), slow).toContain('Filters cleared.')
  await expect.poll(() => counts.textContent(), slow).toContain('100,000 products, 0 selected')
  await expect.poll(() => clear.getAttribute('aria-disabled'), slow).toBe('true')
  // The button stays drawn, so a key press on it does not drop focus to the body.
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Clear filters')

  // Measured against the layout viewport: a phone zooms out to fit an overflowing page.
  await page.setViewportSize({ width: 390, height: 800 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page.close()
})

test('on a phone the pinned UPC leaves room for the next column, and the page does not scroll sideways', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 800 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto(vite.resolvedUrls!.local[0]!)
  await cell(page, 'p0', 'description').waitFor({ timeout: 120_000 })
  const box = async (column: string) => (await cell(page, 'p0', column).boundingBox())!
  expect((await box('upc')).width).toBe(124)
  // Description starts well inside the screen, with a good part of its text in view.
  const description = await box('description')
  expect(390 - description.x).toBeGreaterThan(200)
  // The layout viewport, not `innerWidth`: a phone zooms out to fit a page that overflows.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  const clear = (await page.getByRole('button', { name: 'Clear filters' }).boundingBox())!
  expect(clear.height).toBeGreaterThanOrEqual(32)
  await context.close()
})
