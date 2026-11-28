/**
 * The language page end to end: its Vite dev server (no remote server; SQLite
 * runs in the page) and Chromium driving it. A choice changes every reader's
 * pane, typing narrows SQLite's answer and the in-memory one alike, a refusal
 * is shown in the package's words, and the page holds still on a phone.
 */
import { fileURLToPath } from 'node:url'
import { auditPhone } from 'foldkit-example-site/phone-audit'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let page: Page
const errors: Array<string> = []

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0 },
  })
  await onFreePort(() => vite.listen())
  browser = await chromium.launch()
  page = await browser.newPage()
  page.on('pageerror', error => errors.push(String(error)))
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const open = async () => {
  await page.goto(`${vite.resolvedUrls!.local[0]!}language.html`)
  // SQLite's WebAssembly is fetched on the first question.
  await expect.poll(() => status(), { timeout: 120_000 }).toMatch(/^Search: 2 rows\./)
}

const status = () => page.getByRole('status').first().textContent()

/** The ids in the first column of a pane's table, by the table's own name. */
const ids = async (name: string) =>
  page.getByRole('table', { name }).getByRole('rowheader').allTextContents()

test('a body asked in the page is answered by SQLite and the in-memory readers alike', async () => {
  await open()
  expect(await status()).toBe('Search: 2 rows. SQLite, evaluate and Judge agree.')
  expect(await ids('Rows SQLite answered')).toEqual(['p2', 'p3'])
  expect(await ids('Rows evaluate answered')).toEqual(['p2', 'p3'])
  expect(await ids('Rows Judge knows are in')).toEqual(['p2', 'p3'])
  // The statement is the adapter's own, with its parameters.
  expect(await page.getByLabel('Statement the adapter compiled').textContent()).toContain(
    'from "posts"',
  )
  // metakit's lowering binds the search lowered (`instr(lower(headline), ?)`), not as a LIKE pattern.
  expect(await page.getByText('["comp",101]').isVisible()).toBe(true)
  expect(await page.getByLabel('The expression').textContent()).toContain(
    'WHERE contains(Post.title, $search)',
  )

  // Typing narrows both answers identically.
  await page.getByRole('textbox', { name: 'Search text' }).fill('loom')
  await expect.poll(() => status()).toBe('Search: 1 row. SQLite, evaluate and Judge agree.')
  expect(await ids('Rows SQLite answered')).toEqual(['p4'])
  expect(await ids('Rows evaluate answered')).toEqual(['p4'])
  await page.getByRole('textbox', { name: 'Search text' }).fill('zzz')
  await expect.poll(() => status()).toBe('Search: 0 rows. SQLite, evaluate and Judge agree.')
  expect(await page.getByText('Rows SQLite answered: no rows.').isVisible()).toBe(true)
  expect(await page.getByText('Rows evaluate answered: no rows.').isVisible()).toBe(true)
})

test('a body only SQL can answer shows each reader’s own words', async () => {
  await open()
  await page.getByLabel('Body').selectOption('ByAuthorName')
  await expect
    .poll(() => status())
    .toBe('ByAuthorName: 2 rows. SQLite and Judge agree. evaluate refuses: it does not run path.')
  expect(
    await page.getByText('evaluate refuses this body: it does not run path.').isVisible(),
  ).toBe(true)
  expect(await ids('Rows SQLite answered')).toEqual(['p2', 'p1'])
  // A page holding part of the rows says unknown, with the reason, and is right where it knows.
  const verdicts = await page
    .getByRole('table', { name: 'Judge’s verdict on each post' })
    .getByRole('row')
    .allTextContents()
  expect(verdicts.filter(row => row.includes('unknown: Author a2 is not held'))).toHaveLength(1)
  expect(await page.getByText('right on all 2 it knows').isVisible()).toBe(true)
})

test('who is asking changes a body that reads the viewer', async () => {
  await open()
  await page.getByLabel('Body').selectOption('Discussed')
  await expect.poll(() => status()).toMatch(/^Discussed: 2 rows\./)
  expect(await ids('Rows SQLite answered')).toEqual(['p1', 'p3'])
  await page.getByRole('radio', { name: 'Grace' }).click()
  await expect.poll(() => status()).toMatch(/^Discussed: 1 row\./)
  expect(await ids('Rows SQLite answered')).toEqual(['p1'])
  await page.getByRole('radio', { name: 'A visitor' }).click()
  await expect.poll(() => status()).toMatch(/^Discussed: 0 rows\./)
})

test('on a phone the page does not scroll sideways and its targets are reachable', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open()
  await page.getByLabel('Body').selectOption('NotEditedBy')
  await expect.poll(() => status()).toMatch(/^NotEditedBy: 1 row\./)
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)
  expect(await auditPhone(page)).toEqual({ overflow: 0, small: [] })
  expect(errors).toEqual([])
})
