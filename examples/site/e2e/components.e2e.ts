/**
 * The component pages added with the key-route round, on the Vite dev server in
 * Chromium: each fits a phone (no sideways scroll, no page error), and what
 * only a browser shows holds: the toolbar's one tab stop and its arrows, the
 * search field's clear returning focus to the input, and a removed file's
 * focus going back to the file input.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which resolves the workspace sources (see theme.e2e.ts).
import config from '../vite.config.js'
import { showcases } from '../src/gallery/showcases.js'
import { auditPhone } from '../src/phoneAudit.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  const serving = await config({ command: 'serve', mode: 'development', isPreview: false })
  vite = await createServer(
    mergeConfig(serving, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
  // The first load pre-bundles the workspace: pay for it here, not in a test.
  const warm = await browser.newPage()
  await warm.goto(`${url}/components/search-field`, { timeout: 400_000 })
  await warm.waitForSelector('[data-size="page"]', { timeout: 400_000 })
  await warm.close()
}, 500_000)

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const open = async (page: Page, path: string) => {
  // A first load pre-bundles the workspace, which takes a while.
  await page.goto(`${url}${path}`, { timeout: 120_000 })
  await page.waitForSelector('[data-size="page"]', { timeout: 120_000 })
  // Served markup answers nothing until the browser's code has taken it over; the previews are busy until then.
  await page.waitForFunction(
    () => document.querySelector('[data-size][aria-busy="true"]') === null,
    undefined,
    {
      timeout: 120_000,
    },
  )
}

// Every catalog page: a page added to the gallery is audited without a line here.
const PAGES = showcases.map(showcase => showcase.slug)

test.each(PAGES)(
  '/components/%s fits a phone',
  async slug => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    try {
      const page = await context.newPage()
      const errors: Array<string> = []
      page.on('pageerror', error => errors.push(String(error)))
      await open(page, `/components/${slug}`)
      // Measured against the layout viewport: a phone zooms out to fit an overflowing page.
      const audit = await auditPhone(page)
      expect({ errors, overflow: audit.overflow }).toEqual({ errors: [], overflow: 0 })
    } finally {
      await context.close()
    }
  },
  180_000,
)

test('the toolbar has one tab stop and the arrows move along it, skipping the disabled link', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await open(page, '/components/toolbar')
    const bar = page.locator('[data-size="page"] [role="toolbar"]').first()
    expect(await bar.locator('button[tabindex="0"]').count()).toBe(1)
    await bar.getByRole('button', { name: 'Bold' }).focus()
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Italic')
    await page.keyboard.press('End')
    // The last control is the disabled Link, so End lands on the one before it.
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Align right')
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Bold')
    // The tab stop followed focus: Italic is not it now.
    expect(await bar.locator('button[tabindex="0"]').count()).toBe(1)
    expect(await bar.getByRole('button', { name: 'Bold' }).getAttribute('tabindex')).toBe('0')
  } finally {
    await context.close()
  }
}, 180_000)

test('clearing a search field with its button, or with Escape, puts focus back in the input', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await open(page, '/components/search-field')
    const field = page.getByRole('searchbox', { name: 'Search recipes' })
    await field.fill('pie')
    await page.getByRole('button', { name: 'Clear search' }).first().click()
    await expect.poll(() => field.inputValue()).toBe('')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
      'Search recipes',
    )
    await field.fill('tart')
    await page.keyboard.press('Escape')
    await expect.poll(() => field.inputValue()).toBe('')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
      'Search recipes',
    )
  } finally {
    await context.close()
  }
}, 180_000)

test('the keys of your own move the highlight in the results', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await open(page, '/components/search-field')
    const field = page.getByRole('searchbox', { name: 'Find a recipe' })
    await field.fill('apple')
    await field.press('ArrowDown')
    await expect
      .poll(() => page.locator('li[aria-current="true"]').first().textContent())
      .toBe('Apple pie')
    await field.press('ArrowUp')
    await expect
      .poll(() => page.locator('li[aria-current="true"]').first().textContent())
      .toBe('Apple crumble')
  } finally {
    await context.close()
  }
}, 180_000)

test('a removed file leaves the input holding what the list shows, and focus on the input', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await open(page, '/components/file-input')
    const input = page.locator('input#preview-attachments-input')
    const png = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from(name) })
    await input.setInputFiles([png('a.png'), png('b.png')])
    await expect.poll(() => page.getByRole('button', { name: 'Take a.png off' }).count()).toBe(1)
    expect(await input.evaluate((element: HTMLInputElement) => element.files?.length)).toBe(2)
    await page.getByRole('button', { name: 'Take a.png off' }).click()
    await expect.poll(() => page.getByRole('button', { name: 'Take a.png off' }).count()).toBe(0)
    expect(
      await input.evaluate((element: HTMLInputElement) =>
        Array.from(element.files ?? [], file => file.name),
      ),
    ).toEqual(['b.png'])
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('preview-attachments-input')
  } finally {
    await context.close()
  }
}, 180_000)
