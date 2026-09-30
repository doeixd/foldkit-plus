/**
 * The fixture site the `staticSite` plugin builds in its test: two pages, a
 * button to prove a page resumes, and a style for the first paint. Small on
 * purpose; the CMS example is the real site.
 */
import { Schema } from 'effect'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({
  route: Schema.Literals(['home', 'about']),
  count: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedUrl: {},
  Clicked: {},
})
export type Message = typeof Message.Type

export const update = (model: Model, message: Message) =>
  message._tag === 'Clicked' ? { model: { ...model, count: model.count + 1 } } : { model }

export const App = Surface.application({
  Model,
  Message,
  initial: { route: 'home', count: 0 },
  update,
})

const routeOf = (pathname: string): Model['route'] => (pathname === '/about' ? 'about' : 'home')

export const init = (url: Url) => ({
  model: { route: routeOf(url.pathname), count: 0 },
})

export const routing = {
  onUrlChange: () => Message.ChangedUrl({}),
  // The fixture never navigates: links are not exercised here.
  onUrlRequest: () => Message.ChangedUrl({}),
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: model.route === 'about' ? 'About | Fixture' : 'Home | Fixture',
  body: h.main(
    [],
    [
      h.h1([], [model.route === 'about' ? 'The about page' : 'The home page']),
      h.button([h.OnClick(Message.Clicked())], [`Count: ${model.count}`]),
    ],
  ),
})

export const plan = SSR.plan(App, { id: 'fixture', state: Projection.pick(App.model.route) })

/** The deployment the fixture builds as, named in one place: the site, the
 * build define, and the hydrate call must agree, or pages are refused. */
export const buildId = 'fixture-build'

export const config = {
  Model,
  init,
  update,
  view,
  routing,
  container: null,
}
