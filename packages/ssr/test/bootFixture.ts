/**
 * #460: a page generated for its path and opened at a query starts from the
 * address it arrived at, so a boot Command planned from the Model sees the
 * query. `boot` records the Model it is given and returns a Command whose
 * Message the view shows.
 */
import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({
  path: Schema.String,
  query: Schema.String,
  booted: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Requested: {},
  Changed: { path: Schema.String, query: Schema.String },
  Booted: {},
})
export type Message = typeof Message.Type

const initial: Model = { path: '/', query: '', booted: false }

const App = Surface.application({ Model, Message, initial, update: (model: Model) => ({ model }) })

export const config = {
  Model,
  routing: {
    onUrlRequest: () => Message.Requested(),
    onUrlChange: (url: Url) =>
      Message.Changed({
        path: url.pathname,
        query: Option.match(url.search, { onNone: () => '', onSome: search => search }),
      }),
  },
  init: (url: Url) => ({ model: { ...initial, path: url.pathname } }),
  update: (model: Model, message: Message) =>
    Message.match(message, {
      Requested: () => ({ model }),
      Changed: ({ path, query }) => ({ model: { ...model, path, query } }),
      Booted: () => ({ model: { ...model, booted: true } }),
    }),
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Boot',
    body: h.p([h.Id('booted')], [String(model.booted)]),
  }),
  container: null,
}

/** Every Model `boot` was handed, in order. */
export const seen: Array<Model> = []

const Booted = { name: 'Booted', effect: Effect.succeed(Message.Booted()) }

export const plan = SSR.plan(App, {
  id: 'boot',
  state: Projection.pick(App.model.path, App.model.query, App.model.booted),
  boot: model => {
    seen.push(model)
    return [Booted]
  },
})
