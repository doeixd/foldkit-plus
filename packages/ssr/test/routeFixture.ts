/**
 * A routing application for Phase 2's route checks. The runtime never reports
 * the URL at boot, so the route a resumed page is on is the one the server
 * rendered.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Model = Schema.Struct({ path: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Requested: {}, Changed: { path: Schema.String } })
type Message = typeof Message.Type

const App = Surface.application({
  Model,
  Message,
  initial: { path: '/' },
  update: (model: Model) => ({ model }),
})

export const calls = { init: 0 }

export const config = {
  Model,
  routing: {
    onUrlRequest: () => Message.Requested(),
    onUrlChange: (url: Url) => Message.Changed({ path: url.pathname }),
  },
  init: (url: Url) => {
    calls.init++
    return { model: { path: url.pathname } }
  },
  update: (model: Model, message: Message) =>
    message._tag === 'Changed' ? { model: { path: message.path } } : { model },
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Routes',
    body: h.p([h.Id('route')], [model.path]),
  }),
  container: null,
}

export const plan = SSR.plan(App, { id: 'routes', state: Projection.pick(App.model.path) })
