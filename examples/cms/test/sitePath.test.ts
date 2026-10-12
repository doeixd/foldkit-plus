/**
 * The site's routes and their addresses: the tree builds an address its own
 * parser reads back, so a canonical address names the page it was made from.
 */
import { Option } from 'effect'
import { Site } from 'foldkit-site'
import { expect, it } from 'vitest'
import { SiteMap, routeOf } from '../src/apps/siteApp.js'
import { Route } from '../src/content/siteRoutes.js'

const urlOf = (pathname: string) => ({
  protocol: 'https:',
  host: 'site',
  port: Option.none(),
  pathname,
  search: Option.none(),
  hash: Option.none(),
})

it.each<Route>([
  Route.Home(),
  Route.Page({ slug: 'about' }),
  Route.Page({ slug: 'a page/with slash' }),
  Route.Blog(),
  Route.Post({ slug: 'a-page-is-data' }),
])('reads back %o from its own address', route => {
  expect(routeOf(urlOf(Site.hrefOf(SiteMap, route)))).toEqual(route)
})

it('gives each part of the site its address', () => {
  expect(Site.hrefOf(SiteMap, Route.Home())).toBe('/site')
  expect(Site.hrefOf(SiteMap, Route.Blog())).toBe('/site/blog')
  expect(Site.hrefOf(SiteMap, Route.Post({ slug: 'a-page-is-data' }))).toBe(
    '/site/blog/a-page-is-data',
  )
  // The blog is the blog, not a page by the address `blog`.
  expect(routeOf(urlOf('/site/blog'))).toEqual(Route.Blog())
  // An address the tree does not hold is a page the server will not have.
  expect(routeOf(urlOf('/site/a/b'))).toEqual(Route.Page({ slug: '/site/a/b' }))
})
