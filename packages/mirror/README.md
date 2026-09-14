# `foldkit-mirror`

Keeps part of a Foldkit Model in the URL or in a key-value store, so a filter
survives a shared link and a draft survives a reload. You name a slice of the
Model; the mirror writes it out whenever it changes and reads it back on
navigation or cold load. Nothing else about the application changes: the Model
is still the only truth, and `update` is still the only reducer.

You do not declare keys, codecs, or defaults. They are derived from the field
refs you point at: a key's name is the field's name, its text form comes from
the field's encoded type, and a value equal to the Model's initial one is left
out of the store entirely. The URL query string and Effect's `KeyValueStore`
are the two stores that ship.

**Use it when** the state is disposable, per-device, and cheap to lose: a
filter, a sort, a page, an open panel, a preference, an unsent draft. **Not
for** anything that must converge. A mirror is last-write-wins against a store
with no log and no ordering, so two tabs writing the same key-value document
simply overwrite each other. That is what separates it from
[`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync)
(an ordered durable log that converges) and from
[`foldkit-remote`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote)
(a normalized cache of another owner's facts). The design is in
[`docs/design/MIRROR.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/MIRROR.md).

| State                                          | Owner           | Mirror                        |
| ---------------------------------------------- | --------------- | ----------------------------- |
| Filter, sort, page, search text, an open panel | the local Model | the URL (`Mirror.url`)        |
| Preferences, a draft, a collapsed sidebar      | the local Model | `KeyValueStore` (`Mirror.kv`) |

## Install

```bash
pnpm add foldkit-mirror
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with it.

## Quick start

Declare the mirrors over the application, then wire their three seams: `reduce`
in `update`, `restore` in a Command, and `subscriptions` for the writes.

```ts
import { Schema } from 'effect'
import type { KeyValueStore } from 'effect/unstable/persistence'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

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
```

The slice is field refs straight from `App.fields`, or a writable projection
over them (`Projection.pick`, `Projection.compose`) — the same object
`foldkit-sync` replicates. The URL comes in through the `onUrlChange` the
runtime already has for routing; `Filters.reduce` takes a Foldkit `Url` or an
href. The store comes in through one `MirrorRestored` case spread from
`Mirror.messages`. Links are `Filters.href(model, { page: 2 })`, the mirrored
keys applied to the current URL. An application built without `initial` passes
`initial` in the mirror's config; defaults are read from it. Under
`foldkit-sync`'s `mount`, the `url` option (`init`, `onUrlChange`) is where the
URL mirror plugs in.

## What the Model being the truth gives

- **Defaults for free.** `App.initial` holds every field's default, so a key
  equal to its initial value is elided from the store; there is no
  `.withDefault`. A key that should always be written opts in with
  `keys: { page: { keep: true } }`.
- **Batching for free.** The entry's dependencies are the encoded keys: one
  Model change yields at most one write, whatever it touched, and a change
  that encodes to the same keys writes nothing. Back and forward cannot loop:
  `popstate` reduces into the Model, the entry sees the same keys, and stops.
- **Codecs for free.** A key's codec is derived from the field's encoded form
  of the initial value: a string is itself, a number is parsed as one, a
  boolean is `true`/`false`, and anything else is JSON. `keys: { tags: { codec } }`
  gives a key a `Schema.Codec<Value, string>` of its own when the URL should
  read nicely (`?tags=a,b`).

## Reading back

Each kind of mirror has the `reduce` its store calls for:

- A URL mirror's `reduce(model, url)` takes a Foldkit `Url` or an href and
  sets the whole slice: a key the URL lacks is the initial value, and a key
  that fails to decode is too, so `?page=abc` shows page one rather than
  breaking the page. `mirror.decode(keys)` returns the value and the issues
  for a caller that wants to say so. Only the mirror's keys are read; the
  path, the hash, and every other key are left alone.
- A store mirror's `reduce(model, message)` takes the `MirrorRestored` its
  `restore` Command yields and sets only the fields the Model still holds at
  their initial value, so a change the user made before the store answered is
  kept. Another mirror's Message is ignored.

Both are the kernel's `fromKeys(model, keys)` and `restoreKeys(model, keys)`,
which `Mirror.make` exposes for any store.

`Mirror.reduces(message)` narrows the application's union to Mirror's cases.

## Writing

The entry writes only what changed, waits `throttle` first (50 ms for the
URL, 250 ms for a store; browsers rate-limit history writes), and a newer
slice supersedes a pending write, which is what Foldkit's dependency restart
does. A write pushes a history entry only for a changed key whose `history`
is `push` (the default); a `replace` key, and a key going back to its default,
replace. The store ignores the intent. Outside a browser the URL store writes
nothing, so a server render is safe.

A key-value mirror keeps one JSON document under `key`, with a version and a
`scope` (a user, a tenant); a document of another version or scope, or a
malformed one, is discarded and removed rather than restored, as
`RemotePersistence` does, because a mirror holds no unsent user edits. A
store failure is absorbed: the mirror is disposable state and never fails the
application. A slice back at its defaults removes the document.

## Contracts and `Module`

`mirror.contract` is of kind `mirror`: it observes the slice's fields and owns
nothing, so `Module.manifest` shows the field as `local` with the mirror
beside it. A key-value mirror names `MirrorRestored` among its Messages, so a
union that did not spread `Mirror.messages` is an `unknown-message` finding.
A URL key belongs to one mirror per application: a second mirror claiming it
is an error at construction naming the first.

## The kernel

`Mirror.make(App, store, config)` keeps a slice in any `MirrorStore`: `read`
the keys, `write({ set, remove, intent })`. `MirrorStore.url(keys, location)`,
`MirrorStore.kv({ key, scope })`, and `MirrorStore.memory()` (records its
writes, for tests) are the three; `applyToHref(href, { set, remove })` is the
pure URL step `href` and the URL store share.

## Limits

- A mirror is last-write-wins. Two tabs writing one key-value document do not
  converge; that is `foldkit-sync`'s job.
- Arrays and objects are JSON in the URL by default. Give the key a codec for
  a readable form.
- Two mirrors may name one field (a filter both linkable and remembered). On a
  cold load the URL wins when it names the key, then the store, then the
  initial value: `init` reduces the URL first, and `restore` applies only
  fields still at their initial value.
- The URL store touches only its keys and needs a browser `location`; it uses
  the query string unless `location: 'hash'` says otherwise. A Foldkit router's
  `route.query(schema)` composes with it when they name different keys.

## See also

- [Mirrored state](https://github.com/doeixd/foldkit-plus/blob/main/docs/mirror.md) — the mental model, and when a
  mirror is the wrong tool.
- [The design note](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/MIRROR.md) — why a mirror is not
  an owner.
- [`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync) — for state that must converge instead; its mount's `url` option
  is where a URL mirror plugs in.
- [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) — a linkable filter and a remembered draft.
