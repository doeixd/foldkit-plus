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
  await expect.poll(() => status.textContent(), slow).toContain('products match.')
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
  expect(clear.height).toBeGreaterThanOrEqual(40)
  for (const control of [page.getByLabel('Go to row'), page.getByRole('button', { name: 'Go' })]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  }
  await context.close()
})

test('the toolbar searches the products and sets the density, on a desktop and a phone', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(vite.resolvedUrls!.local[0]!)
  await cell(page, 'p0', 'line').waitFor({ timeout: 120_000 })
  // The widgets arrive as a chunk after boot; their radio group is the sign.
  await page.getByRole('radiogroup', { name: 'Row density' }).waitFor({ timeout: 30_000 })

  const search = page.getByRole('searchbox', { name: 'Search products' })
  await search.fill('Cable, large #2')
  await expect
    .poll(() => page.locator('#products').getAttribute('aria-rowcount'), slow)
    .not.toBe('100001')
  await expect.poll(() => page.getByRole('status').textContent(), slow).toContain('match')
  // The clear button hands focus back to the field it took away.
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect
    .poll(() => page.locator('#products').getAttribute('aria-rowcount'), slow)
    .toBe('100001')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('type')), slow)
    .toBe('search')

  const rowHeight = async () => (await cell(page, 'p0', 'line').boundingBox())!.height
  expect(await rowHeight()).toBe(32)
  await page.getByRole('radio', { name: 'spacious' }).click()
  await expect.poll(rowHeight, slow).toBe(44)

  await page.setViewportSize({ width: 390, height: 800 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page.close()
})

test('Go to row scrolls to the product and puts the keyboard on it, and a range says its size', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(vite.resolvedUrls!.local[0]!)
  await cell(page, 'p0', 'upc').waitFor({ timeout: 120_000 })

  await page.getByLabel('Go to row').fill('5000')
  await page.getByLabel('Go to row').press('Enter')
  await cell(page, 'p4999', 'upc').waitFor(slow)
  await expect
    .poll(() => page.locator('#products').getAttribute('aria-activedescendant'), slow)
    .toBe('products:p4999:upc')
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('products')
  await expect
    .poll(() => page.getByRole('status').textContent(), slow)
    .toContain('Went to row 5,000.')

  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowRight')
  await expect
    .poll(() => page.locator('#registry-counts').textContent(), slow)
    .toContain('A range of 4 cells (2 rows by 2 columns) is selected.')
  await page.keyboard.press('Control+c')
  await expect
    .poll(() => page.getByRole('status').textContent(), slow)
    .toContain('Copied 2 rows by 2 columns.')

  await page.getByLabel('Go to row').fill('0')
  await page.getByLabel('Go to row').press('Enter')
  await expect
    .poll(() => page.getByRole('status').textContent(), slow)
    .toContain('No row 0: rows run from 1 to 100,000.')
  await page.close()
})

test('a click on a funnel opens its form and keeps it open with focus in its field; a second click closes it', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(vite.resolvedUrls!.local[0]!)
  await cell(page, 'p0', 'line').waitFor({ timeout: 120_000 })
  const funnel = page.getByRole('button', { name: 'Filter Line' })
  const form = page.locator('#products [role="dialog"]')
  await funnel.click()
  await form.waitFor(slow)
  // The defect closed it within a frame; wait well past that.
  await page.waitForTimeout(500)
  expect(await form.isVisible()).toBe(true)
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT')
  await funnel.click()
  await expect.poll(() => form.count(), slow).toBe(0)
  await page.close()
})

test('the toolbar is reachable by keyboard alone: Tab walks its controls and the arrows pick a density', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(vite.resolvedUrls!.local[0]!)
  await page.getByRole('radiogroup', { name: 'Row density' }).waitFor({ timeout: 120_000 })
  const focused = () =>
    page.evaluate(() => {
      const element = document.activeElement
      return element?.getAttribute('aria-label') ?? element?.textContent ?? element?.tagName
    })

  await page.getByRole('searchbox', { name: 'Search products' }).focus()
  await page.keyboard.type('bolt')
  await page.keyboard.press('Escape')
  // Escape clears the text and leaves the key on the field.
  await expect.poll(() => page.getByRole('searchbox').inputValue(), slow).toBe('')
  expect(await focused()).toBe('Search products')

  // One tab stop in the density group: the chosen option.
  await page.keyboard.press('Tab')
  await expect.poll(focused, slow).toBe('comfortable')
  await page.keyboard.press('ArrowRight')
  await expect.poll(focused, slow).toBe('spacious')
  await expect
    .poll(() => page.getByRole('radio', { name: 'spacious' }).getAttribute('aria-checked'), slow)
    .toBe('true')
  await page.close()
})
