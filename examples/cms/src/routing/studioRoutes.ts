/**
 * The studio's sections as a Site tree: the address's path names the
 * section, and its query is the section's own (what is open, how a list is
 * narrowed, who is looking), which each section reads with its `linkIn`.
 *
 *   /        the posts
 *   /pages   the pages
 *
 * An address the tree does not hold is another application's (the site), a
 * full load away.
 */
import { Option, pipe } from 'effect'
import { Site } from 'foldkit-site'
import { defineRouteUnion, literal, mapTo, root } from 'foldkit/route'
import type { Url } from 'foldkit/url'
import type { Chair } from '../server/transport.js'

export type Section = 'posts' | 'pages'

export const StudioRoute = defineRouteUnion({ Posts: {}, Pages: {} })
export type StudioRoute = typeof StudioRoute.Type

const sectionRoute = (section: Section): StudioRoute =>
  section === 'pages' ? StudioRoute.Pages() : StudioRoute.Posts()

export const StudioMap = Site.make(
  Site.node(pipe(root, mapTo(StudioRoute.Posts)), StudioRoute.Posts).node,
  Site.node(pipe(literal('pages'), mapTo(StudioRoute.Pages)), StudioRoute.Pages).node,
)

/** The section an address names, if the studio holds it. */
export const sectionOf = (url: Url): Option.Option<Section> =>
  Option.map(Site.routeAt(StudioMap, url), route =>
    StudioRoute.match(route, { Posts: (): Section => 'posts', Pages: (): Section => 'pages' }),
  )

/** A section's address, as `chair` reads it. */
export const sectionHref = (section: Section, chair: Chair): string =>
  `${Site.hrefOf(StudioMap, sectionRoute(section))}?as=${chair}`
