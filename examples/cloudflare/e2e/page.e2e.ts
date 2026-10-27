/**
 * The Cloudflare page end to end: the worker on miniflare (D1, the Durable
 * Object), the page on Vite with `/remote` sent to it, and Chromium driving
 * the page. A todo added to the empty list shows in the tab that added it,
 * and the page fits a phone with its controls a finger's size.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startStack, type CloudflareStack } from '../src/stack.js'

let stack: CloudflareStack
let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  stack = await startStack()
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0, proxy: { '/remote': { target: stack.origin } } },
  })
  await vite.listen()
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await stack?.stop()
})

test('a todo added to the empty list shows, and on a phone each control is a finger’s size', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(vite.resolvedUrls!.local[0]!)
  const list = page.locator('#Todos')
  await expect.poll(() => list.textContent(), { timeout: 120_000 }).toBe('Nothing to do.')

  await page.getByRole('textbox', { name: 'New todo' }).fill('Buy milk')
  await page.getByRole('button', { name: 'Add' }).click()
  const title = page.getByRole('button', { name: 'Buy milk', exact: true })
  await title.waitFor()

  const remove = await page.getByRole('button', { name: 'Delete Buy milk' }).boundingBox()
  expect(remove!.height).toBeGreaterThanOrEqual(24)
  expect((await title.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(errors).toEqual([])
  await page.close()
})
