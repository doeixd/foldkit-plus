/**
 * The site's routes and their addresses: `pathOf` is the inverse of `routeOf`,
 * so a canonical address names the page it was made from.
 */
import { Option } from 'effect'
import { expect, it } from 'vitest'
import { pathOf, routeOf, type Route } from '../src/siteApp.js'

const urlOf = (pathname: string) => ({
  protocol: 'https:',
  host: 'site',
  port: Option.none(),
  pathname,
  search: Option.none(),
  hash: Option.none(),
})

it.each<Route>([
  { _tag: 'Page', slug: 'home' },
  { _tag: 'Page', slug: 'about' },
  { _tag: 'Page', slug: 'a page/with slash' },
  { _tag: 'Blog' },
  { _tag: 'Post', slug: 'a-page-is-data' },
])('reads back %o from its own address', route => {
  expect(routeOf(urlOf(pathOf(route)))).toEqual(route)
})
