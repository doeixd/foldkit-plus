# A recommended AGENTS.md block

An application scaffolded with `create-foldkit-app` has an `AGENTS.md` that
points at `FOLDKIT.md` and ends in an empty **Project Notes** section, which
the scaffold leaves to the project. The block below fills it: the working rules
an agent on this stack needs every session, and the traps that cost the most
time in apps built on it. Paste it under **Project Notes**.

It holds rules and pointers, not explanations: each trap is one line, and the
depth stays in this skill's references, named by file. Keep it short, since an
agent reads all of it at the start of every session.

## Keeping it true

- Replace the `<…>` placeholders with the project's own scripts, and delete the
  trap groups for packages the app does not use.
- A trap that names an issue (`#210`) is there until that issue closes on
  doeixd/foldkit-plus. When it closes, check the line against the new release
  and delete it if it no longer holds.
- When a trap costs more than a few minutes, add one line for it under
  **Known traps**: what failed, and what to do instead. Point at the file that
  shows the fix.

## The block

````md
## Working rules

### Before writing code
- **Use what exists first.** Check the Foldkit Plus packages (the foldkit-plus
  skill's package table), then Foldkit, then the Effect ecosystem, before
  writing a helper. A hand-rolled cache, URL store or reducer is a second owner
  of a fact a package already owns.
- **Prefer Effect** for server and infrastructure work: `effect/http`
  (`HttpClient`), `Schema`, `Layer`, `Config`, `Redacted`, `Schedule`,
  `Duration`, `effect/persistence` (`KeyValueStore`). No ad-hoc fetch wrappers,
  retry loops, `process.env` reads or other validation libraries.
- **Check the installed API, not memory.** Read the `.d.mts` / `.d.ts` in
  `node_modules` (and the README shipped in the package) before using a call;
  `npx foldkit-plus docs <symbol or words>` finds the section and declaration.
  This is Effect 4, not 3, and Foldkit Plus is `0.x`: APIs move between
  minors. Unsure how a call behaves? Probe it in a scratch test first.

### Skills to load
- `foldkit-plus`: which package owns which state; read `SKILL.md`, then the
  reference for the package at hand (`references/<package>.md`) before
  changing code that uses it. New app: `references/greenfield.md`.
- Foldkit's skills (`foldkit`, `generate-program`, `audit-program`, from
  github.com/foldkit/foldkit `skills/`): Model, Message, update, Commands,
  Subscriptions. Read the scaffold's `FOLDKIT.md` first.
- An Effect skill, if one is installed, for services, errors and Layers.
- `docs/domain/` before changing the domain, if the project has one.

### How code is written here
- **State:** every Model change is a Message handled in `update`, written with
  `modifyFields` (`foldkit/struct`).
- **Absence:** `Option`, not `null` or `undefined`. Convert at the boundary
  that speaks null (JSON, a database, the DOM); a stored or sent Model uses
  `Schema.OptionFromNullOr`.
- **Tagged unions:** branch with the union's own `match` (a Message union,
  `RemoteData.match`, `Option.match`) or `Match.tagsExhaustive`. No ternary on
  `_tag`, no `switch` with a `default`. Construct variants through the union's
  constructors, never an object literal with `_tag`.
- **Typed references, not name strings:** a field ref (`App.model.todos`,
  `Post.fields.title`), the query, mutation or Surface value. A string is for
  the wire.
- **No casts** that promise what nothing enforces, and no `any`. A cast needed
  in app code is a gap in an API: file it.
- **No quiet fallbacks:** a missing input fails loudly, at definition time if
  it can; a `catch` never hides a programming error.

### Checking work
- After each unit of work: `<typecheck>`, `<lint>`, `<test>`, `<build>`, then
  re-read the diff. Commit small; fix what review finds in a follow-up commit.
- A claim about focus, layout or the pointer is a browser test: jsdom moves no
  focus and lays nothing out.
- A flaky test is a bug: reproduce it and fix the cause, never retry to green.
- Report only what was verified; say which checks were skipped or failed.

### Foldkit Plus itself
- A bug or gap in a package: work around it in the app with a comment naming
  the issue, and file it on doeixd/foldkit-plus. Never patch `node_modules`.

### Known traps on this stack
Foldkit and the Model
- Keep the root Model, Message and `update` in `src/main.ts`: the scaffold's
  lint reads a Message imported from `./app` as a child's.
- A no-op that returns `{ ...model }` renders the whole page; test `toBe(model)`.
- An `Option` compared with `=== undefined`/`=== null`, or put in `${…}`,
  compiles and is always wrong: grep for them after moving a value to `Option`.
- A URL a Command writes comes back as `UrlChanged` with the address the Model
  already shows: make that a no-op.
- A Mount reads its args once, at insert. Drive a DOM effect the Model causes
  (focus the next field) as a Command from the Message that changed it.
- Model fields named `Schema`, `optic`, `dependency`, `key`, `read`, `get`,
  `set`, `at`, `index` or `select` throw once a Surface reads the Model.

Effect 4
- Moved names: `Effect.result` (was `either`), `Effect.callback` (`async`),
  `Effect.timeoutOrElse` (`timeoutFail`); `Schema.Union([a, b])` and
  `Schema.Literals([...])` take arrays; no `effect/unstable/*` (import
  `effect/http`, `effect/sql`, `effect/rpc`, `effect/persistence`).
- `Effect.provide(layer)` closes the layer when that effect ends: join
  long-lived services with `Layer.provide`, or hold them in a `ManagedRuntime`.
- An Effect handed to `Effect.forever` is built once: wrap what must be asked
  again each pass in `Effect.suspend`.
- A label is `Words.of(schema)` (`foldkit-plus/entity`): a `title` set before a
  `.check(...)` is lost.

Styles (foldkit-plus/mixins)
- Two Slots' `attrs()` on one element keep one class: give each Slot its own element.
- `Defaults.reset` zeroes margins: a dialog centred by `margin: auto` restores it.
- In one style, write a shorthand or its longhands, never both: declarations
  are sorted, so `borderWidth` can land after `borderLeftWidth`.

Remote
- A Projection no active Surface reads stays `Initial` for good: check the
  Surface wiring before drawing `Initial` as a spinner.
- A `Query.make` list is invalidated by any change to its Entity; use
  `Query.define` for a list the client should place (#238).
- A write's answer must carry every field the page reads (derived counts,
  relations), or the row reverts or refetches (#226, #245).
- `Expr.input(...)` is a placeholder built once: compare it, never `input.x ? a : b`.

SSR
- Set `FOLDKIT_BUILD_ID` for every build, one value for client and server;
  without it `SSR.hydrate` contains the server's page instead of resuming it (#210).
- Give `SSR.entry` `styles` with the stylesheet and `Style.usedIn(rendered.html)`,
  or served pages flash unstyled. Import `foldkit-plus/ssr/client` in the browser.

Sync
- One storage name and `ReplicaId` per tab, never per user or token.
- A durable Message writes only the shared slice and returns no Commands: mint
  ids and timestamps in a Command first.

Workers, D1, Yielded Auth
- Build auth once per isolate (a `ManagedRuntime`), not per request, with
  `Operations.AuthenticationClock.layer({ futureToleranceMillis: 1000 })`.
- One request cannot wake another's stream: live updates re-read D1 inside the
  subscriber's request (polling), never an in-memory hub.
- Deploying publishes publicly: confirm the account and the Worker name, run
  Wrangler commands one at a time, and never print a secret.
````

Each trap's detail is in the reference for its package: [ssr.md](ssr.md),
[remote.md](remote.md), [sync.md](sync.md), [auth.md](auth.md),
[surface.md](surface.md), [mixins.md](mixins.md), [entity.md](entity.md).
