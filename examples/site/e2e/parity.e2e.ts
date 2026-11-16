/**
 * Every showcase's first preview, drawn by the server in Node and by the runtime in Chromium: the
 * markup must agree, or the browser rebuilds what the server drew (Foldkit warns of that in
 * development only). The picker that read `EyeDropper` while rendering was one; this lists the
 * rest, by slug, with what differs.
 */
import { fileURLToPath } from 'node:url'
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import { chromium, type Browser } from 'playwright'
import { createServer, mergeConfig, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
// Read through Vitest, which resolves the workspace sources (see theme.e2e.ts).
import config from '../vite.config.js'
import { onFreePort } from '../../../scripts/free-port.mjs'
import { showcases, viewOf } from './showcaseView.js'

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
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

const served = (slug: string) =>
  Effect.runPromise(
    renderToString({ init: () => ({ model: {} }), view: viewOf(slug) } as never, { buildId: 'b' }),
  ).then(rendered =>
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      rendered,
    ),
  )

/**
 * The showcases known to differ, and why. The check expects exactly these, so one fixed in a package
 * fails the test until it is taken off the list. The Menu preview starts open (`shownMenu`), and
 * upstream draws its backdrop in place with `h.OnMount(PortalMenuBackdrop())`
 * (`@foldkit/ui/dist/menu/index.js:680`), a Mount that moves the node to the portal root once it
 * runs. Node's markup keeps the backdrop `div` beside the button; the browser's no longer does.
 * Nothing is read from the environment while rendering, so hydration adopts it all the same.
 */
const KNOWN = ['menu']

test('every showcase is drawn alike by the server and by the browser', async () => {
  const pages = await Promise.all(
    showcases.map(async showcase => [showcase.slug, await served(showcase.slug)] as const),
  )
  const page = await browser.newPage()
  await page.goto(`${url}/404.html`, { timeout: 120_000 })
  // A string, not a function: Vitest's own transform would rewrite the `import` inside one.
  const differing: unknown = await page.evaluate(
    `import('/e2e/drawShowcase.ts').then(module => module.differing(${JSON.stringify(pages)}))`,
  )
  expect(
    Array.isArray(differing) ? differing.map(line => String(line).split(':')[0]) : differing,
  ).toEqual(KNOWN)
}, 600_000)
