import { Effect, Option } from 'effect'
import type { Url } from 'foldkit/url'
import { Schema, pipe } from 'effect'
import { Bundle, Link } from 'foldkit-bundle'
import { Submodel } from 'foldkit'
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

// A node's meta reads its own route, and the Model it names.
export const described = Site.node(peopleRouter, AppRoute.People).meta<{ blurb: string }>(
  ({ route, model }) => ({
    description: Option.getOrElse(route.searchText, () => model.blurb),
  }),
)
export const wrongRoute = Site.node(peopleRouter, AppRoute.People).meta(({ route }) => ({
  // @ts-expect-error: the People route has no personId
  description: String(route.personId),
}))
export const wrongModel = Site.node(peopleRouter, AppRoute.People).meta<{ blurb: string }>(
  // @ts-expect-error: the named Model has no title
  ({ model }) => ({ description: model.title }),
)
// @ts-expect-error: a Meta field the head does not write
export const wrongField = Site.node(homeRouter, AppRoute.Home).meta(() => ({ keywords: 'a' }))

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
  landing: { searchText: Option.none() },
})

// The Surface takes searchText, not personId.
export const BadSurfaced = Site.route(peopleRouter, AppRoute.People, {
  surface: {
    surface: Page,
    // @ts-expect-error: personId is not a Surface param
    params: () => ({ personId: 3 }),
  },
})

// A landing takes the node's own params.
export const BadLanding = Site.route(peopleRouter, AppRoute.People, {
  // @ts-expect-error: a people landing carries searchText, not personId
  landing: { personId: 3 },
})

// A routed page: the link states the relationship once, and the placement
// drives the fold and the drawing from it.
const ChildModel = Schema.Struct({ text: Schema.String })
type ChildModel = typeof ChildModel.Type
const ChildMessage = defineMessageUnion({ Told: { text: Schema.String } })
type ChildMessage = typeof ChildMessage.Type
const ChildBundle = Bundle.make('Child', {
  Model: ChildModel,
  Message: ChildMessage,
  args: Schema.Struct({ text: Schema.String }),
  init: ({ text }) => ({ model: { text } }),
  update: model => ({ model }),
  view: Submodel.defineView<ChildModel, ChildMessage>(() => null as never),
})

const ChildModelApp = Schema.Struct({ route: AppRoute, child: ChildModel })
type ChildModelApp = typeof ChildModelApp.Type
const ChildAppMessage = defineMessageUnion({
  GotChild: { message: ChildMessage },
})
const ChildNode = Site.route(peopleRouter, AppRoute.People)

// @ts-expect-error: an arg-ful bundle needs its args
export const ChildPageNoArgs = Site.placement(ChildNode, ChildBundle, {
  link: Link.field<ChildModelApp>()('child', Link.wrapper(ChildAppMessage.GotChild)),
})

export const ChildPageBadChanged = Site.placement(ChildNode, ChildBundle, {
  link: Link.field<ChildModelApp>()('child', Link.wrapper(ChildAppMessage.GotChild)),
  args: () => ({ text: 'hi' }),
  // @ts-expect-error: the arrival message is the child's, not a number
  changed: () => 42,
})

// The tree carries its routes: parsed to their union, built only from one of them.
const Other = defineRouteUnion({ Away: {}, Lost: { path: Schema.String } })
const PathsSite = Site.make(Site.mount(Home, [People]))
export const parsedRoute: (url: Url) => AppRoute | typeof Other.Type = Site.parse(
  PathsSite,
  Other.Lost,
)
// @ts-expect-error: the parser yields the tree's routes or the fallback, not a narrower type
export const narrowParse: (url: Url) => { readonly _tag: 'Home' } = Site.parse(
  PathsSite,
  Other.Lost,
)
export const builtHref = Site.hrefOf(PathsSite, AppRoute.Home())
// @ts-expect-error: a route no node of the tree holds
export const strangerHref = Site.hrefOf(PathsSite, Other.Away())
export const peoplePaths = Site.paths(
  People,
  Effect.succeed([{ params: { searchText: Option.none() } }]),
)
// @ts-expect-error: People's params are a search, not a slug
export const wrongPaths = Site.paths(People, Effect.succeed([{ params: { slug: 'x' } }]))
// The failures and services of every node's paths reach the whole listing.
export const listing: Effect.Effect<ReadonlyArray<unknown>, 'down', never> = Site.targets(
  PathsSite,
  [Site.paths(People, Effect.fail('down' as const))],
)
// A listing of no paths cannot fail and needs nothing.
export const listingNone: Effect.Effect<ReadonlyArray<unknown>, never, never> = Site.targets(
  Site.make(Home),
  [],
)
// @ts-expect-error: the listing fails as its paths fail
export const unfailing: Effect.Effect<ReadonlyArray<unknown>, never, never> = Site.targets(
  PathsSite,
  [Site.paths(People, Effect.fail('down' as const))],
)
