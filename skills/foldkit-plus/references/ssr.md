# foldkit-ssr

**In development and unpublished.** Phases 0–2 of its plan are built: render on
the server, and the browser takes the page over without rerunning `init`.

## What it owns

Only the handover from a server render to the browser. Rendering to HTML and
adopting it stay Foldkit's (`foldkit/experimental/server`, `foldkit/runtime`);
`foldkit-ssr` calls them. It adds a **resume plan**: which slice of the Model
crosses, as a JSON script read back through the slice's own Schema. `init`
runs once, on the server; nothing outside the slice crosses, Flags included.

## Basic use

```ts
import { Projection } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count), // what the browser owns
  // baseline defaults to App.initial; boot: model => Commands to run on load
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
- In the browser a page from another build, or whose envelope cannot resume
  (`ResumeRefused`: `Missing`, `Duplicate`, `Unreadable`, `Protocol`, `Plan`,
  `Invalid`, `Route`), is contained with the reason logged, never re-rendered.
- The route check compares path and query with the URL the server rendered.
- `Projection.pick` refuses two fields with the same last key (`post.id` and
  `viewer.id`), which would otherwise merge into one.
- Lower level: `SSR.envelope(plan, model, { route? })` and
  `SSR.resume(plan, document, { route? })`. The envelope goes in the template,
  not in Foldkit's rendered HTML.
