/**
 * The studio's shell in the published demo's build mode: on a wide window it fills the window and
 * only its centre column scrolls, the sidebar and the settings panel standing for their full
 * height; on a phone the document scrolls.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Page, chromium } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import config from '../vite.config.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer(
    mergeConfig(config, {
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      mode: 'sandbox',
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/** The first post of the list, open in the editor. */
const openPost = async (page: Page) => {
  await page.goto(`${url}/?as=edda&reset`)
  const first = page.locator('#studio-main tbody button').first()
  await first.waitFor({ timeout: 120_000 })
  await first.click()
  await page.getByRole('complementary', { name: 'Post settings' }).waitFor({ timeout: 60_000 })
}

const wheelToEnd = async (page: Page, width: number, height: number) => {
  await page.mouse.move(width / 2, height / 2)
  for (let step = 0; step < 40; step++) {
    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
}

test.each([
  [1280, 720],
  [1440, 900],
])(
  'at %ipx wide the window does not scroll: the centre column does, between a full-height sidebar and settings panel',
  async (width, height) => {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
    await openPost(page)
    await wheelToEnd(page, width, height)

    const measured = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const main = document.getElementById('studio-main')!
      const lastField = Array.from(main.querySelectorAll('input, textarea')).at(-1)!
      return {
        windowScroll: document.documentElement.scrollTop,
        windowOverflow: document.documentElement.scrollHeight - innerHeight,
        columnScrolled: main.scrollTop,
        sidebar: box('aside[aria-label="Studio"]'),
        settings: box('aside[aria-label="Post settings"]'),
        lastField: lastField.getBoundingClientRect(),
        innerHeight,
      }
    })
    expect(measured.windowScroll).toBe(0)
    expect(measured.windowOverflow).toBeLessThanOrEqual(0)
    expect(measured.columnScrolled).toBeGreaterThan(0)
    expect(measured.sidebar.top).toBe(0)
    expect(measured.sidebar.bottom).toBe(measured.innerHeight)
    // The panel's height is the window's less the bar in rem, which lands a fraction of a pixel short.
    expect(Math.abs(measured.settings.bottom - measured.innerHeight)).toBeLessThan(1)
    expect(measured.lastField.bottom).toBeLessThanOrEqual(measured.innerHeight)
    expect(measured.lastField.top).toBeGreaterThanOrEqual(0)
    await page.context().close()
  },
)
