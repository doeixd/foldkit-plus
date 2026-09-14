/**
 * The Quick start from this package's README, type-checked so the
 * documentation cannot drift from the API.
 */
import { Schema } from 'effect'
import type { KeyValueStore } from 'effect/unstable/persistence'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
type Model = typeof Model.Type

// `Mirror.messages` contributes `MirrorRestored`, which a store mirror reduces.
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url } })
type Message = typeof Message.Type

const initial: Model = { filter: 'all', page: 1, q: '', sidebar: 'open', draft: '' }
const App = Surface.application({ Model, Message, initial, update })

// The URL shows the filters, as ?filter=…&page=…&q=…; keys default to the field names.
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.fields.filter, App.fields.page, App.fields.q],
  keys: { q: { history: 'replace' } }, // the rest push a history entry
})

// A key-value store keeps the preference and the draft across sessions.
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.fields.sidebar, App.fields.draft),
})

type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>

function update(model: Model, message: Message): Return {
  if (Mirror.reduces(message)) return { model: Prefs.reduce(model, message) }
  switch (message._tag) {
    case 'UrlChanged':
      return { model: Filters.reduce(model, message.url) }
  }
}

// Cold load: the URL is reduced in, and the store is asked for the rest.
const init = (url: Url): Return => ({
  model: Filters.reduce(initial, url),
  commands: [Prefs.restore],
})

// The writes: one entry per mirror, keyed `<name>.mirror`.
const subscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(() => ({
  ...Filters.subscriptions,
  ...Prefs.subscriptions,
}))

// Links are the mirrored keys applied to the current URL.
const link: string = Filters.href(initial, { page: 2 })

void init
void subscriptions
void link
