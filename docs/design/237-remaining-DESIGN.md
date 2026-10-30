# What #237 left open

Status: designed 2026-10-30. Builds on `237-diagnostics-DESIGN.md`, whose
channel (`Diagnostics.report` into the `Diagnostics.Reporter` in context) is
unchanged. Six items were open on 2026-10-29; each was checked against HEAD
before this was written.

| Item | At HEAD | Decision |
| --- | --- | --- |
| `MountFailed` reaching the application's reporter | Always the default log | A DOM event an application claims: build |
| Sync's `journalChanges` failing silently | A dead subscribe fiber or a throwing listener stops notices, unreported | Report both, keep notifying past a listener: build |
| `Theme.make` naming the option | A bare `SchemaError` without the knob or the call | A `DiagnosticError` naming both: build |
| A quieter browser default in production | Same default everywhere | `Diagnostics.quiet`, chosen by the application: build; no sniffed default |
| A development overlay | None | A Mount in `foldkit-mixins`, opted into: build |
| Reading the compiled build id | `SSR.hydrate` needs `buildId` | Upstream Foldkit: document |

## 1. Mount failures reach the application's reporter

### At HEAD

Foldkit forks every Mount with `Effect.runForkWith(capturedContext)`, the
runtime's context captured once at boot (`foldkit/dist/runtime/runtime.js`,
`html/index.js`'s `acquireMount`). The application's `resources` Layer is
provided only to Commands, Subscriptions and Flags (`resourceProvider.js`'s
`provideAllResources`), and `Runtime.run`, `hydrate` and `embed` take no
context of their own. So `Diagnostics.report` inside a Mount always finds the
default reporter, and an application's sink never hears `MountFailed`.

### Decision

The browser is the route a Mount has: its element. Code that runs without the
application's context hands a diagnostic to the document as an event the
application may claim.

```text
Mount fails ── Diagnostics.dispatch(element, d) ── 'foldkit-diagnostic' event, bubbling
                                                       │
           claimed (defaultPrevented) ◀── listener installed by Diagnostics.layer(report)
                                          └─ report(d), with the application's reporter
           unclaimed ──▶ Diagnostics.report(d): the reporter in context (the default log)
```

- `Diagnostics.dispatch(target, diagnostic): Effect<void>` dispatches a
  `DiagnosticEvent` (bubbling, composed, cancelable) at `target`, or at its
  document when the element has left it, since a detached element's event
  reaches nobody. When no listener claims it, it reports through
  `Diagnostics.report`, so nothing is lost when no application listens.
- `Diagnostics.layer(report): Layer<never>` provides the reporter and, where
  there is a `document`, adds a listener for its scope that claims each
  unclaimed `DiagnosticEvent` and reports it through `report`. One call gives
  an application's resources both. `Layer.succeed(Diagnostics.Reporter, …)`
  still works for Effect code; it does not hear Mounts.
- The mixins resolver reports `MountFailed` with `Diagnostics.dispatch` at the
  Mount's element in place of `Diagnostics.report`.

Only events built by `foldkit-surface`'s own `DiagnosticEvent` class are
claimed (`instanceof`): any script on the page can dispatch an event named
`foldkit-diagnostic`, and its `detail` would otherwise reach the
application's sink (telemetry) unchecked.

### Limits, stated in the docs

- Foldkit builds `resources` when the first Command or Subscription runs
  (before `init` when the application has Flags). A Mount that fails before
  that is unclaimed and goes to the default log.
- Two runtimes in one document both listen on the document; the first to
  have built its resources claims every event, its own or the other's.

### Rejected

- **A module-level reporter** (`Diagnostics.setDefault`). Global state shared
  by every runtime and every test in a file, and nothing to undo it.
- **A Message from the Mount.** The resolver is generic in the Message; the
  application would have to name a Message for each slot's failures, and
  `update` is not where a sink belongs.
- **Waiting for Foldkit** to run Mounts with `resources`. That is still the
  better fix, and `Diagnostics.layer` keeps working when it lands: the Mount's
  `Diagnostics.report` path would simply find the application's reporter.

## 2. Sync's `journalChanges`

`journalChanges` forks `Stream.runForEach(journal.subscribe, listener)` with
`Effect.runFork` and keeps only the fiber to interrupt. Two ways stop every
later notice with no word: the journal's stream dies (its type says it fails
only by defect), or the listener throws (`serveSocket`'s `send` on a socket
that just closed), which dies the fiber.

Decision: `journalChanges(journal, documentId, { diagnostics })`:

- A listener that throws is reported as `ListenerFailed { site: 'Notice' }`
  and the next commit still calls it. The site joins `Presence` and `Socket`.
- The subscription ending with any cause but the unsubscribe's interrupt is
  reported as `HostDefect { stage: 'Changes' }`: "the journal's commit stream
  broke; this connection hears of no more commits". An end with no cause
  (the journal closed) is the host shutting down, not a failure.
- `serveJournal` passes its `diagnostics` on. The fiber runs outside any
  context, so the option is the only way a host's reporter reaches it, as for
  the existing `Notice` stage.

## 3. Configuration refusals name the option

`Theme.make`, `Theme.set` and `Knobs.withValue` decode each value with
`Schema.decodeUnknownSync(knob.schema)`, which throws `SchemaError(Expected a
value between 6 and 36 at ["dark"])`: neither the knob nor the call. An
unknown group or knob throws a plain `Error`.

Decision: each throws `foldkit-mixins`' `DiagnosticError` (as `theme:fluid-range`
already does) with a new code:

- `theme:knob-value`: `Theme.make: surface.lightness is out of range: Expected
  a value between 6 and 36 at ["dark"]. surface.lightness takes a number from 6
  to 36 (or { light, dark } of them).` The control's range is read from the
  knob (`knob.control`), so the message states what it takes; `details`
  holds `{ knob, value }`.
- `theme:unknown-knob`: `Theme.make: no knob "surface.lightnes".`

The call is named (`Theme.make`, `Theme.set`, `Knobs.withValue`), since a
theme is usually built at module load, where the stack shows only the module.

Rejected: **a branded range type** (the issue's "ideally a type error").
TypeScript cannot compare number literals with a bound, so a brand would make
every value go through a constructor, which can only check at run time: the
same moment `Theme.make` checks now, with more ceremony. A choice outside its
options is already a type error.

## 4. A quieter browser default in production

No package here reads a build mode, and there is no portable way to: Vite
replaces `import.meta.env.DEV`, other bundlers `process.env.NODE_ENV`, and
`import.meta.env` is undefined under tsx (a trap recorded in `AGENTS.md`).
A default sniffed from either would be wrong in one of the setups this
repository runs, and quietly so. `docs/errors.md` also promises that
development and production report the same.

Decision: the default stays. The quiet choice is a named value the
application picks where it already knows its mode:

```ts
resources: Diagnostics.layer(import.meta.env.DEV ? overlay.report : Diagnostics.quiet)
```

`Diagnostics.quiet` logs errors as `Diagnostics.log` does and drops warnings,
which tell a developer to change something and mean nothing to a visitor.
Errors stay: they are what a bug report needs.

## 5. A development overlay

The issue asks for one "through the Foldkit devtools". Foldkit's devtools
(`foldkit/devtools-host`) record Messages, Models and Mounts; they offer no
panel for another package. So the overlay is a Mount the application draws in
development, in `foldkit-mixins`, beside its other Mounts:

```ts
import { DevOverlay } from 'foldkit-mixins'

const overlay = DevOverlay.make() // holds the newest 50 diagnostics

// resources
Diagnostics.layer(overlay.report) // shown, then logged (`next`, default Diagnostics.log)
// view, in development only
h.div([h.OnMount(overlay.mount)], [])
```

- `overlay.report` keeps each diagnostic and passes it to `next`. Since
  `Diagnostics.layer` also claims Mount failures, the overlay lists those too.
- `overlay.mount` draws the list into a shadow root on its element: a fixed
  panel at the bottom corner, a count, each diagnostic's source, tag, level
  and message, and a Clear button. A shadow root keeps the application's
  styles out and Foldkit's patches away (it owns the element's light DOM
  only). It draws nothing while there is nothing to show.
- Diagnostics reported before the Mount is drawn are kept, so a failure at
  boot shows once the panel is drawn.
- It sends no Message. Per the trap "A Mount that sends no Message must not be
  on by default", it is never drawn unless the application draws it, and the
  docs say to draw it behind the application's development flag.

It does not style through tokens: a development tool must read the same
whatever theme, or none, the page installs. It uses system colours
(`Canvas`, `CanvasText`) and `color-scheme: light dark`.

## 6. The compiled build id

Foldkit 0.169 compiles the id into `dist/buildToken.js` as `injectedBuildId`,
and its own `Runtime.hydrate` falls back to it (`buildIdOrInjected`). It is
marked `@internal`, and `foldkit`'s `exports` map has no subpath reaching it,
so `SSR.hydrate`, which compares the page's id with the client's before
adopting anything, cannot read it. Upstream: export the compiled id (for
example `Runtime.buildId`). Until then `SSR.hydrate` takes `buildId` and
reports `PageContained { reason: 'NoBuildId' }` without one, as at HEAD.

## Tests

- Surface: `dispatch` claimed and unclaimed, a detached target, an event of
  another class not claimed, `layer`'s listener removed with its scope,
  `quiet`. Mutation spec for each.
- Mixins: `MountFailed` claimed by `Diagnostics.layer` on a real runtime
  (`embed`), and unclaimed to the default reporter.
- Sync: a throwing listener reported and called again; a dying stream
  reported; unsubscribe and a closed journal reported as nothing.
- Theme: the messages and codes of each refusal, through `make`, `set` and
  `withValue`.
- Overlay: a browser test drawing it on a real runtime, a failing Mount and a
  reported diagnostic listed, Clear, and nothing drawn when empty.
