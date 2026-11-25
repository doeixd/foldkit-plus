/**
 * End-to-end tests for per-Message lazy chunks on `domains-plus` (Phase 7, Bout 7.8):
 *   1. A press while `assets/addDomain-*.js` is held happens exactly once once
 *      the chunk arrives (even if clicked twice while held), with zero POSTs.
 *   2. When `assets/addDomain-*.js` fails to load, a held form press is
 *      released to browser POST submission (server fallback).
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { type Browser, type Page, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { unstable_startWorker } from 'wrangler'

const root = fileURLToPath(new URL('..', import.meta.url))

let worker: Awaited<ReturnType<typeof unstable_startWorker>>
let browser: Browser
let origin: string

beforeAll(async () => {
  const built = spawnSync('pnpm build', {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, DOMAINS_PLUS_BINDER: '1' },
  })
  if (built.status !== 0) throw new Error(`pnpm build failed:\n${built.stdout}${built.stderr}`)
  worker = await unstable_startWorker({
    config: `${root}wrangler.jsonc`,
    dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, logLevel: 'error' },
  })
  origin = (await worker.url).origin
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] })
})

afterAll(async () => {
  await browser?.close()
  await worker?.dispose()
})

const RUNTIME_CHUNK = '**/assets/entry-*.js'
const ADD_DOMAIN_CHUNK = '**/assets/addDomain-*.js'

const holdRoute = async (page: Page, pattern: string) => {
  let release = (): void => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  let requests = 0
  await page.route(pattern, async route => {
    requests += 1
    await held
    await route.continue()
  })
  return { release, asked: () => requests }
}

test('press before addDomain chunk loads happens exactly once when the chunk arrives', async () => {
  const page = await browser.newPage()
  const posts: Array<string> = []
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname !== '/remote') posts.push(req.url())
  })
  const runtime = await holdRoute(page, RUNTIME_CHUNK)
  const addChunk = await holdRoute(page, ADD_DOMAIN_CHUNK)
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    const firstAdd = page
      .locator('.domain-card')
      .first()
      .getByRole('button', { name: /^Add .* to cart$/ })

    // Press twice while addDomain chunk is still held
    await firstAdd.click()
    await firstAdd.click()
    await expect.poll(addChunk.asked, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await page.getByRole('button', { name: 'Cart, 1 domains' }).count()).toBe(0)

    // Release addDomain chunk: cart updates to 1 (never 2!) while runtime is still held
    addChunk.release()
    await page.getByRole('button', { name: 'Cart, 1 domains' }).waitFor({ timeout: 10_000 })
    expect(await page.locator('#cart-announcement').textContent()).toBe('1 domain in your cart.')
    expect(posts).toEqual([])
  } finally {
    addChunk.release()
    runtime.release()
    await page.close()
  }
})

test('failed addDomain chunk releases a held cart form to browser POST fallback', async () => {
  const page = await browser.newPage()
  const posts: Array<string> = []
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname !== '/remote') posts.push(req.url())
  })
  const runtime = await holdRoute(page, RUNTIME_CHUNK)
  await page.route(ADD_DOMAIN_CHUNK, route => route.abort('failed'))
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    const firstAdd = page
      .locator('.domain-card')
      .first()
      .getByRole('button', { name: /^Add .* to cart$/ })

    await firstAdd.click()
    // Form submission falls back to server POST and renders Cart, 1 domains
    await expect.poll(() => posts.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    await page.getByRole('button', { name: 'Cart, 1 domains' }).waitFor({ timeout: 15_000 })
  } finally {
    runtime.release()
    await page.close()
  }
})
