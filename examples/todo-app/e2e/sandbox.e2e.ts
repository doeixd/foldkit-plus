/**
 * The sandbox end to end: the Vite dev server in the `sandbox` mode, so the
 * journal runs in a SharedWorker, and Chromium with two tabs of it as two
 * people. A todo one adds reaches the other, and a reloaded tab reads it back
 * from the journal the other tab kept alive.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from 'playwright'
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

const titles = (page: Page) => page.locator('li button[title="Rename"]').allTextContents()

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

const openAs = async (context: BrowserContext, token: string, errors: Array<string>) => {
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${url}?token=${token}`)
  await page.waitForSelector('input[aria-label="New todo"]', { timeout: 120_000 })
  return page
}
const connection = (page: Page) => page.getByRole('status').first()
const shows = (locator: Locator, pattern: RegExp, timeout = 10_000) =>
  expect.poll(() => locator.textContent(), { timeout }).toMatch(pattern)
const focused = (locator: Locator) =>
  expect.poll(() => locator.evaluate(element => element === document.activeElement)).toBe(true)
const add = async (page: Page, title: string) => {
  await page.fill('input[aria-label="New todo"]', title)
  await page.press('input[aria-label="New todo"]', 'Enter')
}

test('edits queue while offline, reach another tab once back online, and a delete is undone by keyboard', async () => {
  const context = await browser.newContext()
  const errors: Array<string> = []
  const alice = await openAs(context, 'alice', errors)
  const bob = await openAs(context, 'bob', errors)
  await shows(connection(alice), /Saved on this device and in sync/)

  await alice.getByRole('button', { name: 'Go offline' }).click()
  await shows(connection(alice), /Offline: edits are kept on this device/)
  await add(alice, 'Queued one')
  await add(alice, 'Queued two')
  await shows(connection(alice), /Offline: 2 changes waiting to sync/)
  // Nothing left her tab: the journal both tabs share has not heard of them.
  await bob.waitForTimeout(1_000)
  expect(await titles(bob)).not.toContain('Queued one')

  await alice.getByRole('button', { name: 'Go online' }).click()
  await shows(connection(alice), /Saved on this device and in sync/, 20_000)
  await expect.poll(() => titles(bob), { timeout: 15_000 }).toEqual(['Queued one', 'Queued two'])

  // Enter on a title renames it, and Enter in the editor puts focus back on the title.
  await alice.getByRole('button', { name: 'Rename "Queued one"' }).focus()
  await alice.keyboard.press('Enter')
  await focused(alice.getByRole('textbox', { name: 'Rename "Queued one"' }))
  await alice.keyboard.type(' today')
  await alice.keyboard.press('Enter')
  await focused(alice.getByRole('button', { name: 'Rename "Queued one today"' }))

  // A delete moves focus to the next row, says so, and the offer brings the todo back.
  await alice.getByRole('button', { name: 'Delete "Queued one today"' }).focus()
  await alice.keyboard.press('Enter')
  await focused(alice.getByRole('button', { name: 'Rename "Queued two"' }))
  await shows(alice.getByRole('status').last(), /Deleted "Queued one today"\.\s*Undo/)
  await alice.getByRole('button', { name: 'Undo' }).click()
  await focused(alice.getByRole('button', { name: 'Rename "Queued one today"' }))
  await expect.poll(() => titles(bob), { timeout: 15_000 }).toContain('Queued one today')
  expect(errors).toEqual([])
  await context.close()
})

test('on a phone the page does not scroll sideways and its controls are a finger wide', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const errors: Array<string> = []
  const page = await openAs(context, 'phone', errors)
  await add(
    page,
    'A long title with an unbroken-looking-token-that-is-wider-than-the-row-should-still-wrap',
  )
  await expect.poll(() => titles(page)).toHaveLength(1)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // Scrolled to the end, the guide pill sits on the room the page reserves, clear of the footer's controls.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const pill = (await page.locator('details[data-corner] > summary').boundingBox())!
  const footerControls = await page.locator('footer button, footer a[href]').all()
  const covered: Array<string> = []
  for (const control of footerControls) {
    const box = (await control.boundingBox())!
    const intersects =
      box.x < pill.x + pill.width &&
      pill.x < box.x + box.width &&
      box.y < pill.y + pill.height &&
      pill.y < box.y + box.height
    if (intersects) covered.push((await control.textContent())?.trim() ?? '')
  }
  expect(footerControls.length).toBeGreaterThan(0)
  expect(covered).toEqual([])
  for (const control of [
    page.getByRole('button', { name: 'Go offline' }),
    page.getByRole('button', { name: /^Delete / }),
    page.getByRole('button', { name: 'Active' }),
  ]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  }
  expect(errors).toEqual([])
  await context.close()
})
