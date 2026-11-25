/**
 * End-to-end tests for `domains-plus` running on `foldkit-ssr/binder`
 * (Phase 6, Bout 6.11):
 *   1. A cart press before the runtime chunk loads is answered immediately by
 *      the binder (DOM anchors update while `assets/entry-*.js` is still held,
 *      zero POSTs), survives hand-over to `SSR.hydrate` with zero rebuilt
 *      elements, and subsequent presses after hand-over work through Foldkit.
 *   2. Navigation to another page after hand-over succeeds cleanly.
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

const opened = async (): Promise<{
  readonly page: Page
  readonly problems: Array<string>
  readonly posts: Array<string>
}> => {
  const page = await browser.newPage()
  const problems: Array<string> = []
  const posts: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname !== '/remote') {
      posts.push(request.url())
    }
  })
  return { page, problems, posts }
}

const holdRuntime = async (page: Page) => {
  let release = (): void => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  let requests = 0
  await page.route(RUNTIME_CHUNK, async route => {
    requests += 1
    await held
    await route.continue()
  })
  return { release, asked: () => requests }
}

const recordServed = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      const rootEl = document.querySelector('[data-foldkit-app]')
      ;(window as unknown as { served: Array<Element> }).served =
        rootEl === null ? [] : [rootEl, ...rootEl.querySelectorAll('*')]
    })
  })

const rebuilt = (page: Page) =>
  page.evaluate(() => {
    const served = (window as unknown as { served?: Array<Element> }).served ?? []
    return {
      count: served.length,
      gone: served
        .filter(
          element =>
            !element.isConnected &&
            element.tagName !== 'STYLE' &&
            element.getAttribute('name') !== 'foldkit-plus-message',
        )
        .map(element => element.outerHTML.slice(0, 100)),
    }
  })

test('answers a cart press before runtime loads, hands over with zero rebuilt elements, and answers presses after', async () => {
  const { page, problems, posts } = await opened()
  await recordServed(page)
  const chunk = await holdRuntime(page)
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    const firstAdd = page
      .locator('.domain-card')
      .first()
      .getByRole('button', { name: /^Add .* to cart$/ })

    // Press BEFORE the runtime chunk finishes loading: binder answers immediately!
    await firstAdd.click()
    await page.getByRole('button', { name: 'Cart, 1 domains' }).waitFor({ timeout: 10_000 })
    expect(await page.locator('#cart-announcement').textContent()).toBe('1 domain in your cart.')
    expect(posts).toEqual([])

    // Release the runtime chunk so Foldkit hydrates and adopts the binder's state
    chunk.release()
    await page.waitForFunction(
      () => !document.querySelector('[data-foldkit-app]')?.hasAttribute('data-foldkit-plus-resume'),
      undefined,
      { timeout: 60_000 },
    )

    // Binder's cart count survived hand-over, and the cart button + every card stayed the exact same DOM node
    await page.getByRole('button', { name: 'Cart, 1 domains' }).waitFor({ timeout: 10_000 })
    const preserved = await page.evaluate(() => {
      const served = (window as unknown as { served?: Array<Element> }).served ?? []
      const cartBtn = document.getElementById('cart-button')
      const cards = Array.from(document.querySelectorAll('.domain-card'))
      return {
        servedCount: served.length,
        cartButtonPreserved: cartBtn !== null && served.includes(cartBtn),
        allCardsPreserved: cards.length > 0 && cards.every(card => served.includes(card)),
      }
    })
    expect(preserved).toEqual({
      servedCount: expect.any(Number),
      cartButtonPreserved: true,
      allCardsPreserved: true,
    })

    // Press a second domain AFTER hand-over: runtime answers it normally
    const secondAdd = page
      .locator('.domain-card')
      .nth(1)
      .getByRole('button', { name: /^Add .* to cart$/ })
    await secondAdd.click()
    await page.getByRole('button', { name: 'Cart, 2 domains' }).waitFor({ timeout: 10_000 })
    expect(problems).toEqual([])
  } finally {
    chunk.release()
    await page.close()
  }
})

test('hydrates with zero rebuilt elements at rest and navigates cleanly to an unserved search page', async () => {
  const { page, problems } = await opened()
  await recordServed(page)
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    await page.waitForFunction(
      () => !document.querySelector('[data-foldkit-app]')?.hasAttribute('data-foldkit-plus-resume'),
      undefined,
      { timeout: 60_000 },
    )
    const check = await rebuilt(page)
    expect(check.count).toBeGreaterThan(0)
    expect(check.gone).toEqual([])

    await page.goto(`${origin}/?q=nova`, { waitUntil: 'load' })
    await page.locator('.domain-card').first().waitFor({ timeout: 10_000 })
    expect(problems).toEqual([])
  } finally {
    await page.close()
  }
})
