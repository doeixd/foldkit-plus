// @vitest-environment node
/**
 * The filter funnel in the page an application builds: Foldkit's Vite plugin
 * brands every function's return with that function's identity, and the
 * differ replaces a node whose identity changed. A funnel returned by one
 * arrow while the form is shut and by another while it is open was replaced
 * by the press that opened the form, which dropped its focus, and the form's
 * own focus-leave handler took that for the user leaving and closed it. The
 * vitest browser project has no such plugin, so this runs the fixture on a
 * Vite server that has it.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../scripts/free-port.mjs'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  // The plugin is a dependency of the examples, not of this package.
  const entry = new URL(
    '../../../examples/data-grid/node_modules/@foldkit/vite-plugin/dist/index.js',
    import.meta.url,
  )
  const plugin = (await import(entry.href)) as { foldkit: () => never }
  const root = fileURLToPath(new URL('.', import.meta.url))
  vite = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    plugins: [mutation(), plugin.foldkit()],
    resolve: { conditions: ['foldkit-plus:source'] },
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] },
    },
  })
  await onFreePort(() => vite.listen())
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('a click on a funnel keeps the form open, with focus in its field', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } })
  try {
    await page.goto(`${vite.resolvedUrls!.local[0]}brandedPage.html`)
    const funnel = page.getByRole('button', { name: 'Filter Title' })
    await funnel.waitFor()
    await funnel.click()
    // Long enough for the form to be drawn, and for a close it should not get.
    await settle(500)
    expect(await page.locator('[role="dialog"]').count()).toBe(1)
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT')
    // The same press again closes it, and focus stays on the funnel that was pressed.
    await funnel.click()
    await settle(500)
    expect(await page.locator('[role="dialog"]').count()).toBe(0)
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
      'Filter Title',
    )
  } finally {
    await page.close()
  }
}, 120_000)

test('a press on the column menu button keeps its menu open, with focus in it', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } })
  try {
    await page.goto(`${vite.resolvedUrls!.local[0]}brandedPage.html`)
    const button = page.getByRole('button', { name: 'Title menu' })
    // Replaced, the button is a new node: the press that opened the menu was on this one.
    await button.evaluate(node => node.setAttribute('data-pressed', ''))
    await button.click()
    await settle(500)
    expect(await page.locator('[role="menu"]').count()).toBe(1)
    expect(await page.locator('[data-pressed]').count()).toBe(1)
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('menu')
  } finally {
    await page.close()
  }
}, 120_000)

test('a tap on a funnel keeps the form open', async () => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1000, height: 600 },
  })
  const page = await context.newPage()
  try {
    await page.goto(`${vite.resolvedUrls!.local[0]}brandedPage.html`)
    await page.getByRole('button', { name: 'Filter Title' }).tap()
    await settle(500)
    expect(await page.locator('[role="dialog"]').count()).toBe(1)
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT')
  } finally {
    await context.close()
  }
}, 120_000)
