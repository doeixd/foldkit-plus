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
import { onFreePort } from '../../../scripts/free-port.mjs'

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
  await onFreePort(() => vite.listen())
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
const saved = (page: Page) => page.locator('#saved').textContent()
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

test('with the server down an edit says it is kept, and saved once the server is up', async () => {
  // A port nothing listens on, until a server starts there again below.
  const later = openJournal()
  const first = await startPagesServer({ journal: later })
  const port = Number(new URL(first.url).port)
  await first.close()
  const offline = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'silent',
    server: { port: 0, proxy: { '/sync': { target: `ws://127.0.0.1:${port}`, ws: true } } },
  })
  await onFreePort(() => offline.listen())
  let up: Awaited<ReturnType<typeof startPagesServer>> | undefined
  try {
    const page = await browser.newPage()
    await page.goto(offline.resolvedUrls!.local[0]!)
    await page.waitForSelector('#new-page', { timeout: 120_000 })
    await page.click('#new-page')
    await expect
      .poll(() => saved(page), { timeout: 30_000 })
      .toMatch(/^Offline: \d+ edits? kept in this tab until the server is back\.$/)

    up = await startPagesServer({ journal: later, port })
    await expect.poll(() => saved(page), { timeout: 60_000 }).toBe('All changes saved.')
  } finally {
    await up?.close()
    await offline.close()
    later.close()
  }
})
