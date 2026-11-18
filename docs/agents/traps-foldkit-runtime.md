# Traps: Foldkit runtime, Mounts, Subscriptions and upstream components

Read before touching a Mount, Subscription, Command, lazy slot, embed or runtime boot, a URL or route Message, a Scene test, or an upstream component bundle (Menu, Listbox, Button, Dialog).

- **A node returned from a different function is replaced, and only a
  workspace build shows it.** Foldkit's Vite plugin brands a node with the
  function that returned it, and the differ replaces a node whose brand
  changed. The data grid's funnel came from `onNone: () => [button]` while its
  form was shut and `onSome: … => [button, form]` while open, so opening the
  form replaced the focused button, the header read the focus loss as leaving,
  and the form closed 100ms after a click. Every test passed because
  Vitest's browser project did not run the plugin; it does now (`inBrowser` in
  `vitest.shared.ts`), while the unit project and an installed package are not
  branded. Return a control that must keep focus or state from one function
  whatever the state, and assert it with `watchFocusLoss`
  (`test-support/focusLoss.mjs`).
- **Chromium drops a scroll key pressed in the last frame of its own
  animated scroll.** On a page with no script, End pressed about 150ms after
  Page Down did nothing. domains-plus left its list's keys to the browser,
  and upstream's parity test, which presses End as soon as Page Down has
  moved the page, failed one run in four (#406); Home and ArrowUp failed the
  same way. Handle such keys and scroll with `behavior: 'instant'`, as
  upstream does. Test such a key by its `defaultPrevented` and poll where the
  page lands: reading the offset straight after the press failed on CI, where
  the Command ran frames later.
- **A ResizeObserver's first report comes after the frame's animation
  callbacks.** WindowList's Mount observed the rows drawn and placed the
  list; the frame that drew the placement ran first and took rows away,
  which were never measured (#398). CPU throttling never reproduced it;
  deferring every zero-delay `setTimeout` to a frame did, every run.
  Holding the placement for that report placed the list a frame late, after
  domains-plus's first reads, which then looped (#399). Read what is drawn
  synchronously when observing starts.
- **A stream's own Message can interrupt it.** The outbox's send emitted
  its answer, which took the write out of the queue, so Foldkit restarted
  the send entry and interrupted the store write after it; the lock went
  while the store still said waiting, and a second tab sent the write again
  (once on CI, never under throttling). What must finish after an emit runs
  `Effect.uninterruptible` (with a timeout), and a lagged store per tab
  reproduces it (`outboxTabs.browser.test.ts`).
- **A Subscription's restart speaks after the Messages already queued.**
  Foldkit derives dependencies on a fiber of its own (a PubSub of Models), so
  the first Messages of a restarted stream land behind answers queued
  meanwhile. Remote's `RefreshStarted`, planned while a row was missing,
  marked stale the answer that came between, and two overlapping reads
  refreshed each other for good (#399); `Trace.run` restarts at once and
  never showed it. Emit nothing whose effect assumes the Model it was
  planned from, and test such a race with a driver whose restart lags
  (`packages/remote/test/overlappingReads.test.ts`).
- **A runtime disposed before its Subscriptions start never ends their
  streams.** `embed(...).dispose()` in the same tick as boot (React
  StrictMode's mount, unmount, mount) interrupts the Subscription fibers
  before they run, so a `Stream.ensuring` on an entry never fires. The
  runtime's first `modelToDependencies` call, made with the boot Model before
  any Message, is the reliable boot signal; do not take "my stream ended" as
  the only stop.
- **Foldkit logs a failed boot through Effect's logger and still paints.** A
  throw in `modelToDependencies` at boot is no crash view and no
  `console.error`: it goes to `console.log`. Spy on that to assert it.
- **An embedded runtime draws in place of its container.** A test that kept
  the container element and read `container.querySelector(...)` saw an empty
  page for good, and it looked like the view never ran. Read the page from
  `document`, as the other runtime tests do.
- **`embed` replaces its container with the rendering.** `getElementById` of
  the staged div is null right after boot; the content is there, the div is
  not. Query the drawn page (a role, a label), never the staged containers.
- **Foldkit's lazy slots throw outside a runtime render.** `createLazy` and
  `createKeyedLazy` read the current frame and throw when there is none (an
  inert test, a server's first pass), and Foldkit offers no way to ask first.
  The Renderer tries the slot and draws uncached when it throws. A memoized
  drawing is also reused at one position only: key it, or a move patches it
  into its neighbour.
- **`inertHtml` is every view's `h`.** It is Foldkit's one builder, inert only
  when no runtime frame exists. A check `h === inertHtml` meant as "drawn
  inert" was true in a running app too, so the inspector drew its form without
  `h.submodel` and every form Message went unwrapped to the Builder, which
  ignored it. Ask a lazy slot, which throws only for a missing frame: a catch
  around `h.submodel` also caught its duplicate-slot error and drew a dead form.
- **A Mount's acquire that throws halfway leaks what it attached first.**
  `Measure` attached a MutationObserver, then `new ResizeObserver` threw in
  jsdom, and the observer it left called `measure` later ("Cannot access
  'sizes' before initialization"). Make every observer before any observes, and
  test with the constructor stubbed away. Through Effect 4.0.1 such a stream
  neither ended nor reported; since then it fails, and a merge of Mounts
  (`Stream.mergeAll`) ends every stream in it, so one Behavior's failure took the
  canvas's clicks with it. The resolver's composed Mount fails each alone.
- **A Mount runs outside the application's `resources`.** Only Commands and
  Subscriptions get them, so a service given there (a diagnostics reporter)
  never reaches a Mount; `MountFailed` goes to the default log (#333).
- **Upstream's leave can end on a read made before the leave is drawn.**
  `Dom.waitForAnimationSettled` reads `getAnimations()` one frame after it is
  asked, with no wait for the commit (`detectElementMovement` waits). A render
  whose Model is behind the queue puts itself off a frame, so the read found
  no `data-closed` panel and the Menubar's fade was skipped on CI (#400); 300
  throttled runs never showed it. A frame race reproduces by putting a
  callback off when it runs (`real(() => real(run))` armed in the right
  frame), not when it is asked, which only reshuffles the order. The Menu,
  Listbox and Combobox bundles read after `Render.afterCommit` (`leaveDrawn`,
  `test/frames.ts` reproduces it); Popover, whose `update` an application
  calls itself, still races.
- **A disabled `Button.view` is only `aria-disabled`, and still submits.**
  Upstream keeps a disabled button focusable, so a `type: 'submit'` one stops
  neither Enter's implicit submission nor a press. The waitlist's button read
  disabled through its email check while `update` held the submit and sent it
  on the answer; a story test even asserted that. Refuse in `update` what a
  button says it refuses, and test Enter and a press in a browser.
- **Upstream's Menu clicks a row for you on a release after a press on the
  trigger.** It keeps the press's origin until the menu shuts, and a release
  on the rows over 200ms later and 5px away sends `ClickItem` as well as the
  browser's click; a check row left open flipped twice. Locally the two clicks
  fell within 200ms and the test passed; on CI they did not. Test a pointer
  path with a gap longer than any threshold the component reads.
- **An element holds one Mount.** Foldkit's `OnMount` replaces the vnode's
  `insert` hook, so a second one on an element silently drops the first. The
  mixins resolver composes the Mounts that Mixins contribute, but not one
  inside an upstream bundle: a `FluidHover` given to a listbox's `items` slot
  disabled upstream's anchor there, and the panel stayed `visibility: hidden`
  with no error. Give a Mount of your own an element of your own (the popups'
  `rows` slot), and check a slot's upstream bundle for an `OnMount` first.
- **Two Slots' attributes on one element keep one class.** Foldkit's `Class`
  (and `Style`) sets the vnode's data outright (`setModuleData`,
  `foldkit/dist/html/index.js`), so the later list wins:
  `h.label([...option.card, ...builders.choice.attrs()])` dropped the
  RadioGroup's `card` class, and the Questionnaire's choice rows lost their
  layout while the unit tests and `Inert.unslotted` passed. Give each Slot
  an element of its own, and assert the layout in a browser.
- **Mount args are captured at insert, never refreshed.** A Mount that should
  follow the Model (focus the next OTP cell after a fill) ran once with the
  initial args and never again: `OnMount` binds `insert` and `destroy` only,
  there is no update hook. Drive Model-caused DOM effects from the Message
  that updated the Model, as a Command — the platform's own prescribed path.
- **A Mount that sends no Message must not be on by default.** A Scene test
  resolves every Mount a view draws with a Message, and one that sends none
  (`ScrollBars`, `FluidHover`, `ReadingKeys`, `FollowDirection`) cannot be
  resolved, so a component drawing it by default fails the Scene tests of
  every application page that draws the component. Ship such a Mount as a
  mixin passed beside the style (`Tabs.fluid`, `X.overlayBars`,
  `X.readingKeys`).
- **A view input may hold no nested function.** `h.submodel` throws on a
  function below the top level of `viewInputs`. The plan's sketch made each
  word that takes a value a function, and the Builder's words, a nested
  object, would have crashed it drawn through `BuilderView.submodel`, as the
  CMS draws it; a test drawing it directly passed. `fillWords`' doc comment
  already said why words are text with blanks. Read the convention in the
  code before a plan's sketch, and test a view input through a submodel.
- **Foldkit's `string` route segment neither encodes nor decodes.** Built with
  a slug `a/b` it gives `/site/a/b`, which parses as `a` plus a stray segment,
  and a browser's `a%20b` reads back as `a%20b`, not `a b`. The CMS's hand-written
  `pathOf` encoded and hid it until the site moved onto a Site tree. Route text
  that is not URL-safe through `schemaSegment` with an encoding Schema
  (`examples/cms/src/apps/siteApp.ts`'s `Slug`).
- **`Subscription.lift` wraps every entry's dependencies (Foldkit 0.166).** A
  lifted entry's `modelToDependencies` returns `{ maybeDependencies: Option }`,
  gated or not. Remote lifted its entries only to map their Messages, and an
  `as never` on the result hid that each read's `{ requirements, queries }`
  had moved; only the api-cache tests that read them failed. To map Messages
  alone, map each entry's `dependenciesToStream` (Remote's `messagesAs`).
- **A URL a Command writes comes back as a `UrlChanged`.** Foldkit's
  `pushUrl`/`replaceUrl` dispatch `foldkit:urlchange`, which the runtime
  answers with `onUrlChange`; `makeApplication` itself sends nothing for the
  starting URL (0.163: `navigation/index.js`, `runtime/browserListeners.js`).
  So a Command that rewrites the URL at start, or a URL mirror's write, hands
  `update` the address the Model already shows. A new-entry reload in the CMS
  cleared its pending state on that repeat and showed "That entry does not
  exist." while every test passed, since `makeElement` wires no navigation. A
  `UrlChanged` for the shown address must not undo anything, pending work
  included: make it a no-op unless the app deliberately treats re-navigation
  as an event (Route Transitions logs "Stayed within route").
- **A Mount reads its args once.** `OnMount` acquires on snabbdom's `insert` and releases on
  `destroy`; its `postpatch` only hands a replayed Mount to the live runtime. A render that
  passes new args to the same element changes nothing, so a block handle's anchor stayed beside
  the first block the caret visited. Key the element by what the args depend on (`h.Key(node)`).
  A counter the component keeps in its Model is not such a key: CMS fills from the form's fixed
  `initial`, so the count repeated. Key by the value itself (see "Scene does not model keys").

- **Two runtimes in one document share its ids.** Two registry panes on one
  page each drew a grid with the id `products`, and the grid finds its cells
  by id, so one pane's keys would reach the other's. Give each device a page of
  its own (a frame), or ids of its own.
- **A view that returns a `Document` owns the whole body.** The todo-app
  sandbox put its note beside the app's container with `container.before`; the
  first draw of the `Document` view removed it in the deployed build, while the
  e2e test against the dev server found it. Draw such chrome in the view, in a
  Slot, and check a deploy at a phone's width, where layout faults show.
- **A no-op must return the Model it was given.** Foldkit renders only when the root Model
  changes identity, and `Update.foldChild` writes the child back unconditionally, so a
  `{ ...model }` equal copy (or a placement that re-wrote an unchanged child) rendered the
  whole page: every `pointerdown` did so through DismissLayer. Test with `toBe(model)`.

- **Give embedded Foldkit containers an id.** The runtime fails asynchronously
  before rendering when its container has no id; a DOM test otherwise sees only
  an empty element and hides the actual initialization failure. The CMS studio
  drew into a `div` its entry made in place of `#app`, with no id, and
  `pnpm dev` showed a blank page for a week: every test mounts its own
  container. Only an e2e test runs the real entry.

