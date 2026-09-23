# `foldkit-ssr`

Server rendering for a Foldkit application: render once on the server, hand the
browser the part of the Model it owns, and hydrate without running `init` a
second time.

**Status: in development, not published.** Built in phases from
[the plan](../../docs/design/ssr-PLAN.md). Phases 0, 1 and 2 are done: a page
renders on the server and the browser takes it over from the handed-over Model.

## What it owns

Only the handover. Rendering to HTML and adopting it in the browser are
Foldkit's own (`foldkit/experimental/server` and `foldkit/runtime`), and this
package calls them rather than replacing them. What it adds is a **resume
plan**: which slice of the Model crosses from the server to the browser,
written into the page as a JSON script and read back through the slice's own
Schema.

Foldkit's own server rendering runs `init` on both sides and sends the Flags
that produced the page so the browser can. With a resume plan, `init` runs once,
on the server, and the browser starts from the slice it was sent. Nothing else
crosses: not the Flags, and not a field the plan leaves out.

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

## When a page is refused

On the server, `SSR.render` fails with `ResumeUnsafe`:

- `UndeclaredStartup`: `init` returned Commands and the plan has no `boot`.
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
