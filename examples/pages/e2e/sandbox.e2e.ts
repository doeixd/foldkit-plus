/**
 * The sandbox end to end: the Vite dev server in the `sandbox` mode, so the journal runs in
 * a SharedWorker, and two tabs of one Chromium editing one page. Each tab's typing reaches
 * the other, and a reloaded tab reads it back from the journal the other kept alive.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    mode: 'sandbox',
    logLevel: 'error',
    server: { port: 0 },
  })
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const body = (page: Page) => page.locator('#page-body [contenteditable]')
const openPage = async (page: Page, title: string) => {
  await page.getByRole('button', { name: title }).click({ timeout: 15_000 })
  await page.waitForSelector('#page-body')
}

test('two tabs of one browser edit one page through the journal in the browser', async () => {
  // One context: the tabs of one browser, which share its SharedWorker.
  const context = await browser.newContext()
  const errors: Array<string> = []
  const open = async () => {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(url)
    await page.waitForSelector('#new-page', { timeout: 120_000 })
    return page
  }
  const ada = await open()
  const ben = await open()
  await ada.click('#new-page')
  await ada.fill('#page-title', 'Groceries')
  await ada.press('#page-title', 'Enter')
  await body(ada).click()
  await ada.keyboard.type('Milk and eggs')

  await openPage(ben, 'Groceries')
  await expect.poll(() => body(ben).textContent(), { timeout: 15_000 }).toBe('Milk and eggs')
  await body(ben).click()
  await ben.keyboard.press('End')
  await ben.keyboard.type(', and bread')
  await expect
    .poll(() => body(ada).textContent(), { timeout: 15_000 })
    .toBe('Milk and eggs, and bread')

  await ben.reload()
  await ben.waitForSelector('#new-page', { timeout: 60_000 })
  await openPage(ben, 'Groceries')
  await expect
    .poll(() => body(ben).textContent(), { timeout: 15_000 })
    .toBe('Milk and eggs, and bread')
  expect(errors).toEqual([])
  await context.close()
})
