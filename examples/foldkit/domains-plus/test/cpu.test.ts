// @vitest-environment node
/**
 * The Worker's main routes within a CPU budget: the landing page, a search,
 * a search with a full cart in its cookie, and reads of prices at
 * `/remote`. They run here, in Node, as the built Worker runs them in
 * workerd: `handleRequest` over the server entry, read by this thread's CPU
 * time. A cart's read once cost 33 to 54 ms a request (e33c3d79), which no
 * other test saw.
 */
import { Schema } from 'effect'
import { DocumentAssets, handleRequest } from 'foldkit/experimental/server'
import { REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { Cpu } from 'foldkit-plus/testing/workers'
import { describe, expect, test, vi } from 'vitest'
import { cpuBudget } from '../../../../scripts/perf-report.mjs'
import { renderDocument, renderPage } from '../src/server/entry.js'

// The build's id, which `vite build` gives both bundles; read when the entry is made.
vi.hoisted(() => vi.stubEnv('FOLDKIT_BUILD_ID', 'cpu-test'))

const ORIGIN = 'https://domains.test'

const assets = DocumentAssets.make({
  entryScript: '/entry.js',
  stylesheets: [],
  modulePreloads: [],
})

const answer = (request: Request) =>
  handleRequest(request, {
    renderPage,
    renderDocument: application => renderDocument(application, assets),
  })

const meter = Cpu.inThread(answer, ORIGIN)

/** The most names a cart cookie is read for (`cart.ts`). */
const cart = Array.from({ length: 50 }, (_, at) => `label${at}.com`)

/** A read of `names`' prices, as the page asks `/remote`. */
const pricesOf = (names: ReadonlyArray<string>) => () =>
  new Request(`${ORIGIN}/remote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operation: 'read',
      payload: {
        version: REMOTE_PROTOCOL_VERSION,
        requests: names.map(id => ({ entity: 'Domain', id, fields: ['price'] })),
      },
    }),
  })

describe('within the CPU budget', () => {
  test('reads of prices', async () => {
    const readings = await cpuBudget('domains-plus: reads', Cpu.budget, meter, {
      // About 1 ms warm on Linux. The first read in the process is the
      // first through Remote's server, and measured up to 47 ms on Windows.
      warm: 10,
      cold: 100,
      routes: {
        'three names': pricesOf(['acme.com', 'acme.ai', 'acme.io']),
        'a full cart': pricesOf(cart),
      },
    })
    expect(readings.map(reading => reading.status)).toEqual([200, 200])
    // Each name was read, not refused.
    const read = Schema.decodeUnknownSync(
      Schema.Struct({ result: Schema.Struct({ entities: Schema.Array(Schema.Unknown) }) }),
    )(await (await answer(pricesOf(cart)())).json())
    expect(read.result.entities).toHaveLength(cart.length)
  }, 60_000)

  /**
   * The pages are over any Workers plan's limit today: on Linux a search
   * never seen before takes about 120 ms warm (2026-11-09; 300 before the
   * first screen, the linked sheet and the trimmed resume data), a third of
   * it parse5 inside Foldkit checking its own markup (#413). This budget only
   * keeps them from growing until that is fixed.
   */
  test('the pages, as they are', async () => {
    const readings = await cpuBudget('domains-plus: pages', Cpu.budget, meter, {
      warm: 1000,
      cold: 2000,
      routes: {
        'the landing page': '/',
        'a search': '/?q=acme',
        'a search with a full cart': () =>
          new Request(`${ORIGIN}/?q=acme`, {
            headers: { cookie: `cart=${new URLSearchParams({ cart: cart.join(' ') })}` },
          }),
      },
    })
    expect(readings.map(reading => reading.status)).toEqual([200, 200, 200])
  }, 120_000)

  /**
   * A page drawn from its URL alone is kept at the edge (#428), and served
   * again without a read or a render: under a millisecond warm here, where
   * the render it saves takes 40 to 140 ms.
   */
  test('a kept page', async () => {
    const readings = await cpuBudget('domains-plus: kept pages', Cpu.budget, meter, {
      warm: 5,
      routes: { 'the landing page': '/', 'a search': '/?q=sunbeam' },
    })
    expect(readings.map(reading => reading.status)).toEqual([200, 200])
  }, 60_000)
})
