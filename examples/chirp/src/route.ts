/** The addresses: what a route is, and the parser for each. `site.ts` puts the pages on them. */
import { Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'

export const AppRoute = defineRouteUnion({
  Home: {},
  Profile: { handle: Schema.String },
  Status: { handle: Schema.String, id: Schema.String },
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

export const homeRouter = pipe(root, mapTo(AppRoute.Home))
export const profileRouter = pipe(string('handle'), mapTo(AppRoute.Profile))
export const statusRouter = pipe(
  string('handle'),
  slash(literal('status')),
  slash(string('id')),
  mapTo(AppRoute.Status),
)
