// @vitest-environment node
/**
 * domains-plus at the edge (#428): a page whose prices were read in public
 * and whose request carried no cart is kept by its URL and served again
 * without a read; a page with a cart is the visitor's alone, and never kept;
 * and the checkers find every kept read and page the same for whoever asks.
 */
import { DocumentAssets, handleRequest } from 'foldkit/experimental/server'
import { CacheStore, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { checkCache } from 'foldkit-remote-server/fetch'
import { SSR } from 'foldkit-ssr'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.hoisted(() => vi.stubEnv('FOLDKIT_BUILD_ID', 'edge-test'))

/** Each sample result the server makes: one per name a read prices. */
const made = vi.hoisted(() => ({ count: 0 }))
vi.mock('../src/shared/demoDomains', async original => {
  const module = await original<typeof import('../src/shared/demoDomains')>()
  return {
    ...module,
    makeDemoDomain: (...args: Parameters<typeof module.makeDemoDomain>) => {
      made.count += 1
      return module.makeDemoDomain(...args)
    },
  }
})

const { pagesWith, renderDocument } = await import('../src/server/entry.js')
const { served } = await import('../src/server/remote.js')

const ORIGIN = 'https://domains.test'
const assets = DocumentAssets.make({
  entryScript: '/entry.js',
  stylesheets: [],
  modulePreloads: [],
})

/** The pages as the Worker serves them, keeping what they keep in a store of their own. */
const pages = () => {
  const entry = pagesWith({ cache: { store: CacheStore.memory(), maxAge: '60 seconds' } })
  return (request: Request) =>
    handleRequest(request, {
      renderPage: entry.renderPage,
      renderDocument: application => renderDocument(application, assets),
    })
}

const cart = `cart=${new URLSearchParams({ cart: 'sunbeam.com' })}`

beforeEach(() => {
  made.count = 0
})

describe('a search', () => {
  test('is served again from the cache, reading no price', async () => {
    const serve = pages()
    const first = await serve(new Request(`${ORIGIN}/?q=sunbeam`))
    expect(made.count).toBeGreaterThan(0)
    expect(first.headers.get('cache-control')).toBe('public, max-age=60')
    expect(first.headers.get('vary')).toBe('cookie')
    made.count = 0
    const again = await serve(new Request(`${ORIGIN}/?q=sunbeam`))
    expect(made.count).toBe(0)
    expect(await again.text()).toBe(await first.text())
  })

  test('with a cart is the visitor’s alone, read every time and never kept', async () => {
    const serve = pages()
    await serve(new Request(`${ORIGIN}/?q=sunbeam`))
    for (const _ of [1, 2]) {
      made.count = 0
      const response = await serve(
        new Request(`${ORIGIN}/?q=sunbeam`, { headers: { cookie: cart } }),
      )
      expect(made.count).toBeGreaterThan(0)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await response.text()).toContain('sunbeam.com')
    }
  })

  test('is the same page for a visitor and for someone with a cart wherever it is kept', async () => {
    await SSR.checkCache(pagesWith, [
      () => new Request(`${ORIGIN}/?q=sunbeam`),
      () => new Request(`${ORIGIN}/?q=sunbeam`, { headers: { cookie: cart } }),
      () => new Request(`${ORIGIN}/`),
    ])
  })
})

describe('a read of prices at /remote', () => {
  const prices = () =>
    new Request(`${ORIGIN}/remote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'read',
        payload: {
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Domain', id: 'sunbeam.com', fields: ['price'] }],
        },
      }),
    })

  test('is the same for whoever asks', async () => {
    await checkCache(
      served,
      [
        prices,
        () => {
          const request = prices()
          request.headers.set('cookie', cart)
          return request
        },
      ],
      undefined,
    )
  })
})
