# `foldkit-mirror`

You want a todo filter, page number, open panel, or unsaved draft in your [Foldkit](https://foldkit.dev/) app to survive a reload or live in a shareable URL like `?filter=active&page=2`. Putting that state directly in `location.search` or `localStorage` as a second store forces components to read two places and risks async storage overwriting newer keystrokes; keeping it only in memory loses it when the page refreshes.

`foldkit-mirror` keeps selected fields of your Foldkit `Model` mirrored in the URL, a `KeyValueStore`, or a browser cookie while your `Model` stays the single source of truth. Your `update` writes to the `Model` as usual, a Subscription writes changes out when the encoded slice changes, and startup or navigation reads them back in.

See a filter mirrored in the URL in the [live todo demo](https://foldkit-todo-demo.pages.dev/), or read [Mirrored state](../../docs/mirror.md) for the full guide.

## Choose between Mirror, Sync, and Remote

A mirror is a secondary representation for disposable, per-device state such as filters, sort order, page numbers, open panels, preferences, and drafts. It is last-write-wins with no durable log; use [`foldkit-sync`](../sync/README.md) when edits from multiple devices must survive offline and converge, and [`foldkit-remote`](../remote/README.md) when the server owns the data.

| State | Owner | Representation |
| --- | --- | --- |
| Filter, sort, page, search text, open panel | local `Model` | URL via `Mirror.url` |
| Preference, draft, collapsed sidebar | local `Model` | `KeyValueStore` via `Mirror.kv` |
| Cart or preference rendered by the server | local `Model` | cookie via `Mirror.cookie` |
| Shared/offline edits that must converge | `foldkit-sync` / Durable | Sync journal |
| Server-derived facts | server / `foldkit-remote` | Remote cache |

Every field keeps one owner: a mirror observes a local field and writes restored values into that field without claiming ownership away from your `update`.

## How URL and store mirrors update the Model

URL and key-value mirrors share the same ownership rule, but read back into the `Model` at different times:

- **URL mirror:** When your `Model` changes the filter, `Filters.subscriptions` updates the URL via `history.pushState` or `replaceState`. On navigation, the runtime sends `UrlChanged`, and `Filters.urlChanged(model, url)` reduces the URL back into the `Model`. The initial URL is already available at startup.
- **Key-value mirror:** On a cold load, the `Prefs.restore` Command reads the `KeyValueStore` and sends `MirrorRestored`, which `Prefs.reduce(model, message)` applies to fields still at their initial values. Each later `Model` change writes outward through `Prefs.subscriptions`.

Every mirror integrates through three seams: `reduce` reads an external representation back into the `Model`, `restore` requests a store's cold-load value, and `subscriptions` writes `Model` changes outward.

## Install

```bash
pnpm add foldkit-mirror
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the package.

## A first URL mirror: keep a filter in the URL

This mirrors `filter` and `page` into the query string, omitting fields still at their defaults and reading a URL back into the `Model`:

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
const Message = defineMessageUnion({ UrlChanged: { url: Url } })
const initial: typeof Model.Type = { filter: 'all', page: 1 }

const App = Surface.application({
  Model,
  Message,
  initial,
  update: (model: typeof Model.Type) => ({ model }),
})
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.model.filter, App.model.page],
})

const activeUrl = Filters.href(initial, { filter: 'active', page: 2 }, '/todos')
// '/todos?filter=active&page=2'

const restored = Filters.reduce(initial, '/todos?filter=done&page=3')
// { filter: 'done', page: 3 }
```

What happened:

- `Mirror.url` derives parameter names, default values (`'all'` and `1`), and text codecs directly from `App.model.filter` and `App.model.page`.
- `Filters.href` produces `'/todos?filter=active&page=2'`; when fields return to their defaults (`{ filter: 'all', page: 1 }`), `Filters.href` omits them and produces `'/todos'`.
- `Filters.reduce` decodes `'/todos?filter=done&page=3'` back into `{ filter: 'done', page: 3 }`.

When a mirror writes to the browser URL, Foldkit emits a `UrlChanged` echo for that write; `Filters.urlChanged` tracks every in-flight write and returns the `Model` unchanged so echoes never overwrite newer keystrokes or trigger a second render.

## Plug the URL into `makeApplication` with `Mirror.routing`

`Mirror.routing` wraps your `init`, `update`, and `routing` callbacks so the mirrors read the starting URL on boot and every `UrlChanged` on navigation, then returns the config to spread into `Runtime.makeApplication`:

```ts
import { Runtime } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { UrlRequest } from 'foldkit/navigation'
import * as Subscription from 'foldkit/subscription'

type Model = typeof Model.Type
const RoutedMessage = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  UrlChanged: { url: Url },
})
type RoutedMessage = typeof RoutedMessage.Type

const routed = Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'UrlChanged',
  init: (_url: Url) => ({ model: initial }),
  update: (model: Model, _message: RoutedMessage) => ({ model }),
  routing: {
    onUrlRequest: request => RoutedMessage.ClickedLink({ request }),
    onUrlChange: url => RoutedMessage.UrlChanged({ url }),
  },
})

const view = (model: Model, h: HtmlBuilder<RoutedMessage>) => ({
  title: 'Todos',
  body: h.p([], [model.filter]),
})
const subscriptions = Subscription.make<Model, RoutedMessage>()(() => ({
  ...Filters.subscriptions,
}))

Runtime.makeApplication({ Model, ...routed, view, subscriptions, container: document.body })
```

What each piece does:

- `init` runs your `init` first and reduces the starting URL into the `Model` it returns. If your startup Commands depend on the mirrored slice, call `Filters.reduce(initial, url)` before building those Commands.
- `update` reduces any `UrlChanged` message through `Filters.urlChanged` before passing the message to your `update`, so your router sees the updated slice.
- `routing` keeps your own `onUrlRequest` and `onUrlChange` handlers as written.
- `Filters.subscriptions` writes subsequent `Model` changes out to the browser URL.

`urlChanged` names the tag returned by `onUrlChange`, and that variant must carry a `url` field. `examples/foldkit/query-sync` shows this full application running.

## Add remembered local state with `Mirror.kv`

For state that should survive reload outside the URL, use an Effect `KeyValueStore`. A key-value mirror restores through a `Message`, so give it a variant in your `Message` union:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Url } from 'foldkit/url'
import { Mirror } from 'foldkit-mirror'
-->

```ts
const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  GotPrefsMessage: { message: Mirror.Message },
  UrlChanged: { url: Url },
})
type Message = typeof Message.Type
```

Build `App` from that `Model` and `Message`, declare `Filters` and `Prefs`, and fold the key-value mirror under `GotPrefsMessage`:

```ts
import type { KeyValueStore } from 'effect/persistence'
import type * as Update from 'foldkit/update'
import { Projection, Surface } from 'foldkit-surface'

type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>

const initial: Model = { filter: 'all', page: 1, sidebar: 'open', draft: '' }
const App = Surface.application({ Model, Message, initial, update })

const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.model.filter, App.model.page],
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
})

const foldPrefs = Mirror.fold(Prefs, message => Message.GotPrefsMessage({ message }))
```

Match the union in `update` and start `foldPrefs.init` on boot:

```ts
function update(model: Model, message: Message): Return {
  return Message.match(message, {
    GotPrefsMessage: ({ message }) => foldPrefs(model, message),
    UrlChanged: ({ url }) => ({ model: Filters.urlChanged(model, url) }),
  })
}

const init = (url: Url): Return =>
  // URL wins first because startup already has it; the store answers later.
  foldPrefs.init(Filters.reduce(initial, url))
```

`foldPrefs.init` attaches the `Prefs.restore` Command lifted to yield `GotPrefsMessage`, so Story and Scene tests can resolve `Prefs.restore` directly.

Alternatively, spread `Mirror.messages` into your union and narrow with `Mirror.reduces(message)`:

<!-- docs-check standalone
import { Schema } from 'effect'
import type { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
type Model = typeof Model.Type
const initial: Model = { filter: 'all', page: 1, sidebar: 'open', draft: '' }
type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>
-->

```ts
import { Match } from 'effect'

const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url } })
type Message = typeof Message.Type

function update(model: Model, message: Message): Return {
  if (Mirror.reduces(message)) return { model: Prefs.reduce(model, message) }
  return Match.value(message).pipe(
    Match.tag('UrlChanged', ({ url }) => ({ model: Filters.urlChanged(model, url) })),
    Match.orElse(() => ({ model })),
  )
}

const init = (url: Url): Return => ({
  model: Filters.reduce(initial, url),
  commands: [Prefs.restore],
})
```

<!-- docs-check
const App = Surface.application({ Model, Message, initial, update })
const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter, App.model.page] })
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
})
-->

Then spread both mirrors into `subscriptions` so changes write out from the same `Model`:

```ts
import type { KeyValueStore } from 'effect/persistence'
import * as Subscription from 'foldkit/subscription'

const subscriptions = Subscription.make<
  Model,
  Message,
  KeyValueStore.KeyValueStore
>()(() => ({
  ...Filters.subscriptions,
  ...Prefs.subscriptions,
}))
```

`sidebar` and `draft` stay ordinary `Model` fields; the key-value store only persists them between sessions.

## Keep what a server renders in a cookie with `Mirror.cookie`

A `KeyValueStore` lives only in the browser, so a server rendering HTML cannot read it and a page without JavaScript has no store at all. A cookie travels with every HTTP request: the server reads it for the first render, a form posted without JavaScript sets it in the response, and the scripted browser updates it as the `Model` changes:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

const Model = Schema.Struct({
  cart: Schema.Array(Schema.String),
  theme: Schema.Literals(['light', 'dark']),
})
type Model = typeof Model.Type
const initial: Model = { cart: [], theme: 'light' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({}),
  initial,
  update: (model: Model) => ({ model }),
})
-->

```ts
const Cart = Mirror.cookie(App, {
  name: 'cart',
  fields: [App.model.cart],
})
```

The cookie is named `cart` and stores its keys form-encoded (`cart=cart=%5B%22acme.dev%22%5D`) so field values cannot break the header syntax. On the server, read it on incoming requests and write `Set-Cookie` on responses:

<!-- docs-check
import { Option } from 'effect'
declare const request: Request
declare const reached: Model
-->

```ts
// On the server, before the first render: the request's cookie into the Model.
const opened = Mirror.bootstrap(initial, Cart.bootstrap(Cart.keysOf(request.headers.get('cookie'))))

// In a server's answer that changed the slice: `reached` is the Model a form
// posted without scripts reached through `update`.
const setCookie: Option.Option<string> = Cart.setCookie(reached, request)
```

In the browser, `Cart.wiring()` (or `Cart.subscriptions`) writes `document.cookie` whenever the encoded slice changes, with zero delay by default. A client-only app without a server render reads it on startup via `Cart.bootstrap(Cart.keysOf(document.cookie))`.

What each call does:

- `keysOf(header)` extracts the mirror's cookie and keys from a `Cookie` header without decoding values; cookies larger than `maxBytes` (4096 by default) read as empty.
- `bootstrap(keys)` decodes each key through its Schema; invalid keys leave their fields at the initial value and are reported in `Cart.decode(keys).issues`.
- `setCookie(model, request)` returns `Option.some` with the `Set-Cookie` header string (or a clearing header when at defaults), or `Option.none()` when the encoded slice exceeds `maxBytes`. In the browser, writes past `maxBytes` are skipped and reported as `CookieTooLarge`.

Because visitors can edit cookies in their browser, decoding validates shape rather than trust: re-price cart items or re-verify permissions on the server, or mirror only identifiers (`keys: { cart: { codec } }`). Browser-written cookies are readable by client scripts rather than `HttpOnly`, so store only non-secret data there.

Attributes default to `Path=/`, `SameSite=Lax`, `Max-Age` of 365 days, and `Secure` when the page or request uses HTTPS. Behind a TLS-terminating proxy (nginx, Fly, Render) where your server receives plain HTTP, set `secure: true` explicitly in production:

```ts
const Theme = Mirror.cookie(App, {
  name: 'theme',
  fields: [App.model.theme],
  attributes: { sameSite: 'Strict', maxAge: '30 days', secure: true },
})
```

## Restore before the first render with bootstrap

Normally, `Prefs.restore` reads a store asynchronously and dispatches `MirrorRestored` after the initial render. When stored keys are already available at boot—embedded as server `Flags`, read synchronously, or passed in a test—apply them before the first render with `Mirror.bootstrap`:

<!-- docs-check standalone
import { Schema } from 'effect'
import type { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  sidebar: Schema.Literals(['open', 'closed']),
  draft: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url } })
type Message = typeof Message.Type
type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>
const initial: Model = { filter: 'all', page: 1, sidebar: 'open', draft: '' }
const App = Surface.application({
  Model,
  Message,
  initial,
  update: (model: Model, _message: Message): Return => ({ model }),
})
const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter, App.model.page] })
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
})
-->

```ts
import type { Encoded } from 'foldkit-mirror'

const init = (flags: { prefs: Encoded }, url: Url): Return => ({
  model: Mirror.bootstrap(
    initial,
    Prefs.bootstrap(flags.prefs),
    model => Filters.reduce(model, url),
  ),
})
```

What each piece does:

- `Prefs.bootstrap(keys)` applies pre-read keys (`Encoded`, `Record<string, string>`) purely to fields still at their initial values, running before the first render with no Command.
- `model => Filters.reduce(model, url)` applies the starting URL over that result.
- `Mirror.bootstrap(model, ...steps)` runs the steps in order so precedence stays URL > store > initial, returning the `Model` unchanged when nothing differs.

A bootstrapped value also wins over a later `restore` for any field it set, so bootstrapping from Flags alongside running `restore` stays safe. `Wiring.init` runs startup Commands after the `Model` exists, whereas `bootstrap` populates the initial `Model` itself.

## One list per application with wiring

With `foldkit-bundle`, `wiring()` combines routing, startup restore, Subscriptions, and `Module` contracts in one assembly:

```ts
import { Bundle } from 'foldkit-bundle'

const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())
const update = wiring.update(model => ({ model }))
const subscriptions = wiring.subscriptions()
const url = wiring.url(url => Message.UrlChanged({ url }))
```

`Filters.wiring('UrlChanged')` routes `UrlChanged` into `Filters.urlChanged` and reduces the starting URL; `Prefs.wiring()` routes `MirrorRestored` into `Prefs.reduce` and schedules `Prefs.restore` at startup. Multiple mirrors share both tags cleanly, and your own `update` runs after URL mirrors have updated their slices.

## Slice = field refs or a writable Projection

A mirror accepts either an array of `App.model` field references or a `Projection.pick` slice:

```ts sketch
fields: [App.model.filter, App.model.page]
// or:
fields: Projection.pick(App.model.sidebar, App.model.draft)
```

The projection tells Mirror which fields it observes and restores without transferring ownership away from your application.

## Defaults, codecs, and batching

Because Mirror derives its behavior from your application Schemas, three behaviors work out of the box:

### Defaults

`App.initial` provides the default values (pass `initial` in the mirror config if `App` has none). Any field equal to its initial value is omitted from the URL or store—so `{ filter: 'all', page: 1 }` yields `/todos`, and changing `filter` yields `/todos?filter=active`. Opt a field in to stay visible with `keys: { page: { keep: true } }`.

### Codecs

Mirror chooses a compact text representation from each field's encoded type: strings stay plain text, numbers parse numerically, booleans serialize as `true` or `false`, and arrays or objects serialize as JSON. Override any key with a custom codec via `keys: { tags: { codec: TagsAsCommaSeparatedText } }`. Calling `mirror.decode(keys)` returns both valid decoded values and any `issues` for invalid inputs.

### Batching and loop avoidance

Subscriptions track the encoded slice rather than every `Model` update, so changing multiple mirrored fields in one transition triggers one write, and transitions that keep the same encoded output skip writing altogether. When `popstate` reduces a URL back into the `Model`, the encoded slice already matches the URL, preventing feedback loops.

## How state changes here

Normal edits use `Message`, `update`, and `modifyFields` like the rest of your app; the mirror watches and persists them. Restoration runs in reverse only through the writable projection declared up front, so only those linked fields can ever be written.

## URL history behavior

URL keys default to `history: 'push'`. Set `history: 'replace'` on fast-changing keys such as search text so typing replaces the current history entry instead of flooding the Back button:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Url } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
})
type Model = typeof Model.Type
const initial: Model = { filter: 'all', page: 1, q: '' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ UrlChanged: { url: Url } }),
  initial,
  update: (model: Model) => ({ model }),
})
-->

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

When a key returns to its default value, it is removed from the URL using `replace`. Call `Filters.href(model, { page: 2 })` to build a link with updated keys while keeping unrelated query parameters, the path, and the hash intact. Set `location: 'hash'` to store keys in the hash instead of the query string. Outside a browser, the URL store skips writes so server rendering stays safe.

## Key-value restore semantics

`Prefs.reduce(model, message)` writes a stored value back only for fields **still at their initial value**. If a user types `'new text'` into `draft` before the asynchronous `MirrorRestored` arrives, `reduce` preserves `'new text'` instead of overwriting it with the older stored draft.

Because `Prefs.subscriptions` starts immediately on cold load, a key-value mirror holds outgoing writes until the `Model` matches the latest `restore` answer (or matches the store itself when no `restore` ran). Empty stores release writes immediately, failed reads resolve as empty, and each runtime holds its own gate independently.

When both a URL mirror and a key-value mirror observe the same field, startup precedence is URL value (when present), then key-value restore, then the initial value.

## Writing and persistence behavior

Writes are throttled by default to **50 ms** for URL mirrors, **250 ms** for key-value mirrors, and **0 ms** for cookie mirrors. Rapid changes within that window coalesce into a single write via Foldkit's subscription restart behavior.

A key-value mirror stores one versioned JSON document under `key`, optionally isolated per user or tenant with `scope`:

```ts sketch
Mirror.kv(App, {
  key: 'todo/prefs',
  scope: principal.userId,
  fields: Projection.pick(App.model.sidebar, App.model.draft),
})
```

Documents with another version or scope, or malformed JSON, are discarded and removed so stale preferences never crash the app. If you need to keep data from an older format, write an explicit importer or store under a new key instead of relying on decode failure. Store errors are absorbed, and returning every field to its default removes the stored document.

### Diagnostics

Any store failure or oversized cookie is reported as a typed diagnostic through `Diagnostics.Reporter` (`foldkit-surface`), defaulting to Effect's logger:

| `_tag` | `level` | When |
| --- | --- | --- |
| `StoreUnread` | `warning` | The store failed a read: the mirror restored nothing. |
| `StoreUnwritten` | `warning` | The store failed a write, or the removal of a discarded document. |
| `StoreMalformed` | `warning` | Key held invalid JSON or shape; wrong version/scope discards silently. |
| `CookieTooLarge` | `warning` | Slice encoded past `maxBytes`, so browser write skipped; carries `name`, `bytes`, `maxBytes`. |

Each key-value diagnostic carries `key` and either `error` or `reason`. Redirect diagnostics in runtime resources via `Layer.succeed(Diagnostics.Reporter, report)`, or capture them in tests with `Diagnostics.collect().report`. Invalid URL query values are left for `mirror.decode(keys).issues` rather than reported as diagnostics.

## Contracts and `Module`

Every mirror exposes a `contract` of kind `'mirror'`. Because the local application `Model` owns the field and the mirror only observes it, `Module.manifest` keeps the field listed as local with the mirror attached beside it.

A key-value mirror declares `MirrorRestored` in its contract, allowing `Module.validate` to catch a forgotten `...Mirror.messages` spread. Each URL key may belong to only one URL mirror per application; declaring a duplicate key throws and names the conflicting mirror.

## The generic store seam

`Mirror.url` and `Mirror.kv` are built on `Mirror.make(App, store, config)`, where a `MirrorStore` provides `read` and `write`:

```ts
import type { Effect } from 'effect'
import type { Encoded } from 'foldkit-mirror'

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

Built-in stores include `MirrorStore.url(...)` (browser URL), `MirrorStore.kv(...)` (Effect `KeyValueStore`), and `MirrorStore.memory(...)` (in-memory for tests), alongside `applyToHref(href, { set, remove })` for pure URL updates. Custom stores hold writes until `restore` settles, just like `Mirror.kv`. Most applications should start with `Mirror.url`, `Mirror.kv`, or `Mirror.cookie`.

## Limits

- Last-write-wins per store; two tabs writing one KV document overwrite rather than merge. Use `foldkit-sync` when convergence matters.
- Arrays and objects serialize as JSON in URLs by default; supply a custom `codec` for friendlier strings.
- Multiple mirror kinds (such as URL and cookie) may observe the same field; cold-load precedence follows URL, then KV, then initial.
- URL mirrors touch only their declared keys, composing cleanly with Foldkit's `route.query(schema)` on separate keys.
- Cookies are sent with every request to their path and capped near 4 KB by browsers; keep cookies to small identifiers or preferences.

## Next

- Read the conceptual guide and package-choice rules: [Mirrored state](../../docs/mirror.md).
- Persist offline edits with server convergence: [`foldkit-sync`](../sync/README.md).
- Fetch and cache server-owned records: [`foldkit-remote`](../remote/README.md).
- Inspect a live app using a linkable filter and remembered draft: [`examples/todo-app`](../../examples/todo-app).
