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

let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0 },
  })
  await vite.listen()
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
