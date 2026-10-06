/**
 * `Site.routing`: the link-click and URL-change lifecycle as one wiring.
 * Clicks navigate (pushing or replacing per history); URL changes set the
 * route field, or touch nothing when the address is the route shown.
 */
import { Option, Schema, pipe } from 'effect'
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
import { Url, fromString } from 'foldkit/url'
import type { Url as UrlValue } from 'foldkit/url'
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
const urlOf = (path: string): UrlValue => {
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

const Model = Schema.Struct({ route: AppRoute })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
})
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })

const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: App.model.route.dependency,
    get: (model: Model) => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
})

const at = (path: string): Model => ({ route: urlToAppRoute(urlOf(path)) })
const routed = (model: Model, message: Message) =>
  Routing.route === undefined ? undefined : Option.getOrUndefined(Routing.route(model, message))

describe('Site.routing', () => {
  it('claims the click and shares the change', () => {
    expect(Routing.key).toBe('site')
    expect(Routing.handles).toEqual(['ClickedLink', 'ChangedUrl'])
    expect(Routing.shared).toEqual(['ChangedUrl'])
    expect(Routing.contract).toMatchObject({
      kind: 'site',
      observes: [['route']],
      messages: ['CompletedNavigation'],
    })
  })

  it('names its messages for the application’s guard', () => {
    expect(
      Routing.reduces(Message.ClickedLink({ request: UrlRequest.External({ href: 'x' }) })),
    ).toBe(true)
    expect(Routing.reduces(Message.ChangedUrl({ url: urlOf('/') }))).toBe(true)
    expect(Routing.reduces(Message.CompletedNavigation())).toBe(false)
  })

  it('answers nothing it does not own', () => {
    expect(routed(at('/'), Message.CompletedNavigation())).toBeUndefined()
  })

  it('refuses a completion that names no message', () => {
    expect(() =>
      Site.routing<Model, Message, AppRoute>({
        site: AppSite,
        owner: App.owner,
        route: {
          dependency: App.model.route.dependency,
          get: (model: Model) => model.route,
          set: (model, route) => modifyFields(model, { route: () => route }),
        },
        parse: urlToAppRoute,
        tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
        // Deliberately invalid: a bare function names no message tag.
        completed: (() => Message.CompletedNavigation()) as never,
      }),
    ).toThrow('Site.routing: completed must be a message constructor')
  })
})

describe('URL changes', () => {
  it('sets the route field on a new address', () => {
    const next = routed(at('/'), Message.ChangedUrl({ url: urlOf('/people/3') }))
    expect(next?.model.route).toEqual(AppRoute.Person({ personId: 3 }))
    expect(next?.commands).toBeUndefined()
  })

  it('returns the same Model for an echo of the shown address', () => {
    const model = at('/people/3')
    const next = routed(model, Message.ChangedUrl({ url: urlOf('/people/3') }))
    expect(next?.model).toBe(model)
  })

  it('applies the starting URL through onUrl', () => {
    expect(Routing.onUrl?.(at('/'), urlOf('/people/3')).route).toEqual(
      AppRoute.Person({ personId: 3 }),
    )
    const model = at('/')
    expect(Routing.onUrl?.(model, urlOf('/'))).toBe(model)
  })
})

describe('link clicks', () => {
  const navigated = (model: Model, message: Message) => {
    const next = routed(model, message)
    expect(next?.model).toEqual(model)
    const [command] = next?.commands ?? []
    return command as { readonly name: string; readonly args?: unknown } | undefined
  }

  it('pushes an internal link to another node', () => {
    const internal = UrlRequest.Internal({ url: urlOf('/people/3') })
    expect(navigated(at('/'), Message.ClickedLink({ request: internal }))).toMatchObject({
      name: 'Site.Navigate',
      args: { url: 'https://example.test/people/3', history: 'push' },
    })
  })

  it('replaces an internal link within a node by default', () => {
    const internal = UrlRequest.Internal({ url: urlOf('/people?searchText=al') })
    expect(
      navigated(at('/people?searchText=a'), Message.ClickedLink({ request: internal })),
    ).toMatchObject({
      name: 'Site.Navigate',
      args: { url: 'https://example.test/people?searchText=al', history: 'replace' },
    })
  })

  it('pushes an internal link to another entry of its node', () => {
    const internal = UrlRequest.Internal({ url: urlOf('/people/4') })
    expect(navigated(at('/people/3'), Message.ClickedLink({ request: internal }))).toMatchObject({
      name: 'Site.Navigate',
      args: { url: 'https://example.test/people/4', history: 'push' },
    })
  })

  it('replaces an internal link to the same entry of its node', () => {
    const internal = UrlRequest.Internal({ url: urlOf('/people/3') })
    expect(navigated(at('/people/3'), Message.ClickedLink({ request: internal }))).toMatchObject({
      name: 'Site.Navigate',
      args: { url: 'https://example.test/people/3', history: 'replace' },
    })
  })

  it('pushes from a location the tree does not hold', () => {
    const internal = UrlRequest.Internal({ url: urlOf('/people/3') })
    expect(navigated(at('/nowhere'), Message.ClickedLink({ request: internal }))).toMatchObject({
      name: 'Site.Navigate',
      args: { url: 'https://example.test/people/3', history: 'push' },
    })
  })

  it('loads an external link', () => {
    const external = UrlRequest.External({ href: 'https://example.com/x' })
    expect(navigated(at('/'), Message.ClickedLink({ request: external }))).toMatchObject({
      name: 'Site.Load',
      args: { href: 'https://example.com/x' },
    })
  })
})
