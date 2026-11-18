# Traps: Foldkit runtime, Mounts, Subscriptions and upstream components

Read before touching a Mount, Subscription, Command, lazy slot, embed or runtime boot, a URL or route Message, a Scene test, or an upstream component bundle (Menu, Listbox, Button, Dialog).

Foldkit's own behaviour we work around is also listed in `docs/upstream-foldkit-ssr.md` ("Other Foldkit behaviour we work around").

## Mounts

- **An element holds one Mount, and a Mount reads its args once.**
  `OnMount` replaces the vnode's `insert` hook, so a second one silently drops the first (a `FluidHover` on a listbox's `items` slot disabled upstream's anchor: panel stuck `visibility: hidden`, no error). It acquires on `insert` and releases on `destroy`; `postpatch` only hands a replayed Mount to the live runtime, so new args on the same element change nothing (a block handle's anchor stayed by the first block). The resolver composes Mixins' Mounts but not one inside an upstream bundle: check a slot's bundle for `OnMount`, give your Mount an element of its own (the popups' `rows` slot), key the element by the value the args depend on (`h.Key(node)`, never a Model counter: CMS fills from the form's fixed `initial`), and drive Model-caused DOM effects from the Message as a Command (focus the next OTP cell).
- **A Mount that sends no Message must not be on by default.**
  A Scene test resolves every Mount with a Message; `ScrollBars`, `FluidHover`, `ReadingKeys`, `FollowDirection` send none, so a component drawing one failed the Scene tests of every page using it. Ship it as a mixin beside the style (`Tabs.fluid`, `X.overlayBars`, `X.readingKeys`).
- **A Mount's acquire that throws halfway leaks what it attached first.**
  `Measure` attached a MutationObserver, then `new ResizeObserver` threw in jsdom, and the leftover observer called `measure` later ("Cannot access 'sizes' before initialization"). Construct every observer before any observes; test with the constructor stubbed away. A merge of Mounts (`Stream.mergeAll`) ends every stream when one fails (Effect 4.0.1: it neither ended nor reported); the resolver's composed Mount fails each alone.
- **A Mount runs outside the application's `resources`.**
  Only Commands and Subscriptions get them, so a service given there (a diagnostics reporter) never reaches a Mount; `MountFailed` goes to the default log (#333).
- **A ResizeObserver's first report comes after the frame's animation callbacks.**
  WindowList observed the rows drawn and placed the list; the frame that drew the placement took rows away, never measured (#398). Holding the placement for that report placed the list a frame late and domains-plus's first reads then looped (#399). Read what is drawn synchronously when observing starts; deferring every zero-delay `setTimeout` to a frame reproduces it (CPU throttling never did).

## Subscriptions, streams and Messages

- **A stream's own Message can interrupt it.**
  The outbox's send emitted its answer, which took the write out of the queue, so Foldkit restarted the send entry and interrupted the store write after it: the lock went while the store said waiting, and a second tab resent (once on CI). Run what must finish after an emit `Effect.uninterruptible` (with a timeout); a lagged store per tab reproduces it (`outboxTabs.browser.test.ts`).
- **A Subscription's restart speaks after the Messages already queued.**
  Foldkit derives dependencies on a fiber of its own (a PubSub of Models), so a restarted stream's first Messages land behind answers queued meanwhile: Remote's `RefreshStarted`, planned while a row was missing, marked stale the answer between, and two overlapping reads refreshed each other for good (#399; `Trace.run` restarts at once and never showed it). Emit nothing whose effect assumes the Model it was planned from; test with a lagging restart (`packages/remote/test/overlappingReads.test.ts`).
- **A runtime disposed before its Subscriptions start never ends their streams.**
  `embed(...).dispose()` in the boot tick (React StrictMode) interrupts the fibers before they run, so a `Stream.ensuring` never fires. The runtime's first `modelToDependencies` call (boot Model, before any Message) is the reliable boot signal; do not rely on "my stream ended".
- **`Subscription.lift` wraps every entry's dependencies (Foldkit 0.166).**
  A lifted entry's `modelToDependencies` returns `{ maybeDependencies: Option }`; Remote's `as never` hid that each read's `{ requirements, queries }` had moved (only api-cache tests failed). To map Messages alone, map each entry's `dependenciesToStream` (Remote's `messagesAs`).
- **A URL a Command writes comes back as a `UrlChanged`.**
  `pushUrl`/`replaceUrl` dispatch `foldkit:urlchange`, answered by `onUrlChange` (`makeApplication` sends nothing for the starting URL; 0.163 `navigation/index.js`, `runtime/browserListeners.js`). A new-entry reload in the CMS cleared its pending state on that repeat ("That entry does not exist.") while tests passed, since `makeElement` wires no navigation. Make a `UrlChanged` for the shown address a no-op, pending work included, unless re-navigation is deliberately an event.
- **A no-op must return the Model it was given.**
  Foldkit renders only when the root Model changes identity and `Update.foldChild` writes the child back unconditionally, so a `{ ...model }` copy rendered the whole page (every `pointerdown`, via DismissLayer). Test with `toBe(model)`.

## Boot, embed and views

- **Foldkit logs a failed boot through Effect's logger and still paints.**
  A throw in `modelToDependencies` at boot goes to `console.log`, not `console.error` or a crash view; spy on that.
- **Give an embedded container an id, and read the page from `document`.**
  The runtime fails asynchronously before rendering when its container has no id (the CMS studio drew into an id-less `div`: blank `pnpm dev` for a week, every test mounted its own container; only an e2e runs the real entry). `embed` draws in place of its container, so `getElementById` of the staged div is null and `container.querySelector` sees an empty page for good: query the drawn page (a role, a label).
- **Foldkit's lazy slots throw outside a runtime render.**
  `createLazy` and `createKeyedLazy` read the current frame and throw with none (inert test, server's first pass), and there is no way to ask first; the Renderer tries the slot and draws uncached on a throw. A memoized drawing is reused at one position only: key it, or a move patches it into its neighbour.
- **`inertHtml` is every view's `h`.**
  It is inert only when no runtime frame exists, so `h === inertHtml` was true in a running app and the inspector drew its form without `h.submodel` (every form Message reached the Builder unwrapped and was ignored). Ask a lazy slot, which throws only for a missing frame; a catch around `h.submodel` also caught its duplicate-slot error and drew a dead form.
- **A node returned from a different function is replaced, and only a workspace build shows it.**
  Foldkit's Vite plugin brands a node with the returning function and the differ replaces a node whose brand changed: the data grid's funnel came from `onNone` while shut and `onSome` while open, so opening replaced the focused button and the form closed 100ms after a click. Unit tests and installed packages are unbranded (the browser project runs the plugin: `inBrowser` in `vitest.shared.ts`). Return a control that must keep focus or state from one function and assert it with `watchFocusLoss` (`test-support/focusLoss.mjs`).
- **A view input may hold no nested function.**
  `h.submodel` throws on a function below the top level of `viewInputs`; a plan's sketch with nested word functions would have crashed the Builder drawn through `BuilderView.submodel`, as the CMS draws it, while a direct draw passed. Words are text with blanks (`fillWords`); read the convention in code before a plan's sketch and test a view input through a submodel.
- **A view that returns a `Document` owns the whole body, and two runtimes in one document share ids.**
  The todo-app sandbox's note, put beside the container with `container.before`, was removed by the first draw in the deployed build only (the dev e2e found it): draw chrome in the view, in a Slot, and check a deploy at a phone's width. Two registry panes each drew a grid with id `products`, and the grid finds cells by id: give each device a frame of its own, or its own ids.
- **Foldkit's `string` route segment neither encodes nor decodes.**
  Slug `a/b` builds `/site/a/b` (parses as `a` plus a stray segment), and `a%20b` reads back as `a%20b`. Route non-URL-safe text through `schemaSegment` with an encoding Schema (`examples/cms/src/apps/siteApp.ts`'s `Slug`).

## Upstream components and the browser

- **Upstream's leave can end on a read made before the leave is drawn.**
  `Dom.waitForAnimationSettled` reads `getAnimations()` one frame after it is asked, without waiting for the commit (`detectElementMovement` waits); a render behind the queue put itself off a frame, found no `data-closed` panel, and the Menubar fade was skipped on CI (#400; 300 throttled runs never showed it). Menu, Listbox and Combobox read after `Render.afterCommit` (`leaveDrawn`, `test/frames.ts`); Popover, whose `update` an application calls itself, still races. Reproduce a frame race by putting a callback off when it runs (`real(() => real(run))`), not when it is asked.
- **A disabled `Button.view` is only `aria-disabled`, and still submits.**
  Upstream keeps it focusable, so a `type: 'submit'` one stops neither Enter's implicit submission nor a press (the waitlist's button read disabled while `update` held the submit and sent it on the answer; a story test asserted that). Refuse in `update` what a button says it refuses; test Enter and a press in a browser.
- **Upstream's Menu clicks a row for you on a release after a press on the trigger.**
  It keeps the press's origin until the menu shuts, so a release on the rows over 200ms later and 5px away sends `ClickItem` as well as the browser's click (a check row flipped twice; locally the clicks fell within 200ms, on CI they did not). Test a pointer path with a gap longer than any threshold the component reads.
- **Two Slots' attributes on one element keep one class.**
  Foldkit's `Class` (and `Style`) sets the vnode's data outright (`setModuleData`, `foldkit/dist/html/index.js`): `h.label([...option.card, ...builders.choice.attrs()])` dropped the RadioGroup's `card` class and the Questionnaire's rows lost their layout while unit tests and `Inert.unslotted` passed. Give each Slot an element of its own and assert layout in a browser.
- **Chromium drops a scroll key pressed in the last frame of its own animated scroll.**
  On a script-free page End pressed about 150ms after Page Down did nothing; upstream's parity test failed one run in four (#406; Home and ArrowUp too). Handle such keys and scroll with `behavior: 'instant'`; test by `defaultPrevented` and poll where the page lands (reading the offset straight after the press failed on CI).
