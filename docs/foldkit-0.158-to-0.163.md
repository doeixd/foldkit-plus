# Foldkit 0.158.0 to 0.163.0: what changed

Status: the upgrade guide below was carried out on 2026-09-23; the workspace
now pins `foldkit@0.163.0`. The document is kept as the record of what changed
and why each step was taken. It was written when the workspace pinned
`foldkit@0.158.2` and upstream was at `0.163.0` (published 2026-09-20). This document has three parts: every upstream change between those
versions, what each one means for this repo's code and for its docs and
design plans, and a step-by-step upgrade guide.

Sources: the published release notes for `foldkit@0.159.0` through
`foldkit@0.163.0`, and a diff of the shipped `.d.ts` files between the two
npm tarballs. Version numbers in parentheses say which release introduced a
change. The 0.158.1 and 0.158.2 patches only republished docs links and
website build artifacts.

## The one-paragraph summary

Five things dominate. `evo` is now `modifyFields`. The dev-reload story was
renamed from "HMR" to "model preservation" and the `foldkit/hmr-protocol`
subpath moved with it. Effect moved from `4.0.0-rc.112` to `4.0.0-rc.116` and
`@effect/platform-browser` became a required peer. The Subscription event
helpers lost their type arguments, gained target-driven inference, and renamed
their mapper fields. `Subscription.aggregate` and `ManagedResource.aggregate`
now infer everything from the records you pass. Everything else is additive
or narrow.

## Breaking changes

### Struct: `evo` renamed to `modifyFields` (0.163.0)

- `evo` is now `modifyFields`. `makeConstrainedEvo` is now
  `makeModifyFieldsFor`. The old names are removed, not deprecated.
- Behavior and type checking are unchanged. Each transformer must still return
  its field's existing type.
- The lint rule `foldkit/no-spread-in-evo` is now
  `foldkit/no-spread-in-modify-fields`.
- `@foldkit/ui` and `@foldkit/devtools` at 0.163.0 require this rename.

```ts
// before
import { evo } from 'foldkit/struct'
model: evo(model, { count: count => count + 1 })

// after
import { modifyFields } from 'foldkit/struct'
model: modifyFields(model, { count: count => count + 1 })
```

### Effect peer bumped to `4.0.0-rc.116`, `@effect/platform-browser` now a peer (0.160.0, 0.163.0)

- 0.160.0 moved to rc.115 and reinstated `@effect/platform-browser` as a peer
  so page-owning apps run under Effect's `BrowserRuntime` again. That runtime
  now interrupts on a non-persisted `pagehide` rather than `beforeunload`, so
  downloads, cancelled navigations, and bfcache restores no longer kill the
  app.
- 0.163.0 moved both to rc.116.
- `@effect/vitest` at these versions requires Vitest 5. Foldkit's own dev
  dependencies moved from `vitest@^4` to `vitest@^5`.
- Effect rc.116 renamed the `Stream.mapBoth` callbacks to `onElement` and
  `onError`; the Oxlint plugin recognizes the new names.

Exact pins are expected while Effect v4 is in prerelease:

```sh
pnpm add effect@4.0.0-rc.116 @effect/platform-browser@4.0.0-rc.116
pnpm add -D vitest@^5.0.0 @effect/vitest@4.0.0-rc.116
```

### Subscription event helpers: inference, renamed mappers, `TypedEventTarget` (0.161.0, 0.163.0)

`Subscription.fromEvent`, `fromEventFilterMap`, and the new
`fromEventFilterMapPreventDefault` changed shape twice.

- 0.161.0 removed the `<EventType, Message>` type arguments. The event type is
  now resolved from `target` and `type`. `type` is constrained to the names the
  target declares, and the mapper receives the matching event.
- 0.163.0 renamed the mapper fields: `toMessage` is `mapEvent` on `fromEvent`,
  and `filterMapEvent` on the two filtering variants. The mapper's output type
  is inferred; `Subscription.make` checks the final Stream against the
  application Message.
- A custom `EventTarget` that dispatches typed events declares its event map by
  annotating the target with `Subscription.TypedEventTarget<{...}>`. On a
  native target the annotation adds custom events, keeps native ones, and
  overrides a native name only when it redeclares it.
- The named config types now take `<Target, Type, Output>`:
  `FromEventConfig<Window, 'keydown', Message>` instead of
  `FromEventConfig<KeyboardEvent, Message>`. Same for
  `FromEventFilterMapConfig` and `FromEventFilterMapPreventDefaultConfig`.
- `Subscription.animationFrame` keeps `toMessage` because it is a full entry.
  `Subscription.lift` keeps `toParentMessage`.

```ts
// before
Subscription.fromEvent<KeyboardEvent, Message>({
  target: window,
  type: 'keydown',
  toMessage: event => Message.PressedKey({ key: event.key }),
})

// after
Subscription.fromEvent({
  target: window,
  type: 'keydown',
  mapEvent: event => Message.PressedKey({ key: event.key }),
})

// custom target
const slowWarningTarget: Subscription.TypedEventTarget<{
  'foldkit:slow-warning': CustomEvent<SlowWarningReport>
}> = new EventTarget()
```

### `Subscription.aggregate` and `ManagedResource.aggregate` infer from their arguments (0.161.0)

- Both now accept records directly with no type arguments. The result keeps
  each record's literal keys and each entry's exact dependency, Schema,
  service, and callback types. Previously the result was a widened
  `Subscriptions<Model, Message, Services>` with a string index signature.
- The first record with a Model dependency fixes the common Model, and later
  records are checked against it at their own argument position. Message and
  Services widen to the union. A record of only `Subscription.persistent`
  entries does not fix the Model.
- The curried form `aggregate<Model, Message>()(...records)` still exists for a
  value that must be typed before its entries exist. It still erases keys.
  Reach for it when dynamic string indexing is part of the contract.

```ts
// before
Subscription.aggregate<Model, Message>()(homeSubscriptions, roomSubscriptions)

// after
Subscription.aggregate(homeSubscriptions, roomSubscriptions)
```

### `Command.mapEffect` can no longer change the result Message (0.160.0)

- The signature is now `Command<A, E1, R1> -> Command<A, E2, R2>`. Providing
  services, adding retry or delay, or reshaping the error channel still work.
  Lifting the result Message through `Effect.map` no longer type checks.
- Use `Command.mapMessage` or `Command.mapMessages` for the lift. Those record
  the mapping so Story and Scene `resolve` can replay it. A lift hidden inside
  `mapEffect` dispatched correctly in production but was invisible to tests.
- New lint rule `foldkit/prefer-command-mapmessage` flags the old pattern.

### `Document.canonical` has no address-bar default (0.163.0)

- The client no longer defaults `canonical` to `window.location`, and
  `Server.renderToString` no longer defaults it to `Request.url`. Only the
  application knows which query values identify a page (`?page=2` does,
  `?utm_source=` does not).
- Derive `canonical` from the typed route in the Model the same way you derive
  `title`. When no render supplies it, the runtime leaves a served
  `<link rel="canonical">` untouched or leaves the document without one.
- Before the client first writes `canonical` or `ogUrl` it records the existing
  value. A later omission restores that value, or removes the element if the
  runtime created it. On a hydrated page the recorded value can be the
  server-rendered one for the initial route.
- `ogUrl` can be set independently. Omitted alongside an explicit `canonical`,
  it uses that canonical. Server rendering returns `canonical` only when the
  view supplies it, and `injectIntoTemplate` leaves either tag unchanged when
  the field is absent.

### Server: Foldkit is now a Web `fetch` handler (0.159.0)

- `handleRequest(request, { renderPage, template, containerId? })` in
  `foldkit/experimental/server` answers one request: it refuses methods the
  `Request` constructor cannot represent, classifies static misses so a hashed
  asset is not answered with the shell, and otherwise calls `renderPage`. Node
  and workerd both call it.
- In the Vite plugin, `ssr.build` no longer takes `entry`. One `vite build`
  emits `dist/server/fetch.js` whose default export is `{ fetch }`. That module
  still exports `renderPage`. `foldkit.build.json` records `fetch.js` as
  `serverEntry`.
- The handler trusts `Request.url` as the platform built it. A Node adapter
  must resolve the raw request target against its configured origin with
  `resolveRequestUrl` and refuse off-origin targets before constructing the
  `Request`.
- Migration: drop `ssr.build.entry`, keep `ssr.serverEntry`, replace the Node
  host with a script that serves `dist/client` and falls through to
  `dist/server/fetch.js`. A Cloudflare Worker can default-export `fetch.js`
  directly.

### `foldkit/hmr-protocol` is now `foldkit/model-preservation` (0.159.0)

- The mechanism was always "serialize the Model, full reload, restore on the
  fresh boot", which is live reload, not hot module replacement. Naming now
  matches. The subpath export moved, and `PreserveModelMessage.isHmrReload` is
  now `isReloadFlush`.
- The exported messages are unchanged in shape otherwise:
  `PreserveModelMessage`, `RequestModelMessage`, `RestoreModelMessage`.
- Internal renames follow: `runtime.start(hmrModel?)` is now
  `start(preservedModel?)`, `hmrScroll` became `scrollPreservation`, and every
  doc comment that said "when Vite HMR is active" now says "under Vite's dev
  server". `freezeModel`, `preserveScroll`, `slowWarnings.show: 'Development'`,
  and DevTools `'Development'` visibility are still gated the same way.
- The README's feature bullet changed from "HMR" to "Live Reload".

### Calendar `LocaleConfig` gains four required format fields (0.161.0)

- `LocaleConfig` now carries `longFormat`, `shortFormat`, `ariaLabelFormat`,
  and `monthYearFormat`. A locale built by spreading `defaultEnglishLocale`
  keeps working. One built field by field must add the four.
- A `DateFormat` is a non-empty ordered array of `Calendar.DatePart` values
  (`MonthName`, `ShortMonthName`, `MonthNumber`, `PaddedMonthNumber`,
  `DayNumber`, `PaddedDayNumber`, `DayName`, `ShortDayName`, `YearNumber`,
  `LiteralText({ text })`). `MonthYearFormat` accepts only month, year, and
  literal parts.
- New `Calendar.format(date, locale, dateFormat)` applies an arbitrary format.
  New `Calendar.formatMonthYear` renders the heading shape. `formatLong`,
  `formatShort`, and `formatAriaLabel` now read their format from the locale
  instead of hardcoding English word order.

### CustomElement event Schemas must decode without services (0.159.0)

- Every declared event `detail` is now decoded against its Schema before the
  callback runs. A rejected detail is logged and dispatches no Message.
  Transformations run at the browser boundary and undeclared fields are
  stripped.
- Because the decode is synchronous inside the DOM handler, event Schemas are
  constrained to the new `CustomElement.EventSchema` type, which forbids
  decoding services. Encoding services are still fine.
- A nullish detail on a payload-less `CustomEvent` is retried as `{}` so
  `Schema.Struct({})` stays the natural declaration.
- `Scene.CustomElement.emit` now takes the encoded side of the Schema.
- The lower-level `h.OnCustomEvent` attribute changed too: its callback now
  receives `CustomEvent<unknown>` and returns `Option<Message>` instead of
  `CustomEvent<any> -> Message`.

### `Dom.showDialog` returns a boolean and takes modal options (0.161.0)

- Resolves `true` when it installs the dialog's resources, `false` when that id
  already holds them. Code that annotated the result as `void` must accept the
  boolean.
- New options: `isModal: true` makes the background inert and hidden from
  assistive technology. `allowedOutsideSelectors` keeps named overlays (such as
  DevTools) interactive during isolation. Stacked modals isolate against the
  topmost one and closing it restores the one beneath.
- An unhandled Escape on the topmost dialog now dispatches a `CustomEvent`
  named `cancel`, distinguishable from a native `cancel`. `closeDialog` and
  `releaseDialog` also restore modal isolation. The runtime calls
  `releaseDialog` itself on disposal, topmost first.
- In `@foldkit/ui`, `Dialog.init()` always creates a closed dialog. An
  initially open dialog uses `Dialog.boot()` fed through
  `Update.foldChildInit`. Toast markup changed from `<ol>`/`<li>` to `<div>`.
  Tabs defaults to active-only panel rendering for `aria-controls`; pass
  `panelMount: 'All'` when every panel stays mounted.

### DevTools protocol: Commands carry a Submodel path (0.161.0)

- `SerializedCommand` and `CommandRecord` gain `maybeSubmodelPath`: `None`
  until the result Message resolves, `Some([])` for a top-level result,
  `Some(tags)` for a Submodel-routed result. `CommandRecord` also gains an
  invocation `id`. Anything constructing these records must add the fields.
- The store gains `recordResolvedCommand(id, submodelPath)`, and the runtime
  integration gains `recordCommandResult` and `isRecordingCommands`. DevTools
  now attributes a Command to its destination from the resolved Message
  instead of replaying mappers.

## Additive changes

### Update: `foldChildInit` and `foldChildInits` (0.161.0)

Both build a parent Model from child init or boot results, lift the child's
Commands, and handle child OutMessages, in one call. Existing hand-written
initialization stays valid.

- `foldChildInit(childResult, { toParentModel, toParentMessage,
  foldOutMessage?, toParentOutMessage? })` for one child.
- `foldChildInits({ a: A.init(), b: B.init() }, { toParentModel, folds: { a:
  {...}, b: {...} }, resolveOutMessage? })` for several. `toParentModel` runs
  once on the record of child Models, then folds run in key order, each
  receiving the Model the previous fold produced. Commands for a child precede
  the next child's Commands. `resolveOutMessage` combines the per-child parent
  OutMessages into one and receives the final Model as its second argument.
- A child that can emit an OutMessage requires `foldOutMessage` or
  `toParentOutMessage`. A derived OutMessage takes precedence over a forwarded
  one. When nothing is emitted, handlers are skipped and `outMessage` is
  omitted.

```ts
return Update.foldChildInit(Search.init(), {
  toParentModel: search => Model.make({ search }),
  toParentMessage: message => Message.GotSearchMessage({ message }),
})
```

### Subscription: `keyBindings` (0.161.0, renamed 0.162.0, mapper renamed 0.163.0)

- Added as `keyboardShortcuts` in 0.161.0, renamed to `keyBindings` in
  0.162.0 (with `shortcut` becoming `keys` and the types becoming
  `KeySequence`, `KeyBinding`, `KeyBindingsConfig`), and its per-binding
  `toMessage` became `mapEvent` in 0.163.0. Only the final shape ever shipped
  as a stable name.
- A binding's `keys` is one press (`'Escape'`, `'Mod+K'`, `'Alt+ArrowDown'`)
  or a sequence of two or more (`['G', 'H']`). `Mod` resolves to Meta on Apple
  platforms and Control elsewhere; `modKey` overrides. Matching uses
  `KeyboardEvent.key`, case-insensitively. `Space` and `Plus` name those keys.
- Defaults: suppressed inside `input`, `textarea`, `select`, and
  contenteditable (`whileTyping: 'Allow'` opts in), ignored during IME
  composition, repeats ignored for single presses (`whenRepeated: 'Allow'`),
  sequences expire after one second (`sequenceTimeout`), matched presses call
  `preventDefault()` (`preventDefault: false` opts out).
- Duplicate bindings, and a complete binding that is also a sequence prefix,
  are rejected at Stream construction.
- It returns a Stream. Wrap it in `Subscription.persistent` for a fixed table,
  or build it inside `dependenciesToStream` and drive each binding's
  `isEnabled` from the dependency record.

### Subscription: `fromEventFilterMapPreventDefault` (0.160.0)

- The cancelling variant of `fromEventFilterMap`. `Option.some` marks the
  dispatch handled: the helper calls `preventDefault()` and queues the value
  before the native listener returns. `Option.none` leaves the default intact.
  The mapper never calls `preventDefault()` itself.
- Registers with `passive: false` unless told otherwise, so wheel and touch
  events on global targets remain cancelable. `passive: true` is rejected at
  compile time and throws at runtime.
- The docs for `fromEvent` and `fromEventFilterMap` now explain that
  `preventDefault()` is a no-op in a passive listener.

### Subscription: `EntryGates` exported (0.163.0)

The per-entry gate map accepted by `Subscription.lift` as `when` is now a
named public type, `Subscription.EntryGates<ParentModel, Subscriptions>`.

### Schema: `matchOrElse` on tagged and route unions (0.159.0)

- Unions from `defineTaggedUnion` and `defineRouteUnion` gain `matchOrElse`
  next to `match`. Selected variants get narrowed handlers, and the fallback is
  narrowed to the remaining variants when inferred. Both data-first and
  data-last forms exist, and structurally refined input unions are preserved.
- `matchOrElse` joins the reserved tag names (`make`, `match`, `cases`, `ast`,
  `members`, `subset`).

### Html: new event attributes (0.159.0, 0.163.0)

- `OnKeyDownSelf` and `OnKeyDownSelfPreventDefault` fire only when
  `event.target === event.currentTarget`, so a composite widget can own a
  region's keyboard while ignoring keystrokes from embedded controls.
- `OnBeforeInput` and `OnBeforeInputPreventDefault` receive `inputType` and
  `data` as an `Option<string>`. The prevent-default form returns
  `Option<Message>`; `Some` cancels the native edit and dispatches, letting
  `update` own the mutation. This catches autocorrect and spellcheck edits that
  never surface as keystrokes.
- `OnInput` and `OnChange` now read a contenteditable host's `innerText` (or
  `textContent`) when the target has no string `value`. Form controls are
  unaffected.
- `OnCancelPreventDefault(customEventMessage?)` prevents a native `cancel`
  without dispatching, and optionally dispatches a Message only for the
  synthetic `CustomEvent` cancel that `Dom.showDialog` emits. This is what keeps
  a Dialog open when a file picker inside it is cancelled.
- `OnPointerDown` callbacks receive two more trailing arguments: `pointerId`
  and the originating `target: EventTarget | null`. Existing callbacks stay
  compatible. `Scene.pointerDown` takes a matching `pointerId` option and
  supplies a detached DOM representation of the target chain.

### Test harness (0.159.0, 0.163.0)

- `Scene.typeContentEditable` drives `OnInput` on a contenteditable element.
- `Scene.beforeInput` drives `OnBeforeInput` and
  `OnBeforeInputPreventDefault`.
- `Scene.pointerDown` accepts `pointerId` and a target description.
- `Scene.CustomElement.emit` takes the encoded detail.

### Oxlint plugin: five new convention rules (0.160.0)

All enabled in the recommended preset.

- `no-switch-on-message-tag`: use the union's `match` or Effect `Match`.
- `acquire-release-constructs-in-acquire-body`: build the resource lazily
  inside the acquire Effect.
- `prefer-option-over-nullable-in-model`: direct Model fields use
  `Schema.Option`, not nullable or optional Schema fields.
- `no-route-query-constructor-default`: constructor defaults do not run during
  `Route.query` decoding; use `Schema.withDecodingDefaultKey` or
  `Schema.OptionFromOptional`.
- `prefer-command-mapmessage`: see `Command.mapEffect` above.

Renamed: `no-spread-in-evo` to `no-spread-in-modify-fields` (0.163.0).

### Runtime and behavior fixes

- Subscriptions and ManagedResources now observe Model changes made by
  Messages buffered during boot (0.163.0).
- `Runtime.embed` reports unhandled startup failures to the console, matching
  `run` and `hydrate`. Interrupt-only exits stay quiet (0.159.0).
- Page-owning apps run under Effect's `BrowserRuntime`, finalizing on a real
  page discard (`pagehide`) and surviving downloads, cancelled navigations,
  and bfcache restores (0.160.0).
- An open Dialog restored by model preservation reacquires its focus trap,
  scroll lock, and isolation. Dialogs are released topmost-first when the
  runtime stops (0.161.0).
- The `@foldkit/ui` Calendar column headers and headings now come from the
  locale instead of a hardcoded English array. `toDaysGridLabel`,
  `toWeekLabel`, `toMonthsGridLabel`, and `toYearsGridLabel` are overridable
  through `ViewInputs`, and DatePicker forwards them (0.161.0).
- `DragAndDrop.DragState` is exported from `@foldkit/ui` (0.161.0).

### Companion packages at the same release

`@foldkit/ui@0.163.0` and `@foldkit/devtools@0.163.0` require `foldkit@0.163.0`
for the `modifyFields` rename and the `mapEvent` rename. `@foldkit/ui` has
required 0.161.0 or newer since the `Dom.showDialog` contract change. The
matching tool versions are `@foldkit/vite-plugin@0.24.0`,
`@foldkit/oxlint-plugin@0.15.0`, `@foldkit/devtools-mcp@0.22.0`,
`@foldkit/markdown@0.12.0`, and `create-foldkit-app@0.35.2`.

## What this means for foldkit-plus

Everything below was checked against the working tree on 2026-09-23, with
`node_modules`, `dist`, and `.tsbuild` excluded. Two things about that tree
matter for the reader:

- The working tree holds uncommitted Phase 5 work in `packages/ssr` (a
  `generate` function and three new tests). That work belongs to another
  session. The upgrade must not be mixed into it; do the upgrade after it
  lands, or in commits that never touch `packages/ssr/src/index.ts` until the
  SSR step below.
- The `.tsbuild/review-*` folders hold stale copies of the repo. A search that
  forgets to exclude them double-counts.

The short version: of the twelve breaking changes upstream, five touch code
here (`evo`, the Effect and Vitest pins, the curried `aggregate` calls, the
SSR server module, and the `@foldkit/ui` Dialog contract), four touch only
docs and design plans, and three touch nothing. The additive changes matter
more for the design docs than for the code, because several of them do what a
design doc here planned to build.

### Dependencies: the part that gates everything else

**Where the pins live.** Effect `4.0.0-rc.112` is pinned in the root, in every
one of the 29 packages, and in every one of the 11 examples. `foldkit@0.158.2`
is pinned in the root, in 24 packages (22 that peer it plus `cms-drizzle` and
`remote-server`, which only dev-depend on it), and in every example.
`@foldkit/ui@0.158.2` appears in `bundle`, `mixins-surface`, `mixins-ui`
(peer `^0.158.2`), and the `bundle`, `todo-app`, and `kitchen-sink` examples.
`@effect/sql-pg` (root) and `@effect/sql-sqlite-node` (`durable`) are also
pinned to rc.112; both exist at rc.116. `react-codegen` and `metadata` do not
depend on Effect or Foldkit and need nothing.

**The new peer.** `foldkit@0.163.0` peers `@effect/platform-browser@4.0.0-rc.116`
exactly. Nothing here declares that package; it is only installed transitively
at rc.117 through the `livestore` example. Every package that dev-depends on
`foldkit` must add it as a dev dependency or pnpm will report an unmet peer,
and every example must add it as a dependency. Library packages here should
not peer it themselves; Foldkit already does, and a second exact peer would
only make the pin harder to move.

**Companion packages move together.** `@foldkit/ui@0.163.0` peers
`foldkit >=0.163.0` and `effect 4.0.0-rc.116` exactly, so the `@foldkit/ui`
bump and the `foldkit` bump are one commit, and `mixins-ui`'s peer range moves
to `^0.163.0`. `@foldkit/vite-plugin@0.24.0` peers `vite ^8`; no example uses
the plugin today, so that only matters for the SSR design (below).

**Vitest 2 to Vitest 5.** The root runs `vitest@^2.1.8`. `@effect/vitest` is
not used here, so nothing forces Vitest 5 on this repo. Staying on Vitest 2 is
possible in the short term. Two reasons to move anyway: Foldkit's own test
package, `foldkit/test`, is built and tested against Vitest 5, and the
workspace already runs Node 22.21.1, which satisfies Vitest 5's Node 22.12
floor. If you move, these are the changes that affect this test suite
specifically:

| Vitest change | Where it bites |
| --- | --- |
| Vitest 5 requires Vite 6.4 or newer as an explicit peer | The root declares no `vite`. The four examples that pin `vite@5.4.21` (`cms`, `entity`, `sync`, `todo-app`) use it for their own builds, not for tests, so the root can take a Vite 6 or 7 dev dependency independently |
| `vi.restoreAllMocks` no longer resets spy state, only restores `vi.spyOn` spies (v4) | `packages/react/test/asyncData.test.ts:113`, `islands.test.ts:149` and `:233`. Check whether those tests relied on the reset |
| `spy.mockReset()` restores the original implementation instead of a noop (v3) | No `mockReset` calls here. Nothing to do |
| `clearMocks` defaults to true, so mocks are cleared before every test (v5) | Nine `vi.spyOn` sites and one `vi.fn`. Any test that asserts call counts accumulated across tests breaks. Unlikely here, but run the suite |
| Async assertions fail the test if not awaited (v5) | 169 `vi.waitFor` calls. They are all awaited today or they would already be flaky. Verify with the suite |
| `bench` is no longer a top-level import; it is a test-context fixture (v5) | The three bench files: `packages/remote/bench/read.bench.ts`, `packages/remote-drizzle/bench/nested.bench.ts`, `packages/sync/bench/projection.bench.ts`, and the root `bench` script |
| `toThrowError(new Error(...))` compares name, message, cause, and prototype (v3) | Grep for `toThrowError(new` before upgrading |
| Default excludes no longer drop `dist` (v4) | Harmless. `vitest.config.ts` sets `test.include` explicitly |
| Fake timers mock `performance.now()` and the Temporal API (v3, v5) | Two `vi.useFakeTimers` sites in `packages/agent-mcp/test`. Check they still pass |
| Test options as a third argument removed (v4) | Grep for `it('...', () => {}, {` before upgrading |

One possible simplification: the `node:sqlite` alias in `vitest.config.ts`
exists because Vite 5's builtin list predates that module. Vite 6 and later
read Node's own list. After the Vite bump, try removing the alias and
`test-support/sqlite.ts`.

**Effect rc.112 to rc.116.** No code here calls `Stream.mapBoth`, the one
renamed API the release notes call out. AGENTS.md keeps a list of Effect 4
renames at lines 418 to 422 and says to check the installed `.d.ts` rather
than trust memory. Do that once for rc.116 after the bump and extend the list.
The `livestore` example already resolves rc.117 transitively, so nothing new
is being introduced into the lockfile's Effect range.

### `evo` to `modifyFields`

**Code.** 50 call sites in 13 files, all under `examples/`. No package source
uses `evo`, and nothing uses `makeConstrainedEvo`. The rename is mechanical:
change the import from `foldkit/struct` and the call. The heavy files are
`examples/todo-app/src/app.ts` (14), `examples/todo/src/app.ts` (8),
`examples/sync/src/app.ts` (6), and `examples/bundle/src/app.ts` (5). Two
type tests also use it, `examples/todo-app/test/readme.test-d.ts` and
`root-readme.test-d.ts`, which exist to prove the README snippets compile.

**Docs with copyable snippets.** `README.md:51` and `:58`,
`packages/remote/README.md:813`, `packages/surface/README.md:304`, and the
code blocks in `docs/design/evo-DESIGN.md`. These must change in the same
commit as the examples, because the README type tests pin them.

**Docs with prose.** AGENTS.md:170 states the rule "Model changes happen in
`update`, normally using `evo`". `docs/state-model.md` draws a
`Message -> update -> evo` diagram five times. `packages/agent/README.md:543`,
`packages/sync/README.md:959`, `packages/mirror/README.md:446`,
`packages/surface/README.md:292`, and `packages/remote/README.md:1396` mention
it in passing. `docs/design/README.md:57` describes the evo design as done.

**The skill.** `skills/foldkit-plus` never mentions `evo`, so the rename does
not by itself require a skill change. The skill does state "Targets Foldkit
`0.158.x`" at `SKILL.md:25`; that line and the version metadata change with
the release.

**The design doc.** `docs/design/evo-DESIGN.md` is a proposal about nested
updates on top of `evo`. Its lint section (lines 20 to 35) assumes linting
means standing up ESLint for the monorepo, and line 225 cites
`no-spread-in-evo`. Foldkit ships an Oxlint plugin with that rule under its
new name. The doc's premise survives the rename; its lint section does not.
Rewrite the doc's examples to `modifyFields` and replace the ESLint discussion
with the Oxlint plugin, or mark the doc historical.

### The curried `aggregate` calls

Five call sites use the curried form, and all five should keep it.

- `packages/bundle/src/assembly.ts:348` passes `any` for Services because the
  placements are stored type-erased. The result is branded and retyped by the
  declared `WiredRecord<Subscriptions<...>>` at line 139, so inference would be
  thrown away anyway.
- `packages/bundle/src/assembly.ts:360` does the same for ManagedResources and
  retypes at line 145.
- `packages/bundle/src/combinators.ts:132` is the erased implementation behind
  the `withSubscriptions` overloads at lines 115 to 126.
- `packages/sync/src/mount.ts:341` widens the app Message to the runtime
  Message union with a cast at line 342. The inferring form would refuse that
  widening at the argument position.
- `packages/bundle/test/completeness.test-d.ts:37` calls the curried form with
  no records under `@ts-expect-error`. The new overload set could make that
  line fail to compile for a different reason. Re-run the type tests and read
  the error.

The string-index contract matters here. `examples/bundle/src/demo.ts:38` reads
`config.subscriptions['MediaQuery@dark/changes']`, roughly 25 tests call
`Object.keys(assembly.subscriptions())`, and every `primitives` bundle
annotates its `subscriptions` return as `Subscriptions<...>`. The release notes
say directly inferred aggregates drop the index signature. Since every
aggregate here is retyped through a `Subscriptions` annotation, the contract
holds, but the bundle README's claim at line 455 ("a duplicate key throws at
startup, as `Subscription.aggregate` does") should be re-verified against
0.163.0 because that check is now in a different overload.

### The one `mapEffect`-shaped lift

No code calls `Command.mapEffect`. But `packages/form/src/index.ts:749`
builds a Command by hand and lifts its result Message with
`Effect.map(command.effect, message => Message.Nested({ key, row, message }))`.
That is exactly the pattern Foldkit closed off: it dispatches correctly, but a
Story or Scene `resolve` replays only the recorded mapping chain, so a test
sees the child's raw Message instead of the wrapped one. Replace the hand-built
object with `Command.mapMessage(command, ...)` and keep the `args` extension
separately, or document why form's nested Commands are meant to be invisible
to Scene. The `prefer-command-mapmessage` rule would flag this if this repo
ran the Oxlint plugin.

### The SSR package

`packages/ssr` (foldkit-ssr) wraps Foldkit's server module rather than
reimplementing it: `renderToString` and `injectIntoTemplate` from
`foldkit/experimental/server`, and `hydrate` from `foldkit/runtime`. Eight
tests call `renderToString` directly and eight call `hydrate`. What changes:

- **`canonical` default removal.** `SSR.render` renders twice and compares the
  HTML with the Flags script stripped. Nothing here sets `canonical`, and
  `renderToString` no longer injects one from the request URL, so the compare
  sees one fewer tag. No test sets or asserts `canonical`, so nothing breaks.
  The README example at line 146 (`title: 'Post', // not the post's title`)
  now has a sibling story for `canonical`: derive it from the Model's route, or
  the page ships without one.
- **The hydrate-without-init trick is unchanged.** `SSR.hydrate` builds a
  config whose `init` returns the resumed Model and removes the `Flags` key so
  Foldkit skips `init`. The 0.163.0 runtime only renamed the `hmrModel`
  parameter to `preservedModel` in `hydrationHandoff`; the Flags branch is the
  same. `packages/ssr/test/flagsTrap.test.ts` pins this and must stay green.
  `docs/design/ssr-PLAN.md:353` already records this as a risk.
- **Hardcoded attribute names.** `data-foldkit-app`, `data-foldkit-build`, and
  `data-foldkit-flags` are string literals at `index.ts:472`, `:473`, `:498`
  and in six tests. Foldkit exports `FOLDKIT_APP_ATTRIBUTE` and
  `FOLDKIT_FLAGS_ATTRIBUTE` from the server module. Switch to them so a rename
  upstream becomes a type error here instead of a silent miss.
- **`handleRequest` is the missing last step.** `SSR.page` returns HTML. The
  design docs never mention a server entry, a fetch handler, Workers, or a
  Node adapter. Foldkit now defines the shape: `handleRequest(request,
  { renderPage, template })` returns a `Response`, `vite build` emits
  `dist/server/fetch.js`, and a Cloudflare Worker default-exports it. A
  foldkit-ssr `renderPage` that returns an `EntryResult` from `SSR.page` plugs
  into that directly. This is the natural Phase 6, and it means the
  `foldkit-ssr/vite` plugin sketched in `SSR-DESIGN.txt` (lines 236, 259, 277,
  2304) should target `@foldkit/vite-plugin@0.24`'s `ssr.serverEntry`, not its
  own build entry.
- **A `Runtime.adopt` upstream is still the ask.** ssr-PLAN.md:344 and
  SSR-DESIGN.txt:2768 propose it. Nothing in 0.159 to 0.163 adds it.
- **Deep imports into `dist`.** `packages/mixins/probe/foldkit.ts:17-20`
  imports `foldkit/dist/experimental/server/serialize.js`,
  `dist/html/index.js`, and `dist/html/childAttribute.js` by path. All three
  still exist in 0.163.0. They are still a hazard and the probe should say so.

### The `@foldkit/ui` Dialog contract

- `packages/mixins-ui/test/dialog.test.ts:54` calls
  `Dialog.init({ id, isOpen: true })`. In `@foldkit/ui@0.161.0` and later,
  `Dialog.init()` always creates a closed Dialog and the `isOpen` option no
  longer opens it. The test either asserts a closed dialog or moves to
  `Dialog.boot({ id })` folded through `Update.foldChildInit`. The second is
  what the release notes prescribe, and it is the first place this repo would
  use `foldChildInit`.
- The `mixins-ui` Dialog adapter resolves slots `dialog`, `backdrop`, `panel`,
  `title`, `description`, `initialFocus`, `closeButton`. The modal-isolation
  work adds no new DOM the adapter has to know about, but a Dialog opened with
  `isModal: true` now sets `inert` and `aria-hidden` on siblings. A mixin that
  restyles the backdrop should be checked in a real page.
- Toast markup changed from `<ol>`/`<li>` to `<div>`. `mixins-ui` has no Toast
  adapter (README:285 lists it as missing), so nothing here breaks. When that
  adapter is written, it targets the new markup.
- Tabs gained `panelMount: 'All'`. The `Bundle.fromParts` Tabs example in
  `packages/bundle/README.md:336` and `examples/bundle/src/app.ts:73` renders
  only the active panel, which is the new default, so no change.
- The `mixins-ui` Calendar adapter (`src/calendar.ts`) resolves `columnHeader`
  and `headingButton` slots. Column header accessible names and heading text
  now come from the locale instead of a hardcoded English array. Under
  `defaultEnglishLocale` the strings are the same, so
  `test/calendar.test.ts` should pass unchanged; run it to confirm, since it
  asserts on rendered names.

### Custom elements

- `packages/react/src/host.ts:30` declares its one event as `Schema.Any`, which
  decodes without services, so the new `EventSchema` constraint is satisfied.
  The detail is now decoded (as `unknown`) and undeclared fields stripped;
  `Schema.Any` strips nothing, so the React host's message payload passes
  through intact.
- `h.OnCustomEvent` changed shape: the callback receives
  `CustomEvent<unknown>` and returns `Option<Message>`. No code here calls it,
  but `packages/mixins/src/resolver.ts:49` keys attributes by the
  `OnCustomEvent` tag and `test/resolver.test.ts:80` constructs one by hand
  with the old signature. That test needs the `Option` return.
- `docs/design/react-DESIGN.md` sections 3 and 5 sketch the host with the old
  `OnCustomEvent` signature and describe the detail arriving undecoded. Update
  the sketch to match `host.ts` and note that Foldkit now validates the detail.
- `react-codegen`'s `FKREACT0007` diagnostic requires a literal
  `CustomElement.define({ tag, properties, events })`. Unchanged.

### New html event attributes and the two tables that enumerate them

Foldkit added `OnKeyDownSelf`, `OnKeyDownSelfPreventDefault`, `OnBeforeInput`,
`OnBeforeInputPreventDefault`, and `OnCancelPreventDefault`, and extended
`OnPointerDown` with `pointerId` and `target`. Two places here enumerate event
attributes by name:

- `packages/mixins/src/resolver.ts` and `docs/design/mixins-DESIGN.md:214`
  normalize `OnKeyDown` to `keydown` and `OnKeyDownPreventDefault` to
  `keydownpreventdefault` so a mixin can own an event slot. The five new tags
  need a classification, or they fall through the default branch. Decide
  whether `OnKeyDownSelf` is the same slot as `OnKeyDown` (probably not, since
  a mixin replacing one should not silently replace the other).
- `packages/react-codegen/src/transform.ts:653-680` lowers `OnKeyDown`,
  `OnKeyUp`, and `OnInput` to React props. The new tags have no lowering and
  will hit whatever the fallback is for an unknown handler. Add lowerings or a
  diagnostic. `OnInput` on a contenteditable host now reads `innerText`; the
  codegen's `event.currentTarget.value` lowering does not, so a view that
  relies on the new behavior compiles to a React component that reads
  `undefined`.
- `packages/mixins-ui/test/slider.test.ts:92` is the only `OnPointerDown`
  call. Its callback takes the first seven arguments; the two new trailing
  arguments are ignored. No change needed.

### Runtime behavior changes worth re-checking

- **Boot-buffered Messages.** 0.163.0 fixed Subscriptions and ManagedResources
  missing Model changes made by Messages dispatched during boot.
  `packages/react/README.md:203` and `react-DESIGN.md:488` describe the host
  connector buffering inbound sends until the runtime binds. `packages/sync`
  `mount.ts` and the React `useFoldkitElement` both dispatch early. If either
  has a workaround for a Subscription not seeing the first Model, it may now
  be dead code. Search for a deferred first dispatch after the bump.
- **`Runtime.embed` reports startup failures.** `docs/sync-runtime-binding.md:12`
  says a container without an `id` makes the runtime "report nothing", and the
  AGENTS.md trap at line 369 says the same. Since 0.159 `embed` logs unhandled
  startup causes. The trap is still worth keeping (the test still sees an empty
  element), but the "reports nothing" claim is stale.
- **`pagehide` instead of `beforeunload`.** `packages/agent-webmcp/README.md:81`
  and `skills/foldkit-plus/references/agent.md:192` show
  `window.addEventListener('beforeunload', () => registration.unregister())`.
  That is app code and still works, but Foldkit's own runtime now finalizes on
  `pagehide` precisely because `beforeunload` fires on cancelled navigations
  and downloads. Move the snippet to `pagehide` for the same reason.

### Nothing to do

These upstream changes have no call sites and no doc claims here:

- `foldkit/hmr-protocol` and every model-preservation name.
- `Subscription.fromEvent`, `fromEventFilterMap`, `keyboardShortcuts`, custom
  `EventTarget` subscription targets. The primitives use
  `Stream.fromEventListener` directly.
- `defineTaggedUnion` and any hand-rolled match-with-fallback that
  `matchOrElse` would replace. Every match here is exhaustive.
- `Calendar.LocaleConfig` and `defaultEnglishLocale`.
- DevTools `CommandRecord` and `SerializedCommand`. The agent packages import
  only `foldkit/message`.
- `Scene.pointerDown`, `Scene.type`, `Scene.CustomElement`.
- Oxlint. This repo has no lint configuration at all, so no rule rename
  applies to it. See the next section for why the rules still matter.

## What this means for the docs and design plans

### The new Oxlint rules disagree with snippets this repo publishes

Foldkit's recommended preset now includes `prefer-option-over-nullable-in-model`
and `no-switch-on-message-tag`. A user who scaffolds with `create-foldkit-app`
gets both, then copies a snippet from this repo and gets a lint error. The
snippets:

| Rule | Where the snippet is |
| --- | --- |
| `prefer-option-over-nullable-in-model` (Model fields must be `Schema.Option`, not `Schema.NullOr`) | `packages/surface/README.md:49`, `packages/sync/README.md:127-128`, `packages/mixins-surface/README.md:54`, `skills/foldkit-plus/references/surface.md:67`, `references/sync.md:45-46`, `references/mixins.md:128`, `references/remote.md:81`, `docs/design/REVISION_PLAN.md:1588` |
| `no-switch-on-message-tag` (use the union's `match`) | `skills/foldkit-plus/SKILL.md:101` (the one-screen example, which also rebuilds the Model with spreads), `packages/mirror/README.md:208` and `:289`, `references/mirror.md:76` |

The `agent` README and skill reference already treat `selectedTodoId` as an
`Option` (`Option.getOrThrow(model.selectedTodoId)` at README:496), so the
packages disagree with each other today. Decide once: Model fields are
`Schema.Option`. Then fix the snippets and the type tests that pin them. The
SKILL.md example is the most visible one in the repo and should be the first.

The two design docs that plan Models with nullable fields,
`pagebuilder-DESIGN.md` (`drag: DragState | null` at 954 and 1532) and
`richtext-DESIGN.md` (`composing`, `dragging` at 1170 to 1181), are "Proposed,
not built" and can adopt `Option` when they are built.

### foldkit-bundle and `Update.foldChildInit` / `foldChildInits`

The bundle package already has its own answers to what these helpers do, and
the design docs describe them:

- `packages/bundle/src/placed.ts:278-283` is `foldChildInit` by hand: run the
  child's `init`, write its Model with `link.write`, lift its Commands with
  `Command.mapMessages`.
- `packages/bundle/src/collection.ts:305-312` (`add`) is the same per keyed
  item.
- `packages/bundle/src/assembly.ts:302-336` (`init` and `initial(rest)`) is
  `foldChildInits` shaped: seed empties, run every placement's init shallowest
  first, then wirings in list order. `docs/wiring.md:148` and
  `bundle-DX-PLAN.md:137` document that order.

Two consequences:

1. **A gap the upstream API makes visible.** No bundle doc says what happens
   to an OutMessage a child emits from `init`. `onOut` is documented only for
   `update`. `foldChildInit` requires `foldOutMessage` or `toParentOutMessage`
   when the child result can carry one, and `foldChildInits` adds
   `resolveOutMessage` for combining several. `placed.init` currently drops a
   child init's `outMessage` on the floor. Either route it through the
   placement's `onOut` Step (the same one `update` uses) or state in the bundle
   README that init OutMessages are not observed. This is a behavior decision,
   not a rename.
2. **Reuse or keep.** `placed.ts:278` and `collection.ts:305` could call
   `Update.foldChildInit` instead of hand-lifting, which would also fix the gap
   above for free. `assembly.ts` should stay as it is: `foldChildInits` keys
   children by a record and runs folds in key order, while assembly orders by
   placement depth, which a record cannot express. Note the difference in
   `bundle-DESIGN.md` so a future reader does not "simplify" it.

The `@foldkit/ui` change to `Dialog.init` (always closed) plus `Dialog.boot`
also touches the bundle story. `packages/bundle/README.md:336` says UI
components "export an `init` that returns only the Model". Dialog's `boot`
returns a Model and Commands. A `Bundle.fromParts` over Dialog that wants to
start open needs to run `boot` in its `init`, which the README's shape does not
show.

### foldkit-primitives and `Subscription.keyBindings`

`packages/primitives/events/README.md:59-65` documents `keyboardEvents` and
`matchHotkey("ctrl+shift+k", press)` so that "`update` stays a table of
chords". Foldkit's `keyBindings` now covers single presses, modifier combos,
ordered sequences, `Mod` resolution, typing suppression, IME handling, repeat
suppression, and `preventDefault`, as a Stream. The primitive is not wrong, but
its README should say when to reach for it instead of `keyBindings`: it is a
bundle with a Model slice and a Surface, where `keyBindings` is a Stream you
gate from dependencies. If the answer is "always use `keyBindings` for
shortcuts and `keyboardEvents` for raw key state", write that.

`packages/primitives/README.md:286-288` recommends `Subscription.fromEventFilterMap`
with a manual `preventDefault()` for cancelling. That is now
`fromEventFilterMapPreventDefault`, which also fixes the passive-listener trap
for wheel and touch. Update the recommendation.

### richtext-DESIGN and the new contenteditable support

`docs/design/richtext-DESIGN.md` (Proposed, not built) puts "contenteditable
ownership, beforeinput, composition / IME, browser selection, clipboard,
drag/drop, DOM reconciliation" in a `foldkit-richtext-dom` adapter (lines 176
to 184, 1305 to 1325). Foldkit 0.159 now handles three of those pieces
declaratively: `OnBeforeInput` and `OnBeforeInputPreventDefault` (including
autocorrect and spellcheck edits, with `Option.none` for non-text edits),
`OnInput` reading a contenteditable host, and `OnKeyDownSelf` for a host that
embeds interactive children. The test harness has `Scene.typeContentEditable`
and `Scene.beforeInput`. The design should be revised to build on those rather
than on raw listeners, and its adapter scope shrinks to composition,
selection, clipboard, and reconciliation. Foldkit ships a
`contentEditableEditor` test app in `dist/test/apps`, which is the reference
for what the framework now guarantees.

### react-DESIGN and the React host

Beyond the `OnCustomEvent` signature (above), `react-DESIGN.md:9` pins the
Foldkit peer at `^0.158.2` and `:857` cites Vite HMR as a reason codegen must
not rewrite unchanged bytes. The HMR reason is about Vite's own HMR for React
files and remains true; only Foldkit's dev reload was renamed. Update the peer.

### SSR design docs

Every SSR document carries a status line that is now wrong twice over, once
for the Foldkit version and once for the phase:

- `SSR-DESIGN.txt:7-10` says "not started, there is no `packages/ssr`";
  `:18-22` says verified against 0.158.2.
- `ssr-PLAN.md:3` says written against 0.158.2, "Phase 5 next". Phase 5 is in
  the working tree.
- `docs/design/README.md:51-52` calls `packages/ssr` unbuilt and checked
  against 0.158.
- `docs/releases.md:41` says "Phase 0 of its plan".

Beyond status, three substantive edits:

1. `ssr-PLAN.md:361-363` (Risks) says "with hot reloading, Foldkit keeps the
   previous Model and skips adoption". Foldkit now calls this model
   preservation: a full reload plus a restored Model, and the runtime doc says
   "a Model restored after a development reload skips adoption and gets a
   fresh patch against the stamped root". Same behavior, new name; reword so
   a reader searching Foldkit's docs finds it.
2. The `canonical` story. `SSR-DESIGN.txt:621` delegates head handling to
   upstream and `ssr-PLAN.md:145` says a Phase 0 test covers head fields.
   Neither mentions `canonical`. Add one line to the README's Document example
   and one to the plan: `canonical` comes from the route in the Model, and the
   server sends none otherwise.
3. Phase 6, delivery. Add the `handleRequest` and `fetch.js` shape as the
   target for "how a foldkit-ssr page becomes a Response", and retarget the
   sketched `foldkit-ssr/vite` plugin at `@foldkit/vite-plugin@0.24`'s
   `ssr.serverEntry` (which peers Vite 8).

### Version strings scattered through the docs

`0.158.2` and `rc.112` appear as facts in: `skills/foldkit-plus/SKILL.md:25`,
`README.md:274-275`, `AGENTS.md:410` and `:418`, `docs/releases.md:74`, `:77`,
`:90`, `:100`, `packages/agent/README.md:522` and `:537`, and as "checked
against" notes in `agent-DESIGN.md`, `mixins-DESIGN.md`, `react-DESIGN.md`,
`bundle-DESIGN.md`, `bundle-spike.md`, `reactivity-DESIGN.md`,
`sync-runtime-binding.md`, `SSR-DESIGN.txt`, `ssr-PLAN.md`,
`local-execution-DESIGN.md`, and `REVISION_PLAN.md`. `CONTRIBUTING.md:59`
already says not to hard-code versions in prose and to link `docs/releases.md`
instead. The "checked against" notes in design docs are legitimate provenance
and should stay as history; the user-facing ones (SKILL.md, README, releases,
agent README) change with the release.

### AGENTS.md itself

- Line 170 (`evo` rule) and line 565 (the `evo` trap) rename.
- Lines 369 to 371 (embedded container `id` trap): soften "reports nothing".
- Lines 418 to 422 (Effect 4 renames): re-verify against rc.116 and add
  `Stream.mapBoth`'s `onElement`/`onError` if anything here ever uses it.
- The skill rule at lines 305 to 318 applies: every reference snippet that
  changes gets compiled through a temporary `*.test-d.ts` in
  `examples/kitchen-sink`, and `metadata.version` bumps on release.

## Upgrade guide

Each step is one or two commits. Every commit follows AGENTS.md: re-read the
diff, run `pnpm format:check`, `pnpm typecheck`, `pnpm test`, then `pnpm
demo` where the step touches examples, and get a jev-pref `approve` before the
next step. Commit only your own files; the uncommitted SSR Phase 5 work stays
out of every commit here.

### Step 0: decide two things before touching code

1. **Vitest 5 or stay on 2.** Recommended: move to 5 in its own step, before
   the Foldkit bump, so a test failure is attributable to one change.
2. **Model fields are `Schema.Option`.** Recommended: yes. It matches what the
   agent package already does and what Foldkit's recommended preset enforces.
   This is a docs decision with a few type-test consequences, and it can be a
   later step, but decide it now so the doc rewrites in steps 5 and 6 are done
   once.

### Step 1: Vitest and Vite (optional but recommended)

```sh
pnpm add -Dw vitest@^5 vite@^7
```

- Update the three bench files to the fixture form of `bench`.
- Run the suite. Expect noise from `restoreAllMocks` in `packages/react/test`
  and possibly from `clearMocks` defaulting on. Fix, do not suppress.
- Try removing the `node:sqlite` alias and `test-support/sqlite.ts`. Keep them
  if `packages/durable` tests fail to resolve the builtin.
- Commit: "Move the test runner to Vitest 5".

### Step 2: Effect rc.116

Replace `4.0.0-rc.112` with `4.0.0-rc.116` in the root, all 29 packages, and
all 11 examples, for `effect`, `@effect/sql-pg`, and `@effect/sql-sqlite-node`.
Peer ranges `^4.0.0-rc.112` become `^4.0.0-rc.116`. Add
`@effect/platform-browser@4.0.0-rc.116` as a dev dependency to every package
that dev-depends on `foldkit` and as a dependency to every example.

```sh
pnpm install
pnpm typecheck
pnpm test
```

Foldkit 0.158.2 peers rc.112 exactly, so pnpm will warn about the peer until
step 3. That is expected for one commit. If the typecheck surfaces Effect
renames, add them to the AGENTS.md list at line 418.

Commit: "Pin Effect to 4.0.0-rc.116 and declare the browser platform peer".

### Step 3: Foldkit and `@foldkit/ui` 0.163.0, plus the `evo` rename

These are one commit because `@foldkit/ui@0.163.0` requires `foldkit >=0.163.0`
and both require `modifyFields`.

1. Replace `0.158.2` with `0.163.0` for `foldkit` and `@foldkit/ui`
   everywhere, peers `^0.158.2` to `^0.163.0`.
2. Rename `evo` to `modifyFields` in the 13 example files and in the README
   snippets that the two `todo-app` type tests pin (`README.md:51`, `:58`;
   `packages/remote/README.md:813`; `packages/surface/README.md:304`).
3. `packages/mixins-ui/test/dialog.test.ts:54`: replace
   `Dialog.init({ id, isOpen: true })` with `Dialog.boot({ id })` folded through
   `Update.foldChildInit`, or assert the closed state if the test only needs a
   Dialog Model.
4. `packages/mixins/test/resolver.test.ts:80`: the hand-built `OnCustomEvent`
   returns `Option<Message>`.
5. `packages/bundle/test/completeness.test-d.ts:37`: read the new
   `@ts-expect-error` reason.
6. Run everything including `pnpm demo`. Read every new type error before
   fixing it; some will be the `aggregate` overloads or the `OnPointerDown`
   arity, which need no change, and the goal is to know which.

Commit: "Upgrade to Foldkit 0.163.0 and rename evo to modifyFields".

### Step 4: code follow-ups the compiler does not force

Each is its own commit with its own test.

- `packages/form/src/index.ts:749`: lift nested Commands with
  `Command.mapMessage` so Scene `resolve` sees the wrapped Message. Add a Story
  test that resolves a nested Command and asserts the `Nested` wrapper.
- `packages/ssr/src/index.ts` (after Phase 5 lands): use
  `FOLDKIT_APP_ATTRIBUTE` and `FOLDKIT_FLAGS_ATTRIBUTE` instead of the string
  literals, in source and in the six tests.
- `packages/mixins/src/resolver.ts`: classify `OnKeyDownSelf`,
  `OnKeyDownSelfPreventDefault`, `OnBeforeInput`, `OnBeforeInputPreventDefault`,
  and `OnCancelPreventDefault`. Add a resolver test per tag.
- `packages/react-codegen/src/transform.ts`: lower the same five tags or emit a
  diagnostic for them. Add a transform test that shows the chosen behavior.
- `packages/bundle/src/placed.ts:278` and `collection.ts:305`: decide the init
  OutMessage question (route through `onOut` or document that it is dropped).
  If routing, switch both to `Update.foldChildInit` and add a test where a
  child's `init` emits an OutMessage.
- `packages/react` and `packages/sync`: look for a deferred-first-dispatch
  workaround made unnecessary by the boot-buffering fix. Remove it only with a
  test that proves the Subscription sees the first Model.

### Step 5: docs that state facts about Foldkit

One commit per package README, per AGENTS.md's docs standard.

- `AGENTS.md:170`, `:369-371`, `:418-422`, `:565`.
- `docs/state-model.md` diagram and table.
- `docs/sync-runtime-binding.md:12-18` ("reports nothing").
- `packages/agent/README.md:522`, `:537`, `:543`; `packages/agent-webmcp/README.md:81`
  (`pagehide`); `packages/sync/README.md:959`; `packages/mirror/README.md:446`;
  `packages/surface/README.md:292`; `packages/remote/README.md:1396`.
- `packages/primitives/README.md:286-288` (`fromEventFilterMapPreventDefault`)
  and `packages/primitives/events/README.md:59-65` (position against
  `keyBindings`).
- `packages/bundle/README.md:336` (UI `init` versus `boot`) and `:455`
  (re-verify the duplicate-key claim).
- `packages/ssr/README.md`: `canonical` line, and the delivery shape.
- `docs/releases.md:41`, `:74`, `:77`, `:90`, `:100`.
- `README.md:274-275`.

### Step 6: the skill

`skills/foldkit-plus/SKILL.md:25` (target version), and the reference files
that change under the `Schema.Option` decision (`surface.md:67`,
`sync.md:45-46`, `mixins.md:128`, `remote.md:81`) plus `agent.md:192`
(`pagehide`) and `mirror.md:76` (`switch` on `_tag`). Compile every changed
snippet through a temporary `examples/kitchen-sink/*.test-d.ts` and delete it.
Bump `metadata.version` with the release.

### Step 7: design docs

These are not release-blocking. They are the record of why decisions were
made, and they should stop describing a Foldkit that no longer exists.

- `docs/design/README.md:51-52`, `:57`: SSR status, evo status.
- `docs/design/ssr-PLAN.md:3`, `:361-363`; `SSR-DESIGN.txt:7-22`: status and
  model-preservation wording; add the Phase 6 delivery target.
- `docs/design/evo-DESIGN.md`: `modifyFields`, Oxlint instead of ESLint.
- `docs/design/react-DESIGN.md:9`, sections 3 and 5.
- `docs/design/mixins-DESIGN.md:214`: the new event tags.
- `docs/design/bundle-DESIGN.md`: why assembly does not use `foldChildInits`;
  the init OutMessage decision.
- `docs/design/richtext-DESIGN.md:176-184`, `:1305-1325`: build on
  `OnBeforeInput` and `Scene.beforeInput`.
- `docs/design/pagebuilder-DESIGN.md` and `richtext-DESIGN.md`: `Option` for
  nullable Model fields when built.

### Step 8: release

Per `CHANGELOG.md` and `docs/releases.md`: every package whose peer range moved
gets a version bump and an "Upgrading from" note stating the new pins
(`foldkit >=0.163.0`, `effect 4.0.0-rc.116`, `@effect/platform-browser
4.0.0-rc.116`, `@foldkit/ui ^0.163.0` for `mixins-ui`). The 0.10.0 entry is the
precedent for republishing packages "only so their pinned dependencies are the
current ones".

## The proposed upstream PRs, re-checked against 0.163.0

The design docs propose or wish for changes to upstream Foldkit in thirteen
places. None has been filed: no doc cites a `foldkit/foldkit` PR or issue, and
a search of that repo finds nothing from this account and nothing mentioning
`Runtime.adopt`. The `#42`, `#59`, and `#60` references in the sync docs are
this repo's own tracker. Every proposal was checked against the 0.163.0
declarations and the `@foldkit/ui` 0.163.0 tarball.

**Nothing was pre-empted.** No proposal shipped upstream in another form.
Three proposals are strengthened by what did ship, two need rewording, and
one is mildly weakened. The rest are unaffected.

### SSR (SSR-DESIGN.txt, ssr-PLAN.md, resumable-DESIGN.md)

| Proposal | Status in 0.163.0 | Effect on the plan |
| --- | --- | --- |
| `h.UnmanagedChildren()` (PR 1, "the PR I'd actually start with", :2958) | Not shipped. `nativeInnerHtml` and the hydration markers are unchanged. | Unchanged. Still first in the sequence at :3050. |
| `Server.renderModelToString` (PR 2, :2626) | Not shipped. `renderToString` still takes a config and runs `init`. | Unchanged, but the pitch improves: 0.163.0 removed the `Request.url` canonical default, so the server render now depends on nothing but config, url, and buildId. A "render this Model" entry is a smaller ask than before because there is no request-derived metadata to thread through. |
| `Runtime.adopt(app, { buildId, boot })` (RFC, :2725) | Not shipped. `hydrationHandoff` only renamed its `hmrModel` parameter to `preservedModel`. | **Reframe.** Foldkit now names the "start from a Model you already have" path: model preservation. `MakeRuntimeReturn.start(preservedModel?)` is the runtime's own entry for it, and the doc comment says a preserved Model "skips adoption and gets a fresh patch against the stamped root". The RFC should present `adopt` as the missing third boot mode beside `run` (fresh), `hydrate` (Flags to `init` to adopt), and preservation (Model to replace). That framing uses upstream's vocabulary and shows the gap exactly: preservation takes a Model but not Commands, which is the objection the doc already raises against `hydrateModel` at :2800. |
| "What I would upstream" table, build-skew checks (:2937) | Already in core and unchanged. | Drop the row; it was never a gap. |
| Surface as unit of hydration, §26; binding-level resumability, §27 | Nothing relevant shipped. | Unchanged. |
| resumable-DESIGN: `EagerStartRequired` would go away with adopt (:420) | Partly affected. 0.163.0 fixed Subscriptions and ManagedResources missing Model changes from Messages buffered during boot. | Re-run the Phase A to D tests that pin 0.158.2 internals (`seedAdoptedState`, control `value` mismatch, `pendingHydrationRoot` stripping). If `EagerStartRequired` exists to work around the boot-buffer bug rather than the adoption ordering, it may be removable without an upstream change. |

The delivery layer is a new item, not a proposal: `handleRequest` and
`dist/server/fetch.js` (0.159.0) define how a rendered page becomes a
`Response`. The sequence at :3050 should add "foldkit-ssr `renderPage` for
`handleRequest`" between the prototype and the benchmarks, and the sketched
`foldkit-ssr/vite` plugin should extend `@foldkit/vite-plugin`'s
`ssr.serverEntry` rather than own a build entry.

### reactivity-DESIGN (three core PR candidates)

| Proposal | Status | Effect |
| --- | --- | --- |
| #1 committed Model transition observation (:1414) | Not public. But DevTools now records `(message, modelBefore, modelAfter, commands)` per dispatch and attributes each Command to its resolved Submodel path (0.161.0). | Strengthened. The runtime already computes exactly the `ModelTransition` the PR asks for, for DevTools. The PR becomes "expose the seam DevTools uses", which is smaller than "add a seam". The gate at :1414 ("do not open until the prototype shows why") still holds. |
| #2 persistent render region (:1465) | Nothing shipped. | Unchanged. |
| #3 managed renderer leaf (:1541) | Nothing shipped. | Unchanged. |

### docs/rfc.md (what Foldkit might want from foldkit-plus)

| Rank | Item | Effect |
| --- | --- | --- |
| 1 | Message subsets (`Message.only`) | Weakened as a pitch. `defineTaggedUnion` already had `subset(tags)` at 0.158 and now adds `matchOrElse` (0.159.0). Core owns partial handling of a union. The RFC should say what `Message.only` adds beyond `subset` plus `matchOrElse`, or fold the item into rank 3. |
| 2, 3, 4 | Projection, Surface, Application | Unchanged. `foldChildInit` and `foldChildInits` show core investing in Submodel composition helpers, not application identity. Cite them as evidence that composition is a core concern. |
| 6 | DevTools manifest | Slightly strengthened. The protocol now carries per-Command Submodel paths, so DevTools already has a partial static-architecture view. |
| 7, 8, 9 | Agent, Mirror as official packages | Unchanged. |
| 10 | `Attribute.compose` | Unchanged. |

### agent-DESIGN: `agent` option on `Runtime.makeApplication`

Unchanged. `MakeRuntimeReturn` still exposes neither the Model nor a dispatch
function. The workaround in `Agent.bind` stands. One new fact for the pitch:
`Runtime.embed` now reports startup failures (0.159.0), so an embedded agent
host can rely on the console for a failed bind.

### bundle-DESIGN: deferred items

- Dependency-change Stream beside `readDependencies` (:52): not shipped.
  `@foldkit/ui` drag-and-drop still polls per animation frame. Unchanged.
- Keyed `ManagedResource` (:59): not shipped. Unchanged.
- Not a proposal, but relevant: `Subscription.EntryGates` is now exported
  (0.163.0). bundle-DESIGN:34 relies on `Subscription.lift`'s per-entry gate;
  the type can now be named instead of derived.

### REVISION_PLAN and mixins-DESIGN: the `HtmlBuilder` seam

`__htmlBuilder<Message>()` is still declared in `foldkit/html`'s internal
module and still not exported from the public entry. The cast in
`Surface.view` stands. Unchanged.

### mixins-ui: Menu, Listbox, ComboBox, DatePicker

Their public surfaces are identical between `@foldkit/ui` 0.158.2 and 0.163.0
except one new ComboBox message (`SuppressedEmptyItemNavigation`) and
DatePicker forwarding the Calendar label fields. No `toView` or `RenderInfo`
seam appeared. The limitation at README:275 stands, and no request has been
drafted. If one is, note that Calendar and DatePicker gained overridable label
inputs in 0.161.0, so upstream is already accepting per-component render
inputs.

### evo-DESIGN: a `prefer-evo-model-update` lint rule

The rule name and premise both need updating. The core rule is now
`no-spread-in-modify-fields`, and the plugin gained five convention rules in
0.160.0 (`no-switch-on-message-tag`, `prefer-option-over-nullable-in-model`,
`prefer-command-mapmessage`, and two more). None covers "root Model spread
inside `update`", so the proposal is still open, and it is more plausible now
that the plugin clearly accepts convention rules with unit tests, integration
fixtures, and website docs (the 0.160.0 notes describe that bar).

### Sync: transition driver / admission hook

Unchanged. Resolved locally by `Sync.mount` without an upstream hook, and
nothing shipped that would make the upstream version cheaper.
