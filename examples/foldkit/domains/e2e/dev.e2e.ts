/**
 * `pnpm dev` end to end, run by the repository's `pnpm e2e`: the Vite dev
 * server renders the page and answers `/rpc` through the sample backend, as
 * the README runs it. Upstream's own Playwright suites (`*.spec.ts` here) run
 * with `playwright test`; this checks the copy still starts in the workspace.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0, host: '127.0.0.1' },
  })
  await onFreePort(() => vite.listen())
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const origin = () => vite.resolvedUrls!.local[0]!.replace(/\/$/, '')

test('a typed search lists its domains, priced by the sample backend', async () => {
  const page = await browser.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin()}/`)

  await page.getByRole('searchbox', { name: 'Search domains' }).fill('acme')

  const firstCard = page.locator('.domain-card').first()
  await expect.poll(() => firstCard.textContent(), { timeout: 120_000 }).toContain('acme.com')
  await expect.poll(() => firstCard.textContent(), { timeout: 30_000 }).toMatch(/\$\d+\.\d\d/)
  expect(new URL(page.url()).searchParams.get('q')).toBe('acme')
  expect(errors).toEqual([])
  await page.close()
})

test('an unknown path answers 404 with a way back', async () => {
  const page = await browser.newPage()
  const response = await page.goto(`${origin()}/missing`)

  expect(response?.status()).toBe(404)
  await page.getByRole('link', { name: '← Back to Domains' }).waitFor({ timeout: 60_000 })
  await page.close()
})
