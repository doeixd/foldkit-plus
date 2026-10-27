/**
 * Every published demo on a phone: each example in `demos` served by its own
 * Vite config, opened at 390px on a touch screen, and audited. It loads with
 * no page error, does not scroll sideways, and every target is a finger's
 * size or spaced as WCAG 2.5.8 allows. A demo added to the list is audited
 * without a line here, unless it needs a mode or a starting path.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, mergeConfig, type UserConfig } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { demos } from '../src/demos.js'
import { auditPhone } from '../src/phoneAudit.js'

/** How a demo is served as it is published, where that is not its plain dev server at `/`. */
const launch: Readonly<Record<string, { readonly mode?: string; readonly path?: string }>> = {
  // The published demos' servers run in the page, in a SharedWorker.
  'examples/cms': { mode: 'sandbox', path: '/?as=wren' },
  'examples/registry': { mode: 'sandbox' },
  'examples/pages': { mode: 'sandbox' },
  'examples/todo-app': { mode: 'sandbox' },
}

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
})

test('the launch table names only listed demos', () => {
  const listed = new Set(demos.map(demo => demo.example))
  expect(Object.keys(launch).filter(example => !listed.has(example))).toEqual([])
})

test.each(demos.map(demo => [demo.example, demo] as const))('%s fits a phone', async example => {
  const root = fileURLToPath(new URL(`../../../${example}/`, import.meta.url))
  const { mode, path = '/' } = launch[example] ?? {}
  // The config read through Vitest, as the CMS's own e2e test reads it: a
  // config Vite loads runs in Node, which cannot load a workspace plugin's
  // TypeScript source (`foldkit-ssr/vite`) where no `dist` is built.
  const { default: config } = (await import(`${root}vite.config.ts`)) as {
    readonly default: UserConfig
  }
  const vite = await createServer(
    mergeConfig(config, {
      root,
      configFile: false,
      ...(mode === undefined ? {} : { mode }),
      logLevel: 'error',
      server: { port: 0 },
    }),
  )
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  try {
    await vite.listen()
    const page = await context.newPage()
    const errors: Array<string> = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(`${vite.resolvedUrls!.local[0]!.replace(/\/$/, '')}${path}`)
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, {
      timeout: 120_000,
    })
    // A sandbox keeps a live connection open, so the network never goes idle:
    // audit once the page has held still for two readings half a second apart.
    let audit = await auditPhone(page)
    for (let reading = 0; reading < 40; reading++) {
      await page.waitForTimeout(500)
      const next = await auditPhone(page)
      if (JSON.stringify(next) === JSON.stringify(audit) && reading > 0) break
      audit = next
    }
    expect({ errors, ...audit }).toEqual({ errors: [], overflow: 0, small: [] })
  } finally {
    await context.close()
    await vite.close()
  }
})
