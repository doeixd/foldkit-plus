# Traps: browser, e2e and layout tests

Read before writing or debugging a `*.browser.test.ts`, an e2e test, a touch or pointer test, or a layout assertion.

## Keys, focus and frames

- **Keys faster than a frame meet the last frame's view.**
  Typing on the grid opened an editor but keys sent before it was drawn reached the grid, whose drawn state said "not editing", so each restarted the edit ("Dowel" became "l"): make the Message carry enough for `update` to continue what is open (`EditTyped` adds to an open draft). TagsInput guessed whether its input had been redrawn by whether the text started with the tag just added; a frame drawn mid-burst showed `reac`, the next key made `react` and the draft was stripped (#224, only CI placed a frame there): let the handler send the Model state it was drawn from (`Typed.drawn`), and let a key handler that must decide on what an input holds (Command's Backspace in an empty field) read a cell the drawing's own `OnInput` fills. An edit's patch is a Command a loaded machine runs after the next keys, so three Enters and an ArrowUp moved the caret through a page without the new lines: the editor holds caret keys, and edits behind them, until every edit it asked for is answered (`Attachment.answered`). Reproduce by holding `requestAnimationFrame` in the browser test or `Emulation.setCPUThrottlingRate`, not by throttling alone.
- **Enter submits through a button the last frame drew enabled.**
  A natively `disabled` default button made the browser drop Enter, so the crud editor test, pressing right after `fill` and before the frame that enables submit, timed out waiting for `aria-busy` (once in a full run); a user who pastes and presses Enter does the same. The form's button is `aria-disabled`, never `disabled`, and `update` decides from the Model (accepts once valid, refuses visibly with every key marked). Hold `requestAnimationFrame` across the fill to test it (`submitKeys.browser.test.ts`); a button of your own with `h.Disabled` still drops the key. Playwright refuses to click an `aria-disabled` element: press with `focus()` and `click()`.
- **A synthetic event moves no focus.**
  `dispatchEvent(new MouseEvent('click'))` and a `keydown` to an element leave focus where it was, so a jsdom test of the Builder kept focus in the layers and a focus-following Mount "broke" it. Focus what a user would press and test focus in a browser with `userEvent` (four focus bugs passed every test: Enter, Delete, a disabled button, a narrow panel).
- **A tap focuses the link, and focus is intent of its own.**
  A touch test of `pointedLinks` passed with the finger's fast path deleted: Chromium focuses a tapped link about 20ms after `pointerup` and the focus counted after its own wait. Hold the focus off (`mousedown` -> `preventDefault`) to test the finger alone, and log the real event sequence before trusting a touch test.
- **End goes to the end of a line, not of a block, and CI wraps elsewhere.**
  The playground's e2e pressed a callout then End and typed; CI's fonts (DejaVu Sans) wrap onto more lines, so the caret stopped mid-text (Windows and the Playwright image passed). Put the caret at a block's end with a press past its last line (`caretAtEnd` in `playground.e2e.ts`); reproduce in the Playwright image with `fonts-dejavu-core`.

## The shared pointer and Vitest's locators

- **The browser tests share one real pointer: park it somewhere known before asserting `:hover`/`:active`.**
  A test pressing the mouse through `cdp()` (`Input.dispatchMouseEvent`) and checking `:active` failed now and then in a wide run because other files moved or pressed the pointer; fixing coordinates (the frame's offset, its scale, `DOM.getBoxModel`) never made it reliable. Force the state instead (`CSS.forcePseudoState` on a node from `DOM.querySelector`), looking the node up once (each `DOM.getDocument` hands out new ids and a release sent to a new id left the old one forced). A row read as transparent failed only in CI because an earlier file left the mouse over it: move the pointer before asserting (`userEvent.hover(document.body, { position: … })`) to an empty spot away from the controls, not the corner (a (1, 1) park sat on a menu trigger and failed three CI runs).
- **Vitest's locator names things its own way.**
  `userEvent.click` on an accordion trigger timed out looking for "Team Team" (vitest's in-page library read a hidden `::after` copy into the name; Chrome's tree says "Team"): check a name against Chrome's tree (`Accessibility.getFullAXTree` per frame, as `steady.browser.test.ts` does) and press with `click()`. It also names an element by a selector made at the call, often by position: `userEvent.hover(spot)` on a bare `div` sent `div >> nth=1` before the runtime drew a `nav` in place of its container, and on a loaded CI runner nothing matched (`nav.browser.test.ts`). Give an element you act on an id or use `page.getByRole`.
- **A moving element is never stable to Playwright.**
  `userEvent.hover` on a running Marquee's copy timed out ("element is not stable"). Hover the still region around it.
- **A hidden browser tab, or an open one across a restart, is not a bug in the page.** See `traps-tooling-vitest-mutate.md`.

## Layout and animation

- **One layout decision written twice drifts apart.**
  The page builder stacked its panels below 64rem of its own width but showed the tabs that choose one only below 52rem, so at 1280px every panel stood above the page and New page looked broken. Name the width once, pass it to every query that decides the same thing, and test at a width between the old values.
- **A layout test that checks what shows passes a broken layout.**
  The narrow editor's test asserted which panels were visible at 600px while the grid still had three columns and the shown panel was squeezed to 50px. Assert geometry (a width, a position) for a layout claim, and take a screenshot once.
- **A transition's end value is not its end, and a settle can pass before the animation starts.**
  A `Measure` test waited until a row's height read its final value then asserted a stylesheet was not yet seen; the transition still had a frame and `Measure` measures every frame (CI saw the margin early): wait for `getAnimations()` to be empty. The Sheet's touch test swiped, awaited `settled(panel)` (no running animation) and read `releases()`; when `Released` had not landed nothing was animating, the settle resolved at once and CI read 0 about one run in two: wait for evidence of the step first (the count above zero), then settle, then assert the exact value.
- **An indicator test can pass by an accidental re-measure.**
  A test flipping `dir` and reading that the indicator moved also passes without the fix when a sub-pixel resize or a running transition makes `Measure` measure again. Fix the fixture's width and drop its transitions so only the change under test can move it.
- **A layout-shift test needs files that arrive late.**
  A test of `Image` loading `data:` URLs reported no shift with `width` and `height` deleted (such files arrive before first layout). Hold the request (`cdp().send('Fetch.enable', …)`, then `Fetch.fulfillRequest` after two frames) and the same deletion reports one.
- **A MutationObserver callback sees the element as it is now, not as each record left it.**
  The Menu's leave test read the panel's attributes in the callback, so a batch adding `data-closed` beside `data-leave` and moving on recorded only `leave` (CI failed it now and then). Observe with `attributeOldValue` and replay the records (`packages/mixins-ui/test/observe.ts`).
- **The default theme moves measured sizes.**
  Density 1.1 and text scale 1.025 changed every pixel size: a test that measures one pins `unitKnobs` (`.touch.browser` files too). With fluid text CI's DejaVu Sans digits run about 10% wider than Segoe UI's; force `Verdana` locally to see CI's widths.
- **A colour outside sRGB shifts when painted.**
  A canvas clips it: the default accent ink `oklch(0.45 0.225 235)` painted at hue 257. Compare painted colours with each other, never with a knob value.
- **A sleep between synthetic events stretches past what reads their times.**
  The Sheet reads a flick's speed from `event.timeStamp` over the last 100ms; on a loaded CI runner even `setTimeout(1)` between press and move ran past that and every flick read as a rest. Space such events with a busy-wait in one synchronous run (`flick` in `sheet.browser.test.ts`) and wait for the outcome, not a mark (`data-dragging`) a synchronous run may never draw.
- **Emulate a coarse pointer through the browser, in a `*.touch.browser.test.ts`.**
  A cast `matchMedia` answers only the one query it was written for. `cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })` makes `(hover: hover) and (pointer: fine)` fail for real but cannot be undone in a page: on Linux, Chromium turned off reports `pointer: none`, so every later file lost its fine pointer on CI (overlay bars never drew, a Sheet's flick did not dismiss) while Windows came back `fine`. The `browser-touch` project's page is a touch screen from the start (`hasTouch`). Reproduce a CI-only browser failure in `mcr.microsoft.com/playwright` under Docker.

## Playwright and screenshots

- **A phone zooms out to fit a page that overflows.**
  Under `isMobile`, a page 664px wide at 390px reported `innerWidth` 664, so a `scrollWidth - innerWidth` check read 0 with the fault in place. Measure against `document.documentElement.clientWidth` and break a demo once to see the check fail.
- **Chrome's `fullPage` screenshot wraps past 16,384px.**
  The 18,000px file-upload page came out as the whole page twice (the DOM held one heading; `adoption.e2e.ts` counts it). Capture elements or viewports for a taller page.
- **A Playwright route that waits inside its handler stalls the next one, and `route.fulfill` without a charset serves windows-1252.**
  `route.fallback()` hands the request on only when the handler returns, so awaiting `request.response()` inside it hung every held write: wait outside the handler. "Loading…" arrived as "Loadingâ€¦" and a text check passed for the wrong reason: pass `contentType: 'text/html; charset=utf-8'`.
- **Foldkit's slow-render warning logs the Model, and a browser test pays to format it.**
  Vitest formats a console call's arguments in the page: with the registry's 100,000 rows about 200ms a warning, and on a loaded runner every render is over budget and the warnings took the test past its 15s. A browser test of a large Model passes `slow: false`; reproduce with `Emulation.setCPUThrottlingRate` at 4.
- **The render benchmark's Worker port can be held by the last run.**
  domains-plus's `wrangler dev` outlived `taskkill /T` for a moment, the next run's first fetch reached it, and the page served by the other build's Worker never hydrated ("no View phase reported"). `pnpm bench:render` now refuses a port already answering.
- **A sheet an earlier test installed defines what a later one removes.**
  domains-plus's pruned-sheet test swapped its `<style>` for the pruned text and compared computed styles; run after the file's other tests the full sheet was still in the head, every token stayed defined and both prune mutations survived (`-t` alone killed them; #488, filed as a tooling bug, was this). Remove what a test installs in its own cleanup and run a mutation's test file whole before blaming the tool. The test then met two more: `document.fonts.ready` resolved with the face still loading, and new text in a `<style>` holding an `@font-face` loads the face again: before comparing two draws await each face's `load()` and every animation's `finished`.
