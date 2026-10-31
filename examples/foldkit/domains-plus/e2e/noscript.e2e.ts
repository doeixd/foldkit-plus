/**
 * The page with JavaScript off, and the same page with it on (#388). Off,
 * the search and the filters are a GET of the address, the list pages by
 * links, and the cart is a form the server answers by running `update`.
 * On, none of that is sent: the runtime answers it, loads no chunk the
 * enhancement added, and adopts the served page without a warning.
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

/** The prices All Results shows, in order; a name the demo marks taken shows none. */
const rowPrices = (page: Page) =>
  page
    .locator('#domain-results .domain-row .price')
    .allTextContents()
    .then(texts => texts.map(text => Number(text.replace(/[^\d.]/g, ''))))

test('without JavaScript, the page searches, filters, pages and keeps a cart', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(`${origin}/`)

  const search = page.getByRole('searchbox', { name: 'Search domains' })
  await search.fill('acme')
  await search.press('Enter')
  await page.waitForURL(/[?&]q=acme(&|$)/)
  // Everything shown is priced: the cards, and every row of the list's window.
  expect(await page.locator('.domain-card .price').count()).toBe(4)
  const rows = page.locator('#domain-results .domain-row')
  expect(await rows.count()).toBeGreaterThan(30)
  expect(await page.locator('#domain-results .domain-row .skeleton-price').count()).toBe(0)
  expect(await page.locator('.result-count').textContent()).toMatch(/\d+ of 556 domains checked/)

  // The dropdowns only a script opens are hidden; their plain selects show.
  expect(await page.locator('.desktop-filters').isVisible()).toBe(false)
  await page.getByRole('combobox', { name: 'Filter availability' }).selectOption('Available')
  await page.getByRole('combobox', { name: 'Sort results' }).selectOption('PriceAscending')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.waitForURL(/availability=Available/)
  expect(new URL(page.url()).searchParams.get('q')).toBe('acme')
  const ascending = await rowPrices(page)
  expect(ascending.length).toBeGreaterThan(30)
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b))
  expect(await page.locator('#domain-results .unavailable').count()).toBe(0)

  // The list's next rows, by a link the server draws from.
  const firstRow = await rows.first().textContent()
  await page.getByRole('link', { name: 'Next' }).click()
  await page.waitForURL(/from=\d+/)
  expect(
    Number(
      await page.locator('#domain-results [role="listitem"]').first().getAttribute('aria-posinset'),
    ),
  ).toBeGreaterThan(1)
  expect(await rows.first().textContent()).not.toBe(firstRow)
  await page.getByRole('link', { name: 'Previous' }).click()
  await page.waitForURL(url => !url.searchParams.has('from'))
  expect(await rows.first().textContent()).toBe(firstRow)

  // The cart: a form posted to the page, answered by `update` on the server.
  const card = page.locator('.domain-card').first()
  const name = (await card.locator('h3').textContent())!
  await card.getByRole('button', { name: `Add ${name} to cart` }).click()
  await page.getByRole('link', { name: /^Cart/ }).waitFor()
  expect(await page.getByRole('link', { name: /^Cart/ }).textContent()).toContain('1')
  const cart = page.getByRole('region', { name: 'Your cart' })
  expect(await cart.textContent()).toContain(name)
  expect(await card.getByRole('button', { name: `Remove ${name} from cart` }).count()).toBe(1)

  // Kept in a cookie: another search shows it, and its removal posts too.
  await page.goto(`${origin}/?q=other`)
  expect(await cart.textContent()).toContain(name)
  await cart.getByRole('button', { name: `Remove ${name}` }).click()
  await page.waitForLoadState()
  expect(await cart.textContent()).not.toContain(name)
  await context.close()
})

test('with JavaScript, the same page sends no form, loads no new chunk and adopts without a warning', async () => {
  const page = await browser.newPage()
  const posted: Array<string> = []
  const scripts: Array<string> = []
  const warnings: Array<string> = []
  let live = false
  page.on('request', request => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname !== '/remote') posted.push(request.url())
    if (live && request.resourceType() === 'script') scripts.push(request.url())
  })
  page.on('console', message => {
    if (message.type() === 'error' || message.text().includes('did not match')) {
      warnings.push(message.text())
    }
  })
  page.on('pageerror', error => warnings.push(String(error)))
  await page.goto(`${origin}/?q=acme`)
  await page.locator('#domains-app:not([data-foldkit-plus-resume])').waitFor({ timeout: 60_000 })
  live = true

  // A cart button is a form's submit: the runtime answers it, and nothing posts.
  const card = page.locator('.domain-card').first()
  const name = (await card.locator('h3').textContent())!
  await card.getByRole('button', { name: `Add ${name} to cart` }).click()
  await page.getByRole('button', { name: 'Cart, 1 domains' }).waitFor()
  // Enter in the search form, which is a GET without scripts.
  const search = page.getByRole('searchbox', { name: 'Search domains' })
  await search.fill('acmes')
  await search.press('Enter')
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('acmes')
  // The desktop's dropdown, mirrored into the address the plain select sends.
  await page.getByRole('button', { name: 'Filter availability: Show All' }).click()
  await page.getByRole('option', { name: 'Available' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('availability')).toBe('Available')

  expect(posted).toEqual([])
  expect(scripts).toEqual([])
  expect(warnings).toEqual([])
  await page.close()
})
