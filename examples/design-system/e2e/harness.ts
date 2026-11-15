/**
 * What the page's e2e files share: the Vite dev server of this example and a
 * Chromium, started once per file.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Page, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { onFreePort } from '../../../scripts/free-port.mjs'

export interface Harness {
  readonly vite: ViteDevServer
  readonly browser: Browser
  /** A new page at the given size, with every page error collected. */
  readonly visit: (
    width: number,
    height: number,
  ) => Promise<{ readonly page: Page; readonly problems: Array<string> }>
  readonly close: () => Promise<void>
}

export const startHarness = async (): Promise<Harness> => {
  const vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0 },
  })
  await onFreePort(() => vite.listen())
  const browser = await chromium.launch()
  return {
    vite,
    browser,
    visit: async (width, height) => {
      const page = await browser.newPage({ viewport: { width, height } })
      const problems: Array<string> = []
      page.on('pageerror', error => problems.push(String(error)))
      page.on('console', message => {
        if (message.text().includes('No response from @foldkit/vite-plugin'))
          problems.push(message.text())
      })
      await page.goto(vite.resolvedUrls!.local[0]!)
      return { page, problems }
    },
    close: async () => {
      await browser.close()
      await vite.close()
    },
  }
}

/** An island's section scrolled to, so it loads, once it has drawn. */
export const reveal = async (page: Page, id: string): Promise<void> => {
  await page.locator(`#${id}-island`).scrollIntoViewIfNeeded({ timeout: 120_000 })
  await page.locator(`#${id}-island > *`).first().waitFor({ timeout: 120_000 })
}
