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
import { Projection, Surface, type Contract } from 'foldkit-surface'
import { Mirror, type Mirror as MirrorOf, type MirrorMessage } from '../src/index.js'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { href: Schema.String } })
type Message = typeof Message.Type
const initial: Model = { filter: 'all', page: 1, q: '', sidebar: 'open', draft: '' }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Filters = Mirror.url(App, {
  fields: Projection.pick(App.fields.filter, App.fields.page, App.fields.q),
  keys: { q: { history: 'replace' } },
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.fields.sidebar, App.fields.draft),
})

// Hover: the slice's value type and nothing else.
const _filters: MirrorOf<
  Model,
  { readonly filter: 'all' | 'active' | 'done'; readonly page: number; readonly q: string }
> = Filters
const _prefs: MirrorOf<
  Model,
  { readonly sidebar: 'open' | 'closed'; readonly draft: string },
  KeyValueStore.KeyValueStore
> = Prefs
const _contract: Contract = Filters.contract
const _href: string = Filters.href(initial, { page: 2 })
const _restore: Command<MirrorMessage, never, KeyValueStore.KeyValueStore> = Prefs.restore

// @ts-expect-error a key the mirror does not own
Filters.href(initial, { sidebar: 'closed' })
// @ts-expect-error a value of the wrong type
Filters.href(initial, { page: '2' })
Mirror.url(App, {
  fields: Projection.pick(App.fields.filter),
  // @ts-expect-error an option for a field the slice does not have
  keys: { page: { history: 'push' } },
})
Mirror.url(App, {
  fields: Projection.pick(App.fields.page),
  // @ts-expect-error a codec must decode from text to the field's type
  keys: { page: { codec: Schema.String } },
})

// The wiring an application writes.
function update(
  model: Model,
  message: Message,
): Update.Return<Model, Message, KeyValueStore.KeyValueStore> {
  if (Mirror.reduces(message)) return { model: Prefs.reduce(model, message) }
  switch (message._tag) {
    case 'UrlChanged':
      return { model: Filters.reduce(model, message.href) }
  }
}
void update
const _init: Update.Return<Model, Message, KeyValueStore.KeyValueStore> = {
  model: Filters.reduce(initial, '/todos?filter=active'),
  commands: [Prefs.restore],
}
const _subscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(() => ({
  ...Filters.subscriptions,
  ...Prefs.subscriptions,
}))
void _subscriptions
