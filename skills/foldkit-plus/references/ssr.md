# foldkit-ssr

**In development and unpublished.** Phases 0 and 1 of its plan are built; the
browser does not yet start from the handed-over Model.

## What it owns

Only the handover from a server render to the browser. Rendering to HTML and
adopting it stay Foldkit's (`foldkit/experimental/server`, `foldkit/runtime`);
import those directly. `foldkit-ssr` adds a **resume plan**: which slice of the
Model crosses, as a JSON script read back through the slice's own Schema.

## Basic use

```ts
import { Projection } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count), // what the browser owns
  // baseline defaults to App.initial; boot: model => Commands to run on load
})

const script = SSR.envelope(Editor, model) // server: write into the page template
const resumed = SSR.resume(Editor, document) // browser: Result<Model, ResumeRefused>
```

## Gotchas

- `SSR.resume` refuses with a `reason`: `Missing`, `Duplicate`, `Unreadable`,
  `Protocol`, `Plan` or `Invalid`. A page is never half-restored.
- Nothing outside `state` crosses. A field the view reads that is not in the
  slice starts from the baseline in the browser.
- `Projection.pick` refuses two fields with the same last key (`post.id` and
  `viewer.id`), which would otherwise merge into one.
- The envelope script goes into the page template, not into Foldkit's rendered
  HTML: `injectIntoTemplate` accepts only the root and its own payload there.
