/**
 * The CMS at 320px, the narrowest phone: the site's and the studio's headers
 * and footers lay out with no sideways scroll, and every control in them is
 * drawn inside the viewport and clear of its neighbours. Measured against the
 * layout viewport (`clientWidth`): a phone zooms out to fit an overflowing page,
 * which hides the fault from `innerWidth`.
 */
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHttpServer } from '../src/server/http.js'
import config from '../vite.config.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

let server: Awaited<ReturnType<typeof startHttpServer>>
let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  server = await startHttpServer(0)
  vite = await createServer(
    mergeConfig(config, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      logLevel: 'error',
      server: {
        port: 0,
        proxy: { '/remote': { target: new URL(server.url).origin } },
      },
    }),
  )
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
})

type Box = { name: string; left: number; right: number; top: number; bottom: number }

const WIDTH = 320
const shots = process.env.CMS_SHOTS

/** Each control of each header, footer and the studio's sidebar, as it is drawn. */
const controlBoxes = (page: Page): Promise<Array<Box>> =>
  page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        ['header', 'footer', 'aside[aria-label="Studio"]']
          .map(r => `${r} :is(a, button, input, select, textarea, [role="button"])`)
          .join(', '),
      ),
    )
      .filter(el => el.getClientRects().length > 0)
      .map(el => {
        const r = el.getBoundingClientRect()
        const region = el.closest('header, footer, aside')!.tagName.toLowerCase()
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName
        return {
          name: `${region}: ${name}`,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        }
      }),
  )

const overlap = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5

const prove = async (path: string, ready: string, shot: string) => {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 700 } })
  await page.goto(`${url}${path}`)
  await page.waitForSelector(ready, { timeout: 120_000 })
  // The footer is below the fold; fonts and the first draw settle before measuring.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const metrics = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
  }))
  expect(metrics.client).toBe(WIDTH)
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.client)
  expect(metrics.bodyScroll).toBeLessThanOrEqual(metrics.client)

  const boxes = await controlBoxes(page)
  expect(boxes.length).toBeGreaterThan(2)
  for (const box of boxes) {
    expect(box.left, `${box.name} left`).toBeGreaterThanOrEqual(0)
    expect(box.right, `${box.name} right`).toBeLessThanOrEqual(metrics.client)
  }
  for (const [i, a] of boxes.entries())
    for (const b of boxes.slice(i + 1))
      expect(overlap(a, b), `${a.name} over ${b.name}`).toBe(false)

  if (shots) {
    mkdirSync(shots, { recursive: true })
    await page.screenshot({ path: `${shots}/${shot}.png`, fullPage: true })
  }
  await page.close()
}

test('the site’s header and footer fit 320px', async () => {
  await prove('/site/blog', 'header a, footer a', 'site')
})

test('the studio’s sidebar and screen header fit 320px', async () => {
  await prove('/?as=edda', 'aside a, aside button', 'studio')
})
