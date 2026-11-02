// @vitest-environment node
/**
 * A read builds the domains it names and no others. A cart cookie names
 * whatever its visitor writes, and the server reads it for every page, so a
 * read that made each label's whole catalog (about 550 domains) cost tens of
 * milliseconds of CPU per request for a cookie of 50 labels.
 */
import { describe, expect, test, vi } from 'vitest'

const built = vi.hoisted(() => ({ count: 0 }))
vi.mock('../src/shared/demoDomains', async original => {
  const module = await original<typeof import('../src/shared/demoDomains')>()
  return {
    ...module,
    makeDemoDomain: (label: string, tld: string) => {
      built.count += 1
      return module.makeDemoDomain(label, tld)
    },
    makeDemoDomains: (label: string) => {
      const made = module.makeDemoDomains(label)
      built.count += made.length
      return made
    },
  }
})

const { cartOf } = await import('../src/server/cart.js')
const { readDomains } = await import('../src/server/remote.js')
const { makeDemoDomains } = await import('../src/shared/demoDomains')
const { Domain } = await import('../src/shared/domain')

const cookieOf = (names: ReadonlyArray<string>) =>
  `cart=${new URLSearchParams({ cart: names.join(' ') })}`

describe('reading domains', () => {
  test('a cart of 50 labels builds its 50 domains', () => {
    const names = Array.from({ length: 50 }, (_, at) => `label${at}.com`)
    built.count = 0
    const cart = cartOf(
      new Request('https://domains.test/', { headers: { cookie: cookieOf(names) } }),
    )
    expect(cart.map(({ name }) => name)).toEqual(names)
    expect(built.count).toBe(50)
  })

  test("each name reads as its label's catalog has it", () => {
    for (const label of ['acme', 'vercel']) {
      const catalog = makeDemoDomains(label)
      const read = readDomains(catalog.map(({ name }) => name))
      expect(read.map(({ values }) => values)).toEqual(
        catalog.map(domain =>
          Domain.match(domain, {
            Available: available => ({ ...available, id: available.name }),
            Unconfirmed: unconfirmed => ({
              ...unconfirmed,
              id: unconfirmed.name,
              price: null,
              renewalPrice: null,
              years: null,
              isPremium: null,
            }),
          }),
        ),
      )
    }
  })

  test('a name under no known extension, or with no label, reads as nothing', () => {
    expect(readDomains(['acme.nope', '.com', 'acme', 'com', 'a b.com', 'acme.com.cn'])).toEqual(
      readDomains(['acme.com.cn']),
    )
    expect(readDomains(['acme.com.cn'])).toHaveLength(1)
  })
})
