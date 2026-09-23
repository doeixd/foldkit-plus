# foldkit-ssr

**In development and unpublished.** Phases 0–4 of its plan are built: render on
the server, the browser takes the page over without rerunning `init`, a plan is
checked against the Surfaces the browser reads, and `SSR.static` regions belong
to the server alone.

## What it owns

Only the handover from a server render to the browser. Rendering to HTML and
adopting it stay Foldkit's (`foldkit/experimental/server`, `foldkit/runtime`);
`foldkit-ssr` calls them. It adds a **resume plan**: which slice of the Model
crosses, as a JSON script read back through the slice's own Schema. `init`
runs once, on the server; nothing outside the slice crosses, Flags included.

## Basic use

```ts
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count), // what the browser owns
  // baseline defaults to App.initial; boot: model => Commands to run on load
  local: [App.model.menuOpen], // may start from the baseline
  surfaces: [Surface.at(EditorToolbar, undefined)], // checked against state + local
})

// server
const result = yield* SSR.render(config, Editor, { buildId, url, flags })
const html = SSR.page(template, result)

// browser, instead of Runtime.hydrate
SSR.hydrate(config, Editor, { buildId })
```

## Gotchas

- `init`'s Commands never run on a resumed page. `SSR.render` fails with
  `ResumeUnsafe` `UndeclaredStartup` until the plan names them in `boot`. A
  `foldkit-bundle` app (`Mirror.kv` restore): `boot: model => assembly.init(model).commands ?? []`.
- A view that reads a field outside `state` fails with `ResumeUnsafe`
  `ViewDependsOnUnsentState`. Add the field to `state` or stop reading it.
- A Surface in `surfaces` that reads or is activated by a field in neither
  `state` nor `local`, reads Remote data (no resume part for it yet), or
  activates differently from the browser's Model fails with `Uncovered`.
  `SSR.inspect(plan, model)` shows each read's cover. The check runs for the
  server's Model, since a Surface's reads follow its params.
- `SSR.static('id', ih => [...])` in a view: rendered once on the server with
  the inert builder (no handlers), adopted as trusted `InnerHTML` in the
  browser, never rendered there, so what it reads need not be in `state`. It
  changes only with a new document; anything a Message changes belongs in a
  Surface. Duplicate ids fail with `DuplicateStaticRegion`.
- In the browser a page from another build, or whose envelope cannot resume
  (`ResumeRefused`: `Missing`, `Duplicate`, `Unreadable`, `Protocol`, `Plan`,
  `Invalid`, `Route`), is contained with the reason logged, never re-rendered.
- The route check compares path and query with the URL the server rendered.
- `Projection.pick` refuses two fields with the same last key (`post.id` and
  `viewer.id`), which would otherwise merge into one.
- Lower level: `SSR.envelope(plan, model, { route? })` and
  `SSR.resume(plan, document, { route? })`. The envelope goes in the template,
  not in Foldkit's rendered HTML.
