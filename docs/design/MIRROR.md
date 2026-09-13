# Mirror: a Model slice kept in the URL or a key-value store

A design note. Nothing here is implemented; the shape is proposed for a
prototype in the style of #69 (a compile-only fixture first, then the smallest
kernel that makes it real).

## The question

[nuqs](https://nuqs.dev) makes URL search params typed state for React: one
bidirectional parser per key, a default the URL elides, batched writes into one
history entry, `push` or `replace` per key, and a server-side parse of the same
keys. Is there a Foldkit Plus version of this, and does the same idea cover
Effect's `KeyValueStore`?

Yes to both, with one change of frame. nuqs makes the URL a second store a hook
reads. In a Foldkit application the Model is the only truth, so the URL (and a
key-value store) is not a store the application reads; it is a **mirror** of a
Model slice: written whenever the slice changes, read back into the slice on
navigation or cold load. The primitive that names a slice already exists:
`Projection.pick(App.fields.filter, App.fields.page)` is a Struct schema with
`get` and `set`, which is exactly what nuqs calls a parser bundle.

## What lands where

A datum has one owner; a mirror is not an owner. It sits beside the existing
answers to "where does this state live":

| State                                                | Owner                          | Mirror                    |
| ---------------------------------------------------- | ------------------------------ | ------------------------- |
| Route, selected item, transient errors               | the local Model, plain `update`| —                         |
| Filter, sort, page, search text, open panel          | the local Model                | the URL (`Mirror.url`)    |
| Preferences, a draft, a collapsed sidebar            | the local Model                | `KeyValueStore` (`Mirror.kv`) |
| Server-derived, disposable cache                     | `foldkit-remote`               | —                         |
| Client-owned replicated state, offline writes        | `foldkit-sync`                 | —                         |

A mirror is last-write-wins to a dumb keyed string store with no ordering and
no log. That is what separates it from Sync (an ordered durable log that
converges) and from Remote (a normalized cache of another owner's facts), and
it is why it must not reuse either's machinery.

## Its own package

`foldkit-mirror`, depending on `effect`, `foldkit` (`navigation`, `url`,
`subscription`), and `foldkit-surface` (`WritableProjection`, `Contract`,
`ModelRef`). Not part of:

- **`foldkit-surface`**, which is the pure observation boundary and performs
  no effects. A mirror writes to `history` and to a store.
- **`foldkit-sync`**, whose whole value is ordering and convergence. A mirror
  with a log would be Sync with a worse transport.
- **`foldkit-remote`**, whose cache is another owner's facts. `RemotePersistence`
  is the one overlap (a snapshot in `KeyValueStore`); it stays, because it
  persists the Remote store's own shape, not a Model slice.

The package is small: a store interface, two stores (URL, key-value), a codec
derivation, a reducer, one Subscription entry, and a link builder. It earns a
package because it is a third answer in the ownership table and because
`Module` should show it.

## The API

```ts
import { Mirror } from 'foldkit-mirror'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url }, … })
const App = Surface.application({ Model, Message, initial, update })

// The URL shows the filters. Keys default to the field names.
const Filters = Mirror.url(App, {
  fields: Projection.pick(App.fields.filter, App.fields.page, App.fields.q),
  keys: { q: { history: 'replace' } }, // the rest push
})

// A key-value store keeps preferences and the draft across sessions.
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.fields.sidebar, App.fields.draft),
  scope: userId,
})
```

What the two values carry:

```ts
Filters.reduce(model, url)        // URL → Model: the keys it owns, decoded; missing or malformed → initial's value
Filters.encode(model)             // Model → the keys it owns, defaults elided: { page: '2', q: 'apollo' }
Filters.href(model, { page: 3 })  // a link with the mirrored keys applied to the current URL (nuqs' createSerializer)
Filters.subscriptions             // one entry: writes the URL when the encoded keys change (push if any changed key pushes)
Filters.contract                  // kind 'mirror', observes the fields, owns nothing

Prefs.restore                     // a Command: reads the store and yields Mirror's MirrorRestored Message
Prefs.reduce(model, message)      // applies a restore (Mirror.reduces narrows the union to Mirror's cases)
Prefs.subscriptions               // one entry: writes the store when the encoded slice changes (debounced)
```

Wiring, in the application:

```ts
const App = Surface.application({
  Model, Message,
  init: url => ({ model: Filters.reduce(initial, url), commands: [Prefs.restore] }),
  update: (model, message) =>
    Mirror.reduces(message) ? { model: Prefs.reduce(model, message) }
    : message._tag === 'UrlChanged' ? { model: Filters.reduce(model, message.url) }
    : …,
})

const subscriptions = Subscription.make<Model, Message>()(() => ({
  ...Filters.subscriptions,
  ...Prefs.subscriptions,
  ...Data.subscriptions({ … }),
}))
```

`update` stays the only reducer. Neither mirror adds a Message the application
must invent: the URL comes in through the runtime's `onUrlChange` the
application already has for routing, and the store comes in through one
`MirrorRestored` case spread from `Mirror.messages`, as `Remote.messages` is.

## What falls out of the Model being the truth

Three things nuqs bolts on come for free.

- **Defaults.** nuqs needs `.withDefault(x)` per key so it can elide the default
  from the URL. `App.initial` already holds every field's default, so "equal to
  the initial value, omit the key" needs no second declaration. A key that
  should always be written opts in (`keys: { page: { keep: true } }`).
- **Batching.** Model → URL is a Subscription entry whose dependencies are the
  encoded keys. One Model change yields at most one history write, whatever it
  touched, and a change that encodes to the same keys writes nothing. Back and
  forward cannot loop: `popstate` reduces into the Model, the entry sees the
  same keys, and stops.
- **Codecs.** Effect Schema is a better parser library than nuqs carries. The
  per-key codec is derived from the field's schema when it can be: a string or
  a literal union is itself; a number is `NumberFromString`; a boolean is
  `"true"`/`"false"`; anything else is a JSON string. `keys: { tags: { codec } }`
  overrides one when the URL should read nicely (`?tags=a,b`).

## Model → store: the entry

```text
modelToDependencies   model ↦ encode(model)              a Record<string, string>, defaults elided
dependenciesToStream  keys  ↦ Stream.fromEffect(write(keys)).pipe(Stream.drain)   emits no Message
```

Foldkit restarts an entry's stream when its dependencies change (`switchMap`),
so `write` runs at most once per distinct set of keys, and a write still
pending when the keys change again is dropped in favour of the newer one. The
URL store reads the current location inside `write`, replaces only the keys it
owns, and leaves the path, the hash, and every other key alone, so a router or
another mirror on the same page is untouched.

Two constraints the entry must respect, both learned from nuqs:

- **Push or replace is intent, not data.** Search text should replace; a page
  or filter change should push; one Model change can touch both. Per key,
  `history: 'push' | 'replace'` (default `push`), and a write pushes if any
  changed key pushes. `shallow` has no meaning here: there is no framework
  router to bypass, and a routed application reduces `UrlChanged` as it wishes.
- **Browsers rate-limit history writes.** Safari refuses more than about a
  hundred `pushState`/`replaceState` calls in thirty seconds. The entry delays
  a write by `throttle` (default 50 ms) before performing it; with `switchMap`
  that is a trailing debounce, and the last keys win. The key-value store uses
  the same knob with a longer default (250 ms), since a draft is typed into.

## Store → Model: the reducer

```text
reduce(model, url)  = fields.set(model, { ...fields.get(initial), ...decoded(url) })
```

Only the mirror's keys are read. A missing key is the initial value (that is
what eliding defaults means). A key that fails to decode is the initial value
too, so `?page=abc` shows page one rather than breaking the page, as nuqs
does; `Filters.decode(url)` returns the value and the issues for a caller that
wants to say so. A cold load is `init: url => Filters.reduce(initial, url)`;
SSR is the same call on the server, which is nuqs' `createSearchParamsCache`
with no separate API.

For the key-value store, `read` is asynchronous, so restoring is a Command
(`Prefs.restore`) whose Message `Prefs.reduce` applies. The snapshot names the
mirror's `key`, a `scope` (a user), and a version; one that is another scope,
another version, or malformed is discarded (and its key removed), the same
disposable-cache policy `RemotePersistence` has, because a mirror holds no
unsent user edits. A restore that arrives after the user has already changed a
mirrored field keeps the user's change: `MirrorRestored` carries the fields it
read, and `reduce` applies only those the Model still holds at their initial
value.

## Integration

- **Surface.** Nothing changes for a Surface: it reads Model fields. One
  synergy is new: `Surface.at(ProjectPage, model => model.projectId ? { projectId: model.projectId } : undefined)`
  over a URL-mirrored `projectId` makes the page deep-linkable and drives
  `Data.subscriptions` from the URL without a Route union.
- **Module.** A mirror registers a `Contract` of kind `mirror` that `observes`
  its fields and owns nothing, so `Module.manifest` shows a field as `local`
  with a mirror beside it, and `Module.validate` gains one rule: two URL
  mirrors of one application claiming the same key
  (`url-key-claimed-twice`). Two mirrors of one field (URL and key-value) are
  allowed and ordered: the URL wins on cold load when it names the key, else
  the store, else the initial value.
- **Remote.** A page cursor is a natural URL key: `?after=<cursor>` mirrored
  into `model.after` and read by `Data.query(…, { after: model.after })` makes
  a paginated list linkable. Remote itself needs no change; `RemotePersistence`
  stays as is.
- **Sync.** A field may be replicated by Sync and mirrored to the URL at once
  (a shared filter that is also linkable). Sync owns it; the mirror observes;
  `Module` reports no conflict. A mirror never becomes a Sync transport.
- **Agent.** An agent action that sets `filter` goes through `update`; the URL
  follows through the same entry. No adapter work.
- **Router.** Foldkit's `route.query(schema)` biparser can still parse keys
  into the Route union. The two compose when they name different keys, and
  `Module` says so when they do not (a route contract is the natural place to
  declare the keys it reads; that is a follow-up).

## The store interface

```ts
interface MirrorStore {
  readonly read: Effect.Effect<Option.Option<Readonly<Record<string, string>>>>
  readonly write: (keys: Readonly<Record<string, string>>, intent: 'push' | 'replace') => Effect.Effect<void>
}
```

The URL store maps keys to search params and `intent` to
`Navigation.pushUrl`/`replaceUrl`; the key-value store maps the record to one
JSON document under `key` and ignores `intent`; an in-memory store is what the
tests use, so none of them needs a DOM. A `changes` stream (another tab's
`storage` event) is the one addition a later version needs for cross-tab
mirrors; it emits `MirrorRestored` through the same reducer.

## Hovers

`Filters` should hover as `Mirror<AppModel, { readonly filter: …; readonly page: number; readonly q: string }>`,
the fields and nothing else; the keys, codecs, and intents are values, not
type parameters. `Filters.href` takes `Partial<Fields>`, so a link that sets a
key the mirror does not own is a compile error at the key.

## Open decisions

- **Arrays and records.** JSON by default (`?tags=%5B%22a%22%5D` is ugly);
  a comma codec as the documented override. nuqs made the same call.
- **The hash.** Some applications keep view state in `#`. A `location: 'search' | 'hash'`
  option on `Mirror.url` is cheap; the default is the search string.
- **Nested fields.** `App.fields.view.sort` is a `FieldRef` and picks fine;
  the default key is the last segment, so two nested fields with the same leaf
  name need explicit keys, which the construction-time check reports.
- **Restore precedence.** URL, then store, then initial, as above; the
  alternative (store wins) breaks shared links, so it is not on the table.

## Plan

1. A compile-only fixture (`packages/mirror/test/dx.test-d.ts`) writing the
   todo-app's `filter` and `q` to the URL and `sidebar` and `draft` to a
   key-value store, checked for hovers and error placement as in #69.
2. The kernel: `encode`/`decode`/`reduce`/`href`, the codec derivation, the
   store interface with the in-memory store, the entry, the contract, the
   `Module` rule. Every guard mutation-verified.
3. The URL and key-value stores, on `foldkit/navigation` and
   `effect/unstable/persistence`.
4. The todo-app example mirrors its filter to the URL and its draft to a
   store; its transcript pins both.
5. A README that leads with the four lines an application writes, and the
   guide's ownership table gains the mirror column.
