/**
 * The widgets demo end to end: its Vite dev server started here and Chromium
 * driving the page, as a visitor follows the demo's steps. Bold presses in the
 * toolbar; the command palette narrows six commands to two and picks one. The
 * sort Picker drops its options down on a desktop and shows them in a sheet on
 * a phone, and either choice reaches the page; the window list keeps the page
 * scrolling and draws a handful of its thousand names at its end. The page
 * throws nothing and has the Foldkit plugin answering.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
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

test('Bold presses, and the palette narrows to what was typed and picks from it', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.text().includes('No response from @foldkit/vite-plugin'))
      problems.push(message.text())
  })
  await page.goto(vite.resolvedUrls!.local[0]!)

  const bold = page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', {
    name: 'Bold',
  })
  await bold.waitFor({ timeout: 120_000 })
  expect(await bold.getAttribute('aria-pressed')).toBe('false')
  await bold.click()
  await expect.poll(() => bold.getAttribute('aria-pressed')).toBe('true')

  const palette = page.getByRole('dialog', { name: 'Commands' })
  await expect.poll(() => palette.getByRole('option').count()).toBe(6)
  await palette.getByRole('searchbox', { name: 'Search commands' }).fill('new')
  await expect
    .poll(() => palette.getByRole('option').allTextContents())
    .toEqual(['New file', 'New folder'])
  const folder = palette.getByRole('option', { name: 'New folder' })
  await folder.click()
  await expect.poll(() => folder.getAttribute('aria-selected')).toBe('true')

  expect(problems).toEqual([])
  await page.close()
})

const visit = async (width: number, height: number) => {
  const page = await browser.newPage({ viewport: { width, height } })
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  await page.goto(vite.resolvedUrls!.local[0]!)
  return { page, problems }
}

test('on a desktop the sort Picker drops its options down', async () => {
  const { page, problems } = await visit(1280, 900)
  const trigger = page.getByRole('button', { name: 'Sort: Sort by' })
  await trigger.waitFor({ timeout: 120_000 })
  expect(await page.getByRole('button', { name: 'Sort: Sort by' }).count()).toBe(1)
  await trigger.click()
  await page.getByRole('option', { name: /Lowest price/ }).click()
  await expect.poll(() => page.getByText('Sorted by: Lowest price').count()).toBe(1)
  expect(problems).toEqual([])
  await page.close()
})

test('on a phone the sort Picker shows its options in a sheet', async () => {
  const { page, problems } = await visit(390, 844)
  const opener = page.getByRole('button', { name: 'Sort: Sort by' })
  await opener.waitFor({ timeout: 120_000 })
  await opener.click()
  const sheet = page.getByRole('dialog', { name: 'Sort' })
  await sheet.getByRole('option', { name: /Name/ }).click()
  await expect.poll(() => page.getByText('Sorted by: Name').count()).toBe(1)
  await expect.poll(() => sheet.count()).toBe(0)
  expect(problems).toEqual([])
  await page.close()
})

test('the window list scrolls with the page and draws a handful of rows at its end', async () => {
  const { page, problems } = await visit(390, 844)
  const list = page.getByRole('list', { name: 'Names' })
  await list.waitFor({ timeout: 120_000 })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const last = list.getByText('harbor-125.io')
  await last.waitFor()
  expect(await list.getByRole('listitem').count()).toBeLessThan(45)
  expect(await list.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible')
  expect(problems).toEqual([])
  await page.close()
})
