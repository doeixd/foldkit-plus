/**
 * The sandbox end to end: the Vite dev server in the `sandbox` mode, so the journal runs in
 * a SharedWorker, and two tabs of one Chromium editing one page. Each tab's typing reaches
 * the other, and a reloaded tab reads it back from the journal the other kept alive.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../scripts/free-port.mjs'

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
  await onFreePort(() => vite.listen())
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

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)

test('focus follows a new page, Enter in its title, a delete, and its undo', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await expect.poll(() => focused(page)).toBe('page-title')
  await page.keyboard.type('Plans')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('#page-body') !== null))
    .toBe(true)
  await page.keyboard.type('Ship it')

  await page.click('#delete-page')
  await expect.poll(() => focused(page)).toBe('undo-trash')
  await page.getByRole('status').filter({ hasText: 'moved to the trash' }).waitFor()
  await page.keyboard.press('Enter')
  await expect.poll(() => focused(page)).toBe('page-title')
  await expect.poll(() => body(page).textContent()).toBe('Ship it')
  await context.close()
})

test('the sidebar opens a second tab, and each tab then says the other is online', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const first = await context.newPage()
  await first.goto(url)
  await first.waitForSelector('#second-tab', { timeout: 120_000 })
  // Phone width: the link is shown, and nothing makes the page scroll sideways.
  expect(
    await first.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  const [second] = await Promise.all([context.waitForEvent('page'), first.click('#second-tab')])
  await second.waitForSelector('#new-page', { timeout: 60_000 })
  for (const tab of [first, second])
    await expect.poll(() => tab.getByText('1 other online').count(), { timeout: 30_000 }).toBe(1)
  await context.close()
})

test('a keyboard reaches the block handle from the text, and its menu opens', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await page.keyboard.type('Notes')
  await page.keyboard.press('Enter')
  await page.keyboard.type('First')
  await page.getByRole('button', { name: 'Block handle' }).waitFor()
  await page.keyboard.press('Tab')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Block handle')
  await page.keyboard.press('Enter')
  await page.getByRole('menu', { name: 'Block' }).waitFor()
  await context.close()
})
