/**
 * Side-by-side screenshots of upstream's app and the port, in the same states
 * at four widths, for review by eye (fonts and token rounding differ, so no
 * pixel threshold). Both must be served first, upstream's built Worker and the
 * port's (`pnpm preview` in each):
 *
 *   node parity/screenshots.mjs <out-dir> [upstream origin] [port origin]
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [out, upstream = 'http://127.0.0.1:5180', port = 'http://127.0.0.1:5193'] =
  process.argv.slice(2)
if (out === undefined)
  throw new Error('usage: node parity/screenshots.mjs <out-dir> [upstream] [port]')
mkdirSync(out, { recursive: true })

const WIDTHS = [320, 390, 900, 1440]
const phone = width => width <= 700

/** Holds every read, so the page stays as it is before any answer. */
const holdReads = async page => {
  await page.route(/\/(remote|rpc)\/?$/, () => new Promise(() => undefined))
}

/** Answers the first read and fails every later one, so a later page fails. */
const failLaterReads = async page => {
  let answered = 0
  await page.route(/\/(remote|rpc)\/?$/, async route => {
    answered += 1
    if (answered <= 2) await route.continue()
    else await route.fulfill({ status: 500, body: '{}' })
  })
}

const priced = page => page.locator('.domain-card .price').first().waitFor({ timeout: 30_000 })

const states = {
  landing: async page => page.goto('/'),
  pending: async page => {
    await holdReads(page)
    await page.goto('/?q=acme')
    await page.locator('.domain-card').first().waitFor()
  },
  ready: async page => {
    await page.goto('/?q=acme')
    await priced(page)
  },
  'filters-open': async (page, width) => {
    await page.goto('/?q=acme')
    await priced(page)
    const opener = phone(width)
      ? page
          .getByRole('button', { name: /Filters and sort|Sort results/ })
          .filter({ visible: true })
          .first()
      : page
          .getByRole('button', { name: /Sort results/ })
          .filter({ visible: true })
          .first()
    await opener.click()
  },
  'tld-sheet': async page => {
    await page.goto('/?q=acme')
    await priced(page)
    await page
      .getByRole('button', { name: /Filter by TLD/ })
      .filter({ visible: true })
      .first()
      .click()
  },
  'cart-two': async page => {
    await page.goto('/?q=acme')
    await priced(page)
    await page.getByRole('button', { name: 'Add acme.com to cart' }).first().click()
    await page.getByRole('button', { name: 'Add acme.dev to cart' }).first().click()
    await page.getByRole('button', { name: /^Cart, 2 domains/ }).click()
  },
  'page-failure': async page => {
    await failLaterReads(page)
    await page.goto('/?q=acme')
    await priced(page)
    await page.evaluate(() => window.scrollTo({ top: 4000, behavior: 'instant' }))
    await page
      .getByRole('alert')
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined)
  },
  'invalid-label': async page => page.goto('/?q=-bad-'),
  'not-found': async page => page.goto('/missing'),
}

const browser = await chromium.launch()
const failures = []
for (const width of WIDTHS) {
  for (const [state, enter] of Object.entries(states)) {
    for (const [app, origin] of [
      ['upstream', upstream],
      ['port', port],
    ]) {
      const context = await browser.newContext({
        baseURL: origin,
        viewport: { width, height: 900 },
        hasTouch: phone(width),
        isMobile: phone(width),
      })
      const page = await context.newPage()
      try {
        await enter(page, width)
        await page.waitForTimeout(900)
        await page.screenshot({ path: `${out}/${state}-${width}-${app}.png` })
      } catch (error) {
        failures.push(`${state} ${width} ${app}: ${String(error).split('\n')[0]}`)
      }
      await context.close()
    }
  }
}
await browser.close()
console.log(failures.length === 0 ? 'every state captured' : failures.join('\n'))
