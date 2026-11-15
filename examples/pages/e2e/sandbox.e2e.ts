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
  await expect.poll(() => page.inputValue('#page-title')).toBe('Plans')
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
  await expect.poll(() => focused(page)).toBe('page-title')
  await page.keyboard.type('Notes')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('#page-body') !== null))
    .toBe(true)
  await page.keyboard.type('First')
  await page.getByRole('button', { name: 'Block handle' }).waitFor()
  await page.keyboard.press('Tab')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Block handle')
  // A decoration refresh (presence redraws the carets) must not pull the focus back to the text.
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
    'Block handle',
  )
  await page.keyboard.press('Enter')
  await page.getByRole('menu', { name: 'Block' }).waitFor()
  await context.close()
})

test('the formatting bar is one tab stop with arrows, keeps the selection, and refuses an unavailable control', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await expect.poll(() => focused(page)).toBe('page-title')
  const bar = page.locator('[role="toolbar"][aria-label="Formatting"]')
  const control = (item: string) => bar.locator(`[data-item="${item}"]`)

  // Tab from the title lands on the bar's one stop; the arrows walk it, an unavailable control
  // (nothing to undo) included, and the stop follows focus.
  expect(await bar.locator('button[tabindex="0"]').count()).toBe(1)
  await page.keyboard.press('Tab')
  await expect.poll(() => focused(page)).toBe('bar-undo')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focused(page)).toBe('bar-redo')
  // The stop follows focus a frame later: End before that moves from the old position.
  await expect.poll(() => bar.locator('button[tabindex="0"]').getAttribute('id')).toBe('bar-redo')
  await page.keyboard.press('End')
  await expect.poll(() => focused(page)).toBe('bar-insert')
  expect(await bar.locator('button[tabindex="0"]').getAttribute('id')).toBe('bar-insert')
  await page.keyboard.press('Home')
  await expect.poll(() => focused(page)).toBe('bar-undo')
  expect(await control('undo').getAttribute('aria-disabled')).toBe('true')

  // Pressing Bold toggles it on the selected text, and the selection stays for the next press.
  await body(page).click()
  await page.keyboard.type('Milk')
  await page.keyboard.press('Shift+Home')
  await control('mark-Bold').click()
  await expect.poll(() => control('mark-Bold').getAttribute('aria-pressed')).toBe('true')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Milk')
  await control('mark-Bold').click()
  await expect.poll(() => control('mark-Bold').getAttribute('aria-pressed')).toBe('false')
  await expect.poll(() => control('undo').getAttribute('aria-disabled')).toBe('false')

  // Redo has nothing to redo: a press on it changes nothing.
  expect(await control('redo').getAttribute('aria-disabled')).toBe('true')
  await control('redo').dispatchEvent('click')
  expect(await control('undo').getAttribute('aria-disabled')).toBe('false')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  await context.close()
})

test('Escape on a formatting bar control returns to the text, and typing lands there', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#new-page', { timeout: 120_000 })
  await page.click('#new-page')
  await expect.poll(() => focused(page)).toBe('page-title')
  await body(page).click()
  await page.keyboard.type('Milk')
  await page.keyboard.press('Shift+Home')
  const bold = page.locator('[role="toolbar"][aria-label="Formatting"] [data-item="mark-Bold"]')
  await bold.focus()
  await page.keyboard.press('Escape')
  await expect.poll(() => body(page).evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.type('Oat')
  await expect.poll(() => body(page).textContent()).toContain('Oat')
  await context.close()
})
