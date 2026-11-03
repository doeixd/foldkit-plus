// @vitest-environment node
/**
 * #473's spike: the compiled result row (`compiledRow.ts`) writes the bytes
 * the interpreted path serves for every row of a page's first screen, so
 * hydration adopts it as it adopts the server's markup today. Each page is
 * rendered whole, as the Worker renders it, and its rows are compared with
 * the compiled rows of the same listings.
 */
import { DocumentAssets, handleRequest } from 'foldkit/experimental/server'
import { describe, expect, test, vi } from 'vitest'
import type { Message } from '../src/client/app.js'
import { renderDocument, renderPage } from '../src/server/entry.js'
import { compileRows, firstScreen, rowsIn, staticsFrom } from './compiledRow.js'

vi.hoisted(() => vi.stubEnv('FOLDKIT_BUILD_ID', 'compiled-row-test'))

const ORIGIN = 'https://domains.test'

const assets = DocumentAssets.make({
  entryScript: '/entry.js',
  stylesheets: [],
  modulePreloads: [],
})

const pageOf = async (search: string, cart: ReadonlyArray<string> = []): Promise<string> => {
  const request = new Request(`${ORIGIN}/?${search}`, {
    headers:
      cart.length === 0 ? {} : { cookie: `cart=${new URLSearchParams({ cart: cart.join(' ') })}` },
  })
  const response = await handleRequest(request, {
    renderPage,
    renderDocument: application => renderDocument(application, assets),
  })
  expect(response.status).toBe(200)
  return response.text()
}

/** The binding the page's first cart form inside a row was given. */
const firstRowBinding = (html: string): number =>
  Number(/<li\b[^>]*class="domain-row [^]*?data-foldkit-plus-on-submit="(\d+)"/.exec(html)?.[1])

describe('the compiled result row', async () => {
  // Every row state on one page: a taken name, names in and out of the cart, pending rows.
  const statics = staticsFrom(await pageOf('q=vercel', ['vercel.ai', 'vercel.io']))
  const fill = compileRows(statics)

  const pages = [
    {
      name: 'taken names and a cart',
      label: 'foldkit',
      from: 0,
      cart: ['foldkit.app', 'foldkit.xyz'],
    },
    { name: 'a search with no cart', label: 'sunbeam', from: 0, cart: [] },
    { name: 'a page opened further down', label: 'github', from: 12, cart: [] },
  ]

  test.each(pages)(
    'writes the bytes of the interpreted rows: $name',
    async ({ label, from, cart }) => {
      const html = await pageOf(`q=${label}${from === 0 ? '' : `&from=${from}`}`, cart)
      const served = rowsIn(html)
      const { window, preview } = firstScreen(label, from, cart)
      const shown = [...window, ...preview]
      expect(served).toHaveLength(shown.length)
      // The bindings the page made before its first row, which a compiled row continues.
      const bindings: Array<Message> = new Array(firstRowBinding(html))
      expect(shown.map(row => fill([row], bindings))).toEqual(served)
    },
  )

  test('the pages hold every row state', async () => {
    const all = (
      await Promise.all(
        pages.map(({ label, from, cart }) =>
          pageOf(`q=${label}${from === 0 ? '' : `&from=${from}`}`, cart),
        ),
      )
    ).flatMap(rowsIn)
    const count = (pattern: RegExp) => all.filter(row => pattern.test(row)).length
    expect(count(/^<li data-unavailable/)).toBeGreaterThan(0)
    expect(count(/data-added/)).toBe(2)
    expect(count(/aria-label="Add /)).toBeGreaterThan(0)
    expect(count(/skeleton-price/)).toBeGreaterThan(0)
  })
})
