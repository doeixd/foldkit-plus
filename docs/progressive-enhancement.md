# Pages that work without JavaScript

A Foldkit Plus page can work with client scripts disabled and upgrade seamlessly
once they boot, using one `Model`, one `update`, and one view. The server
renders the full HTML; the URL holds search and filter state; and forms post
their `Message` to the page URL, where the server runs the same `update` the
browser runs. Scripts make interactions faster rather than making the page work.

These practices come from porting
[`examples/foldkit/domains-plus`](../examples/foldkit/domains-plus/README.md)
— a domain search with filters, a virtualized list, and a cart — to run with
JavaScript off.

## A first form that works both ways

This creates a cart form with `Resume.builder(h)`, lists `Message.Added` on an
active `Surface`, and configures `SSR.plan` with `fallback: 'server'` so the
server handles `POST` requests when JavaScript has not booted:

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Resume, SSR } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'

const Model = Schema.Struct({ cart: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Added: { name: Schema.String.check(Schema.isMaxLength(128)) } })
const App = Surface.application({ Model, Message, initial: { cart: [] }, update: m => ({ model: m }) })
const CartControls = App.surface('CartControls', {
  model: ({ model }) => ({ cart: model.cart }),
  messages: [Message.Added],
})
const plan = SSR.plan(App, {
  id: 'cart',
  state: Projection.pick(App.model.cart),
  surfaces: [Surface.at(CartControls, undefined)],
  fallback: 'server',
})
const view = (model: typeof Model.Type, h: HtmlBuilder<typeof Message.Type>) => {
  const rh = Resume.builder(h)
  return {
    title: 'Cart',
    body: rh.form([rh.OnSubmit(Message.Added({ name: 'acme.com' }))], [
      rh.p([], [`${model.cart.length} in the cart`]),
      rh.button([rh.Type('submit')], ['Add acme.com']),
    ]),
  }
}
export const { renderPage } = SSR.entry(
  { Model, init: () => ({ model: { cart: [] } }), update: m => ({ model: m }), view, container: null },
  plan,
  { buildId: 'build-1', origins: ['https://shop.example'] },
)
```

`renderPage` emits `<form method="post">` containing a hidden
`foldkit-plus-message` field encoding `Added({ name: 'acme.com' })`.

- **With scripts off:** Clicking **Add acme.com** submits a standard `POST` to
  the page. `SSR.entry` checks `Origin` against `origins` (returning `403` on
  mismatch before reading the body), decodes and validates the `Message`
  against `Message` Schema and active `Surface`s (`400` if invalid), rebuilds
  the initial `Model`, runs `update`, and renders the updated page.
- **With scripts on:** `SSR.hydrate` strips `method="post"` and the hidden
  field during boot so the first client render matches the served DOM, then
  handles `OnSubmit` in the browser without a network `POST`.

Because the server starts each `POST` from `init`, validate the `Message`
payload (such as keeping `name` under 128 characters and verifying item prices
in `update`) and persist multi-request state in a cookie or database.

## How GET, POST, and hydration share one owner map

| Part of the page | Owner | Behavior without scripts |
| --- | --- | --- |
| HTML document | `foldkit-ssr` (`SSR.render`) | Full page rendered from `init` |
| Server data | `foldkit-remote` (`Data.satisfy`, `Remote.resume`) | Data already embedded in HTML |
| Search, filters, sort, page | `foldkit-mirror` (`Mirror.url`) | GET forms and links update the URL |
| Virtualized list window | `foldkit-mixins-ui` (`WindowList`) | One visible window paged by links |
| Mutations (such as add to cart) | `update` via `fallback: 'server'` | Form `POST` runs `update` on server |
| Scripted vs plain controls | `Style.media('(scripting: none)', …)` | Only plain HTML controls display |
| Cross-request state | Your app (cookie or database) | Read in `prepare`, written in `headers` |

Both scripted and unscripted paths share one `Model`, one `update`, and one
view:

1. **GET `/?q=acme&sort=PriceAscending`:** `Mirror.reduce` reads query params
   into `init`, `prepare` loads the cart cookie and runs `Data.satisfy`, and
   `SSR.render` emits HTML plus the resume envelope. When scripts boot,
   `SSR.hydrate` resumes that `Model` without re-fetching.
2. **POST `/?q=acme` (scripts off):** `SSR.entry` verifies `Origin`, rebuilds
   the `Model` via `init` and `prepare`, decodes `foldkit-plus-message`, runs
   `update(Message)`, writes the updated cookie header, and redirects (`303`)
   back to `/?q=acme`. With scripts on, the browser handles `OnSubmit` locally.

Six rules follow:

1. **Render every shown value in the HTML** before sending the response.
2. **Keep GET state in the URL** using `Mirror.url` and `<form method="get">`.
3. **Draw both scripted and plain controls** and toggle them with CSS
   `(scripting: none)` rather than `<noscript>`.
4. **Page virtualized lists with links** (`WindowList.pageOf`) so users can step
   through windows without JavaScript.
5. **Express mutations as `rh.form` submissions** carrying a typed `Message`.
6. **Test both modes:** verify the workflow with JavaScript disabled, and verify
   hydration produces zero warnings or form `POST`s with JavaScript enabled.

## Everything shown is in the HTML

`SSR.render` renders synchronously from the `Model` you give it. To populate
server data before rendering, call `Data.satisfy` inside `SSR.entry`'s
`prepare` hook (using `pageReader` from `foldkit-remote-server/fetch`), and
include `Remote.resume(Data)` in your plan so the browser starts with those
rows already `Ready`:

```ts sketch
const readPage = (model: Model, request: Request): Effect.Effect<Model> =>
  Data.satisfy(model, actives).pipe(Effect.provide(readPrices(request)))

export const { renderPage } = SSR.entry({ Model, init, update, view, container: null }, plan, {
  buildId,
  origins: 'same-origin',
  prepare: readPage,
})
```

`origins: 'same-origin'` matches the request's own origin in local development;
behind a TLS-terminating reverse proxy where the app sees `http://host` while
the browser sends `Origin: https://host`, pass explicit public `origins: ['https://example.com']`
and set `Mirror.cookie({ …, attributes: { secure: true } })`. A failing `prepare`
returns `500` unless you catch and recover inside `prepare`.

Include every field read by active `Surface`s (search query, list window, sort
order) in the plan's `state`:

```ts sketch
SSR.plan(App, {
  state: Projection.pick(App.model.query, App.model.resultsList, App.model.sortOrder),
  surfaces: [Surface.at(SearchBox, undefined), actives.top, actives.visible, actives.whole],
  parts: [Remote.resume(Data)],
})
```

## The address is the state a GET carries

`Mirror.url` binds Model fields to query parameters and provides `reduce` to
hydrate `init` from incoming URLs on both server and client:

```ts sketch
export const SearchInUrl = Mirror.url(App, {
  name: 'search',
  fields: [App.model.query, App.model.tldFilter, App.model.availabilityFilter, App.model.sortOrder, App.model.from],
  keys: {
    query: { key: 'q', history: 'replace' },
    tldFilter: { key: 'tld', history: 'replace' },
    availabilityFilter: { key: 'availability', history: 'replace' },
    sortOrder: { key: 'sort', history: 'replace' },
    from: { history: 'replace' },
  },
})

export const init = (url: Url) => start(SearchInUrl.reduce(empty, url))
```

Pair this with a `<form method="get" action="/">` containing named inputs (and
`<select form="domain-search-form" name="sort">` controls linked by `form` id).
Pass `rh.Method('get')` explicitly whenever a `rh.form` should submit as a GET
instead of posting a `Message`:

```ts sketch
rh.form([h.Id('domain-search-form'), h.Method('get'), h.Action('/'), h.OnSubmit(Message.SubmittedSearch())], [
  rh.input([h.Name('q'), h.Value(model.query), rh.OnInput(Message.UpdatedSearch)]),
])

h.select([h.Name('sort'), h.AriaLabel('Sort results'), h.Attribute('form', 'domain-search-form')], options)
```

Build pagination links with `SearchInUrl.href(model, { from: 13 }, '/')` so
both server and client generate matching URLs with default params omitted.

## Both kinds of control, drawn on both sides

Custom dropdowns or sheets require JavaScript; native `<select>` elements do
not. Render both in the view and switch visibility with the CSS
`(scripting: none)` media query so hydration finds the exact DOM the server
sent:

```ts
import { Style, type Piece } from 'foldkit-mixins'

export const NO_SCRIPT = '(scripting: none)'

// Place last in a slot's pieces so it overrides breakpoint `display` rules.
const scriptedOnly = Style.media(NO_SCRIPT, { display: 'none' })
const plainOnly = (display: string): Piece => [{ display: 'none' }, Style.media(NO_SCRIPT, { display })]

export const filterPieces = {
  dropdowns: [{ display: 'flex', gap: '6px' }, scriptedOnly],
  plainFilters: [plainOnly('flex'), { gap: '6px' }],
} satisfies Record<string, Piece>
```

## A virtual list pages by links

A `WindowList` renders visible rows plus scroll spacers. Without JavaScript,
users cannot scroll to trigger new windows, so page by URL links instead:

- Mirror `?from=` with `Mirror.url` and pass it to `WindowList.init({ from })` so
  the server renders and fetches prices (`windowOf`) only for that window.
- `Recipes.WindowList` hides scroll spacers under `(scripting: none)` so rows
  sit in normal document flow.
- `WindowList.pageOf(model, keys)` returns `Option` offsets for previous and
  next `?from=` links.

When scripts boot, `WindowList.Track` measures row heights, restores scroll
offset seamlessly, and resets `from` back to `0` on the first `Placed` reading.

## State between two posts

Because each server `POST` runs from `init`, share cart state between server
and client using `Mirror.cookie` (`foldkit-mirror`):

```ts sketch
export const CartInCookie = Mirror.cookie(App, {
  name: 'cart',
  fields: [App.model.cart],
  keys: { cart: { codec: Cart.CartCookie } },
})

const held = CartInCookie.keysOf(request.headers.get('cookie'))
CartInCookie.setCookie(reached, request)
```

- **Validate cookie contents on read:** Cookies are user-editable.
  `foldkit-mirror` enforces the 4096-byte cap, and your `prepare` hook should
  decode names via Schema, deduplicate, cap item counts, and look up current
  prices on the server.
- **Validate the posted `Message`:** `SSR.entry` checks the `Message` Schema
  and verifies the active `Surface` permits it; `update` checks item availability.
- **Write cookies in `headers(request, model)`:** Only emit `Set-Cookie` on
  `POST` responses where `model` is `Option.some(...)`.
- **Mark personalized pages private:** Set `cache-control: private, no-store`
  whenever rendered HTML includes user cart state.
- **Redirect after POST (`answerPost: 'redirect'`):** Returns `303` to the
  posted URL so browser reloads issue a `GET` instead of re-submitting. Persist
  flash feedback or validation errors in a one-shot cookie written in `headers`
  and read in `prepare`.

## Testing it

Three Playwright tests in
[`noscript.e2e.ts`](../examples/foldkit/domains-plus/e2e/noscript.e2e.ts) verify
both paths:

- **JavaScript disabled** (`javaScriptEnabled: false`): searches, filters with
  native selects, pages through results, and adds or removes cart items via
  `POST` + `303`.
- **JavaScript enabled:** performs the same flows with zero form `POST` network
  requests, zero extra script fetches, and zero hydration warnings.
- **Shared cookie:** items added with scripts on persist when reloading with
  scripts off, and removals posted without scripts update the scripted page.

In scripted tests, wait for hydration to complete (the root loses
`data-foldkit-plus-resume`) before clicking so you test the live runtime.

## What it costs

Measured on `domains-plus` (`vite build` client bundle and served `/?q=acme`,
gzip -9):

| Piece | Client JS (min / gzip) | HTML of `/?q=acme` (gzip) |
| --- | --- | --- |
| Server-rendered data in HTML | +0.1 KB / 0 | +3.0 KB (prices markup + 1.4 KB envelope) |
| GET search/filters and `scripting: none` CSS | +2.9 KB / +0.9 KB | +4.5 KB (557 TLD `<option>`s + 0.35 KB CSS) |
| Pagination links | +0.7 KB / +0.1 KB | +0.2 KB |
| Cart via `fallback: 'server'` | +0.8 KB / +0.1 KB | +1.4 KB (form fields, bindings, plain cart) |
| `foldkit-ssr` and `foldkit-mixins` runtime | +0.8 KB / +0.3 KB | none |
| **Total** | **+5.2 KB / +1.4 KB** | **+9.1 KB (18.7 KB to 27.8 KB)** |

The form fallback itself adds ~0.1 KB gzipped to client JavaScript. Most of
the HTML growth comes from listing every TLD in a native `<select>`; using a
text input avoids that HTML size when needed.

## Limits

- **Post-redirect messages:** Only state persisted in a cookie or store survives
  `answerPost: 'redirect'`; flash validation errors require a one-shot cookie
  written in `headers` and read in `prepare`.
- **Pending form state:** Server-posted forms do not automatically track busy
  state while waiting for a response.

## Next

- Configure `SSR.plan`, `SSR.entry`, and `Resume.builder`: [`foldkit-ssr` README](../packages/ssr/README.md)
- Keep URL query parameters and cookies in sync with your Model: [`foldkit-mirror` README](../packages/mirror/README.md)
- Inspect the working reference app: [`examples/foldkit/domains-plus`](../examples/foldkit/domains-plus/README.md)
