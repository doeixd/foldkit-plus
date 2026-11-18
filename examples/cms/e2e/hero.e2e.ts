/**
 * The public site's hero in the published demo's build mode: its actions read on the colored band,
 * in both schemes. Colors are read as painted (through a canvas), since a computed `oklch(…)` is
 * not an rgb triple.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
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

test.each(['light', 'dark'] as const)(
  'the hero’s primary action is a filled button whose label reads on its fill, in the %s scheme',
  async scheme => {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme })
    ).newPage()
    await page.goto(`${url}/site?as=edda&reset`)
    const action = page.getByRole('link', { name: 'Read the blog' })
    await action.waitFor({ timeout: 120_000 })
    await page.waitForTimeout(500)
    const ratio = await action.evaluate(element => {
      const paint = (color: string) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return Array.from(context.getImageData(0, 0, 1, 1).data)
      }
      const luminance = ([r, g, b]: ReadonlyArray<number>) => {
        const channel = (value: number) => {
          const unit = value / 255
          return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
      }
      const style = getComputedStyle(element)
      const fill = paint(style.backgroundColor)
      // A fill with transparency is blended on the page by the browser; require it opaque.
      const [light, dark] = [luminance(fill), luminance(paint(style.color))].sort((a, b) => b - a)
      return { alpha: fill[3], ratio: (light! + 0.05) / (dark! + 0.05) }
    })
    expect(ratio.alpha).toBe(255)
    expect(ratio.ratio).toBeGreaterThanOrEqual(4.5)
    console.log(scheme, 'hero action contrast', ratio.ratio.toFixed(2))
    await page.context().close()
  },
)
