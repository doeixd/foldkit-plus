# foldkit-mirror

Keeps part of a Foldkit Model **represented** in the URL or in an Effect
`KeyValueStore`. The Model stays authoritative, and `update` stays the only
place where state changes. A mirror only observes the state, so it never owns it.

## Ownership

| State | Owner | Representation |
| --- | --- | --- |
| Filter, sort, page, search text, open panel | local Model | URL, via `Mirror.url` |
| Preference, draft, collapsed sidebar | local Model | `KeyValueStore`, via `Mirror.kv` |
| Offline edits that must converge across devices | `foldkit-sync` | not Mirror |
| Server facts | `foldkit-remote` | not Mirror (put only the id in the URL) |

Only use a mirror for disposable per-device state. It is last-write-wins, with
no log and no ordering, so two tabs writing to it do not converge.

## Mental model: three seams

```text
subscriptions  Model slice -> encode (defaults elided) -> URL / store   (throttled, deduped)
reduce         URL or MirrorRestored Message -> Model slice
restore        Command that reads the store on cold load -> MirrorRestored
```

A URL mirror has no `restore` because startup already has the URL. A KV mirror
does have one. Cold-load precedence is: URL value, then KV restore, then initial.

## Minimal example

```ts
import { Schema } from 'effect'
import type { KeyValueStore } from 'effect/unstable/persistence'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Mirror } from 'foldkit-mirror'
import { Projection, Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
  draft: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ...Mirror.messages,                 // adds MirrorRestored; required for Mirror.kv
  UrlChanged: { url: Url },
})
type Message = typeof Message.Type
type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>

const initial: Model = { filter: 'all', page: 1, q: '', draft: '' }
const App = Surface.application({ Model, Message, initial, update })

// ?filter=active&page=2 ; keys default to field names, defaults are omitted
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.fields.filter, App.fields.page, App.fields.q],
  keys: { q: { history: 'replace' } },          // others default to 'push'
})

// one versioned JSON document under 'todo/prefs'
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.fields.draft),     // field refs or a writable Projection
})

function update(model: Model, message: Message): Return {
  if (Mirror.reduces(message)) return { model: Prefs.reduce(model, message) }
  switch (message._tag) {
    case 'UrlChanged':
      return { model: Filters.reduce(model, message.url) }
  }
}

const init = (url: Url): Return => ({
  model: Filters.reduce(initial, url),          // URL first
  commands: [Prefs.restore],                    // store answers later with MirrorRestored
})

const subscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(() => ({
  ...Filters.subscriptions,                     // entry key: 'filters.mirror'
  ...Prefs.subscriptions,
}))

const link: string = Filters.href(initial, { page: 2 })   // current URL with mirrored keys patched

// One list instead of the hand-wiring above.
const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())
const wiredUpdate = wiring.update(model => ({ model }))
const wiredSubscriptions = wiring.subscriptions()
const wiredUrl = wiring.url(url => Message.UrlChanged({ url }))
```

Provide the store Layer where the runtime runs (for example,
`KeyValueStore.layerStorage(() => window.localStorage)`).

## Under `Sync.mount`

`Sync.mount` has no `init` Commands. To wire a mirror in, derive the runtime
pieces from the assembly instead of writing them by hand (as
`examples/todo-app` does): `wiring.subscriptions()` for `subscriptions`,
`wiring.url(…)` for `url`, and `wiring.initial(…)` for the startup Commands to
dispatch once mounted:

```ts
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { Sync } from 'foldkit-sync'

const store = KeyValueStore.layerStorage(() => window.localStorage)
const start = wiring.initial(initial)
const mounted = Sync.mount(App, TodoSync, {
  replica,
  container,
  view,
  subscriptions: wiring.subscriptions(),
  resources: store,
  url: wiring.url(url => Message.UrlChanged({ url })),
})
for (const command of start.commands ?? []) {
  void Effect.runPromise(command.effect.pipe(Effect.provide(store))).then(message =>
    mounted.dispatch(message),
  )
}
```

## Behavior worth knowing

- Values equal to `App.initial` are omitted (`keys: { page: { keep: true } }`
  keeps one). Codecs follow the field type (string, number, boolean, else JSON).
  Override with `keys: { tags: { codec } }`.
- URL `reduce` sets the **whole** slice, so a missing or undecodable key
  (`?page=abc`) becomes initial. KV `reduce` fills only fields **still at
  initial**, which keeps early edits, and ignores other mirrors' restores
  (matched by `name`, which defaults to `key`).
- Writes are throttled (URL 50 ms, KV 250 ms, `throttle`) and deduped, so
  `popstate` cannot loop. `location: 'hash'` is supported, and SSR writes nothing.
- `Mirror.kv({ scope })` scopes to a user or tenant. Another scope or version,
  or a malformed document, is removed. Store failures never throw.

## Contract, Module, gotchas

- `mirror.contract` has kind `mirror`, so `Module.manifest` shows the field as
  `local` with the mirror beside it. `Module.validate` reports a KV mirror
  whose `MirrorRestored` is missing from the union.
- Each URL key belongs to one URL mirror per app. A second claim throws and
  names the first mirror. Always set `name`, or the entry key is derived.
- Without `...Mirror.messages` and the restore, the KV value never returns.
- Don't mirror Sync or Remote state, or route path segments. Keys that differ
  from `route.query(schema)` coexist with it.
- Kernel: `Mirror.make(App, store, config)` over any `MirrorStore`
  (`read`/`write`). Built-in stores are `MirrorStore.url`, `.kv`, and `.memory`.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/mirror/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/mirror.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/MIRROR.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app
