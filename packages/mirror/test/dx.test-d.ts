/**
 * The application API on the design note's example, checked for inference,
 * hover shape, and error placement.
 */
import { Schema } from 'effect'
import type { KeyValueStore } from 'effect/unstable/persistence'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Projection, Surface, type Contract } from 'foldkit-surface'
import {
  Mirror,
  type KvMirror,
  type Mirror as MirrorOf,
  type MirrorMessage,
  type UrlMirror,
} from '../src/index.js'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url } })
type Message = typeof Message.Type
const initial: Model = { filter: 'all', page: 1, q: '', sidebar: 'open', draft: '' }
const App = Surface.application({ Model, Message, initial, update })

// The slice is field refs straight from `App.model`, or a writable projection over them.
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.model.filter, App.model.page, App.model.q],
  keys: { q: { history: 'replace' } },
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
})

// Hover: the slice's value type, the store, and the name; nothing else.
const _filters: UrlMirror<
  Model,
  { readonly filter: 'all' | 'active' | 'done'; readonly page: number; readonly q: string },
  'filters'
> = Filters
const _prefs: KvMirror<
  Model,
  { readonly sidebar: 'open' | 'closed'; readonly draft: string },
  'todo/prefs'
> = Prefs
const _base: MirrorOf<
  Model,
  { readonly filter: 'all' | 'active' | 'done'; readonly page: number; readonly q: string },
  never,
  'filters'
> = Filters
const _contract: Contract = Filters.contract
const _href: string = Filters.href(initial, { page: 2 })
const _restore: Command<MirrorMessage, never, KeyValueStore.KeyValueStore> = Prefs.restore
// The entry is keyed by the mirror's name.
const _entry = Filters.subscriptions['filters.mirror']
void _entry

// @ts-expect-error a key the mirror does not own
Filters.href(initial, { sidebar: 'closed' })
// @ts-expect-error a value of the wrong type
Filters.href(initial, { page: '2' })
Mirror.url(App, {
  fields: [App.model.filter],
  // @ts-expect-error an option for a field the slice does not have
  keys: { page: { history: 'push' } },
})
Mirror.url(App, {
  fields: [App.model.page],
  // @ts-expect-error a codec must decode from text to the field's type
  keys: { page: { codec: Schema.String } },
})
// @ts-expect-error a URL mirror reduces a URL, not a store's Message
Filters.reduce(initial, Message.MirrorRestored({ name: 'filters', keys: {} }))
// @ts-expect-error a store mirror reduces its Message, not a URL
Prefs.reduce(initial, '/todos')

// The wiring an application writes.
function update(
  model: Model,
  message: Message,
): Update.Return<Model, Message, KeyValueStore.KeyValueStore> {
  if (Mirror.reduces(message)) return { model: Prefs.reduce(model, message) }
  switch (message._tag) {
    case 'UrlChanged':
      return { model: Filters.reduce(model, message.url) }
  }
}
const _init: Update.Return<Model, Message, KeyValueStore.KeyValueStore> = {
  model: Filters.reduce(initial, '/todos?filter=active'),
  commands: [Prefs.restore],
}
const _subscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(() => ({
  ...Filters.subscriptions,
  ...Prefs.subscriptions,
}))
void _subscriptions
