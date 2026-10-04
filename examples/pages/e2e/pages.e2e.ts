/**
 * The pages example end to end: its sync server (the journal in memory) and its Vite dev
 * server started here, and Chromium tabs editing one page. Each tab's typing reaches the
 * other without a reload, and a new browser, with nothing stored, reads it all from the
 * server.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { openJournal } from '../src/journal.js'
import { startPagesServer } from '../src/server.js'

let journal: ReturnType<typeof openJournal>
let server: Awaited<ReturnType<typeof startPagesServer>>
let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  journal = openJournal()
  server = await startPagesServer({ journal })
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: {
      port: 0,
      // The proxy goes to this run's server, on the port it was given.
      proxy: { '/sync': { target: server.url, ws: true } },
    },
  })
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
  journal?.close()
})

/** A tab in a browser of its own, so it has its own storage and its own replica. */
const open = async () => {
  const page = await browser.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  return { page, errors }
}
const body = (page: Page) => page.locator('#page-body [contenteditable]')
const openPage = async (page: Page, title: string) => {
  await page.getByRole('button', { name: title }).click({ timeout: 10_000 })
  await page.waitForSelector('#page-body')
}

test('two tabs edit one page, and a new browser reads it from the server', async () => {
  const ada = await open()
  const ben = await open()
  await ada.page.click('#new-page')
  await ada.page.fill('#page-title', 'Groceries')
  await ada.page.press('#page-title', 'Enter')
  await body(ada.page).click()
  await ada.page.keyboard.type('Milk and eggs')

  // Ben's tab hears of each commit: the page appears in the list, and its text.
  await openPage(ben.page, 'Groceries')
  await expect.poll(() => body(ben.page).textContent(), { timeout: 10_000 }).toBe('Milk and eggs')

  await body(ben.page).click()
  await ben.page.keyboard.press('End')
  await ben.page.keyboard.type(', and bread')
  await expect
    .poll(() => body(ada.page).textContent(), { timeout: 10_000 })
    .toBe('Milk and eggs, and bread')

  const cleo = await open()
  await openPage(cleo.page, 'Groceries')
  await expect
    .poll(() => body(cleo.page).textContent(), { timeout: 10_000 })
    .toBe('Milk and eggs, and bread')
  expect([...ada.errors, ...ben.errors, ...cleo.errors]).toEqual([])
})
