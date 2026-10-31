# Pages that work without JavaScript

A Foldkit Plus page can do its job with scripts off and be taken over by them
when they run, from one Model, one `update` and one view. The server renders
the whole page; the address carries what the page shows; and a form posts its
Message to the page, where the server runs the same `update` the browser would.
Scripts make the page faster to use. They do not make it work.

The practice comes from porting
[`examples/foldkit/domains-plus`](../examples/foldkit/domains-plus/README.md),
a domain search with filters, a virtual list and a cart, to work with
JavaScript off. Every rule below is something that port needed.

## Who owns what

| Part of the page | Owner | What it does without scripts |
| --- | --- | --- |
| The page | `foldkit-ssr` renders it whole, from the Model `init` and your reads reached | It is the page |
| What it shows of a server's data | `foldkit-remote`: `Data.satisfy` reads it before the render, `Remote.resume` sends it to the browser | It is in the HTML |
| Search text, filters, sort, a list's position | the Model, kept in the address by `foldkit-mirror`'s `Mirror.url` | A GET form or a link writes the address; the server reads it |
| A change (add to cart) | `update`, as always. `fallback: 'server'` posts a form's Message, and `SSR.handle` runs `update` on the server | A POST of the page |
| Which controls show | the view draws both kinds; `foldkit-mixins`' `Style.media('(scripting: none)', …)` shows one | The plain kind |
| State between two posts | the application: a cookie it reads and writes | Foldkit Plus keeps nothing |

Nothing here is a second application. There is no action route and no
server-only view: the browser adopts what the server drew, and the address
and the posts reach the `update` the scripted page runs.

## The mental model

```text
GET  /?q=acme&sort=PriceAscending
       Mirror.reduce ─▶ init ─▶ Data.satisfy ─▶ render whole ─▶ HTML + envelope
       scripts on:  SSR.hydrate resumes the Model; nothing is read again

POST /?q=acme   (foldkit-plus-message = the form's encoded Message)
       Origin checked ─▶ init, as for the GET ─▶ update(Message) ─▶ render ─▶ HTML
       scripts on:  the runtime answers the submit; nothing is posted
```

Six rules follow from it:

1. **Everything shown is in the HTML.** Read before the render, so no row
   waits for a script to price it.
2. **The address is the state a GET carries.** Search and filters are a GET
   form over the keys the URL mirror reads.
3. **Both kinds of control are drawn on both sides.** The plain ones show
   under `(scripting: none)`, the scripted ones otherwise, so the browser's
   first render is the page the server sent. Never `<noscript>`.
4. **A virtual list pages by links.** Without scripts it draws one window, so
   it links to the next.
5. **A change is a form whose submit is a Message.** The runtime answers it
   when it runs; the server answers the post when it does not.
6. **A test runs with JavaScript off**, and another checks that the scripted
   page did not change.

## Sixty seconds: one form that works both ways

A cart with one button. The Message carries the name, not the domain and its
price: a form posted without scripts can carry anything, so `update` decides
what the name is worth.

```ts
import { Array, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Resume, SSR } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'

const Model = Schema.Struct({ cart: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Added: { name: Schema.String.check(Schema.isMaxLength(128)) },
})
type Message = typeof Message.Type

const initial: Model = { cart: [] }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const update = (model: Model, message: Message) =>
  Message.match(message, {
    Added: ({ name }) => ({
      model: Array.contains(model.cart, name)
        ? model
        : modifyFields(model, { cart: cart => Array.append(cart, name) }),
    }),
  })

const view = (model: Model, h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return {
    title: 'Cart',
    body: rh.main(
      [],
      [
        rh.p([], [`${model.cart.length} in the cart`]),
        rh.form(
          [rh.OnSubmit(Message.Added({ name: 'acme.com' }))],
          [rh.button([rh.Type('submit')], ['Add acme.com'])],
        ),
      ],
    ),
  }
}

/** The Messages a posted form may carry: what the cart's controls send. */
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

export const { renderPage } = SSR.entry(
  { Model, init: () => ({ model: initial }), update, view, container: null },
  plan,
  { buildId: 'build-1', origins: ['https://shop.example'] },
)
```

What each part does, and does not do:

- **`rh.form` with `rh.OnSubmit(Message)`** is an ordinary Foldkit form while
  scripts run: the submit is the Message, `update` answers it, and the
  browser sends nothing. Because the plan has `fallback: 'server'`, the
  server also writes the form `method="post"` with the Message encoded in a
  hidden field. `SSR.hydrate` takes both out as the page boots, so the
  browser's first render matches the page it adopts.
- **`fallback: 'server'`** makes `SSR.entry` take a `POST`. `SSR.handle`
  decodes the posted Message through the plan's Message Schema (a name over
  128 characters is a `400`), refuses one no active Surface lists, rebuilds
  the Model as a `GET` would (`init`, then the plan's `boot`), runs `update`
  and every Command after it, and renders the page.
- **`origins`** is required with a fallback: a form cannot carry a CSRF
  header, so a post whose `Origin` is not listed is a `403` before its body is
  read.
- **It does not keep the cart.** Each post starts from `init`, so a second
  add finds an empty cart. Keeping state between posts is the application's
  ([below](#state-between-two-posts)).

## Everything shown is in the HTML

`SSR.render` renders the Model it is given and fetches nothing. A page whose
rows come from Remote reads them first, with `Data.satisfy`, which reads what
every active Surface needs, pass after pass, through a reader in the same
process (`foldkit-remote-server/fetch`'s `pageReader`). The entry then starts
from that Model, so it is made per request:

```ts sketch
const readPage = (request: Request, url: Url): Promise<Model> =>
  Effect.runPromise(
    Data.satisfy(init(url).model, actives).pipe(Effect.provide(readPrices(request))),
  )

export const renderPage = async (request: Request) => {
  const model = await readPage(request, Option.getOrThrow(fromString(request.url)))
  return SSR.entry({ Model, init: () => ({ model }), update, view, container: null }, plan, {
    buildId,
    origins: [new URL(request.url).origin],
  }).renderPage(request)
}
```

The plan lists the reading Surfaces and sends their data with Remote's part,
so the browser starts with the prices and reads none of them again:

```ts sketch
SSR.plan(App, {
  state: Projection.pick(App.model.query, App.model.resultsList, App.model.sortOrder),
  surfaces: [Surface.at(SearchBox, undefined), actives.top, actives.visible, actives.whole],
  parts: [Remote.resume(Data)],
})
```

What a Surface's reads follow (the list's window, the filters) goes in
`state`, or the browser would read different rows from the ones the server
drew, and `SSR.render` refuses the plan. Building an entry per request is a
gap: [#393](https://github.com/doeixd/foldkit-plus/issues/393) proposes a
`prepare` step instead.

## The address is the state a GET carries

`Mirror.url` keeps fields of the Model in the address, and its `reduce`
reads them back, which is all a server needs to render the page a GET names:

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

The search form is then a GET of `/`. Its text input is named `q`, and the
filters' plain selects join it with the `form` attribute, wherever they stand
in the page, so Enter in the box and Apply beside the filters send the same
query. With scripts, `OnSubmit` answers Enter and nothing is sent.

```ts sketch
h.form([h.Id('domain-search-form'), h.Method('get'), h.Action('/'), h.OnSubmit(Message.SubmittedSearch())], [
  rh.input([h.Name('q'), h.Value(model.query), rh.OnInput(Message.UpdatedSearch)]),
])

h.select([h.Name('sort'), h.AriaLabel('Sort results'), h.Attribute('form', 'domain-search-form')], options)
```

Build a GET form with `h.form`, not `rh.form`: with a server fallback every
form `rh` builds is written to post its Message
([#391](https://github.com/doeixd/foldkit-plus/issues/391)).

A link to another state of the page is `SearchInUrl.href(model, { from: 13 },
'/')`: the address with the mirrored keys patched, defaults left out. Give
it the base, so the server and the browser write the same link.

Mirroring the filters changes the scripted page too: choosing one now
replaces the address, as the search text does. That is what makes a page
reached without scripts the same page.

## Both kinds of control, drawn on both sides

A dropdown or a sheet needs a script; a `<select>` does not. Draw both, and
let the browser's `scripting` media feature pick. The browser's first render
must be the server's page, so a control drawn on only one side, or inside
`<noscript>`, would be rebuilt when the page is adopted.

```ts
import { Style, type Piece } from 'foldkit-mixins'

/** Where no script runs. */
export const NO_SCRIPT = '(scripting: none)'

/** Shown only where scripts run. Last in a slot's pieces, so it wins over a width's `display`. */
const scriptedOnly = Style.media(NO_SCRIPT, { display: 'none' })

/** Shown only where no script runs, as `display` when it is. */
const plainOnly = (display: string): Piece => [{ display: 'none' }, Style.media(NO_SCRIPT, { display })]

export const filterPieces = {
  dropdowns: [{ display: 'flex', gap: '6px' }, scriptedOnly],
  plainFilters: [plainOnly('flex'), { gap: '6px' }],
} satisfies Record<string, Piece>
```

These are ordinary Style pieces: they go in a slot of the page's Slots, and
the rules land in the layer the slot's style is placed in. Put `scriptedOnly`
after any media rule that sets `display` for a width, as the comment says.

## A virtual list pages by links

A `WindowList` draws the rows in view and spacers for the rest. Without
scripts there is no view to follow, so the page draws one window and links to
the next:

- the spacers are `scriptedOnly`, so the rows drawn lie in the page's flow;
- `?from=` is a mirrored field; `init` opens the list at that row, and the
  server reads the prices of exactly the rows it draws;
- the paging links are worked out from the window a list opened at `from`
  would draw, not from the live window, so scrolling a scripted page changes
  none of them;
- with scripts, the list's first `Placed` reading sets `from` back to 0, and
  the mirror takes it out of the address.

domains-plus opens the list by sending `WindowList.Message.Placed` with the
viewport past the rows its overscan would draw above the row.
[#392](https://github.com/doeixd/foldkit-plus/issues/392) proposes
`WindowList.openAt` and a page helper.

## State between two posts

A post starts from `init`. Whatever must outlive it lives where the next
request reads it: domains-plus keeps its cart's names in a cookie.

- **Reading it is validating it.** The cookie is the visitor's to edit, so
  the server takes the names only, drops repeats, keeps at most 50, and
  prices each again from its own data; a taken or unknown name is dropped.
- **The posted Message is validated three times:** its Schema (a name has a
  length), the plan (an active Surface must list it), and `update`, which adds
  a name only if the Model read it as available, at the price it read.
- **Writing it needs the Model the post reached.** `SSR.entry`'s `headers`
  sees only the request; domains-plus keeps the Model `status` is given and
  adds `set-cookie` to the answer
  ([#389](https://github.com/doeixd/foldkit-plus/issues/389)).
- **A page drawn with someone's cart is theirs.** Answer it
  `cache-control: private, no-store`.
- **A reload posts again.** The answer is the page, at the post's URL.
  Adding and removing are idempotent, so domains-plus can bear it; a
  redirect after the post is
  [#390](https://github.com/doeixd/foldkit-plus/issues/390).

The scripted page keeps its cart in the Model and writes no cookie, as before.
A cookie store for `Mirror` that both would share is
[#394](https://github.com/doeixd/foldkit-plus/issues/394).

## Testing it

Two Playwright tests, both in
[`noscript.e2e.ts`](../examples/foldkit/domains-plus/e2e/noscript.e2e.ts):

- **With JavaScript off** (`browser.newContext({ javaScriptEnabled: false })`):
  search, filter with the plain selects, page with the links, add to the cart,
  see the cart on another search, remove it.
- **With it on**, the scripted page is unchanged: no form `POST` in the
  network log, no script requested after the page went live, and no
  hydration warning in the console.

A scripted test that clicks before the runtime has taken the page over is
now testing the page without scripts: the served page is priced and its
forms post. Wait for the takeover first (the root loses
`data-foldkit-plus-resume` as the page boots).

## What it costs

Measured on domains-plus (`vite build`, the client's one chunk, gzip -9;
the served `/?q=acme`), against Solid 2's form enhancement on the same app,
about 1 KB:

| Piece | Client JavaScript, minified / gzipped | HTML of `/?q=acme`, gzipped |
| --- | --- | --- |
| Everything shown in the HTML | +0.1 KB / 0 | +3.0 KB (the prices' markup, and the envelope +1.4 KB) |
| Search and filters as a GET, `scripting: none` styles | +2.9 KB / +0.9 KB | +4.5 KB (the TLD select's 557 options 4.1 KB, the new rules 0.35 KB) |
| Paging links | +0.7 KB / +0.1 KB | +0.2 KB |
| The cart through `fallback: 'server'` | +0.8 KB / +0.1 KB | +1.4 KB (the forms, their hidden Message fields and their bindings, the plain cart) |
| `foldkit-ssr` and `foldkit-mixins`' changes | +0.8 KB / +0.3 KB | none |
| **All** | **+5.2 KB / +1.4 KB** | **+9.1 KB: 18.7 KB to 27.8 KB** |

The cart row is the one that compares with Solid's: the runtime already
answers a form's submit, and the server writes the fallback, so a form that
posts without scripts costs the browser about 0.1 KB.

The bundle stays one chunk, and the scripted page loads nothing new after
boot. The largest cost is HTML: a TLD select a page without scripts can use
lists every extension. A page that must stay small would offer a text field
there instead.

## Limits

- The answer to a post is the page, not a redirect (#390), and its headers
  cannot come from the Model (#389).
- A GET form is built with `h.form` (#391).
- Opening a virtual list at a row is the application's (#392).
- A read before render needs an entry per request (#393).
- State between posts is the application's own cookie (#394).
- A form's busy state is not yet tied to its write being answered (#387).
