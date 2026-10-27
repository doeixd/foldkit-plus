/**
 * The widgets demo end to end: its Vite dev server started here and Chromium
 * driving the page, as a visitor follows the demo's steps. Bold presses in the
 * toolbar; the command palette narrows six commands to two and picks one. The
 * page throws nothing and has the Foldkit plugin answering.
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
