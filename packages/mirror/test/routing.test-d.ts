/** `Mirror.routing`: its result is `makeApplication`'s own config, and a mismatched URL Message is refused. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { makeApplication } from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({ path: Schema.String, filter: Schema.Literals(['all', 'active']) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  Pinged: {},
})
type Message = typeof Message.Type
const initial: Model = { path: '/', filter: 'all' }
const App = Surface.application({ Model, Message })
const Filters = Mirror.url(App, { initial, fields: [App.model.filter] })

type Return = Update.Return<Model, Message>
const init = (url: Url): Return => ({ model: { ...initial, path: url.pathname } })
const update = (model: Model, _message: Message): Return => ({ model })
const routing = {
  onUrlRequest: (request: UrlRequest) => Message.ClickedLink({ request }),
  onUrlChange: (url: Url) => Message.ChangedUrl({ url }),
}

const routed = Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'ChangedUrl',
  init,
  update,
  routing,
})

// Spread straight into Foldkit's config: no adapter.
makeApplication({
  Model,
  ...routed,
  view: (model: Model, h: HtmlBuilder<Message>) => ({ title: '', body: h.p([], [model.path]) }),
  container: null,
})

// The application's own Returns come back unwidened.
const _init: (url: Url) => Return = routed.init
const _update: (model: Model, message: Message) => Return = routed.update
void _init
void _update

// An application with flags keeps them before the URL.
const withFlags = Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'ChangedUrl',
  init: (flags: { readonly theme: string }, url: Url): Return => ({
    model: { ...initial, path: `${flags.theme}${url.pathname}` },
  }),
  update,
  routing,
})
const _flagsInit: (flags: { readonly theme: string }, url: Url) => Return = withFlags.init
void _flagsInit

Mirror.routing({
  mirrors: [Filters],
  // @ts-expect-error a tag the application's union does not have
  urlChanged: 'UrlChanged',
  init,
  update,
  routing,
})
Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'ChangedUrl',
  init,
  update,
  routing: {
    onUrlRequest: routing.onUrlRequest,
    // @ts-expect-error `onUrlChange` must make the Message the mirrors read
    onUrlChange: () => Message.Pinged(),
  },
})
Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'Pinged',
  init,
  update,
  routing: {
    onUrlRequest: routing.onUrlRequest,
    // @ts-expect-error the URL Message must carry the `url` the mirrors read
    onUrlChange: () => Message.Pinged(),
  },
})

const Other = Schema.Struct({ filter: Schema.Literals(['all', 'active']) })
const OtherApp = Surface.application({ Model: Other, Message })
const OtherFilters = Mirror.url(OtherApp, {
  name: 'other',
  initial: { filter: 'all' },
  fields: [OtherApp.model.filter],
})
Mirror.routing({
  // @ts-expect-error a mirror of another application's Model
  mirrors: [OtherFilters],
  urlChanged: 'ChangedUrl',
  init,
  update,
  routing,
})
Mirror.routing({
  // @ts-expect-error at least one mirror
  mirrors: [],
  urlChanged: 'ChangedUrl',
  init,
  update,
  routing,
})
