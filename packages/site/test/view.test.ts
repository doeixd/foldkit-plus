/**
 * `Site.view`: the deepest node's view, wrapped by every ancestor's layout
 * root-first. Ancestors contribute layouts only, never their views.
 */
import { Schema, pipe } from 'effect'
import { defineRouteUnion, int, literal, mapTo, root, slash, string } from 'foldkit/route'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  Section: { name: Schema.String },
  Page: { section: Schema.String, id: Schema.Number },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const sectionRouter = pipe(literal('s'), slash(string('name')), mapTo(AppRoute.Section))
const pageRouter = pipe(
  literal('s'),
  slash(string('section')),
  slash(literal('p')),
  slash(int('id')),
  mapTo(AppRoute.Page),
)

const calls: Array<string> = []

const Home = Site.route(homeRouter, AppRoute.Home, {
  view: { render: () => 'home' as never },
})
const Section = Site.route(sectionRouter, AppRoute.Section, {
  layout: {
    render: child => {
      calls.push('section-layout')
      return { section: child } as never
    },
  },
  view: {
    render: () => {
      calls.push('section-view')
      return 'section' as never
    },
  },
})
const Page = Site.route(pageRouter, AppRoute.Page, {
  view: {
    render: () => {
      calls.push('page-view')
      return 'page' as never
    },
  },
})
const AppSite = Site.make(Home, Site.mount(Section, [Page]))

const view = (route: AppRoute) => Site.view(AppSite, route, { marker: true }, null as never)

describe('Site.view', () => {
  it('wraps the leaf view in every ancestor layout, root-first', () => {
    calls.length = 0
    const html = view(AppRoute.Page({ section: 'a', id: 1 }))
    expect(calls).toEqual(['page-view', 'section-layout'])
    expect(html).toEqual({ section: 'page' })
  })

  it('draws a leaf with no layouts above it bare', () => {
    calls.length = 0
    expect(view(AppRoute.Home({}))).toBe('home')
    expect(calls).toEqual([])
  })

  it('never draws an ancestor’s view', () => {
    calls.length = 0
    view(AppRoute.Page({ section: 'a', id: 1 }))
    expect(calls).not.toContain('section-view')
  })

  it('refuses an unknown tag instead of guessing', () => {
    expect(() => Site.view(AppSite, { _tag: 'Missing' }, {}, null as never)).toThrow(
      'Site.view: no node holds the tag "Missing"',
    )
  })

  it('refuses a leaf with no view', () => {
    const Bare = Site.route(sectionRouter, AppRoute.Section)
    const site = Site.make(Bare)
    expect(() => Site.view(site, AppRoute.Section({ name: 'a' }), {}, null as never)).toThrow(
      'Site.view: "Section" draws nothing; give the leaf a view',
    )
  })
})

describe('nesting order', () => {
  const order: Array<string> = []
  const Outer = Site.route(homeRouter, AppRoute.Home, {
    layout: {
      render: child => {
        order.push('outer')
        return { outer: child } as never
      },
    },
  })
  const Inner = Site.route(sectionRouter, AppRoute.Section, {
    layout: {
      render: child => {
        order.push('inner')
        return { inner: child } as never
      },
    },
  })
  const Leaf = Site.route(pageRouter, AppRoute.Page, {
    view: {
      render: () => {
        order.push('leaf')
        return 'leaf' as never
      },
    },
  })
  const nested = Site.make(Site.mount(Outer, [Site.mount(Inner, [Leaf])]))

  it('nests root-first: the outermost layout wraps last', () => {
    order.length = 0
    const html = Site.view(nested, AppRoute.Page({ section: 'a', id: 1 }), {}, null as never)
    expect(order).toEqual(['leaf', 'inner', 'outer'])
    expect(html).toEqual({ outer: { inner: 'leaf' } })
  })
})
