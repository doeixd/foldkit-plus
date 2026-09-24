# `foldkit-ssr`

Server rendering for a Foldkit application that hands the browser **the Model
the server reached**, not the inputs to rebuild it. `init` runs once, on the
server. The browser adopts the server's HTML and starts from the slice of the
Model it owns.

**In development, not published.** The API below is built and tested; it may
still change before a first release.

```ts
// Which part of the Model the browser owns.
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})

// Server: render, and write that slice into the page.
const html = SSR.page(template, await Effect.runPromise(SSR.render(config, Post, { buildId, url })))

// Browser: take the page over from the slice, without running init.
SSR.hydrate(config, Post, { buildId })
```

## Why you would use it

Foldkit already renders on the server. What its page carries is the **input**:
the Flags that produced the first Model, which the browser decodes and feeds to
`init` again. That is simple and right when `init` is cheap and its Flags are
small.

It stops being right when `init` does real work: it loads a post, reads a
session, computes something expensive. Then the browser either repeats that
work or has to receive everything `init` read, as Flags, including data the
page never shows. `foldkit-ssr` sends the **result** instead: the fields the
browser owns, and nothing else.

|                                 | Foldkit's own (`renderToString` + `Runtime.hydrate`) | `foldkit-ssr` (`SSR.render` + `SSR.hydrate`)                    |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| The page carries                | The Flags                                            | The plan's slice of the Model; no Flags                         |
| `init` runs                     | On the server, then again in the browser             | On the server only                                              |
| Server-only data                | Crosses if `init` needs it                           | Stays on the server unless the slice includes it                |
| A view that reads unsent state  | Rebuilt in the browser; only development warns       | Refused by `SSR.render`, naming the field, before it is served  |
| What you write                  | Nothing beyond the config                            | A plan                                                          |

Beyond the handover it offers three things you can adopt one at a time:
server-owned **static regions** that never render in the browser, **resumable
pages** that answer clicks and typing before the runtime has booted, and
**forms that work with scripts off**, answered by running `update` on the
server.

## What it owns, and what it does not

It owns **the handover**: which slice crosses, how it is written into the page,
and the checks that the browser can start from it.

- **Rendering and adoption stay Foldkit's.** `SSR.render` calls Foldkit's
  `renderToString` and `SSR.hydrate` calls `Runtime.hydrate`. Foldkit still
  refuses a page from another build and still adopts the server's nodes.
- **The Model stays the application's.** A plan names fields of it; it adds no
  state of its own, and every change after boot goes through `update`.
- **Data belongs to its package.** Remote's store crosses through Remote's own
  part (`Remote.resume`), which decides what to capture.

## The mental model

```text
server   init ──▶ Model ──┬── plan.state ──▶ slice ──▶ envelope   (JSON in the page)
                          └── view ──▶ HTML                        (checked, see below)

browser  envelope ──▶ baseline with the slice set on it ──▶ Model
         Model + the server's HTML ──▶ Runtime.hydrate adopts ──▶ plan.boot Commands
```

The one rule everything else serves: **the browser's first Model renders the
same page the server sent.** The browser's Model is the plan's baseline, by
default the application's `initial`, with the slice set onto it. So
`SSR.render` renders the view twice, once from the server's Model and once from
the browser's, and refuses the plan if the two differ. A view that reads a
field the plan does not send is caught there, on the server, instead of being
silently rebuilt in the browser.

## A first page

The examples in this README share one application, a post page, sketched [at
the end](#the-application-in-these-examples). `App` is its Surface application
from `foldkit-surface`, and `config` is what you would pass to
`makeApplication`, the same object on both sides.

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

What each call does:

- **`SSR.plan`** is a declaration. It does no I/O and holds no state. It
  throws only for a plan that could never work, such as two parts with one id.
- **`SSR.render`** is an Effect. It runs `init` once, renders the view twice,
  checks the plan, and returns the rendered application and the envelope
  script. It fails with `ResumeUnsafe` when the browser could not start where
  the server did; [the refusals](#when-a-page-is-refused) say why and how to
  fix each.
- **`SSR.page`** is pure: the template with the application and the envelope in
  it. The envelope goes before the template's last `</body>`, and a template
  without one is refused, by `SSR.page` and by `SSR.entry` when it is made.
- **`SSR.hydrate`** reads the envelope, starts Foldkit's runtime from the
  resumed Model, and runs the plan's `boot` Commands. `init` does not run. A
  page with no server render at all starts on the client as usual.

An application with Flags passes `flags` to `SSR.render`. They shape the
server's `init` and never reach the page.

### Commands `init` would have run: `boot`

The browser does not run `init`, so the Commands it returns would run nowhere.
`SSR.render` refuses a plan that would drop them, naming them. Say what the
browser runs on load in `boot`:

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

### The head is part of the view

`title`, `lang`, `dir`, `canonical` and `ogUrl` are checked like the body.
Since Foldkit 0.163 nothing gives `canonical` a default from the URL, so a page
that wants one derives it from the route in its Model, as it does its `title`,
and sends the route in `state`.

## Serving pages

### Through Foldkit's fetch handler

Foldkit's server entry is one function, `renderPage(request)`, which
`handleRequest` calls for every request that is not a static file, on Node and
on Workers alike. `SSR.entry` is that function for a plan:

```ts
import { handleRequest } from 'foldkit/experimental/server'

// The server entry.
export const { renderPage } = SSR.entry(config, Post, { buildId, template })

// A Worker, or any host that hands you a Web Request.
export default {
  fetch: (request: Request) => handleRequest(request, { renderPage, template }),
}
```

`GET` and `HEAD` render the page for the request's URL; an application with
Flags passes `flags: request => ...`. `POST` is handled only for a plan with a
[server fallback](#forms-that-work-without-scripts), and any other method is
answered `405`. A render that fails or throws, `flags` that reject, and a plan
the render refuses are answered `500` with the reason logged, never with a page
the browser could not resume.

The page comes back whole, as Foldkit's `Responded`, built by Foldkit's own
`toResponse`. A `Rendered` result has no room for the envelope, which is why
the entry takes the template itself, and why Foldkit's built-in `prerender`
cannot generate these pages; `SSR.generate` below does.
[foldkit#1448](https://github.com/foldkit/foldkit/issues/1448) asks Foldkit
for that room.

### At build time

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
`about/index.html`); a path ending in `.html` keeps its name. `origin` makes
each path the full URL a routing application parses, and `flags: path => ...`
gives each its own Flags. The pages come back in the order of `paths`, typed as
a tuple, so `const [home, about] = pages` needs no check.

A static host serves one file for every query, and for `/about` and `/about/`
alike, so a generated page records its path alone: `/about?ref=mail` resumes
the page generated for `/about`, and `/other` is refused. A server-rendered page
records its path and query, and resumes only there.

## Checking what the browser will read

The view check sees what the first render shows. A Surface can read a field the
first view never shows: a like button's state, a menu's contents. Name the
Surfaces the browser may activate, and the fields that may start from the
baseline on purpose:

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.post.id, App.model.post.liked),
  local: [App.model.menuOpen], // starts from the baseline, on purpose
  surfaces: [
    Surface.when(PostActions, App.model.route, AppRoute.Post, route => ({ id: route.id })),
    Surface.at(Menu, undefined),
  ],
})
```

`SSR.render` then refuses the plan, naming the Surface and the field, when an
active Surface reads a field that is in neither `state` nor `local`, is
activated by one, reads data no part of the plan resumes, or would activate
differently from the Model the browser starts from. The check runs for the
server's Model, because a Surface's reads follow its params.
`SSR.inspect(plan, model)` returns the same findings as data, for a test or a
debugging session: for each Surface, whether it is active, and where each read
comes from, `state`, `local` or `missing`.

## State the slice cannot carry

### Parts: another package's state

Some state is not a field to pick. Remote's normalized store holds whatever the
server read, most of which the page never shows. A **part** is a package's own
contribution to the envelope: it captures what the plan's active Surfaces read,
and restores it in the browser.

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
nothing else of the store. The browser requests none of it again, and the
coverage check counts those reads as sent. Every part the plan names must be in
the page and restore, or the page is refused whole. The server restores each
part from its own capture before serving, so a part that could not is refused
there (`UnrestorablePart`), not in a user's browser.

### Static regions: parts of the page the server owns

An article body, a product description, highlighted code: a part of the page no
Message changes need not render in the browser at all, and what it reads need
not be sent. Mark it with `SSR.static`:

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

The region renders once, on the server, with Foldkit's inert builder, so it
cannot attach a handler. The browser adopts the server's markup as it is and
never runs the render, so this plan sends neither `post.title` nor `post.body`
and the view check still passes. A region changes only with a new document;
content a Message should change belongs in a Surface. A region the browser
needs that is not in the page, say after a Message shows one, is logged and
rendered in the browser.

## Resumable pages: answering before the runtime boots

Everything above boots Foldkit's runtime as soon as the page loads. A resumable
page waits: it answers clicks and typing from the server's markup, and boots
only when it must, so the first interaction does not wait for the application's
code to start.

```text
server   each handler ──▶ its Message, encoded ──▶ a marker on the element + an entry in the envelope

browser  event ──▶ the markers name its Messages ──▶ queued ──▶ the runtime boots
                                                             ──▶ the queue replays through update
```

It rests on the fact that a Foldkit handler is already a Message value.
`Resume.builder(h)` is `h` that writes those values into the server's markup:

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

`rh` differs from `h` in one place: `OnInput`, `OnChange`, `OnKeyDown` and
`OnKeyUp` also take a Message's own constructor, and the event fills the field
it leaves open. The types check it where it is written: the member must be one
of the view's Messages, and leave exactly one string field, or exactly `key`
and `modifiers`. A closure still works. It is not data, so the page cannot
answer that event itself and boots on it instead, letting the live page answer.
So does a hole form whose field has checks the empty placeholder fails, such
as `Schema.isMinLength(1)`: it cannot be written into the page as data, so it
is treated as a closure.

A Surface renderer gets the same builder through `Resume.view`, and its `rh`
makes only that Surface's Messages:

```ts
const LikeView = Surface.rootView(
  Like,
  undefined,
  Resume.view((like, rh) => rh.button([rh.OnClick(Message.Liked({ id: like.id }))], ['Like'])),
)
```

Then say when the runtime starts:

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.post),
  surfaces: [PostActionsAt],
  start: 'on-interaction', // or 'idle'; 'now', the default, boots on load
})
```

The event that boots the page is not lost and does not count twice. Messages
answered before boot replay in order through the same `update`, so the Model
ends where an eager boot would have taken it, and the input typed into is
adopted, not rebuilt.

### What a resumable page must declare

- **Its Surfaces.** A Surface's `messages` list is what the page may dispatch
  before boot. A binding whose Message no active Surface lists is refused on
  the server, naming the element and the Message, and the browser refuses a
  page that carries one.
- **What may start late.** A Subscription or Managed Resource that starts at
  boot starts later on a deferred page, which can change what the application
  does. `SSR.render` refuses a deferred plan while one would be active,
  naming each, until the plan declares it:

  ```ts
  const Post = SSR.plan(App, {
    id: 'post',
    state: Projection.pick(App.model.post),
    parts: [Remote.resume(Data)], // Remote's entries may start late; its part says so
    start: 'idle',
    deferrable: ['tick'], // this application's own clock may start late
  })
  ```

  For the check to see them, pass the application's `subscriptions` and
  `managedResources` in the config given to `SSR.render`, as you would to
  Foldkit. `boot` Commands run at boot, so a deferred page's `Mirror.kv`
  restore waits for the first interaction.

### Bundles whose code loads on demand

A `Bundle.lazy` from `foldkit-bundle` keeps a bundle's `update` and `view` out
of the boot chunk. Name each in the config's `lazy` list:

```ts
const config = {
  Model,
  init: () => placements.init({ title: 'Uploads', upload }),
  update: placements.update(),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return { title: model.title, body: rh.main([], [PlacedUpload.view(model, rh)]) }
  },
  container: null,
  subscriptions: placements.subscriptions(),
  lazy: [Upload],
}
```

The server loads the code before it renders, so the page carries the real
view. The browser loads it before it boots and answers from the markers
meanwhile, whatever `start` says. A binding inside a placement dispatches the
parent's Message, as Foldkit's own handlers do, so the plan's Surface lists the
wrapper variant, `Message.GotUploadMessage`.

## Forms that work without scripts

A form whose `OnSubmit` names a Message can be answered by the server, before
any script has run or with scripts blocked, because `update` is pure and the
server can run it. The plan opts in:

```ts
const Todos = SSR.plan(App, {
  id: 'todos',
  state: Projection.pick(App.model.draft, App.model.todos),
  surfaces: [Surface.at(TodoList, undefined)],
  fallback: 'server',
})
```

```ts
rh.form(
  [rh.OnSubmit(Message.Added({ title: model.draft }))],
  [rh.input([rh.Name('title'), rh.Value(model.draft), rh.OnInput(Message.Typed)])],
)
```

With scripts on, nothing changes: the page answers the submit and the form
never posts. Without them, the server wrote the form to post the Message to the
page's own URL, and `SSR.entry` hands that post to `SSR.handle`:

```text
POST ──▶ decode the Message ──▶ set the posted fields into it (the typed `title`)
     ──▶ init, then boot and its Commands ──▶ update, and every Command after it
     ──▶ the page, rendered
```

The Message must be one the page's active Surfaces list. Commands run under the
config's `resources` Layer, as Foldkit's runtime would provide them. A post the
server cannot use is answered `400` with the reason (`FallbackRefused`); a
Command that fails is answered `500`. The browser's loop runs for the life of
the page, so a Command that reschedules itself, a poll or a tick, is ordinary
there; on the server a post that has not settled within 100 Messages and
Commands is answered `500`, naming the last Command. `SSR.handle(request,
config, plan, { buildId, flags? })` can also be called from an entry of your
own.

## When a page is refused

A refusal never shows a user a half-working page. On the server it is an error
before anything is served; in the browser the page is contained, as Foldkit
contains a page from another build, and the reason is logged.

On the server, `SSR.render` fails with `ResumeUnsafe`, whose `reason` is one
of:

| `reason`                   | What it means                                                                 | The fix                                                             |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ViewDependsOnUnsentState` | The view, or its head, renders differently from the browser's Model           | Add the field the message names to `state`, or stop the view reading it |
| `UndeclaredStartup`        | `init` returned Commands and the plan has no `boot`                           | Name them in `boot`                                                  |
| `Uncovered`                | An active Surface reads or is activated by an unsent field, or a binding sends a Message no active Surface lists | Send the field, name it `local`, or list the Message on the Surface |
| `UnrestorablePart`         | A part cannot restore its own capture                                          | A bug in that part                                                   |
| `DuplicateStaticRegion`    | Two `SSR.static` regions share an id                                          | Give each its own id                                                 |
| `BindingInStaticRegion`    | A handler inside an `SSR.static` region                                        | Move the element out, into a Surface                                 |
| `UndeclaredSurfaces`       | The page has bindings and the plan no `surfaces`                              | Name the Surfaces the page may activate                              |
| `UnencodableBinding`       | The plan has no Message Schema, or a binding's Message does not encode through it | Make the plan from the application; build the Message with its constructor |
| `EagerStartRequired`       | A deferred plan would start a Subscription or Managed Resource late           | Declare it in `deferrable`, or start `'now'`                         |
| `UngeneratablePath`        | `SSR.generate` was given a path no file can be served at                      | Leave out the query and fragment; keep paths to distinct files      |

In the browser, `SSR.hydrate` checks in Foldkit's order: the build id first,
then the envelope. `SSR.resume` returns the envelope's refusal as
`ResumeRefused`: `Missing` or `Duplicate` envelope, `Unreadable` JSON, another
`Protocol` version or `Plan`, state, parts or bindings that are `Invalid`, or a
`Route` other than the one the page was rendered for. A page is resumed whole or
not at all.

## Costs and limits

- **`SSR.render` renders the view twice.** That is the view check. A static
  region's render runs once.
- **`SSR.hydrate` relies on how Foldkit hydrates today.** It gives Foldkit a
  config whose `init` returns the resumed Model, and removes the `Flags` key,
  which Foldkit would otherwise require a payload for. The tests pin both, and
  fail the day Foldkit changes.
  [foldkit#1449](https://github.com/foldkit/foldkit/issues/1449) asks whether
  Foldkit would support this directly.
- **A resumable page leans on three Foldkit behaviours,** each pinned by a test
  here and two by Foldkit's own: the first patch removes attributes the
  browser's view does not assert, a control's value is re-asserted to the
  Model's, and `Runtime.hydrate` renders its first frame before it returns.
- **Development is not production.** Under Vite's dev server, Foldkit's model
  preservation restores the previous Model after a reload and skips adoption.
- **A closure handler makes its event wait for boot,** with no warning yet
  naming the element.

## Lower-level API

`SSR.render` and `SSR.hydrate` are built from pieces usable on their own:

- **`SSR.envelope(plan, model, { route? })`** returns the envelope script for a
  Model, and **`SSR.resume(plan, document, { route? })`** reads it back as a
  `Result`. The envelope escapes `<` as Foldkit escapes its Flags, and U+2028
  and U+2029, so no string in the Model can close the script.
- **`SSR.inspect(plan, model)`**: the plan's coverage as data.
- **`Resume.bindings(plan, document, root, model)`** decodes and checks a
  page's bindings, and **`Resume.listen(root, { bindings, onAnswer })`**
  answers events from the markers, one `{ event, messages, unnamed? }` per
  event. `SSR.hydrate` uses both; they are there for a custom boot.
- **Attribute names**, for tools and tests: `RESUME_ATTRIBUTE` (the envelope
  script), `STATIC_ATTRIBUTE`, `BINDING_ATTRIBUTE` (a prefix, followed by the
  event), `SLOT_ATTRIBUTE` (a placement's root while the server renders) and
  `FALLBACK_FIELD` (the posted Message).

## The application in these examples

A post page. `App` is `Surface.application({ Model, Message, initial, update
})`. The Surfaces (`PostActions`, `Menu`, `Like`), `Data` (a `Remote.make`
domain over `App.model.remote`) and `LoadPreferences` (a `Command.define`) are
the application's own. `PostActionsAt` and `PostPageAt` are Surfaces placed
for a plan, as `Surface.when(PostActions, App.model.route, AppRoute.Post, route
=> ({ id: route.id }))` places one in
[the coverage example](#checking-what-the-browser-will-read).

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

## See also

- [The implementation plan](../../docs/design/ssr-PLAN.md): the decisions and
  why, phase by phase.
- [What the tests prove](./test/README.md).
- [What this package asks of Foldkit](../../docs/upstream-foldkit-ssr.md).
