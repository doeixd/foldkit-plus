/**
 * Where the page is: the search at `/`, the TLD list at `/tlds`, and a 404
 * for every other path. The search text is not part of the route: it is the
 * Model's `query`, which `foldkit-mirror` keeps in `?q=` (see `app.ts`), so
 * the route only says which page draws.
 */
import { Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, root } from 'foldkit/route'
import { Site } from 'foldkit-site'

export const SITE_ORIGIN = 'https://domains.foldkit.dev'
export const SITE_NAME = 'Domains by Foldkit'
export const SITE_DESCRIPTION =
  'An unofficial domain-search showcase built with Cloudflare, Alchemy, Foldkit, and Effect. Explore sample availability and pricing, filters, and a demo cart.'
export const SOCIAL_IMAGE_URL = `${SITE_ORIGIN}/og/domains.png`
export const SOCIAL_IMAGE_ALT =
  'Domains by Foldkit. Find your next great domain. A showcase of Cloudflare, Alchemy, Foldkit, and Effect.'

export const AppRoute = defineRouteUnion({
  Search: {},
  Tlds: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

const Search = Site.route(pipe(root, mapTo(AppRoute.Search)), AppRoute.Search, {
  title: () => 'Domains | Foldkit',
})

/**
 * The no-script TLD choice: every extension as a link, so a page without
 * scripts reaches them without drawing 557 `<option>`s into every search.
 */
const Tlds = Site.route(pipe(literal('tlds'), mapTo(AppRoute.Tlds)), AppRoute.Tlds, {
  title: () => 'Filter by TLD | Domains | Foldkit',
})

export const DomainsSite = Site.make(Search, Tlds)

/** The route at an address: the search at `/`, the TLD list at `/tlds`, NotFound anywhere else. */
export const routeOf = Site.parse(DomainsSite, AppRoute.NotFound)

/** The search page's address. */
export const searchHref = Site.href(Search, {})

/** The TLD list's address, which the search page's plain filters link to. */
export const tldsHref = Site.href(Tlds, {})

export const canonicalOf = AppRoute.match({
  Search: () => `${SITE_ORIGIN}/`,
  Tlds: () => `${SITE_ORIGIN}${tldsHref}`,
  NotFound: ({ path }) => `${SITE_ORIGIN}${path}`,
})

/** The tab's title: the search text before the site's, as upstream writes it. */
export const titleOf = (route: AppRoute, query: string): string =>
  AppRoute.match(route, {
    Search: () =>
      query === ''
        ? (Site.titleOf(DomainsSite, route) ?? SITE_NAME)
        : `${query} | Domains | Foldkit`,
    Tlds: () => Site.titleOf(DomainsSite, route) ?? 'Filter by TLD | Domains | Foldkit',
    NotFound: () => 'Not Found | Domains | Foldkit',
  })
