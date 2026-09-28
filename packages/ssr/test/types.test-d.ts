/**
 * `SSR.hydrate` and the server's calls take Foldkit's own application config,
 * whichever of `makeApplication`'s four shapes, with its callbacks typed from
 * `update`'s Message as Foldkit types them.
 */
import { Context, Layer, Schema } from 'effect'
import type { Runtime } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { UrlRequest } from 'foldkit/navigation'
import type { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { SSR as Server } from 'foldkit-ssr'
import { SSR } from 'foldkit-ssr/client'

const Model = Schema.Struct({ path: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Requested: { request: Schema.Unknown },
  Changed: { path: Schema.String },
})
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  message._tag === 'Changed' ? { model: { path: message.path } } : { model }
const view = (model: Model, h: HtmlBuilder<Message>) => ({
  title: 'Routes',
  body: h.p([], [model.path]),
})
const init = (url: Url) => ({ model: { path: url.pathname } })

const App = Surface.application({ Model, Message, initial: { path: '/' }, update })
const plan = SSR.plan(App, { id: 'routes', state: Projection.pick(App.model.path) })

declare const routing: Runtime.RoutingApplicationConfig<Model, Message>
declare const flagged: Runtime.ApplicationConfigWithFlags<Model, Message, { readonly n: number }>
declare const plain: Runtime.ApplicationConfig<Model, Message>

// Foldkit's config types, as they are.
SSR.hydrate(routing, plan, { buildId: 'b' })
SSR.hydrate(flagged, plan, { buildId: 'b' })
SSR.hydrate(plain, plan, { buildId: 'b' })
Server.render(routing, plan, { buildId: 'b' })

// Written in place: `routing`'s callbacks need no annotation, and `devTools` is Foldkit's.
SSR.hydrate(
  {
    Model,
    init,
    update,
    view,
    container: null,
    routing: {
      onUrlRequest: request => Message.Requested({ request: request satisfies UrlRequest }),
      onUrlChange: url => Message.Changed({ path: url.pathname }),
    },
    devTools: { Message },
  },
  plan,
  { buildId: 'b' },
)

SSR.hydrate(
  {
    Model,
    init,
    update,
    view,
    container: null,
    routing: {
      onUrlRequest: request => Message.Requested({ request }),
      // @ts-expect-error: a routing callback returns one of `update`'s Messages
      onUrlChange: url => url.pathname,
    },
  },
  plan,
  { buildId: 'b' },
)

SSR.hydrate(
  {
    Model,
    init,
    update,
    view,
    container: null,
    // @ts-expect-error: not a key of Foldkit's config (`devTools` is)
    devtools: { Message },
  },
  plan,
  { buildId: 'b' },
)

class Clock extends Context.Service<Clock, { readonly now: () => number }>()('Clock') {}
declare const needsClock: Layer.Layer<never, never, Clock>

SSR.hydrate(
  {
    Model,
    init,
    update,
    view,
    container: null,
    // @ts-expect-error: resources must need nothing, as Foldkit's runtime provides them
    resources: needsClock,
  },
  plan,
  { buildId: 'b' },
)

// A server render reads that the application routes, and gets the real routing too.
Server.render(
  // @ts-expect-error: `routing` is Foldkit's `RoutingConfig`, not any object
  { Model, init, update, view, container: null, routing: {} },
  plan,
  { buildId: 'b' },
)
