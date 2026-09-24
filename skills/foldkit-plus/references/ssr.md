# foldkit-ssr

**In development and unpublished.** Phases 0–6, U and R of its plan are built:
render on the server or at build time (`SSR.generate`) and serve through
Foldkit's `handleRequest` (`SSR.entry`), the browser takes the page over
without rerunning `init`, a plan is checked against the Surfaces the browser
reads, `SSR.static` regions belong to the server alone, and Remote's data
crosses through `parts`. Resumable pages are in progress: `Resume.builder(h)`
and `Resume.view(render)` mark bindings, `Resume.listen` answers them before
boot, a plan's `start` defers the boot, and a page dispatches only what its
Surfaces list; a server fallback for forms is not built yet.

## What it owns

Only the handover from a server render to the browser. Rendering to HTML and
adopting it stay Foldkit's (`foldkit/experimental/server`, `foldkit/runtime`);
`foldkit-ssr` calls them. It adds a **resume plan**: which slice of the Model
crosses, as a JSON script read back through the slice's own Schema. `init`
runs once, on the server; nothing outside the slice crosses, Flags included.

## Basic use

```ts
import { Effect } from 'effect'
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
const result = await Effect.runPromise(SSR.render(config, Editor, { buildId, url }))
const html = SSR.page(template, result)

// browser, instead of Runtime.hydrate
SSR.hydrate(config, Editor, { buildId })
```

## Gotchas

- `init`'s Commands never run on a resumed page. `SSR.render` fails with
  `ResumeUnsafe` `UndeclaredStartup` until the plan names them in `boot`. A
  `foldkit-bundle` app (`Mirror.kv` restore): `boot: model => assembly.init(model).commands ?? []`.
- A view that reads a field outside `state` fails with `ResumeUnsafe`
  `ViewDependsOnUnsentState`, in its body or its head (`title`, `lang`, `dir`,
  `canonical`, `ogUrl`). Add the field to `state` or stop reading it. Foldkit
  0.163 gives `canonical` no default: derive it from the route in the Model.
- A Surface in `surfaces` that reads or is activated by a field in neither
  `state` nor `local`, reads Remote data no part resumes, or activates
  differently from the browser's Model fails with `Uncovered`.
- `parts: [Remote.resume(Data)]` sends what the active Surfaces read from
  Remote's store (fields through relations, connection boundaries, live
  cursors) and nothing else; the browser refetches none of it. A part that
  cannot restore its own capture fails with `UnrestorablePart`; a page missing
  a part, or carrying an unknown one, is refused (`Invalid`).
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
- A Surface renderer: `Surface.rootView(S, params, Resume.view((m, rh) => ...))`;
  `rh` makes only the Surface's Messages. No cast: the builder is generic over
  the `h` it is given.
- `const rh = Resume.builder(h)` in a view: `h` plus hole forms,
  `rh.OnInput(Message.ChangedSearch)`, `rh.OnChange(Message.Renamed, { id })`,
  `rh.OnKeyDown(Message.Pressed)`; the member must leave one string field (or
  `key` and `modifiers`), checked by the types. The server marks each
  element's event with every binding's ordinal in the order Foldkit chains
  them (`data-foldkit-plus-on-click="0 1"`), `*` for a handler it cannot
  describe (a closure, `OnKeyDownPreventDefault`), and writes each binding's
  Foldkit attribute and encoded Message into the envelope. A binding built
  from an unsent field fails with `ViewDependsOnUnsentState`; the plan needs
  the app's Message Schema (make it from `App`), else `UnencodableBinding`.
- A Surface's `messages` is the allow list for the page's bindings. A binding
  whose Message no Surface active for the served Model lists is `Uncovered`
  (naming element and tag); bindings with no `surfaces` in the plan are
  `UndeclaredSurfaces`; a handler inside `SSR.static` (only a nested `rh` can
  put one there) is `BindingInStaticRegion`.
- In the browser, `Resume.bindings(plan, document, root, model)` decodes the
  page's bindings, keeps them to what the active Surfaces list, and checks
  its markers (a `ResumeRefused` otherwise), then
  `Resume.listen(root, { bindings, onAnswer })` gives each event one answer,
  `{ event, messages, unnamed? }`: the Messages its bindings dispatch in
  Foldkit's order, and at a `*` the element it stopped at. It returns the
  function that removes the listeners. `SSR.hydrate` uses both itself.
- `start: 'idle' | 'on-interaction'` on the plan (default `'now'`) makes
  `SSR.hydrate` answer from the markers and boot on the first event or when
  idle. The booting event counts once: a completed answer is queued, replayed
  after boot and stopped; one that met a `*` goes on to the live page. On the
  server such a plan is refused (`EagerStartRequired`) naming each
  Subscription, and each Managed Resource the sent Model asks for, that would
  start late, unless `deferrable: ['key']` names it or a part vouches for it
  (`Remote.resume` does for Remote's entries). Pass the app's `subscriptions`
  and `managedResources` in the config given to `SSR.render` so the check sees
  them.
  A helper that takes the builder is typed `ResumableBuilder<Message>`
  (`import type { ResumableBuilder } from 'foldkit-ssr'`); it is the only
  builder type the package exports.
- `SSR.generate` returns pages as a tuple of `paths`: `const [home, about]`.
- `SSR.entry(config, plan, { buildId, template, flags? })` returns the
  `{ renderPage }` a Foldkit server entry exports for `handleRequest`. `GET`
  and `HEAD` render; other methods get `405`; a refused, failed or throwing
  render, or `flags` that reject, get `500` with the reason logged. It answers `Responded`, since a `Rendered` result
  has no room for the envelope.
- The route check compares path and query with the URL the server rendered.
  A page from `SSR.generate(config, plan, { buildId, template, origin, paths })`
  records its path alone, since a static host ignores the query: it resumes at
  `/about?ref=x` or `/about/`, not at `/other`. Each result has `file`
  (`about/index.html`) and `html` to write.
- `Projection.pick` refuses two fields with the same last key (`post.id` and
  `viewer.id`), which would otherwise merge into one.
- Lower level: `SSR.envelope(plan, model, { route? })` and
  `SSR.resume(plan, document, { route? })`. The envelope goes in the template,
  not in Foldkit's rendered HTML.
