import { Option } from 'effect'
import { Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, query, root } from 'foldkit/route'
import { Projection, Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  People: { searchText: Schema.Option(Schema.String) },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const peopleRouter = pipe(
  literal('people'),
  query(Schema.Struct({ searchText: Schema.OptionFromOptional(Schema.String) })),
  mapTo(AppRoute.People),
)

const Home = Site.route(homeRouter, AppRoute.Home)
const People = Site.route(peopleRouter, AppRoute.People)

// Params flow from the route value: the wrong shape is refused.
export const homeTarget = Site.target(Home, {})
export const peopleTarget = Site.target(People, { searchText: Option.none() })

// @ts-expect-error: Person params need a personId, not a search
export const badTarget = Site.target(People, { personId: 3 })

const Model = Schema.Struct({ route: AppRoute })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Noted: {} })
const App = Surface.application({ Model, Message })
const Page = App.surface('Page', {
  params: { searchText: Schema.Option(Schema.String) },
  model: ({ model }) => Projection.struct({ route: model.route }),
})

// Surface params must match the Surface's own Params.
export const Surfaced = Site.route(peopleRouter, AppRoute.People, {
  surface: {
    surface: Page,
    params: route => ({ searchText: route.searchText }),
  },
})

// The Surface takes searchText, not personId.
export const BadSurfaced = Site.route(peopleRouter, AppRoute.People, {
  surface: {
    surface: Page,
    // @ts-expect-error: personId is not a Surface param
    params: () => ({ personId: 3 }),
  },
})
