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

test('the Top Results fill with prices read from /remote', async () => {
  const { page, problems } = await opened()
  const reads: Array<string> = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/remote') reads.push(request.postData() ?? '')
  })
  await page.goto(`${origin}/?q=vercel`)
  await expect.poll(() => page.locator('.domain-card .price').count(), { timeout: 60_000 }).toBe(2)
  expect(await page.locator('.domain-card .unavailable').count()).toBe(2)
  expect(await page.locator('.domain-card .price').allTextContents()).toEqual(['$9.99', '$34.99'])
  await expect
    .poll(() => page.locator('.result-count').textContent())
    .toMatch(/\d+ of 556 domains checked/)
  // The first read is the four top names, as upstream's first request.
  const first: { payload: { requests: Array<{ id: string }> } } = JSON.parse(reads[0] ?? '{}')
  expect(first.payload.requests.map(({ id }) => id).sort()).toEqual([
    'vercel.app',
    'vercel.com',
    'vercel.dev',
    'vercel.io',
  ])
  expect(problems).toEqual([])
  await page.close()
})

test('a search typed over aborts the read still in flight for the last one', async () => {
  const { page, problems } = await opened()
  const aborted: Array<string> = []
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname === '/remote') aborted.push(request.postData() ?? '')
  })
  // Each read waits two seconds at the server, so the first is still in flight.
  await page.route('**/remote', async route => {
    await new Promise(resolve => setTimeout(resolve, 2_000))
    await route.continue().catch(() => undefined)
  })
  await page.goto(`${origin}/`)
  const search = page.getByRole('searchbox', { name: 'Search domains' })
  await search.waitFor({ timeout: 60_000 })
  await search.pressSequentially('acme', { delay: 30 })
  await page.waitForTimeout(500)
  await search.press('End')
  await search.pressSequentially('x', { delay: 30 })
  await expect.poll(() => aborted.length, { timeout: 10_000 }).toBe(1)
  expect(aborted[0]).toContain('"acme.com"')
  await expect.poll(() => page.locator('.domain-card .price').count(), { timeout: 30_000 }).toBe(4)
  expect(await page.locator('.domain-card h3').first().textContent()).toBe('acmex.com')
  expect(problems).toEqual([])
  await page.close()
})

test('All Results reads the rows scrolled into view, and only those', async () => {
  const { page, problems } = await opened()
  const asked: Array<string> = []
  page.on('request', request => {
    if (new URL(request.url()).pathname !== '/remote') return
    const body: { payload: { requests: Array<{ id: string }> } } = JSON.parse(
      request.postData() ?? '{}',
    )
    asked.push(...body.payload.requests.map(({ id }) => id))
  })
  await page.goto(`${origin}/?q=acme`)
  const rows = page.locator('#domain-results .domain-row')
  await expect
    .poll(() => page.locator('#domain-results .domain-row .price').count(), { timeout: 60_000 })
    .toBeGreaterThan(0)
  expect(asked).not.toContain('acme.zone')
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  )
  await expect.poll(() => rows.last().textContent(), { timeout: 30_000 }).toContain('acme.zone')
  // Every row drawn at the end is priced, and the middle of the list was never read.
  await expect
    .poll(
      async () =>
        (await rows.count()) === (await page.locator('#domain-results .domain-row .price').count()),
      { timeout: 30_000 },
    )
    .toBe(true)
  expect(asked).toContain('acme.zone')
  expect(asked).not.toContain('acme.lighting')
  expect(problems).toEqual([])
  await page.close()
})

test('on a phone the filters open as sheets from the bottom', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  await page.goto(`${origin}/?q=vercel`)
  await expect.poll(() => page.locator('.domain-card .price').count(), { timeout: 60_000 }).toBe(2)
  // The desktop's TLD dropdown is hidden; the phone's opener shows.
  expect(await page.locator('.desktop-tld-filter').isVisible()).toBe(false)
  await page.getByRole('button', { name: 'Filter by TLD: All TLDs' }).click()
  const sheet = page.locator('.tld-panel')
  await sheet.waitFor()
  const box = await sheet.boundingBox()
  expect(box !== null && box.y + box.height).toBeGreaterThan(780)
  await page.getByRole('searchbox', { name: 'Search TLDs' }).fill('.dev')
  await page.getByRole('button', { name: '.dev', exact: true }).click()
  await expect.poll(() => sheet.count()).toBe(0)
  await expect.poll(() => page.locator('.result-count').textContent()).toContain('domains')
  expect(await page.locator('#domain-results .domain-row').allTextContents()).toEqual([
    expect.stringContaining('vercel.dev'),
  ])

  await page.getByRole('button', { name: 'Sort results: Relevance' }).click()
  await page.getByRole('option', { name: 'Alphabetical' }).click()
  await expect
    .poll(() => page.getByRole('button', { name: 'Sort results: Alphabetical' }).count())
    .toBe(1)
  expect(problems).toEqual([])
  await page.close()
})

test('the cart takes domains once, and focus moves as upstream moves it', async () => {
  const { page, problems } = await opened()
  await page.goto(`${origin}/?q=vercel`)
  await expect.poll(() => page.locator('.domain-card .price').count(), { timeout: 60_000 }).toBe(2)
  await page.getByRole('button', { name: 'Add vercel.app to cart' }).first().click()
  await page.getByRole('button', { name: 'Add vercel.io to cart' }).first().click()
  await expect
    .poll(() => page.locator('#cart-announcement').textContent())
    .toBe('2 domains in your cart.')
  await page.getByRole('button', { name: 'Cart, 2 domains' }).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('cart-close-button')
  expect(await page.locator('.cart-total').textContent()).toContain('$44.98')
  await page.getByRole('button', { name: 'Remove vercel.app', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('cart-close-button')
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('cart-button')
  expect(await page.getByRole('button', { name: 'Cart, 1 domains' }).count()).toBe(1)
  expect(problems).toEqual([])
  await page.close()
})

test('typing before the bundle runs is kept, with its caret, in the same input', async () => {
  const { page, problems } = await opened()
  let release = (): void => undefined
  const bundle = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/src/client/entry.ts', async route => {
    await bundle
    await route.continue()
  })
  await page.goto(`${origin}/`, { waitUntil: 'commit' })
  const input = page.getByRole('searchbox', { name: 'Search domains' })
  await input.waitFor({ timeout: 60_000 })
  const served = await input.elementHandle()
  await input.fill('typed-before-hydration')
  await input.evaluate(element => {
    if (element instanceof HTMLInputElement) element.setSelectionRange(3, 8)
  })
  // The server's page has no script yet: nothing has answered the typing.
  expect(new URL(page.url()).search).toBe('')
  release()
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
  await page.close()
})
