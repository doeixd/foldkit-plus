/**
 * The `foldkit-site` first cut: stable route nodes in a hierarchy, typed
 * targets with hrefs from one declaration, chain inspection, annotatable
 * metadata, one history declaration, and attached SurfaceSources.
 */
import { Option, Schema, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  defineRouteUnion,
  int,
  literal,
  mapTo,
  oneOf,
  parseUrlWithFallback,
  query,
  root,
  slash,
} from 'foldkit/route'
import { fromString } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  People: { searchText: Schema.Option(Schema.String) },
  Person: { personId: Schema.Number },
  Nested: {},
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const peopleRouter = pipe(
  literal('people'),
  // The query half lives here, not in a second href builder.
  query(Schema.Struct({ searchText: Schema.OptionFromOptional(Schema.String) })),
  mapTo(AppRoute.People),
)
const personRouter = pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person))
const nestedRouter = pipe(literal('nested'), slash(literal('route')), mapTo(AppRoute.Nested))

const urlToRoute = parseUrlWithFallback(
  oneOf(personRouter, peopleRouter, nestedRouter, homeRouter),
  AppRoute.NotFound,
)
const routeOf = (path: string): AppRoute => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return urlToRoute(url.value)
}

const Home = Site.route(homeRouter, AppRoute.Home, {
  title: () => 'Routing',
  landing: {},
  shortcut: 'GH',
})
const People = Site.route(peopleRouter, AppRoute.People, {
  title: () => 'People | Routing',
  section: 'People',
  landing: { searchText: Option.none() },
  shortcut: 'GP',
})
const Person = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
  // Another person is another entry (a step); the default within a node is a replace.
  history: (prev, next) => (prev.personId === next.personId ? 'replace' : 'push'),
})
const Nested = Site.route(nestedRouter, AppRoute.Nested, {
  title: () => 'Nested | Routing',
  landing: {},
  shortcut: 'GN',
  history: 'push',
})

const AppSite = Site.make(Home, Site.mount(People, [Person]), Nested)

describe('targets', () => {
  it('builds the route value and the URL from one declaration', () => {
    const target = Site.target(People, { searchText: Option.some('ali') })
    expect(target.route).toEqual(AppRoute.People({ searchText: Option.some('ali') }))
    expect(target.url).toBe('/people?searchText=ali')
    expect(Site.href(target)).toBe('/people?searchText=ali')
    expect(Site.href(People, { searchText: Option.some('ali') })).toBe('/people?searchText=ali')
    expect(Site.href(Home, {})).toBe('/')
  })

  it('round-trips: a built URL parses back to the target route', () => {
    for (const target of [
      Site.target(Home, {}),
      Site.target(People, { searchText: Option.some('ali') }),
      Site.target(People, { searchText: Option.none() }),
      Site.target(Person, { personId: 3 }),
      Site.target(Nested, {}),
    ]) {
      expect(routeOf(target.url)).toEqual(target.route)
    }
  })
})

describe('the tree', () => {
  it('lists nodes depth-first, parents before children', () => {
    expect(Site.nodesOf(AppSite).map(node => node.tag)).toEqual([
      'Home',
      'People',
      'Person',
      'Nested',
    ])
  })

  it('finds parents, ancestors, and depths', () => {
    expect(Site.parentOf(AppSite, Person)?.tag).toBe('People')
    expect(Site.parentOf(AppSite, People)).toBeUndefined()
    expect(Site.ancestorsOf(AppSite, Person).map(node => node.tag)).toEqual(['People'])
    expect(Site.ancestorsOf(AppSite, People)).toEqual([])
    expect(Site.depthOf(AppSite, Home)).toBe(0)
    expect(Site.depthOf(AppSite, Person)).toBe(1)
  })

  it('resolves a route value to its node and chain', () => {
    expect(Site.nodeOf(AppSite, routeOf('/people/3'))).toBe(Person)
    expect(Site.chainOf(AppSite, routeOf('/people/3')).map(node => node.tag)).toEqual([
      'People',
      'Person',
    ])
    expect(Site.chainOf(AppSite, routeOf('/'))).toEqual([Home])
  })

  it('resolves nothing for a tag the tree does not hold', () => {
    expect(Site.nodeOf(AppSite, routeOf('/nowhere'))).toBeUndefined()
    expect(Site.chainOf(AppSite, routeOf('/nowhere'))).toEqual([])
  })

  it('leaves the node usable bare after mounting', () => {
    // Mounting never mutates: the same value still builds targets.
    expect(Site.target(Person, { personId: 1 }).url).toBe('/people/1')
  })

  it('refuses two nodes sharing a tag', () => {
    const Again = Site.route(homeRouter, AppRoute.Home)
    expect(() => Site.make(Home, Again)).toThrow('two nodes share the tag "Home"')
  })

  it('refuses one node mounted twice', () => {
    expect(() => Site.make(Site.mount(People, [Person]), Site.mount(Nested, [Person]))).toThrow(
      '"Person" is mounted twice',
    )
  })
})

describe('metadata', () => {
  it('reads titles and sections off route values', () => {
    expect(Site.titleOf(AppSite, routeOf('/'))).toBe('Routing')
    expect(Site.titleOf(AppSite, routeOf('/people/3'))).toBe('Person 3 | Routing')
    expect(Site.sectionOf(AppSite, routeOf('/people/3'))).toBe('People')
    expect(Site.sectionOf(AppSite, routeOf('/'))).toBeUndefined()
    expect(Site.titleOf(AppSite, routeOf('/nowhere'))).toBeUndefined()
  })

  it('lands each section on its annotated node', () => {
    expect(Site.landing(AppSite, 'People')).toMatchObject({ url: '/people' })
    expect(Site.landing(AppSite, 'People')?.route).toEqual(
      AppRoute.People({ searchText: Option.none() }),
    )
    // The second node of the section never lands: landings are annotated.
    expect(Site.landing(AppSite, 'People')?.node).toBe(People)
    expect(Site.landing(AppSite, 'Missing')).toBeUndefined()
  })

  it('lands nothing for a section whose nodes declare no landing', () => {
    const bare = Site.make(Person)
    expect(Site.landing(bare, 'People')).toBeUndefined()
  })

  it('names each shortcut beside its destination', () => {
    expect(
      Site.nodesOf(AppSite).flatMap(node =>
        node.shortcut === undefined ? [] : [[node.shortcut, node.tag] as const],
      ),
    ).toEqual([
      ['GH', 'Home'],
      ['GP', 'People'],
      ['GN', 'Nested'],
    ])
  })
})

describe('history', () => {
  const home = Site.target(Home, {})
  const people = (text: string) => Site.target(People, { searchText: Option.some(text) })

  it('moves to another node, or from an unknown location, as a step', () => {
    expect(Site.historyOf(undefined, home)).toBe('push')
    expect(Site.historyOf(home, Site.target(Person, { personId: 3 }))).toBe('push')
  })

  it('replaces within a node by default', () => {
    expect(Site.historyOf(people('a'), people('al'))).toBe('replace')
  })

  it('lets a node declare entries of its own', () => {
    const one = Site.target(Person, { personId: 1 })
    expect(Site.historyOf(one, Site.target(Person, { personId: 1 }))).toBe('replace')
    expect(Site.historyOf(one, Site.target(Person, { personId: 2 }))).toBe('push')
  })

  it('lets a node always step', () => {
    const nested = Site.target(Nested, {})
    expect(Site.historyOf(nested, Site.target(Nested, {}))).toBe('push')
  })
})

describe('attached Surfaces', () => {
  const Model = Schema.Struct({
    route: AppRoute,
    search: Schema.String,
  })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ Noted: {} })
  const App = Surface.application({ Model, Message })

  const PeoplePage = App.surface('PeoplePage', {
    params: { searchText: Schema.Option(Schema.String) },
    model: ({ model }) => Projection.struct({ search: model.search }),
  })
  const PersonPage = App.surface('PersonPage', {
    params: { personId: Schema.Number },
    model: ({ model }) => Projection.struct({ search: model.search }),
  })
  const surfaced = Site.make(
    Home,
    Site.mount(
      Site.route(peopleRouter, AppRoute.People, {
        surface: {
          surface: PeoplePage,
          params: route => ({ searchText: route.searchText }),
        },
      }),
      [
        Site.route(personRouter, AppRoute.Person, {
          surface: { surface: PersonPage, params: route => ({ personId: route.personId }) },
        }),
      ],
    ),
    Nested,
  )
  const sources = Site.sources(surfaced, App.owner, App.model.route)

  it('activates one entry per surfaced node, keyed by tag', () => {
    expect(Object.keys(sources)).toEqual(['People', 'Person'])
    // Each entry answers its own tag only: on a person page the person
    // surface is active and the people surface is not.
    const person = { route: routeOf('/people/3'), search: '' }
    expect(Option.isSome(sources['Person']!.projectionOf(person))).toBe(true)
    expect(Option.isNone(sources['People']!.projectionOf(person))).toBe(true)
    const people = { route: routeOf('/people?searchText=ali'), search: '' }
    expect(Option.isSome(sources['People']!.projectionOf(people))).toBe(true)
    expect(Option.isNone(sources['Person']!.projectionOf(people))).toBe(true)
  })

  it('maps route params to Surface params, and deactivates off-route', () => {
    const on = { route: routeOf('/people/3'), search: '' }
    const active = Option.getOrThrow(sources['Person']!.projectionOf(on))
    expect(active.read(on)).toEqual({ search: '' })
    const away = { route: routeOf('/'), search: '' }
    expect(Option.isNone(sources['People']!.projectionOf(away))).toBe(true)
    expect(Option.isNone(sources['Person']!.projectionOf(away))).toBe(true)
  })

  it('refuses a surface of another application', () => {
    const Other = Surface.application({ Model, Message })
    const Stranger = Site.route(peopleRouter, AppRoute.People, {
      surface: {
        surface: Other.surface('Elsewhere', { model: ({ model }) => ({ search: model.search }) }),
        params: () => undefined,
      },
    })
    expect(() => Site.sources(Site.make(Stranger), App.owner, App.model.route)).toThrow(
      '"Elsewhere" belongs to another application than the site',
    )
  })
})
