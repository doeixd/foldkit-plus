/**
 * `pnpm dev` end to end: the dev server renders each page through the
 * Worker's entry (`src/server/entry.ts`), and Chromium resumes it.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Page, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'

let vite: ViteDevServer
let browser: Browser
let origin: string

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0, strictPort: false },
  })
  await vite.listen()
  origin = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/** A page that records every error it logs or throws. */
const opened = async (): Promise<{ readonly page: Page; readonly problems: Array<string> }> => {
  const page = await browser.newPage()
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text())
  })
  return { page, problems }
}

test('the landing page is served styled and taken over', async () => {
  const { page, problems } = await opened()
  const response = await page.goto(`${origin}/`)
  expect(response?.status()).toBe(200)
  const search = page.getByRole('searchbox', { name: 'Search domains' })
  await search.waitFor({ timeout: 120_000 })
  // Styled by the head's sheet before any script: the page is black.
  expect(
    await page.locator('#domains-app').evaluate(node => getComputedStyle(node).backgroundColor),
  ).toBe('rgb(0, 0, 0)')
  expect(problems).toEqual([])
  await page.close()
})

test('an unknown path answers 404 with the not-found page', async () => {
  const { page, problems } = await opened()
  const response = await page.goto(`${origin}/missing`)
  expect(response?.status()).toBe(404)
  await page.getByText('404 — Page Not Found').waitFor({ timeout: 60_000 })
  // The browser logs the document's own 404, and nothing else.
  expect(problems).toEqual([
    'Failed to load resource: the server responded with a status of 404 (Not Found)',
  ])
  await page.close()
})

test('typing follows into the address, survives a reload, and comes back with back', async () => {
  const { page, problems } = await opened()
  await page.goto(`${origin}/`)
  const search = page.getByRole('searchbox', { name: 'Search domains' })
  await search.waitFor({ timeout: 60_000 })
  await search.pressSequentially('acme', { delay: 40 })
  await expect.poll(() => new URL(page.url()).search).toBe('?q=acme')
  await expect.poll(() => page.locator('.domain-card').count()).toBe(4)
  expect(await page.locator('.domain-card h3').first().textContent()).toBe('acme.com')

  await page.reload()
  await expect.poll(() => search.inputValue()).toBe('acme')
  // Typing replaces the entry, so the brand link is the step back goes back over.
  await page.getByRole('link', { name: 'Domains home' }).click()
  await expect.poll(() => new URL(page.url()).search).toBe('')
  await expect.poll(() => search.inputValue()).toBe('')
  await page.goBack()
  await expect.poll(() => search.inputValue()).toBe('acme')
  await expect.poll(() => page.locator('#domains-app').getAttribute('data-search')).toBe('active')
  expect(problems).toEqual([])
  await page.close()
})
