/** Where the application is: the route tree, its titles and its addresses. */
import { Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
import { Site } from 'foldkit-site'

export const AppRoute = defineRouteUnion({
  Home: {},
  Profile: { handle: Schema.String },
  Status: { handle: Schema.String, id: Schema.String },
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const profileRouter = pipe(string('handle'), mapTo(AppRoute.Profile))
const statusRouter = pipe(
  string('handle'),
  slash(literal('status')),
  slash(string('id')),
  mapTo(AppRoute.Status),
)

// #region site
const Home = Site.route(homeRouter, AppRoute.Home, { title: () => 'Chirp' })
const Profile = Site.route(profileRouter, AppRoute.Profile, {
  title: ({ handle }) => `@${handle} / Chirp`,
})
const Status = Site.route(statusRouter, AppRoute.Status, {
  title: ({ handle }) => `@${handle} on Chirp`,
})

export const ChirpSite = Site.make(Home, Site.mount(Profile, [Status]))

/** A person's page, and one post's, by the routes' own addresses. */
export const profileHref = (handle: string) => Site.href(Profile, { handle })
export const statusHref = (handle: string, id: string) => Site.href(Status, { handle, id })
// #endregion

export const routeOf = Site.parse(ChirpSite, AppRoute.NotFound)
