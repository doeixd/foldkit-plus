// @vitest-environment node
/**
 * #473's spike, measured: the window's 24 priced rows of a never-seen search
 * as the interpreted path draws them, against the same rows filled from the
 * compiled template (`compiledRow.ts`). The interpreted rows cost the
 * difference between the page rendered with them and without them (the
 * list's view replaced by an empty one), checks of the markup included.
 *
 *     npx vitest bench --run examples/foldkit/domains-plus/test/compiledRow.bench.ts
 */
import { DocumentAssets, handleRequest } from 'foldkit/experimental/server'
import { test, vi } from 'vitest'
import type { Message } from '../src/client/app.js'
import { renderDocument, renderPage } from '../src/server/entry.js'
import { compileRows, firstScreen, staticsFrom } from './compiledRow.js'

vi.hoisted(() => vi.stubEnv('FOLDKIT_BUILD_ID', 'compiled-row-bench'))

const drawn = vi.hoisted(() => ({ rows: true }))

vi.mock('foldkit-mixins-ui', async importOriginal => {
  const original = await importOriginal<typeof import('foldkit-mixins-ui')>()
  const view: typeof original.WindowList.view = (config, h) =>
    drawn.rows ? original.WindowList.view(config, h) : h.ul([], [])
  return { ...original, WindowList: { ...original.WindowList, view } }
})

const ORIGIN = 'https://domains.test'

const assets = DocumentAssets.make({
  entryScript: '/entry.js',
  stylesheets: [],
  modulePreloads: [],
})

const render = async (search: string, cart: ReadonlyArray<string> = []): Promise<string> => {
  const request = new Request(`${ORIGIN}/?${search}`, {
    headers:
      cart.length === 0 ? {} : { cookie: `cart=${new URLSearchParams({ cart: cart.join(' ') })}` },
  })
  const response = await handleRequest(request, {
    renderPage,
    renderDocument: application => renderDocument(application, assets),
  })
  return response.text()
}

// A label no earlier request read, so neither the page nor its prices are kept.
let searches = 0
const neverSeen = () => {
  searches += 1
  return `sunbeam${searches}x`
}

const fill = compileRows(staticsFrom(await render('q=vercel', ['vercel.ai', 'vercel.io'])))
const windows = Array.from({ length: 64 }, () => firstScreen(neverSeen(), 0, []).window)

let at = 0

test("a never-seen search's priced rows", async ({ bench }) => {
  await bench.compare(
    bench('interpreted: the page with them', async () => {
      drawn.rows = true
      await render(`q=${neverSeen()}`)
    }),
    bench('interpreted: the page without them', async () => {
      drawn.rows = false
      await render(`q=${neverSeen()}`)
    }),
    bench('compiled: them alone', () => {
      at = (at + 1) % windows.length
      const bindings: Array<Message> = []
      fill(windows[at]!, bindings)
    }),
  )
})
