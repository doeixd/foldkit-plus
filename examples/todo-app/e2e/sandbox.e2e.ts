/**
 * The sandbox end to end: the Vite dev server in the `sandbox` mode, so the
 * journal runs in a SharedWorker, and Chromium with two tabs of it as two
 * people. A todo one adds reaches the other, and a reloaded tab reads it back
 * from the journal the other tab kept alive.
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

const titles = (page: Page) =>
  page.locator('li span[title="Double-click to rename"]').allTextContents()

test('two tabs share the journal in the browser', async () => {
  // One context: the tabs of one browser, which share its SharedWorker.
  const context = await browser.newContext()
  const errors: Array<string> = []
  const open = async (token: string) => {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(`${url}?token=${token}`)
    await page.waitForSelector('input[aria-label="New todo"]', { timeout: 120_000 })
    return page
  }
  const owner = await open('owner')
  const bob = await open('bob')
  expect(await owner.locator('details').last().textContent()).toContain('You are owner.')

  await owner.fill('input[aria-label="New todo"]', 'Water the plants')
  await owner.press('input[aria-label="New todo"]', 'Enter')
  await expect.poll(() => titles(bob), { timeout: 15_000 }).toContain('Water the plants')

  await bob.reload()
  await bob.waitForSelector('input[aria-label="New todo"]', { timeout: 60_000 })
  await expect.poll(() => titles(bob), { timeout: 15_000 }).toContain('Water the plants')
  expect(errors).toEqual([])
  await context.close()
})
