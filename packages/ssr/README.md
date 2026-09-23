# `foldkit-ssr`

Server rendering for a Foldkit application: render once on the server, hand the
browser the part of the Model it owns, and hydrate without running `init` a
second time.

**Status: in development, not published.** Built in phases from
[the plan](../../docs/design/ssr-PLAN.md). Phases 0 to 3 are done: a page
renders on the server, the browser takes it over from the handed-over Model,
and a plan is checked against the Surfaces the browser reads.

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
import { Projection } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

// Which part of the Model the browser owns. The rest starts from the
// baseline, by default the application's initial Model.
export const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count),
})

// On the server, per request.
const result = yield* SSR.render(config, Editor, { buildId, url: request.url, flags })
const html = SSR.page(template, result)

// In the browser, instead of Runtime.hydrate.
SSR.hydrate(config, Editor, { buildId })
```

`config` is the one you pass to `makeApplication`, the same on both sides.
`SSR.page` puts the envelope in the template, not in Foldkit's rendered HTML,
which `injectIntoTemplate` requires to hold only the root and its own payload.

## Startup Commands: `boot`

The browser does not run `init`, so the Commands `init` returns would run
nowhere. `SSR.render` refuses a plan that would drop them, naming them. Name
what the browser should run on load in `boot`:

```ts
const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft),
  boot: model => [LoadPreferences(model)],
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
  metadata (`remote data (User:u1)`). Resuming Remote's state is a later phase;
  until then, leave such a Surface out of `surfaces` or expect it refused;
- is activated differently, or reads something else, from the Model the browser
  starts from. This catches a `Surface.at` whose callback reads an unsent field.

A Surface's reads depend on the Model through its params, so the check runs
for the Model the server rendered. `SSR.inspect(plan, model)` returns the same
findings as data: what is sent, what is local, and for each Surface whether it
is active, where each read comes from (`state`, `local` or `missing`), and
whether the browser would activate it the same way.

## When a page is refused

On the server, `SSR.render` fails with `ResumeUnsafe`:

- `UndeclaredStartup`: `init` returned Commands and the plan has no `boot`.
- `Uncovered`: a Surface in `surfaces` reads or is activated by something the
  plan neither sends nor names `local`, as above.
- `ViewDependsOnUnsentState`: the view rendered from the browser's Model differs
  from the one served, so it reads a field the plan leaves out. Add the field to
  `state`, or stop the view reading it. In production Foldkit would silently
  rebuild that part of the page, so this is the one place it shows.

In the browser, `SSR.hydrate` checks, in Foldkit's order, the page's build id
and then its envelope. A page from another build is refused by Foldkit itself.
A page whose envelope cannot resume is refused the same way, with the reason
logged. A refused page is contained, never rendered again on the client. A page
with no server render at all starts on the client as usual.

The envelope's reasons, which `SSR.resume` returns as `ResumeRefused`:
`Missing` or `Duplicate` envelope, `Unreadable` JSON, another `Protocol`
version, another `Plan`, state that is `Invalid` for the plan's Schema, and a
`Route` other than the one the page was rendered for (path and query). A page
is never half-restored.

## The pieces underneath

`SSR.render` and `SSR.hydrate` are built from two smaller functions, usable on
their own:

```ts
const script = SSR.envelope(Editor, model, { route: '/posts?page=2' })
const resumed = SSR.resume(Editor, document, { route: '/posts?page=2' }) // Result
```

The envelope escapes `<` as Foldkit escapes its Flags, so no string in the
Model can close the script or open another. It also escapes U+2028 and U+2029.

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
