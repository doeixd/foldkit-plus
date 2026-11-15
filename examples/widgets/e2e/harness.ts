/**
 * What the page's e2e files share: the Vite dev server of this example and a
 * Chromium, started once per file, and a way to reach a section. A lazy
 * section (`src/lazy.ts`) boots when it nears the window, so `reveal` scrolls to
 * it and waits for its heading's container to hold something.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, type Locator, type Page, chromium } from 'playwright'
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

/** The section under a heading, scrolled to so a lazy one loads, once it has drawn. */
export const reveal = async (page: Page, heading: string): Promise<Locator> => {
  const section = page.locator('section', { has: page.getByRole('heading', { name: heading }) })
  await section.scrollIntoViewIfNeeded({ timeout: 120_000 })
  await section.locator('div > *').first().waitFor({ timeout: 120_000 })
  return section
}
