/**
 * The published demo's server, end to end: the Vite dev server in the
 * `sandbox` mode, so the server runs in a SharedWorker, and Chromium with two
 * tabs of it. Both write to one database: what one tab writes is still there
 * after the other has written, and after a reload.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type BrowserContext } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, as `cms.e2e.ts` does.
import config from '../vite.config.js'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer(
    mergeConfig(config, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      mode: 'sandbox',
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const status = (page: Awaited<ReturnType<BrowserContext['newPage']>>) =>
  page.locator('#studio-main [role="status"]').textContent()

test('two tabs write to one sandbox, and neither loses the other’s post', async () => {
  // One context: the tabs of one browser, which share its SharedWorker and storage.
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  const errors: Array<string> = []
  const tab = async () => {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(`${url}/?as=wren`)
    await page.getByRole('button', { name: 'New post' }).waitFor({ timeout: 120_000 })
    return page
  }
  const write = async (page: Awaited<ReturnType<typeof tab>>, title: string) => {
    await page.getByRole('button', { name: 'New post' }).click()
    await page.getByRole('textbox', { name: 'Title' }).fill(title)
    await page.getByRole('textbox', { name: 'Excerpt' }).fill('A few words.')
    await page.getByRole('textbox', { name: 'Body' }).fill('More words.')
    await expect.poll(() => status(page), { timeout: 15_000 }).toBe('Draft saved.')
  }
  const first = await tab()
  const second = await tab()
  await write(first, 'Written in the first tab')
  await write(second, 'Written in the second tab')

  await first.goto(`${url}/?as=wren`)
  for (const title of ['Written in the first tab', 'Written in the second tab'])
    await expect.poll(() => first.getByText(title).count(), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(errors).toEqual([])
  await context.close()
})
