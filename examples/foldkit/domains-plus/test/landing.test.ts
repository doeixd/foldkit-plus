/**
 * Phase 0: the landing page and the 404, and the domain code copied from
 * upstream unchanged, which the port's ordering and prices rest on.
 */
import { Option } from 'effect'
import { expect as expectScene, given, role, scene, text } from 'foldkit/scene'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'
import { makeDemoDomains } from '../src/shared/demoDomains'
import { domainTlds } from '../src/shared/domain'
import { filterAndSortDomains } from '../src/client/domain'
import { init, update } from '../src/client/app.js'
import { AppRoute, routeOf } from '../src/client/site.js'
import { view } from '../src/client/view.js'

const url = (path: string) => Option.getOrThrow(fromString(`https://domains.test${path}`))

describe('the landing page', () => {
  test('draws the search box in the hero and the begin-search prompt', () => {
    scene(
      { update, view },
      given(init(url('/')).model),
      expectScene(role('searchbox', { name: 'Search domains' })).toExist(),
      expectScene(text('Begin your search')).toExist(),
      expectScene(text('Find a domain for')).toExist(),
    )
  })

  test('an unknown path is the 404 page', () => {
    expect(AppRoute.guards.NotFound(routeOf(url('/missing')))).toBe(true)
    expect(AppRoute.guards.Search(routeOf(url('/?q=acme')))).toBe(true)
    scene(
      { update, view },
      given(init(url('/missing')).model),
      expectScene(text('404 — Page Not Found')).toExist(),
      expectScene(role('searchbox')).not.toExist(),
    )
  })
})

describe('the copied domain code', () => {
  const acme = makeDemoDomains('acme')
  const vercel = makeDemoDomains('vercel')

  test('a label is offered under every TLD, featured ones first', () => {
    expect(acme.map(domain => domain.name).slice(0, 4)).toEqual([
      'acme.com',
      'acme.dev',
      'acme.app',
      'acme.io',
    ])
    expect(acme).toHaveLength(domainTlds.length)
  })

  test.each([
    ['Relevance', 'All', ['vercel.com', 'vercel.dev']],
    ['Alphabetical', 'All', ['vercel.ac', 'vercel.academy']],
    ['Length', 'All', ['vercel.ac', 'vercel.ag']],
    ['PriceAscending', 'All', ['vercel.space', 'vercel.site']],
    ['PriceDescending', 'All', ['vercel.ai', 'vercel.design']],
    ['Relevance', 'Available', ['vercel.app', 'vercel.io']],
  ] as const)('sorted by %s showing %s, %j come first', (sort, availability, first) => {
    const sorted = filterAndSortDomains(vercel, 'All', availability, sort)
    expect(sorted.slice(0, 2).map(domain => domain.name)).toEqual(first)
  })

  test('a price sort puts the names whose price is unknown last', () => {
    const sorted = filterAndSortDomains(vercel, 'All', 'All', 'PriceAscending')
    expect(sorted.slice(-2).map(domain => domain._tag)).toEqual(['Unconfirmed', 'Unconfirmed'])
  })
})
