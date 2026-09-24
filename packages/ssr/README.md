# `foldkit-ssr`

Server rendering for a Foldkit application: render once on the server, hand the
browser the part of the Model it owns, and hydrate without running `init` a
second time.

**Status: in development, not published.** Built in phases from
[the plan](../../docs/design/ssr-PLAN.md). Phases 0 to 6, U and R are
done: a page renders on the server or at build time and is served through
Foldkit's fetch handler, the browser takes it over from the handed-over Model,
a plan is checked against the Surfaces the browser reads, parts of the page can
belong to the server alone, and Remote's data crosses with the page. Resumable
pages, whose view waits for the first interaction, are being built: bindings
the server's markup names, a listener that answers them before boot, and the
deferred boot itself are done; what remains is the coverage of their Messages
and a server fallback.

## What it owns

Only the handover. Rendering to HTML and adopting it in the browser are
Foldkit's own (`foldkit/experimental/server` and `foldkit/runtime`), and this
package calls them rather than replacing them. What it adds is a **resume
plan**: which slice of the Model crosses from the server to the browser,
written into the page as a JSON script and read back through the slice's own
Schema.

## Compared with Foldkit's own server rendering

Foldkit already renders on the server and hydrates in the browser. What it
sends across is the **input**: the Flags that produced the page, which the
browser decodes and feeds to `init` again. A resume plan sends the **result**:
the part of the Model the browser owns, so `init` runs once.

|                                  | Foldkit (`renderToString` + `Runtime.hydrate`)                                            | `foldkit-ssr` (`SSR.render` + `SSR.hydrate`)                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| What the page carries            | The encoded Flags                                                                         | The plan's slice of the Model; no Flags                                                         |
| `init`                           | Runs on the server, then again in the browser                                             | Runs on the server only                                                                         |
| `init`'s Commands                | Ignored on the server, run in the browser                                                 | Run nowhere unless the plan names them in `boot`; rendering refuses a plan that would drop them |
| Server-only data                 | Crosses if `init` needs it, since it must be in the Flags                                 | Stays on the server unless the plan's slice includes it                                         |
| Server-only parts of the page    | Rendered again in the browser, from the Model rebuilt there                               | `SSR.static` regions: adopted as they are, never rendered in the browser                        |
| A view the browser can't match   | The browser rebuilds that part of the page; only development warns                        | `SSR.render` fails with `ViewDependsOnUnsentState` before the page is served                    |
| The route                        | The browser's `init` reads the browser's URL                                              | The browser must be at the path and query the page was rendered for, or the page is refused     |
| A page from another build        | Refused and frozen                                                                        | The same: Foldkit's own check runs first                                                        |
| A page whose payload can't be read | Refused and frozen                                                                      | The same, and the reason is logged                                                              |
| What you write                   | Nothing beyond the config                                                                 | A plan: `id`, `state`, and `boot` if `init` returns Commands                                    |
| Status                           | Experimental, published                                                                   | In development, unpublished                                                                     |

Use Foldkit's own rendering when the Flags are small and `init` is cheap to run
twice: a Model computed from a few Flags sends less that way than its slice
would. Use a resume plan when `init` needs data the browser should not receive
or re-derive, when its Commands would redo work the server already did, or when
you want a view that reads unsent state caught on the server rather than
repaired in the browser.

The cost of a plan:
- `SSR.render` renders the view twice, once from the server's Model and once
  from the browser's, to catch a view that reads a field the plan doesn't send.
- `SSR.hydrate` skips `init` by giving Foldkit a config whose `init` returns the
  resumed Model. That relies on how Foldkit hydrates today, not on a Foldkit API;
  the tests will fail the day that changes.

## Render and hydrate

```ts
import { Effect } from 'effect'
import { Projection } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

// Which part of the Model the browser owns. The rest starts from the
// baseline, by default the application's initial Model.
export const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})

// On the server, per request.
const result = await Effect.runPromise(SSR.render(config, Post, { buildId, url: request.url }))
const html = SSR.page(template, result)

// In the browser, instead of Runtime.hydrate.
SSR.hydrate(config, Post, { buildId })
```

`App` is the application's Surface application (`foldkit-surface`), and
`config` the one you pass to `makeApplication`, the same on both sides. The
examples in this README share one application, a post page, sketched
[at the end](#the-application-in-these-examples). An application with Flags
also passes `flags` to `SSR.render`; they shape the server's `init` and never
reach the page.
`SSR.page` puts the envelope in the template, not in Foldkit's rendered HTML,
which `injectIntoTemplate` requires to hold only the root and its own payload.

The head is part of the view. Since Foldkit 0.163 nothing gives `canonical` a
default from the URL, so a page that wants one derives it from the route in its
Model, as it does its `title`, and sends the route in `state`. A head field
read from a field the plan leaves out is refused like a body that is (see
below).

## Serve it through Foldkit's fetch handler

Foldkit's server entry is one function, `renderPage(request)`, which its
`handleRequest` calls for every request that is not a static file, on Node and
on Workers alike. `SSR.entry` is that function for a resume plan:

```ts
import { handleRequest } from 'foldkit/experimental/server'

// The server entry.
export const { renderPage } = SSR.entry(config, Post, { buildId, template })

// A Worker, or any host that hands you a Web Request.
export default {
  fetch: (request: Request) => handleRequest(request, { renderPage, template }),
}
```

`GET` and `HEAD` render the page with the request's URL; an application with
Flags passes `flags: request => ...`. Any other method is answered `405`. A
render that fails or throws, `flags` that throw or reject, and a plan the
render refuses are each answered `500` with the reason logged, never with a
page the browser could not resume. `handleRequest` still
answers a missed asset `404` without rendering, and `HEAD` without a body.

The page comes back whole, as Foldkit's `Responded`, built by Foldkit's own
`toResponse`: the `Rendered` result `handleRequest` would place in its
template has no room for a per-request envelope.

## Startup Commands: `boot`

The browser does not run `init`, so the Commands `init` returns would run
nowhere. `SSR.render` refuses a plan that would drop them, naming them. Name
what the browser should run on load in `boot`:

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
  boot: () => [LoadPreferences()],
})
```

An application assembled with `foldkit-bundle` runs its assembly's startup
Commands, which is where a `Mirror.kv` restores what the user saved:

```ts
boot: model => assembly.init(model).commands ?? []
```

## Check the plan against the browser's Surfaces

The view is checked on every render, but a Surface can read a field the first
view never shows: a like button's state, a menu's contents. Name the Surfaces
the browser may activate, and the fields allowed to start from the baseline:

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.post.id, App.model.post.liked),
  local: [App.model.menuOpen], // the browser starts it from the baseline, on purpose
  surfaces: [
    Surface.when(PostActions, App.model.route, AppRoute.Post, route => ({ id: route.id })),
    Surface.at(Menu, undefined),
  ],
})
```

`SSR.render` then refuses the plan, naming the Surface and the field, when an
active Surface:

- reads a field that is neither in `state` nor in `local`;
- is activated by one (the place a `Surface.when` reads);
- reads data no Model path names, such as a Remote selection, reported by its
  metadata (`remote data (User:u1)`), unless one of the plan's `parts` resumes
  it (see below);
- is activated differently, or reads something else, from the Model the browser
  starts from. This catches a `Surface.at` whose callback reads an unsent field.

A Surface's reads depend on the Model through its params, so the check runs
for the Model the server rendered. `SSR.inspect(plan, model)` returns the same
findings as data: what is sent, what is local, and for each Surface whether it
is active, where each read comes from (`state`, `local` or `missing`), and
whether the browser would activate it the same way.

## Parts: state the slice cannot carry

Some state is not a field to pick. Remote's normalized store is keyed by entity
and holds whatever the server read, most of which the page never shows. A
**part** is a package's own contribution to the envelope: it captures what the
plan's active Surfaces read, and restores it in the browser.

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route),
  surfaces: [PostPageAt],
  parts: [Remote.resume(Data)],
})
```

`Remote.resume` sends each field the Surfaces select, through relations, each
connection with its boundaries, and the live cursors of what it sends, and
nothing else of the store; the browser asks the server for none of it again.
The coverage check counts a read as sent when a part covers it.

Every part the plan names must be in the page and restore, and no other part
may be, or the page is refused whole. The server resumes each part from its own
capture before serving, so a part that cannot restore what it captured is
refused there (`UnrestorablePart`), not in the browser. Two parts with one id
are refused when the plan is made.

## Static regions: parts of the page the server owns

An article body, a product description, highlighted code: a part of the page
no Message changes need not be rendered in the browser at all, and what it
reads need not be sent. Mark it with `SSR.static`:

```ts
const view = (model: Model, h: HtmlBuilder<Message>) => ({
  title: 'Post', // not the post's title: the browser does not have it
  body: h.main(
    [],
    [
      SSR.static('post-copy', ih => [
        ih.h1([], [model.post.title]),
        ih.p([], [model.post.body]),
      ]),
      PostActionsView(model, h), // the part the browser owns
    ],
  ),
})
```

The render receives Foldkit's inert builder, so it cannot attach a Message
handler. On the server it runs once, although the server renders the view twice
to check it. In the browser, `SSR.hydrate` reads each region's markup before
hydrating, and the region becomes that markup as trusted `InnerHTML`, which
Foldkit adopts node for node. The render never runs there, so the plan above
sends neither `post.title` nor `post.body`, and the view check passes.

A region changes only with a new document. Content a Message should change
belongs in a Surface.

- Two regions with one id are refused on the server
  (`DuplicateStaticRegion`): the browser could adopt only one.
- A region the browser asks for that is not in the page, say after a Message
  shows one, is logged and rendered in the browser from the browser's Model.
- With no server render, a region renders like any other part of the view.

## Static generation

The same render at build time, for paths you know, as files a static host
serves:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const pages = await Effect.runPromise(
  SSR.generate(config, Post, {
    buildId,
    template,
    origin: 'https://example.com',
    paths: ['/', '/about', '/docs/intro'],
  }),
)
for (const page of pages) {
  await mkdir(dirname(join('dist', page.file)), { recursive: true })
  await writeFile(join('dist', page.file), page.html)
}
```

Each path becomes `index.html` in its own folder (`/about` is
`about/index.html`), and a path ending in `.html` keeps its name. `origin` makes
each path the full URL a routing application parses. An application with Flags
passes `flags: path => ...`, and they stay out of the page as always. The
pages come back in the order of `paths`, typed as a tuple of them, so
`const [home, about] = pages` needs no check.

A static host serves one file whatever the query, and for `/about` and
`/about/` alike. So a generated page records its path alone, and the browser
checks the path and ignores the query and a trailing slash: `/about?ref=mail`
resumes the page generated for `/about`, and `/other` is refused. A path with a
query or fragment, or two paths that would be one file, are refused with
`UngeneratablePath`.

## Bindings: what each element causes

A resumable page answers an interaction before its view has run. For that the
page must say, in the server's markup, which Message each element causes. A
Foldkit handler is already a Message value, so for most events that is data;
`Resume.builder` writes it down:

```ts
const view = (model: Model, h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return {
    title: 'Post',
    body: rh.main(
      [],
      [
        rh.button([rh.OnClick(Message.Liked({ id: model.post.id }))], ['Like']),
        // A Message with a hole: the event fills `value`.
        rh.input([rh.Value(model.draft), rh.OnInput(Message.ChangedDraft)]),
        // Fixed fields beside the hole: the event fills `title`.
        rh.input([rh.OnChange(Message.Renamed, { id: model.post.id })]),
        // A key event fills `key` and `modifiers`.
        rh.div([rh.OnKeyDown(Message.Pressed)], []),
      ],
    ),
  }
}
```

`rh` is `h` with one addition: `OnInput`, `OnChange`, `OnKeyDown` and `OnKeyUp`
also take a Message's own constructor, and the event fills the field it leaves
open. The types check it where it is written: the member must be one of the
view's Messages and leave exactly one string field, or exactly `key` and
`modifiers`, after the fixed ones. A closure still works; it is simply not
data, so nothing can name what it would do.

A Surface renderer takes the resumable builder through `Resume.view`, which
goes wherever a renderer goes. Its `rh` makes only the Surface's own Messages:

```ts
const LikeView = Surface.rootView(
  Like,
  undefined,
  Resume.view((like, rh) => rh.button([rh.OnClick(Message.Liked({ id: like.id }))], ['Like'])),
)
```

During the server's render each binding gets an ordinal, its element a
`data-foldkit-plus-on-<event>` attribute naming it, and the envelope the
Message encoded through the application's Message Schema, with the Foldkit
attribute it came from (`OnSubmit` also prevents the default action, which the
page must know to answer as the live page would). Foldkit runs every handler
of an event on an element, in order, so the marker lists every ordinal of that
event, `click="0 1"`; a handler the page cannot describe, a closure or an
attribute such as `OnKeyDownPreventDefault`, is listed as `*`, so the page
knows it cannot answer that event alone. In the browser the builder marks
nothing, and Foldkit's first patch removes the server's markers. The plan must
be made from the application, so it knows that Schema.

The server compares the bindings of its two renders as it compares the body:
a Message built from a field the plan does not send
(`Liked({ id: model.post.id })` with `post.id` unsent) would be one Message before the
view runs and another after, so it is refused, naming the element.

In the browser, `Resume.bindings(plan, document, root)` decodes the page's
bindings through the application's Message Schema and checks every marker
against them; a page whose entries are not the application's Messages, or
whose markers name a binding it does not carry, is refused whole. Then
`Resume.listen(root, { bindings, onAnswer })` answers events from the markers
with one capture-phase listener per event type at the root, so `focus` and
`blur` are caught too. It walks from the target to the root and collects each
binding's Message on the way, in the order Foldkit chains them, filling a hole
from the event as the closure would, honouring `OnClick`'s `defaultAction`,
`propagation` and `focusSelector`, and preventing a submit's default as
`OnSubmit` does. Each event gets one answer, `{ event, messages, unnamed? }`;
at a `*` the walk stops and the answer names that element as `unnamed`,
because the live page does something there the page cannot describe. Both
are what `SSR.hydrate` uses when the plan defers its boot.

## Deferred boot: the page answers until the runtime is needed

A plan says when the runtime starts:

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.post),
  start: 'on-interaction', // or 'idle'; 'now' is the default
})
```

With `'now'`, `SSR.hydrate` boots as before. Otherwise it decodes the page's
bindings, listens, and boots on the first event they answer, or when the
browser is idle. Foldkit's hydrate adopts the page during that event's
dispatch, so the event that woke the page is not lost: an answer the markers
completed is queued and replayed after boot, in order, through the same
`update`, and the event stops there so the live page does not answer it
again; an answer they could not complete, one that met a `*`, queues nothing
and goes on to the live page, which alone can answer it. Either way the Model
ends where an eager boot would have taken it. A page whose bindings are
refused is contained, as any refused page is.

What deferral cannot do is start a Subscription or a Managed Resource late
without changing what the application does, so on the server `SSR.render`
refuses a deferred plan while one of them would be active for the sent Model,
naming each (`EagerStartRequired`). The plan declares by key the entries that
may start late, and a part vouches for its own package's, as `Remote.resume`
does for Remote's:

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.post),
  parts: [Remote.resume(Data)], // Remote's entries start whenever the page does
  start: 'idle',
  deferrable: ['tick'], // this application's own clock may start late
})
```

For the check to see them, the configuration passed to `SSR.render` carries
the application's `subscriptions` and `managedResources`, as Foldkit's does.
The plan's `boot` Commands run at boot, so with deferral a `Mirror.kv` restore
waits for the first interaction; that is the application's choice to make with
`start`.

## When a page is refused

On the server, `SSR.render` fails with `ResumeUnsafe`:

- `UndeclaredStartup`: `init` returned Commands and the plan has no `boot`.
- `Uncovered`: a Surface in `surfaces` reads or is activated by something the
  plan neither sends nor names `local`, as above.
- `DuplicateStaticRegion`: two `SSR.static` regions share an id.
- `UngeneratablePath`: `SSR.generate` was given a path no file can be served at.
- `UnrestorablePart`: a part cannot restore its own capture.
- `UnencodableBinding`: the page has bindings and the plan has no Message
  Schema, or a binding's Message does not encode through it.
- `ViewDependsOnUnsentState`: the view rendered from the browser's Model differs
  from the one served, in its body or in its head (`title`, `lang`, `dir`,
  `canonical`, `ogUrl`), so it reads a field the plan leaves out. The message
  names which. Add the field to `state`, or stop the view reading it. In
  production Foldkit would silently rebuild that part of the page, so this is
  the one place it shows.

In the browser, `SSR.hydrate` checks, in Foldkit's order, the page's build id
and then its envelope. A page from another build is refused by Foldkit itself.
A page whose envelope cannot resume is refused the same way, with the reason
logged. A refused page is contained, never rendered again on the client. A page
with no server render at all starts on the client as usual.

The envelope's reasons, which `SSR.resume` returns as `ResumeRefused`:
`Missing` or `Duplicate` envelope, `Unreadable` JSON, another `Protocol`
version, another `Plan`, state or a part that is `Invalid` (a part missing,
unknown to the plan, or not restoring), and a `Route` other than the one the
page was rendered for (path and query, or the path alone for a generated
page). A page is never half-restored.

## The pieces underneath

`SSR.render` and `SSR.hydrate` are built from two smaller functions, usable on
their own:

```ts
const script = SSR.envelope(Post, model, { route: '/posts/p1' })
const resumed = SSR.resume(Post, document, { route: '/posts/p1' }) // Result
```

The envelope escapes `<` as Foldkit escapes its Flags, so no string in the
Model can close the script or open another. It also escapes U+2028 and U+2029.

## The application in these examples

A post page. The examples read these fields and send these Messages; `App`
is `Surface.application({ Model, Message, initial, update })`, and the
Surfaces (`PostActions`, `Menu`, `Like`), `Data` (a `Remote.make` domain over
`App.model.remote`) and `LoadPreferences` (a `Command.define`) are the
application's own.

```ts
const AppRoute = defineRouteUnion({ Home: {}, Post: { id: Schema.String } })

const Model = Schema.Struct({
  route: AppRoute,
  post: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    body: Schema.String,
    liked: Schema.Boolean,
  }),
  draft: Schema.String,
  menuOpen: Schema.Boolean,
  remote: Remote.Model,
})

const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  altKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})

const Message = defineMessageUnion({
  ...Remote.messages,
  Liked: { id: Schema.String },
  ChangedDraft: { value: Schema.String },
  Renamed: { id: Schema.String, title: Schema.String },
  Pressed: { key: Schema.String, modifiers: Modifiers },
})
```

## What the tests prove

- **Phase 0, the ground:** Foldkit's own rendering and hydration, one test file
  per case, because a hydrated program cannot be stopped and a page holds one
  application. The cases are a counter, a page from another build, Flags, a
  routing application, a keyed list, a controlled input with trusted
  `InnerHTML`, a custom element that renders its own contents, and head fields.
  Every hydration test fails if the server's nodes are replaced instead of
  adopted.
- **Phase 1, the envelope:** the slice round-trips onto the baseline, nothing
  outside it is in the page, each refusal has its test, and a hostile string in
  the Model cannot break out of the script.
- **Phase 2, the handover:** `init` runs once, on the server; the browser adopts
  the server's nodes and the page works; a large field left out of the plan is
  nowhere in the page; Flags never reach it; `boot` runs, including a
  `Mirror.kv` restore; and each refusal above, on the server and in the
  browser, has its test.
- **Phase 3, coverage:** each kind of gap is reported, naming the Surface and
  the field: an unsent read, an unsent activation, a Remote read, and a Surface
  the browser would activate differently, including one whose Remote id comes
  from an unsent field. A sent parent field covers its children; a local place
  with no path covers nothing; an inactive Surface is not checked.
- **Phase 4, static regions:** a region's render runs once on the server and
  never in the browser, its nodes are the same after hydration and after a
  Message, and what it reads is not in the envelope. A duplicate id is refused,
  a region missing from the page is reported and rendered, a client-only render
  works, and a render leaves no context behind.
- **Phase 5, static generation:** each path is rendered to its file, with its
  own Flags; a generated page resumes at its path with a query and a trailing
  slash, and is refused at another path; and each path no file can be served
  at is refused.
- **Phase R, Remote's state:** a page with Remote data hydrates with the data
  present and no request, and with the node the server rendered; a field no
  Surface selects is not in the page; a part that is missing, unknown or does
  not restore refuses the page; a covered Remote read passes the coverage
  check. `foldkit-remote`'s own tests pin the capture: relations, connection
  boundaries, stale marks, live cursors under the key the live entry uses,
  and retention keeping what was resumed.
- **Phase 6, delivery:** through Foldkit's real `handleRequest`, `GET` answers
  the resumable page and the browser resumes it on its route without `init`;
  `HEAD` answers with no body; `POST` is answered `405`; a missed asset renders
  nothing; a refused plan is answered `500` with the reason logged; and each
  request gets its own Flags, kept out of the page.
- **Phase A, bindings:** each binding, keyed elements included, is marked with
  its ordinal in render order and written into the envelope as its encoded
  Message, decodable by the Message Schema; a closure is not marked; a binding
  built from an unsent field is refused, naming the element; a plan without
  the Schema is refused. In the browser the markers are gone after the first
  patch, the nodes are kept, and a click, an input and a key press each
  dispatch the Message their binding names. A member that leaves the wrong
  fields fails to compile, and at runtime says why.
- **Phase B, delegated dispatch:** with no runtime booted, a click, an input,
  a change, a key press and a focus each dispatch the Message their binding
  names, with holes filled from the event; two bindings on one element both
  run and `Stop` keeps the click from the parent; a submit's default is
  prevented; a handler the page could not name stops the walk and is
  reported, so a parent is not answered alone; the listeners can be removed;
  and a marker naming no binding, an entry that is not a Message, or an
  entry for no event attribute each refuse the page.
- **Phase C, deferred boot:** a page planned to start on interaction has no
  runtime until the first event; what was typed before boot is in the Model
  after it and the input it was typed into is adopted, not rebuilt; the click
  that boots the page counts once, though the live page would have answered
  it too; an event at a handler the page could not name boots it and is
  answered by the live page alone, once, including an event no binding names;
  after boot the live page answers, not the markers; `'idle'` boots without an
  event. On the server a deferred plan is refused naming each Subscription,
  and each Managed Resource the sent Model asks for, that would start late,
  unless the plan declares it or Remote's part vouches for it.
