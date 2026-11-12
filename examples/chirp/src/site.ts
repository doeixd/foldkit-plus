/**
 * Where the application is: the route tree, its titles and its addresses. Each
 * node owns the Surface its page reads, so a route's reads are the node's.
 */
import { Site } from 'foldkit-site'
import { AppRoute, homeRouter, profileRouter, statusRouter } from './route.js'
import { Home, Profile, Status } from './state.js'

// #region site
const HomeNode = Site.route(homeRouter, AppRoute.Home, {
  title: () => 'Chirp',
  surface: { surface: Home, params: () => undefined },
})
const ProfileNode = Site.route(profileRouter, AppRoute.Profile, {
  title: ({ handle }) => `@${handle} / Chirp`,
  surface: { surface: Profile, params: ({ handle }) => ({ handle }) },
})
const StatusNode = Site.route(statusRouter, AppRoute.Status, {
  title: ({ handle }) => `@${handle} on Chirp`,
  surface: { surface: Status, params: ({ id }) => ({ id }) },
})

export const ChirpSite = Site.make(HomeNode, Site.mount(ProfileNode, [StatusNode]))

/** A person's page, and one post's, by the routes' own addresses. */
export const profileHref = (handle: string) => Site.href(ProfileNode, { handle })
export const statusHref = (handle: string, id: string) => Site.href(StatusNode, { handle, id })
// #endregion

export const routeOf = Site.parse(ChirpSite, AppRoute.NotFound)
