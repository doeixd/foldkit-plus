// @vitest-environment jsdom
/**
 * `Site.routing`'s `navigated`: told each navigation's kind before its route
 * is set. Foldkit reduces a URL change on the stack of the event that caused
 * it (`foldkit/dist/runtime/browserListeners.js`: `popstate` for Back and
 * Forward, `foldkit:urlchange` for a URL a Command wrote), so the listeners
 * below reduce as its own do.
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
  root,
  slash,
} from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url, fromString } from 'foldkit/url'
import type { Url as UrlValue } from 'foldkit/url'
import { ModelRef, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  Person: { personId: Schema.Number },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const personRouter = pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person))
const parse = parseUrlWithFallback(oneOf(personRouter, homeRouter), AppRoute.NotFound)
const urlOf = (path: string): UrlValue =>
  Option.getOrThrow(fromString(`https://example.test${path}`))

const AppSite = Site.make(
  Site.route(homeRouter, AppRoute.Home),
  Site.route(personRouter, AppRoute.Person),
)

const Model = Schema.Struct({ route: AppRoute, kinds: Schema.Array(Schema.String) })
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
    dependency: ModelRef.focus(App.model.route).dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  // The route is still the one left: the kind is told before it is set.
  navigated: (model, kind) =>
    modifyFields(model, { kinds: kinds => [...kinds, `${kind} from ${model.route._tag}`] }),
})

const at = (path: string): Model => ({ route: parse(urlOf(path)), kinds: [] })
const changed = (model: Model, path: string): Model => {
  const routed = Routing.route?.(model, Message.ChangedUrl({ url: urlOf(path) }))
  if (routed === undefined || Option.isNone(routed))
    throw new Error('Site.routing took no URL change')
  return routed.value.model
}

/** Reduces the URL change the way Foldkit does, inside a listener for `type`. */
const during = (type: string, event: Event, reduce: () => Model): Model => {
  let model: Model | undefined
  const listener = () => {
    model = reduce()
  }
  window.addEventListener(type, listener)
  window.dispatchEvent(event)
  window.removeEventListener(type, listener)
  return model!
}

describe("Site.routing's navigated", () => {
  afterEach(() => window.history.replaceState({}, '', '/'))

  it('tells history for a popstate, before the route is set', () => {
    const model = during('popstate', new PopStateEvent('popstate'), () =>
      changed(at('/'), '/people/3'),
    )

    expect(model.kinds).toEqual(['history from Home'])
    expect(model.route).toEqual(AppRoute.Person({ personId: 3 }))
  })

  it('tells push for a URL a Command wrote', () => {
    const model = during('foldkit:urlchange', new CustomEvent('foldkit:urlchange'), () =>
      changed(at('/'), '/people/3'),
    )

    expect(model.kinds).toEqual(['push from Home'])
  })

  it('tells push for a change reduced off any event', () => {
    expect(changed(at('/'), '/people/3').kinds).toEqual(['push from Home'])
  })

  it('tells nothing for an echo of the shown address', () => {
    const model = at('/people/3')
    const echoed = during('popstate', new PopStateEvent('popstate'), () =>
      changed(model, '/people/3'),
    )

    expect(echoed).toBe(model)
  })
})
