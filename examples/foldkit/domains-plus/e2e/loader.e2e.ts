/**
 * The built Worker with the SSR loader (#472), `DOMAINS_PLUS_LOADER=1 pnpm
 * build`: the page loads `foldkit-ssr/loader`, the plan starts idle, and the
 * runtime's chunk (`assets/entry-*.js`) is a file of its own that each test
 * holds, fails or lets through. Held, the served page is all there is, and
 * what a reader does to it must survive the late boot.
 *
 * Hand mutation (the build is outside `pnpm mutate`): in
 * `packages/ssr/src/loader.ts`, delete `if (event.type === 'submit')
 * event.preventDefault()` in `hold`; the first test goes red, since the held
 * press then posts the form.
 *
 * The page has no checkbox or radio, so a box ticked before boot is covered by
 * the package's own browser tests (`packages/ssr/test/loader.browser.test.ts`).
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
    env: { ...process.env, DOMAINS_PLUS_LOADER: '1' },
  })
  if (built.status !== 0) throw new Error(`pnpm build failed:\n${built.stdout}${built.stderr}`)
  worker = await unstable_startWorker({
    config: `${root}wrangler.jsonc`,
    dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, logLevel: 'error' },
  })
  origin = (await worker.url).origin
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await worker?.dispose()
})

const RUNTIME_CHUNK = '**/assets/entry-*.js'

/** A page that records what it logs or throws and every POST the browser sends it. */
const opened = async (
  context?: Awaited<ReturnType<Browser['newContext']>>,
): Promise<{
  readonly page: Page
  readonly problems: Array<string>
  readonly posts: Array<{ readonly url: string; readonly at: number }>
}> => {
  const page = await (context ?? browser).newPage()
  const problems: Array<string> = []
  const posts: Array<{ url: string; at: number }> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname !== '/remote')
      posts.push({ url: request.url(), at: Date.now() })
  })
  return { page, problems, posts }
}

/** Holds the runtime's chunk until `release()`; `asked()` counts its requests. */
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

/** Records the served elements as the document turns interactive, before any module runs. */
const recordServed = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      const root = document.querySelector('[data-foldkit-app]')
      ;(window as unknown as { served: Array<Element> }).served =
        root === null ? [] : [root, ...root.querySelectorAll('*')]
    })
  })

const rebuilt = (page: Page) =>
  page.evaluate(() => {
    const served = (window as unknown as { served?: Array<Element> }).served ?? []
    return {
      count: served.length,
      gone: served
        // The no-JS fallback's payload fields are removed on purpose (`unmark`).
        .filter(
          element =>
            !element.isConnected &&
            element.tagName !== 'STYLE' &&
            element.getAttribute('name') !== 'foldkit-plus-message',
        )
        .map(element => element.outerHTML.slice(0, 100)),
    }
  })

/** Counts `submit` events reaching the document, the held one included. */
const countSubmits = (page: Page) =>
  page.addInitScript(() => {
    const seen = { count: 0 }
    ;(window as unknown as { submits: typeof seen }).submits = seen
    document.addEventListener('submit', () => (seen.count += 1), true)
  })

const submits = (page: Page) =>
  page.evaluate(() => (window as unknown as { submits: { count: number } }).submits.count)

const addButton = (page: Page) =>
  page
    .locator('.domain-card')
    .first()
    .getByRole('button', { name: /^Add .* to cart$/ })

test('a cart press before the runtime is answered once after it, and nothing is posted', async () => {
  const { page, problems, posts } = await opened()
  await countSubmits(page)
  const chunk = await holdRuntime(page)
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    const button = addButton(page)
    const label = (await button.getAttribute('aria-label'))!
    const name = label.replace(/^Add /, '').replace(/ to cart$/, '')
    await button.click()
    // The chunk was asked for at load (modulepreload), and is held: the page is the served one.
    await expect.poll(chunk.asked, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(await page.locator('[data-foldkit-app]').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Cart, 1 domains' }).count()).toBe(0)
    expect(posts).toEqual([])

    chunk.release()
    await page.getByRole('button', { name: 'Cart, 1 domains' }).waitFor({ timeout: 60_000 })
    await page.locator('#domains-app:not([data-foldkit-plus-resume])').waitFor({ timeout: 60_000 })
    // Idempotent Messages cannot tell once from twice, so the form's events say it:
    // the press made one submit, the handover made no second, and the browser sent none.
    expect(await submits(page)).toBe(1)
    await page.waitForTimeout(500)
    expect(posts).toEqual([])
    expect(new URL(page.url()).search).toBe('?q=acme')
    await page.getByRole('button', { name: 'Cart, 1 domains' }).click()
    await page.getByRole('button', { name: `Remove ${name}`, exact: true }).waitFor()
    expect(problems).toEqual([])
  } finally {
    chunk.release()
    await page.close()
  }
})

test('with the chunk never answering, a pressed cart form is posted once at the 3 s deadline', async () => {
  const { page, posts } = await opened()
  const chunk = await holdRuntime(page)
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    const pressed = Date.now()
    await addButton(page).click()
    await expect.poll(() => posts.length, { timeout: 30_000 }).toBe(1)
    const waited = posts[0]!.at - pressed
    expect(waited).toBeGreaterThanOrEqual(2_800)
    expect(waited).toBeLessThan(10_000)
    expect(new URL(posts[0]!.url).search).toBe('?q=acme')
    // The server's answer is a redirect to the page, with the cart cookie set.
    await page.waitForURL(/[?]q=acme$/)
    await page.waitForTimeout(500)
    expect(posts).toHaveLength(1)
    expect(chunk.asked()).toBeGreaterThan(0)
  } finally {
    chunk.release()
    await page.close()
  }
})

test('with the chunk failed, a pressed cart form is posted once at once', async () => {
  const { page, posts } = await opened()
  await page.route(RUNTIME_CHUNK, route => route.abort())
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    const pressed = Date.now()
    await addButton(page).click()
    await expect.poll(() => posts.length, { timeout: 30_000 }).toBe(1)
    // The failed import releases what is held; it does not wait out the limit.
    expect(posts[0]!.at - pressed).toBeLessThan(2_500)
    await page.waitForURL(/[?]q=acme$/)
    await page.waitForTimeout(500)
    expect(posts).toHaveLength(1)
  } finally {
    await page.close()
  }
})

test('typing before the runtime is kept, with its caret, in the same input', async () => {
  const { page, problems } = await opened()
  await recordServed(page)
  const chunk = await holdRuntime(page)
  try {
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    const input = page.getByRole('searchbox', { name: 'Search domains' })
    const served = await input.elementHandle()
    await input.fill('typed-before-hydration')
    await input.evaluate(element => {
      if (element instanceof HTMLInputElement) element.setSelectionRange(3, 8)
    })
    await expect.poll(chunk.asked, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(new URL(page.url()).search).toBe('')

    chunk.release()
    await expect
      .poll(() => new URL(page.url()).search, { timeout: 60_000 })
      .toBe('?q=typed-before-hydration')
    expect(await input.inputValue()).toBe('typed-before-hydration')
    expect(
      await input.evaluate(element =>
        element instanceof HTMLInputElement ? [element.selectionStart, element.selectionEnd] : [],
      ),
    ).toEqual([3, 8])
    expect(
      await served?.evaluate(element => element === document.getElementById('domain-search')),
    ).toBe(true)
    await expect
      .poll(() => page.locator('.domain-card h3').first().textContent())
      .toBe('typed-before-hydration.com')
    expect(problems).toEqual([])
  } finally {
    chunk.release()
    await page.close()
  }
})

test('the served elements are still in the document after a late boot', async () => {
  const { page, problems } = await opened()
  await recordServed(page)
  const chunk = await holdRuntime(page)
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'load' })
    // Past idle, so the loader has asked for the chunk and nothing has run it.
    await expect.poll(chunk.asked, { timeout: 30_000 }).toBeGreaterThan(0)
    await page.waitForTimeout(1_000)
    expect(await page.locator('[data-foldkit-app]').count()).toBe(1)
    chunk.release()
    await page.locator('#domains-app:not([data-foldkit-plus-resume])').waitFor({ timeout: 60_000 })
    const { count, gone } = await rebuilt(page)
    expect(count).toBeGreaterThan(100)
    expect(gone).toEqual([])
    expect(problems).toEqual([])
  } finally {
    chunk.release()
    await page.close()
  }
})

test('no layout shift when the runtime boots late', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const { page } = await opened(context)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(() => {
    const shifts: Array<number> = []
    ;(window as unknown as { shifts: Array<number> }).shifts = shifts
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
        if (!shift.hadRecentInput) shifts.push(shift.value)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  const chunk = await holdRuntime(page)
  try {
    await page.goto(`${origin}/?q=sunbeam`, { waitUntil: 'load' })
    await expect.poll(chunk.asked, { timeout: 30_000 }).toBeGreaterThan(0)
    // Painted and idle with the runtime absent, then the boot lands.
    await page.waitForTimeout(3_000)
    chunk.release()
    await page.locator('#domains-app:not([data-foldkit-plus-resume])').waitFor({ timeout: 60_000 })
    await page.waitForTimeout(2_000)
    const total = (
      await page.evaluate(() => (window as unknown as { shifts: Array<number> }).shifts)
    ).reduce((sum, value) => sum + value, 0)
    expect(total).toBeLessThan(0.1)
  } finally {
    chunk.release()
    await context.close()
  }
})
