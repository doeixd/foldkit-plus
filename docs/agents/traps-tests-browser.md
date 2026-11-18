# Traps: browser, e2e and layout tests

Read before writing or debugging a *.browser.test.ts, an e2e test, a touch or pointer test, or a layout assertion.

- **Foldkit's slow-render warning logs the Model, and a browser test pays to
  format it.** Vitest formats a console call's arguments in the page: with
  the registry's 100,000 rows, about 200ms a warning. On a loaded runner every
  render is over budget, and the warnings took the test past its 15s. A
  browser test of a large Model passes `slow: false`; reproduce with
  `Emulation.setCPUThrottlingRate` at 4.
- **One layout decision written twice drifts apart.** The page builder
  stacked its panels below 64rem of its own width but showed the tabs that
  choose one only below 52rem, so between the two (a 1280px window) every
  panel stood above the page and New page looked broken. Name the width once
  and pass it to every query that decides the same thing, and test at a width
  between the old values.
- **A layout test that checks what shows passes a broken layout.** The
  narrow editor's test asserted which panels were visible at 600px; the
  example's grid still had three columns, collapsing only by the window, and
  the panel it showed was squeezed to 50px. Assert geometry (a width, a
  position) when the claim is about layout, and take a screenshot once.
- **Enter submits through a button the last frame drew enabled.** A natively
  `disabled` default button made the browser drop Enter, so the crud editor
  test, pressing it right after `fill` and before the frame that enables the
  submit button, saw no submit and timed out waiting for `aria-busy` (once in
  a full run); a user who pastes and presses Enter does the same. The form's
  button is now `aria-disabled`, never `disabled`, and `update` decides from the
  Model, so such an Enter is accepted once the Model is valid and refused
  visibly (every key marked) when not. Hold `requestAnimationFrame` across the
  fill to test it (`submitKeys.browser.test.ts`); a button of your own with
  `h.Disabled` still drops the key. Playwright refuses to click an
  `aria-disabled` element: press it with `focus()` and `click()`.
- **Keys faster than a frame meet the last frame's view.** Typing on the grid
  opened an editor, but keys sent before it was drawn and focused reached
  the grid, whose drawn state still said "not editing", so each restarted the
  edit: "Dowel" became "l". A browser test caught it only some runs. When a
  key opens something that takes the keys after it, make the Message carry
  enough for `update` to continue what is open (`EditTyped` adds to an open
  draft), since the view's own state may be a frame old. When a key handler
  must decide on what an input holds (Command's Backspace in an empty field),
  let that drawing's own `OnInput` record the text in a cell the drawing
  makes, and read the cell: both handlers belong to the same drawing.
- **Tell which drawing a text came from by the drawing, not the text.**
  TagsInput guessed whether its input had been redrawn since a commit by
  whether the text started with the tag just added. A frame drawn mid-burst
  showed `reac`, the next key made `react`, and the draft was stripped to
  nothing; only CI placed a frame there (#224). Let the handler send the
  Model state it was drawn from (`Typed.drawn`), and reproduce a frame race
  by holding `requestAnimationFrame` in the browser test, not by throttling.
- **A tap focuses the link, and focus is intent of its own.** A touch test of
  `pointedLinks` passed with the finger's fast path deleted: Chromium focuses
  a tapped link about 20ms after `pointerup`, and the focus counted after its
  own wait. Hold the focus off (`mousedown` -> `preventDefault`) to test the
  finger alone, and log the real event sequence before trusting a touch test.
- **A synthetic event moves no focus.** `dispatchEvent(new MouseEvent('click'))`
  and a `keydown` sent to an element leave focus where it was, so a jsdom test
  of the Builder kept focus in the layers through a crumb click and a key on
  the canvas, and a focus-following Mount "broke" it. Focus what a user would
  press, and test a focus claim in a browser with `userEvent`: four focus
  bugs (Enter, Delete, a disabled button, a narrow panel) passed every test.
- **A transition's end value is not its end.** A `Measure` test waited until a
  row's height read its final value, then asserted a stylesheet was not yet
  seen; the transition still had a frame to run, `Measure` measures every
  frame of one, and CI saw the margin early. Wait for `getAnimations()` to be
  empty before asserting what a later step alone causes.
- **A sheet an earlier test installed defines what a later one removes.**
  domains-plus's pruned-sheet test swapped its `<style>` for the pruned text
  and compared computed styles; run after the file's other tests, their
  full sheet was still in the head, so every token stayed defined and both
  prune mutations survived, while `-t` alone killed them (#488, filed as a
  tooling bug, was this). Remove what a test installs in its own cleanup, and
  run a mutation's test file whole, as `pnpm mutate` does, before blaming
  the tool. The same test then met two more: `document.fonts.ready`
  resolved with the face still loading, and new text in a `<style>` holding
  an `@font-face` loads the face again. Before comparing two draws, await
  each face's `load()` and every animation's `finished`.
- **A held mouse races the other test files.** A test that pressed the
  mouse through `cdp()` (`Input.dispatchMouseEvent`) and checked `:active`
  failed now and then in a wide run: every test file shares one real
  pointer, and the others moved or pressed it while this one held it down.
  Fixing the coordinates (the frame's offset, its scale, `DOM.getBoxModel`)
  never made it reliable. Force the state instead (`CSS.forcePseudoState`
  on a node from `DOM.querySelector`), and look the node up once: each
  `DOM.getDocument` hands out new ids, and a release sent to a new id left
  the old one forced.
- **Vitest's locator names a button its own way, not Chrome's.** `userEvent.click`
  on an accordion trigger timed out looking for "Team Team": vitest's in-page
  library read a hidden `::after` copy into the name, which Chrome's own
  accessibility tree does not (it says "Team"). Check a name against
  Chrome's tree (`Accessibility.getFullAXTree` per frame, as
  `steady.browser.test.ts` does), and press such an element with `click()`.
- **Vitest names an element by a selector made at the call, often by
  position.** `userEvent.hover(spot)` on a bare `div` sent `div >> nth=1`,
  made before the runtime drew a `nav` in place of its container; on a loaded
  CI runner the draw landed first, nothing matched, and the hover timed out
  (`nav.browser.test.ts`). Give an element you act on an id, or act through a
  locator (`page.getByRole`).
- **The browser tests share one real pointer.** A test that read a row's
  resting fill as transparent failed in CI only: an earlier test file had left
  the mouse where the row was drawn, so it was hovered. Before asserting
  anything `:hover` changes, move the pointer somewhere known
  (`userEvent.hover(document.body, { position: … })`).
  A corner of the page is no such place: three CI runs failed a state test
  that parked the pointer at the body's (1, 1), where its menu trigger was
  drawn, so the next test read the trigger hovered. Draw an empty spot away
  from the controls and hover that.
- **The default theme moves measured sizes.** Density 1.1 and text scale 1.025
  changed every pixel size; a test that measures one pins `unitKnobs`,
  `.touch.browser` files included. With fluid text, CI's DejaVu Sans digits
  run about 10% wider than Segoe UI's; force `Verdana` locally to see CI's
  widths.
- **A colour outside sRGB shifts when painted.** A canvas clips it: the default
  accent ink `oklch(0.45 0.225 235)` painted at hue 257. Compare painted
  colours with each other, never with a knob value.
- **A settle on animations passes before the animation starts.** The Sheet's
  touch test swiped its handle, awaited `settled(panel)` (no running
  animation), and read `releases()`: when the `Released` Message had not
  landed yet, nothing was animating, the settle resolved at once, and CI read
  0 about one full run in two. Wait for evidence of the step first (the count
  above zero), then settle, then assert the exact value.
- **A MutationObserver callback sees the element as it is now, not as each
  record left it.** The Menu's leave test read the panel's attributes in the
  callback, so a batch that added `data-closed` beside `data-leave` and then
  moved on recorded only `leave`, and CI failed it now and then. Observe with
  `attributeOldValue` and replay the records (`packages/mixins-ui/test/observe.ts`).
- **Emulate a coarse pointer through the browser, not a stubbed
  `matchMedia`.** A cast `matchMedia` answers the one query it was written
  for and nothing else; `cdp().send('Emulation.setTouchEmulationEnabled',
  { enabled: true, maxTouchPoints: 5 })` makes `(hover: hover) and (pointer:
  fine)` fail for real. But it cannot be undone in a page: on Linux, Chromium
  turned off again reports `pointer: none`, so on CI every later file in that
  page lost its fine pointer (the overlay bars never drew, a Sheet's flick did
  not dismiss) while Windows, with a real mouse, came back `fine`. A coarse
  test is a `*.touch.browser.test.ts`, run by the `browser-touch` project,
  whose page is a touch screen from the start (`hasTouch`). Reproduce a
  CI-only browser failure in `mcr.microsoft.com/playwright` under Docker.
- **A layout-shift test needs files that arrive late.** A test of `Image` that
  loaded `data:` URLs reported no shift with `width` and `height` deleted: such
  a file arrives before the first layout, so nothing moves either way. Hold
  the request in the browser (`cdp().send('Fetch.enable', …)`, then
  `Fetch.fulfillRequest` after two frames) and the same deletion reports one.
- **An indicator test can pass by an accidental re-measure.** A test that
  flips `dir` and reads that the indicator moved also passes without the
  fix when a sub-pixel resize or a transition still running makes `Measure`
  measure again anyway. Fix the fixture's width and drop its transitions, so
  only the change under test can move it.
- **A sleep between synthetic events stretches past what reads their times.**
  The Sheet reads a flick's speed from `event.timeStamp` over the last 100ms;
  on a loaded CI runner even `setTimeout(1)` between press and move ran
  past that, and every flick read as a rest. Space such events with a
  busy-wait in one synchronous run (`flick` in `sheet.browser.test.ts`),
  and wait for the outcome itself, not for a mark (`data-dragging`) a
  synchronous run may never draw.
- **A key the browser handles meets the last drawn page, not the Model.**
  An edit's patch is a Command, which a loaded machine runs after the next
  keys, so three Enters and an ArrowUp moved the caret through a page without
  the new lines. The editor now holds caret keys, and edits behind them,
  until every edit it asked for is answered (`Attachment.answered`).
  Reproduce such a race locally with `Emulation.setCPUThrottlingRate`.
- **End goes to the end of a line, not of a block, and CI wraps elsewhere.**
  The playground's e2e pressed a callout at a fixed point, then End, and
  typed: on CI, whose fonts (DejaVu Sans) wrap the text onto more lines, the
  caret stopped mid-text and every run failed while Windows and the
  Playwright image passed. Put the caret at a block's end with a press past
  its last line (`caretAtEnd` in `playground.e2e.ts`), and reproduce in the
  Playwright image with `fonts-dejavu-core` installed.
- **A phone zooms out to fit a page that overflows.** Under Playwright's
  `isMobile`, a page 664px wide at 390px reported `innerWidth` 664, so a
  sideways-scroll check of `scrollWidth - innerWidth` read 0 with the fault in
  place. Measure against `document.documentElement.clientWidth`, the layout
  viewport, and break a demo once to see the check fail.
- **Chrome's `fullPage` screenshot wraps past 16,384px.** The 18,000px file-upload
  page came out as the whole page twice, its top repeating below its end; the DOM held
  one heading (`adoption.e2e.ts` counts it). Capture elements or viewports for a taller page.
- **A Playwright route that waits inside its handler stalls the next one.**
  `route.fallback()` hands the request on only once the handler returns, so
  awaiting `request.response()` inside it hung every held write. Wait for
  the answer outside the handler.
- **`route.fulfill` without a charset serves text as windows-1252.**
  "Loading…" arrived as "Loadingâ€¦", and a text check passed for the wrong
  reason. Pass `contentType: 'text/html; charset=utf-8'`.
- **A moving element is never stable to Playwright.** `userEvent.hover` on
  a running Marquee's copy timed out ("element is not stable"), since the
  locator waits for the box to stop. Hover the still region around it.
- **The render benchmark's Worker port can be held by the last run.**
  domains-plus's `wrangler dev` outlived `taskkill /T` for a moment, the next
  run's first fetch reached it, and the page, served by the other build's
  Worker, never hydrated ("no View phase reported"). `pnpm bench:render` now
  refuses a port already answering.


