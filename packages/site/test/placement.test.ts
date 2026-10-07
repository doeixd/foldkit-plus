/**
 * `Site.placement`: one routed page stated once. Its link drives the fold
 * (`placed.update`) and the drawing (`placed.view`), and `Site.routing`
 * informs it when its route arrives — no hand-written fold/submodel pair,
 * no ClickedLink/ChangedUrl branches.
 */
import { Option, Schema, pipe } from 'effect'
import { Bundle, Link } from 'foldkit-bundle'
import { Submodel } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
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
import { modifyFields } from 'foldkit/struct'
import { Scene } from 'foldkit/test'
import { Url, fromString } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  People: { searchText: Schema.Option(Schema.String) },
  Person: { personId: Schema.Number },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const peopleRouter = pipe(
  literal('people'),
  query(Schema.Struct({ searchText: Schema.OptionFromOptional(Schema.String) })),
  mapTo(AppRoute.People),
)
const personRouter = pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person))

const urlToAppRoute = parseUrlWithFallback(
  oneOf(personRouter, peopleRouter, homeRouter),
  AppRoute.NotFound,
)
const urlOf = (path: string): Url => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return url.value
}

const Home = Site.route(homeRouter, AppRoute.Home)
const People = Site.route(peopleRouter, AppRoute.People)
const Person = Site.route(personRouter, AppRoute.Person, {
  history: (prev, next) => (prev.personId === next.personId ? 'replace' : 'push'),
})
const AppSite = Site.make(Home, Site.mount(People, [Person]))

const PeopleModel = Schema.Struct({
  searchInput: Schema.String,
  found: Schema.Array(Schema.String),
})
type PeopleModel = typeof PeopleModel.Type
const PeopleMessage = defineMessageUnion({
  ChangedRoute: { route: AppRoute.People },
  Picked: { name: Schema.String },
})
type PeopleMessage = typeof PeopleMessage.Type

const PeopleBundle = Bundle.make('People', {
  Model: PeopleModel,
  Message: PeopleMessage,
  args: Schema.Struct({ searchText: Schema.Option(Schema.String) }),
  init: ({ searchText }) => ({
    model: { searchInput: Option.getOrElse(searchText, () => ''), found: [] },
  }),
  update: (model, message) =>
    PeopleMessage.match(message, {
      ChangedRoute: ({ route }) => ({
        model: {
          searchInput: Option.getOrElse(route.searchText, () => ''),
          found: [],
        },
      }),
      Picked: ({ name }) => ({ model: { ...model, found: [...model.found, name] } }),
    }),
  view: Submodel.defineView<PeopleModel, PeopleMessage>((model, h: HtmlBuilder<PeopleMessage>) =>
    h.div(
      [],
      [
        h.p([], [model.searchInput]),
        h.ul(
          [],
          model.found.map(name => h.li([], [name])),
        ),
        h.button([h.OnClick(PeopleMessage.Picked({ name: model.searchInput }))], ['Pick']),
      ],
    ),
  ),
})

const Model = Schema.Struct({
  route: AppRoute,
  peoplePage: PeopleModel,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  GotPeopleMessage: { message: PeopleMessage },
})
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })

const PeoplePage = Site.placement(People, PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => PeopleMessage.ChangedRoute({ route }),
})

const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: App.model.route.dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  pages: [PeoplePage],
})

const assembly = Bundle.assemble<Model, Message>()([PeoplePage.placed, Routing])

// Placement-routed and routing-owned Messages never reach `own`; the guards
// below are unreachable, and what remains narrows to the completion.
const update = assembly.update((model: Model, message: Message) => {
  if (Routing.reduces(message)) return { model }
  if (message._tag === 'GotPeopleMessage') return { model }
  return { model }
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div([], [PeoplePage.placed.view(model, h)])

const at = (path: string): Model => {
  const started = assembly.initial({ route: urlToAppRoute(urlOf(path)) })
  return started.model
}

describe('one placement drives the fold', () => {
  it('routes the child’s Messages through the wrapper into its field', () => {
    const model = at('/people?searchText=a')
    const next = update(
      model,
      Message.GotPeopleMessage({ message: PeopleMessage.Picked({ name: 'a' }) }),
    )
    expect(next.model.peoplePage.found).toEqual(['a'])
    expect(next.model.route).toEqual(model.route)
  })

  it('starts the child from the route’s params', () => {
    expect(at('/people?searchText=ali').peoplePage.searchInput).toBe('ali')
    expect(at('/').peoplePage.searchInput).toBe('')
  })
})

describe('a route arrival informs its page', () => {
  it('sets the route and tells the child through its own Message', () => {
    const next = update(at('/'), Message.ChangedUrl({ url: urlOf('/people?searchText=bo') }))
    expect(next.model.route).toEqual(AppRoute.People({ searchText: Option.some('bo') }))
    expect(next.model.peoplePage.searchInput).toBe('bo')
  })

  it('tells no page on a route none declares', () => {
    const next = update(at('/people?searchText=a'), Message.ChangedUrl({ url: urlOf('/people/3') }))
    expect(next.model.route).toEqual(AppRoute.Person({ personId: 3 }))
    expect(next.model.peoplePage.searchInput).toBe('a')
  })

  it('touches nothing on an echo of the shown address', () => {
    const model = at('/people?searchText=a')
    expect(update(model, Message.ChangedUrl({ url: urlOf('/people?searchText=a') })).model).toBe(
      model,
    )
  })
})

describe('clicks navigate without branches', () => {
  it('pushes to another node with the page informed on arrival', () => {
    const clicked = update(
      at('/'),
      Message.ClickedLink({ request: UrlRequest.Internal({ url: urlOf('/people/3') }) }),
    )
    expect(clicked.commands).toHaveLength(1)
    // The arrival the navigation will echo back:
    const arrived = update(clicked.model, Message.ChangedUrl({ url: urlOf('/people/3') }))
    expect(arrived.model.route._tag).toBe('Person')
  })
})

describe('one placement drives the drawing', () => {
  const scene = (model: Model, ...steps: Parameters<typeof Scene.scene<Model, Message>>[1][]) =>
    Scene.scene({ update, view }, Scene.given(model), ...steps)

  it('draws the child through the same placement, and a click reaches it', () => {
    scene(
      at('/people?searchText=a'),
      Scene.expect(Scene.selector('p')).toHaveText('a'),
      Scene.expect(Scene.selector('li')).toBeAbsent(),
      Scene.click('button'),
      Scene.expect(Scene.selector('li')).toHaveText('a'),
    )
  })
})

describe('SitePage.inform', () => {
  it('answers nothing for another node’s route', () => {
    const model = at('/people?searchText=a')
    expect(Option.isNone(PeoplePage.inform(model, AppRoute.Person({ personId: 3 })))).toBe(true)
  })

  it('answers nothing without a changed declaration', () => {
    const Quiet = Site.placement(People, PeopleBundle, {
      link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
      args: parent => ({
        searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
      }),
    })
    const model = at('/people?searchText=a')
    expect(
      Option.isNone(Quiet.inform(model, AppRoute.People({ searchText: Option.some('b') }))),
    ).toBe(true)
  })

  it('answers nothing when the arrival needs no answer', () => {
    const Silent = Site.placement(People, PeopleBundle, {
      link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
      args: parent => ({
        searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
      }),
      changed: () => undefined,
    })
    const model = at('/people?searchText=a')
    expect(
      Option.isNone(Silent.inform(model, AppRoute.People({ searchText: Option.some('b') }))),
    ).toBe(true)
  })
})
