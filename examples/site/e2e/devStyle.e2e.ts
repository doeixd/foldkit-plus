/**
 * A guide's code blocks are drawn by the server only, so the dev server must
 * write the classes they use into the page: without them the copy button was
 * the browser's plain grey one and the block had no box, while every
 * prerender test passed. Read as computed style, in light and dark.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which resolves the workspace sources (see theme.e2e.ts).
import config from '../vite.config.js'
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
}, 500_000)

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

test.each(['light', 'dark'] as const)(
  'a code block keeps its recipe styling in %s',
  async scheme => {
    const context = await browser.newContext({ colorScheme: scheme })
    try {
      const page = await context.newPage()
      await page.goto(`${url}/remote`, { timeout: 400_000 })
      const button = page.locator('[data-copy-code]').first()
      await button.waitFor({ timeout: 120_000 })
      const look = await button.evaluate(element => {
        const style = getComputedStyle(element)
        const block = getComputedStyle(element.closest('figure') ?? element)
        return {
          cursor: style.cursor,
          radius: style.borderTopLeftRadius,
          border: style.borderTopWidth,
          block: block.backgroundColor,
        }
      })
      expect(look.cursor).toBe('pointer')
      expect(look.radius).not.toBe('0px')
      expect(look.border).not.toBe('0px')
      expect(look.block).not.toBe('rgba(0, 0, 0, 0)')
    } finally {
      await context.close()
    }
  },
  500_000,
)
