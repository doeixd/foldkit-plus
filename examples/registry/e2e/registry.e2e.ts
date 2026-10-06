/**
 * The registry end to end: its server (Remote over HTTP, the journal over a
 * WebSocket) and its Vite dev server started here, and a real Chromium
 * driving the page. Reading on as the end comes into view, a sort the server
 * does over all 100,000 products, an edit that survives a reload, a column
 * hidden from its menu, and the offline switch sending at once when it is off.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { Effect } from 'effect'
import { REMOTE_PROTOCOL_VERSION, Remote } from 'foldkit-remote'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHttpServer } from '../src/http.js'
import { productId, seedOf } from '../src/server.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
let vite: ViteDevServer
let browser: Browser
let page: Page
let url: string

beforeAll(async () => {
  server = await startHttpServer(0)
  const at = new URL(server.url)
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: {
      port: 0,
      // The proxies go to this run's server, on the port it was given.
      proxy: {
        '/remote': { target: `http://${at.host}` },
        '/sync': { target: `ws://${at.host}`, ws: true },
      },
    },
  })
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
})

const open = async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  await page.waitForSelector('#products [role="gridcell"]', { timeout: 120_000 })
  return errors
}
const cell = (row: string, column: string) => page.locator(`[id="products:${row}:${column}"]`)
const counts = () => page.locator('#counts').textContent()
/** How many product rows the page holds now: the header row is not one. */
const rowsInPage = () =>
  page.locator('#products [role="row"][aria-rowindex]:not([aria-rowindex="1"])').count()

test('reads on as the end comes into view, and sorts over every product', async () => {
  const errors = await open()
  // The strip's count of rows drawn is the rows in the page, laid out for real.
  const drawn = Number(/(\d+) rows drawn/.exec((await counts()) ?? '')?.[1])
  expect(await counts()).toBe(`100 read, more to come · ${drawn} rows drawn`)
  expect(await rowsInPage()).toBe(drawn)
  // Scrolled to the end, the More button comes into view and the next page is read.
  await page.evaluate(() => {
    const grid = document.getElementById('products')!
    grid.scrollTop = grid.scrollHeight
  })
  await expect
    .poll(counts, { timeout: 10_000 })
    .toMatch(/^200 read, more to come · \d+ rows drawn$/)

  // Price, twice: the dearest of all 100,000 first, which no page held before.
  const dearest = Array.from({ length: 100_000 }, (_, index) => seedOf(index)).reduce((a, b) =>
    b.cents > a.cents || (b.cents === a.cents && b.id < a.id) ? b : a,
  )
  const price = page.locator('[id="products:cents"] button', { hasText: 'Price' })
  await price.click()
  await price.click()
  await expect
    .poll(() => cell(dearest.id, 'upc').textContent(), { timeout: 10_000 })
    .toBe(dearest.upc)
  expect(await page.locator('[id="products:cents"]').getAttribute('aria-sort')).toBe('descending')
  expect(errors).toEqual([])
  await page.close()
})

test('an edited price is written by the journal, and is there after a reload', async () => {
  const errors = await open()
  const priceOf = cell(productId(4), 'cents')
  await priceOf.click()
  await page.waitForFunction(
    id => document.getElementById('products')?.getAttribute('aria-activedescendant') === id,
    `products:${productId(4)}:cents`,
  )
  await page.keyboard.press('Enter')
  await page.waitForSelector('#products input')
  await page.keyboard.press('Control+A')
  await page.keyboard.type('77.70')
  await page.keyboard.press('Enter')
  await expect.poll(() => priceOf.textContent()).toBe('77.70')
  // Sent: nothing is kept on the device waiting for the server.
  await expect.poll(() => page.locator('#exchange').textContent(), { timeout: 10_000 }).toBe('')

  // The journal wrote it to the table, at the sequence it committed at: Remote
  // reads it from the server, edits aside.
  const read = await Effect.runPromise(
    Remote.http(server.url).FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Product', id: productId(4), fields: ['cents', 'revision'] }],
    }),
  )
  expect(read.entities).toEqual([
    { entity: 'Product', id: productId(4), values: { cents: 7770, revision: 1 } },
  ])

  await page.reload()
  await page.waitForSelector('#products [role="gridcell"]', { timeout: 60_000 })
  await expect
    .poll(() => cell(productId(4), 'cents').textContent(), { timeout: 10_000 })
    .toBe('77.70')
  expect(seedOf(4).cents).not.toBe(7770)
  expect(errors).toEqual([])
  await page.close()
})

test('a column is hidden from its menu, and shown again from another’s', async () => {
  const errors = await open()
  const header = (column: string) => page.locator(`[id="products:${column}"]`)
  await header('line').locator('[aria-haspopup="menu"]').click()
  await page.locator('#products [role="menuitem"]', { hasText: 'Hide column' }).click()
  await expect.poll(() => header('line').count()).toBe(0)
  await header('status').locator('[aria-haspopup="menu"]').click()
  await page.locator('#products [role="menuitem"]', { hasText: 'Show Line' }).click()
  await expect.poll(() => header('line').count()).toBe(1)
  expect(errors).toEqual([])
  await page.close()
})

test('working offline keeps an edit on the device, and switching back sends it', async () => {
  const errors = await open()
  const exchange = () => page.locator('#exchange').textContent()
  await page.getByRole('checkbox', { name: 'Work offline' }).check()
  await expect.poll(exchange).toBe('Working offline.')
  const priceOf = cell(productId(11), 'cents')
  await priceOf.click()
  await page.waitForFunction(
    id => document.getElementById('products')?.getAttribute('aria-activedescendant') === id,
    `products:${productId(11)}:cents`,
  )
  await page.keyboard.press('Enter')
  await page.waitForSelector('#products input')
  await page.keyboard.press('Control+A')
  await page.keyboard.type('11.10')
  await page.keyboard.press('Enter')
  await expect.poll(exchange).toBe('Working offline: 1 edit kept on this device.')
  expect(await priceOf.getAttribute('data-mark')).toBe('pending')

  // Offline long enough for the replica's backoff to have grown past a few
  // seconds (0.5 s, doubling): switching back sends at once, not when the
  // backoff ends.
  await page.waitForTimeout(4_000)
  await page.getByRole('checkbox', { name: 'Work offline' }).uncheck()
  await expect.poll(exchange, { timeout: 1_500 }).toBe('')
  const read = await Effect.runPromise(
    Remote.http(server.url).FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Product', id: productId(11), fields: ['cents'] }],
    }),
  )
  expect(read.entities).toEqual([{ entity: 'Product', id: productId(11), values: { cents: 1110 } }])
  expect(errors).toEqual([])
  await page.close()
})
