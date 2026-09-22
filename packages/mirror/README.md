# `foldkit-mirror`

Keeps part of a Foldkit Model represented somewhere else — usually the URL or a
key-value store — **without making that representation the owner of the state**.

A filter can become `?filter=active`; a draft can survive a reload; a collapsed
sidebar can be remembered. In every case the Model remains authoritative and
`update` remains the only place application state changes.

The mental model is:

```text
Model slice
   |
   | encode when it changes
   v
URL / KeyValueStore

URL / KeyValueStore
   |
   | decode on navigation / cold load
   v
Model slice
```

A mirror is therefore a **secondary representation**, not a second store of
truth.

Use it for disposable, per-device state that is cheap to lose: filters, sort,
page, open panels, preferences, drafts, and similar local state. Do **not** use
it for state that several clients must converge on. A mirror is last-write-wins
with no durable log or ordering.

That is the boundary between the three nearby packages:

```text
Mirror
  Model owns the value
  URL / store represents it
  losing the representation is acceptable

Sync
  client-authored state must survive offline
  durable operations replay and converge

Remote
  server owns the fact
  client Model caches a disposable copy
```

## Which state belongs here?

| State | Owner | Representation |
| --- | --- | --- |
| Filter, sort, page, search text, open panel | local Model | URL via `Mirror.url` |
| Preference, draft, collapsed sidebar | local Model | `KeyValueStore` via `Mirror.kv` |
| Shared/offline edits that must converge | Sync/Durable | not Mirror |
| Server-derived facts | server / Remote | not Mirror |

A useful rule across Foldkit Plus remains **one owner per datum**. A mirror
observes a local field; it does not claim that field.

## Two lifecycles to remember

The URL and a key-value store represent the same ownership model, but they come
back into the application at different times.

### URL mirror

```text
Model changes filter
      |
      v
Filters.subscriptions
      |
      v
history.pushState / replaceState
      |
  user navigates
      v
UrlChanged
      |
      v
Filters.reduce(model, url)
      |
      v
Model
```

The URL participates in navigation, so the runtime hands navigation back to the
application and the mirror reduces the URL into its slice.

### Key-value mirror

```text
cold load
   |
   v
Prefs.restore Command
   |
   v
MirrorRestored Message
   |
   v
Prefs.reduce(model, message)
   |
   v
Model

later Model changes
   |
   v
Prefs.subscriptions
   |
   v
KeyValueStore
```

That is why the full integration has three seams:

```text
reduce         read an external representation back into Model
restore        ask a store for its cold-load value
subscriptions  write Model changes outward
```

A URL mirror does not need a restore Command because the initial URL is already
available to application startup. A store mirror does.

## Install

```bash
pnpm add foldkit-mirror
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the
package.

## Sixty seconds: put a filter in the URL

Start from a normal Surface application:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Url } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  UrlChanged: { url: Url },
})
type Message = typeof Message.Type

const initial: Model = {
  filter: 'all',
  page: 1,
}

const App = Surface.application({
  Model,
  Message,
  initial,
  update,
})
```

Declare which local fields the URL represents:

```ts
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [
    App.model.filter,
    App.model.page,
  ],
})
```

With the default values, the URL stays clean. If the Model becomes:

```ts
{
  filter: 'active',
  page: 2,
}
```

the mirror represents that as approximately:

```text
?filter=active&page=2
```

The field names, default values, and basic text codecs come from the application
fields; they are not declared again.

Navigation comes back through the application's normal URL Message:

```ts
function update(model: Model, message: Message) {
  switch (message._tag) {
    case 'UrlChanged':
      return {
        model: Filters.reduce(model, message.url),
      }
  }
}
```

And the mirror's Subscription writes Model changes outward:

```ts
import * as Subscription from 'foldkit/subscription'

const subscriptions = Subscription.make<Model, Message>()(() => ({
  ...Filters.subscriptions,
}))
```

At runtime, also reduce the initial URL before the first render and map later
navigation into `Message.UrlChanged`. The Subscription writes outward; it does
not replace those inbound steps. The assembly-based version below wires them
through `Filters.wiring('UrlChanged')` and `placements.url(...)`.

That is the entire URL loop:

```text
Model -> subscription -> URL
URL -> UrlChanged -> reduce -> Model
```

## Add remembered local state with `Mirror.kv`

For state that should survive reload but does not belong in the URL, use an
Effect `KeyValueStore`. This extends the earlier Model with `sidebar` and
`draft`, and its initial value with `'open'` and `''`, respectively. The snippets
in this section replace the earlier Message and update definitions:

```ts
const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
```

Rebuild `App` from that Model before selecting the added fields:

```ts
import { Projection } from 'foldkit-surface'

const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(
    App.model.sidebar,
    App.model.draft,
  ),
})
```

A key-value mirror restores through a Message, so include Mirror's cases in the
application union:

```ts
const Message = defineMessageUnion({
  ...Mirror.messages,
  UrlChanged: { url: Url },
})
```

Then reduce only its restore Message:

```ts
function update(model: Model, message: Message): Return {
  if (Mirror.reduces(message)) {
    return {
      model: Prefs.reduce(model, message),
    }
  }

  switch (message._tag) {
    case 'UrlChanged':
      return {
        model: Filters.reduce(model, message.url),
      }
  }
}
```

Ask the store for its representation at cold load:

```ts
const init = (url: Url): Return => ({
  // URL wins first because startup already has it.
  model: Filters.reduce(initial, url),

  // The store responds later with MirrorRestored.
  commands: [Prefs.restore],
})
```

And write both representations from the same Model:

```ts
const subscriptions = Subscription.make<
  Model,
  Message,
  KeyValueStore.KeyValueStore
>()(() => ({
  ...Filters.subscriptions,
  ...Prefs.subscriptions,
}))
```

The important part is what did **not** change: `sidebar` and `draft` are still
ordinary Model fields. The key-value store is merely how those fields are
remembered between sessions.

## One list per application with wiring

The hand-wiring above — reduce by tag, restore at startup, spread the
Subscriptions — is one value when the application uses `foldkit-bundle`:

```ts
import { Bundle } from 'foldkit-bundle'

const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())
const update = wiring.update(model => ({ model }))
const subscriptions = wiring.subscriptions()
const url = wiring.url(url => Message.UrlChanged({ url }))
```

`Filters.wiring('UrlChanged')` routes the application's URL Message into
`Filters.reduce` and reads the URL at startup; `Prefs.wiring()` routes its own
`MirrorRestored` into `Prefs.reduce` and runs `Prefs.restore` at startup. Two
key-value mirrors share the `MirrorRestored` tag, so each wiring routes only
its own mirror's Message and the assembly accepts both.

## Slice = field refs or a writable Projection

A mirror accepts either field refs directly:

```ts
fields: [
  App.model.filter,
  App.model.page,
]
```

or a writable Projection:

```ts
fields: Projection.pick(
  App.model.sidebar,
  App.model.draft,
)
```

That is the same structural vocabulary used elsewhere in Foldkit Plus. The
projection tells Mirror what it may observe and write back; it does not transfer
ownership away from the application.

## What the Model being the truth gives you

Because Mirror derives its representation from application fields, several
behaviors fall out automatically.

### Defaults

`App.initial` is the default source. A field equal to its initial value is omitted
from the representation by default:

```text
initial: { filter: 'all', page: 1 }
Model:   { filter: 'all', page: 1 }
URL:     /todos
```

Changing only the filter yields:

```text
/todos?filter=active
```

A key that should remain explicit can opt in:

```ts
keys: {
  page: { keep: true },
}
```

An application created without `initial` passes the initial Model in the mirror
config instead.

### Codecs

Mirror derives a key's text representation from the field's encoded type:

```text
string  -> text
number  -> parsed number
boolean -> true / false
other   -> JSON
```

Override a field when a friendlier representation is useful:

```ts
keys: {
  tags: {
    codec: TagsAsCommaSeparatedText,
  },
}
```

`mirror.decode(keys)` returns both the successfully decoded values and any
issues when a caller wants to surface invalid input.

### Batching and loop avoidance

Subscriptions depend on the encoded slice, not every Model transition. One
transition that changes several mirrored fields still produces at most one write,
and a change that encodes to the same key set produces none.

That also prevents URL feedback loops:

```text
popstate
  -> reduce URL into Model
  -> subscription sees same encoded keys
  -> no second navigation write
```

## How state changes here

Ordinary edits use Message/`update`/`evo` like anywhere else; the mirror
observes and represents. Restoration runs the other direction: the
declared writable projection installs the URL/KV value into the Model on
startup. The projection is declared up front, so restoration can only ever
write the fields the application already linked.

## URL history behavior

URL keys default to `history: 'push'`. A field such as free-form search text can
replace the current entry instead:

```ts
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [
    App.model.filter,
    App.model.page,
    App.model.q,
  ],
  keys: {
    q: { history: 'replace' },
  },
})
```

A key returning to its default is removed and uses replace semantics rather than
creating a new history step.

`Filters.href(model, { page: 2 })` applies the mirrored key changes to the
current URL without touching unrelated query keys, the path, or the hash.

By default the mirror uses the query string. `location: 'hash'` stores its keys
in the hash instead.

Outside a browser the URL store writes nothing, so server rendering is safe.

## Key-value restore semantics

A store restore is intentionally conservative. `Prefs.reduce(model, message)`
only restores fields that are **still at their initial value**.

That protects an edit made before the asynchronous restore finished:

```text
initial draft = ''
store draft   = 'remembered'

user types 'new text' before restore returns

MirrorRestored arrives
      |
      v
current draft is no longer initial
      |
      v
keep 'new text'
```

When URL and KV mirrors both represent one field, cold-load precedence is:

```text
URL value, when present
      >
key-value restore
      >
initial value
```

because startup reduces the URL first and the later store restore only fills
fields still at their defaults.

## Writing and persistence behavior

Writes are throttled so rapidly changing local state does not hammer the external
representation:

```text
URL mirror default: 50 ms
KV mirror default:  250 ms
```

A newer slice supersedes a pending write through Foldkit's dependency restart
behavior.

A key-value mirror stores one versioned JSON document under its configured key.
It may also be scoped to a user or tenant:

```ts
Mirror.kv(App, {
  key: 'todo/prefs',
  scope: principal.userId,
  fields: ...,
})
```

A document with another version/scope, or a malformed document, is discarded and
removed. This is safe because Mirror represents **disposable state**, not unsent
user operations.

Store failures are absorbed and logged rather than failing the application. A
slice back at all defaults removes the stored document.

## Contracts and `Module`

Every mirror exposes a `contract` of kind `mirror`.

Conceptually:

```text
field owner:   local application Model
mirror:        observer / representation
```

So `Module.manifest` still reports the field as local with the mirror beside it.
A mirror never becomes a second owner.

A key-value mirror declares `MirrorRestored` among its Messages. If the
application union forgot to spread `Mirror.messages`, `Module.validate` can
report that as an unknown Message dependency.

A URL key belongs to one URL mirror per application. Constructing another mirror
that claims the same key fails and names the original owner of that URL key.

## The generic store seam

`Mirror.url` and `Mirror.kv` are convenience constructors over the kernel:

```ts
Mirror.make(App, store, config)
```

A `MirrorStore` only needs:

```ts
interface MirrorStore<R = never> {
  readonly read: Effect.Effect<Encoded | undefined, never, R>
  readonly write: (
    write: {
      set: Encoded
      remove: ReadonlyArray<string>
      intent: 'push' | 'replace'
    },
  ) => Effect.Effect<void, never, R>
}
```

Built-ins:

```text
MirrorStore.url(...)     browser URL representation
MirrorStore.kv(...)      Effect KeyValueStore representation
MirrorStore.memory(...)  test/in-memory representation
```

`applyToHref(href, { set, remove })` is the pure URL transformation used by the
URL store.

Most applications should use `Mirror.url` / `Mirror.kv` rather than starting at
this kernel.

## Limits

- A mirror is last-write-wins. Two tabs writing one KV document do not converge;
  use `foldkit-sync` when ordering and convergence matter.
- Arrays and objects use JSON in the URL by default; provide a codec for a more
  readable representation.
- Two different mirror kinds may observe the same Model field. That is not two
  owners; cold-load precedence follows the URL -> KV -> initial rule above.
- A URL mirror only touches the keys it owns. It composes with a Foldkit
  router's `route.query(schema)` when they use different keys.
- Mirror stores have no durable operation log, conflict resolution, or
  multi-device synchronization.

## See also

- [Mirrored state](../../docs/mirror.md) — the conceptual guide and package
  choice rules.
- [Mirror design note](../../docs/design/MIRROR.md) — why mirroring is
  observation rather than ownership.
- [`foldkit-sync`](../sync) — state that must survive offline and converge.
- [`foldkit-remote`](../remote) — a cache of facts owned by the server.
- [`examples/todo-app`](../../examples/todo-app) — a linkable filter and a
  remembered draft in a real application.
