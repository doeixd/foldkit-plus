/**
 * The Components gallery's cards on the Vite dev server in Chromium: each
 * card's preview is a bounded thumbnail that paints inside its card, whatever
 * its widget (a list of a thousand rows must not stretch the card), and the
 * page does not scroll sideways at a phone's width.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which resolves the workspace sources (see theme.e2e.ts).
import config from '../vite.config.js'
import { showcases } from '../src/gallery/showcases.js'
import { containment } from './containment.js'
import { onFreePort } from '../../../scripts/free-port.mjs'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

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
      plugins: [mutation()],
    }),
  )
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
}, 500_000)

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const open = async (page: Page) => {
  // A first load pre-bundles the workspace, which takes a while.
  await page.goto(`${url}/components`, { timeout: 400_000 })
  await page.waitForSelector('[data-size="thumb"]', { timeout: 400_000 })
  // Served markup answers nothing until the browser's code has taken it over.
  await page.waitForFunction(
    () => document.querySelector('[data-size][aria-busy="true"]') === null,
    undefined,
    { timeout: 120_000 },
  )
}

// 22rem is the thumbnail's bound (`preview` in `style.ts`), a little over for borders.
const LIMIT = 360

test.each([1440, 390, 360])(
  'every card of the gallery holds its preview inside the card at %ipx',
  async width => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 600,
      isMobile: width < 600,
    })
    try {
      const page = await context.newPage()
      await open(page)
      // A card per showcase, so a card added to the catalogue is checked without a line here.
      const linked = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-size="thumb"]')).map(
          frame =>
            frame.parentElement?.querySelector(':scope > a[href]')?.getAttribute('href') ?? '',
        ),
      )
      expect([...linked].sort()).toEqual(
        showcases.map(showcase => `/components/${showcase.slug}`).sort(),
      )
      // Measured against the layout viewport: a phone zooms out to fit an overflowing page.
      const found = await page.evaluate(containment, LIMIT)
      expect(found).toEqual({ escaped: [], tall: [], overflow: 0 })
    } finally {
      await context.close()
    }
  },
  400_000,
)
