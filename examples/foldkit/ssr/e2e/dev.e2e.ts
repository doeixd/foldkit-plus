/**
 * `pnpm dev` end to end, with no `FOLDKIT_BUILD_ID` in the environment, as
 * the README runs it: the dev server renders the page, Chromium takes it over
 * rather than containing it, and the buttons count with nothing logged as an
 * error.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'

let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  delete process.env.FOLDKIT_BUILD_ID
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

test('the served page is taken over and counts', async () => {
  const page = await browser.newPage()
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text())
  })
  await page.goto(vite.resolvedUrls!.local[0]!)

  const count = page.locator('#count')
  await count.waitFor({ timeout: 120_000 })
  const before = Number(await count.textContent())
  await page.getByRole('button', { name: '+', exact: true }).click()
  await expect.poll(() => count.textContent(), { timeout: 30_000 }).toBe(String(before + 1))

  expect(problems).toEqual([])
  await page.close()
})

test('the sheets the server sent stay in the head once the page is taken over (#365)', async () => {
  const page = await browser.newPage()
  await page.goto(vite.resolvedUrls!.local[0]!)
  await page.locator('#count').waitFor({ timeout: 120_000 })
  // The first patch takes the envelope off the root.
  await page.waitForFunction(() => document.querySelector('[data-foldkit-plus-resume]') === null)
  // `renderPage.ts` sends the page's classes (`Style.usedIn`) as a sheet in the
  // root, which hydration would have removed; the template's own head sheet
  // holds the theme alone, and the injected one is marked.
  const served = await page.evaluate(() =>
    Array.from(document.head.querySelectorAll('style:not([data-foldkit-styles])'), sheet =>
      /\.style-[0-9a-z]+/.test(sheet.textContent ?? ''),
    ).filter(Boolean),
  )
  expect(served).toHaveLength(1)
  expect(await page.locator('body style').count()).toBe(0)
  await page.close()
})
