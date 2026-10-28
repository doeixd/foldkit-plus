/**
 * The Cloudflare page end to end: the worker on miniflare (D1, the Durable
 * Object), the page on Vite with `/remote` sent to it, and Chromium driving
 * the page. A todo added to the empty list shows while its write is still
 * held at the network and stays once it is answered, and the list never
 * reads "Loading…" meanwhile, nor on a reload; the page fits a phone with its controls a
 * finger's size, and logs no error.
 */
import { Behaviors } from 'foldkit-plus/testing/playwright'
import { type Browser, chromium } from 'playwright'
import type { ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { servePage } from '../src/pageServer.js'
import { startStack, type CloudflareStack } from '../src/stack.js'

let stack: CloudflareStack
let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  stack = await startStack()
  vite = await servePage(stack.origin, 0)
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await stack?.stop()
})

test('a todo shows before the server answers, the list never loading again, and on a phone each control is a finger’s size', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const errors = Behaviors.consoleErrors(page)
  await page.goto(vite.resolvedUrls!.local[0]!)
  const list = page.locator('#Todos')
  await expect.poll(() => list.textContent(), { timeout: 120_000 }).toBe('Nothing to do.')

  await page.getByRole('textbox', { name: 'New todo' }).fill('Buy milk')
  const title = page.getByRole('button', { name: 'Buy milk', exact: true })
  await Behaviors.neverShows(page, {
    text: 'Loading…',
    during: () =>
      Behaviors.optimistic(page, {
        act: () => page.getByRole('button', { name: 'Add' }).click(),
        shows: title,
      }),
  })

  // A reload draws the stored list from its first frame (#262). The save waits
  // for the cache to settle, so reload only once the row is stored.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('foldkit-crud-cache:anon') ?? ''))
    .toContain('Buy milk')
  await Behaviors.neverShows(page, {
    text: 'Loading…',
    during: async () => {
      await page.reload()
      await title.waitFor()
    },
  })

  const remove = await page.getByRole('button', { name: 'Delete Buy milk' }).boundingBox()
  expect(remove!.height).toBeGreaterThanOrEqual(24)
  expect((await title.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(errors()).toEqual([])
  await page.close()
})
