# Progress: examples and variations from the packages' own factories (#589)

The design is [589-example-factories-DESIGN.md](./589-example-factories-DESIGN.md); its §8 is the plan this file follows. The maintainer decided on 2026-11-17 that all of it ships in 0.41.0. The work is on the `ui-polish` branch (draft PR #591), pushed as it goes. The coordinator updates this file after each agent reports; a row's commit is the last one of that piece of work.

Status words: **done** (committed, pushed, its own checks green), **running**, **waiting** (blocked on the row named), **not started**.

## Phases

| Phase | What | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| Design | The consolidated design note and issue body | done | 53ed8ba81 | |
| 0 | Measurements M1 to M7 and probes P1 to P3 | done | (measured, no commit) | Every design choice held. Freezing styles saves 22.4 kB brotli on a one-Button page; a narrowed recipe saves 136 B, so per-value recipe files stay rejected; a placed Bundle costs 6.2 kB over a hand fold, so the README shows the hand fold first; unread feature files drop from a page; P1 and P3 pass. Largest kept-for-nothing imports: Breadcrumb to Menu 21.1 kB, Sidebar 16.9 kB, ColorPicker to Popover 7.6 kB. Not measured: M8, M9, bundlers other than Vite 8, `pack:check` for the probes. |
| 1.1 | `recipe.add` | done | 5122b5d1d | A value an axis already has is a type error and throws; `MergeAxes` exported. |
| 1.2 | Conventions as code | partly done | d6ec9817f | `configure.ts`, `words.ts` (read by Calendar and Combobox), `choice.ts` with `one`, `many`, `text`, `rowContent.ts` (built with `Combobox.view`). Deferred to their first reader: press, tone and size names, the anchor helper. |
| 1.3 | `Bundles`, the `foldkit-bundle` peer, the gate Bundles, options-level views and `configure` | done | b02d8d697 | `Bundles.TagsInput`, `Combobox`, `Calendar`, `DatePicker`, `FileUpload`; options-level `view` and `configure` on Calendar, Combobox and DatePicker; `configure` on Button, TagsInput and FileUpload. All 25 call-with-options rows of the calendar reference table are checked by tests. `ResolvedCaption` gained `YearDropdown` (breaking). `foldkit-bundle` needs a version bump at the end. |
| 1.4 | The site harness: one module per example, shown whole | done | 0429de335 | Modules and regions mix per page, so pages convert one at a time. One loosely typed seam in `gallery/example.ts`. |
| 1.5 | The gate: button, tags-input, calendar, date-picker, combobox and the new file-upload page | done, two gaps | 5d3d796dd | All six pages are modules end to end; the old state for them is deleted. Prerender green; adoption e2e counts one heading and one copy of each example after hydration. Gallery first load 410.5 kB against a ceiling moved to 411,500 (file upload is 5.4 kB of it). Example length: 16 of 31 modules are at most 26 lines after imports; compositions run 33 to 65. Gaps: Sorting is not on the file-upload page (needs a way to map a Mixin's Messages in `foldkit-mixins`); the avatar layout has no uploading overlay. A "page drawn twice" in early screenshots was Chrome's full-page capture wrapping past 16,384px. |
| 2 | The families F1 to F11 | running | | See the family table below. |
| 3 | `make` for Sidebar and Questionnaire; the DataGrid features split; Chart fills | not started | | Only if P3 passes. |
| 4 | New widgets: Sortable, time field, Attachment, File Type, Scrollspy, Kanban page, Toggle pages | not started | | Frame is in F2. |
| 5 | Integration: shared files, README, skill, changelog, generated entries, site state deleted, Jev, CI | not started | | |

## Families (phase 2)

Each family did its breaking changes first, then options, Bundles, `configure` and its website pages as example modules. "Left" lists what its agent did not build or verify.

| Family | Status | Last commit | Left |
| --- | --- | --- | --- |
| F1 buttons and marks: badge, button, button-group, toolbar, kbd, icon, spinner, label, separator | done | 6f29a4ec3 | Jev not run on toolbar, kbd, label, spinner, icon. Toolbar's browser and SSR mutations not run. Hover and focus captured for some controls only. |
| F2 surfaces and text: avatar, card, card-group, item, typography, alert, image, empty, figure, aspect-ratio, skeleton, frame (new) | done | 3de3cb883 | Card elevation `fade`/`stack`, Avatar ring `pulse`/`gradient`, Alert `actions` not built. Hover and focus not captured. |
| F3 text fields: adornments, input, search-field, number-field, password-input, input-copy, textarea, otp-field, Field shell (new), fieldset | done | 26cc80c98 | Jev not run on search-field, number-field, password-input, input-copy, otp-field. |
| F4 choice controls: checkbox, checkbox-group, switch, radio-group, segmented, rating, slider, angle-slider, native select | done | e0344c339 | Only rest states looked at. Checkbox group, segmented, slider and angle slider pages are modules beside old regions. |
| F5 selection popups: listbox, picker, cascade-select | done | 016611c19 | Cascade select: several chosen paths, search, footer, loading level, windowed columns (8 of 21 reference rows). |
| F6 dates and colour: calendar and date-picker (gate), color-picker, timer | done | 36c57b415 | ColorPicker's priority-3 additions. |
| F7 overlays: dialog (with alert dialog), sheet, drawer, popover, tooltip, hover-card, toast | done | 36c57b415 | No `Dialog.view` or `Popover.view` (the note put them in 0.42.0), so dialog examples run 50 to 87 lines and the example length limit rose from 52 to 90. Non-modal Dialog. Old page state not deleted. |
| F8 menus and navigation: breadcrumb, steps, pagination, tabs, menu, context menu, menubar, navigation menu, command | done | f8111984b | Menubar submenus (needs a new Model for the bar). Menu, menubar, navigation-menu and command pages are modules beside old regions. No type tests or build pins for the new Bundles. |
| F9 layout and disclosure | running | | Sidebar's `make` is phase 3. |
| F10 data and media: table, chart, progress, meter, code-block, file-input, file-drop, image-cropper, signature-pad, qr-code, marquee | done | bac267981 | No `configure` for the Marquee, ImageCropper, SignaturePad and FileDrop Bundles. SignaturePad has redo and `pointers` only (no replay, export types, shortcuts, `required`). No ImageCropper flip, QR `modules` value or Table `reorder`. Table hover, the chart tooltip, Marquee paused, cropper handles and Progress tones were not captured; only Meter was captured in all four width and scheme pairs. Jev not run on the README and skill diffs (over its budget). The DataGrid features split is phase 3. |
| F11 chat: thinking-steps, message-scroller, thinking-indicator, questionnaire | done, unverified | 31070333e | No screenshots looked at, no Jev run. The thinking-steps page has two broken in-page links (`#tides`, `#moon`) that fail the prerender test. Questionnaire's `make` is phase 3. |
| Integration pass 1 | done | 0efdbc873 | #595 fixed (`NamedStyle` branded by its contract, 0830304b1). No page was found carrying a module it does not draw. Eleven bundle ceilings raised by measured amounts; the gallery ceiling is 430,000 and will move again as F9 to F11 land. |

## The breaking set (must land before the `v0.41.0` tag)

| Change | Status | Commit |
| --- | --- | --- |
| `words` as one object per widget | done for F1 to F8, F10 and F11; F9 running | 06b1acf10 | |
| SignaturePad's `Began` carries `pointerType`, not `pen` | done | 65cddfece | |
| Flags that become passed values: breadcrumb, avatar, card-group, table, image-cropper, chart | done | 098aa0d14 | Breadcrumb alone took 27.8 kB off every trail page. |
| `Recipes.Badge` as a `recipeFor`; Typography's `level` axis removed | done | 5f4446f38 | |
| Tone `error` renamed `danger` | done (alert, badge, rating, progress) | 4c13b9839 | |
| One `clear` option: combobox, search-field, cascade-select, listbox, picker | done | 016611c19 | The Combobox adapter's `clearContent`/`clearLabel` rename still waits. |
| `AppShell.view`'s `main` argument | running (F9) | | |
| `FileInput.accept` as an array; FileUpload's slot and feature export names | done | 2d38ab852 | |
| `foldkit-bundle` as a peer of `foldkit-mixins-ui` | done | efb186d29 |

## Work alongside the factory plan, on the same branch

| Piece | Status | Commit | Not yet verified |
| --- | --- | --- | --- |
| Tints keep their hue in Chrome 157 | done | f6661ddf9 | |
| Widgets demo: overlays dismiss, hover, Toolbar | done | 1e784e36f | Six overlays other than the palette were not driven in a browser. |
| Accordion closes over the time it opens | done | b98a8bab3 | Tree, Sidebar and ThinkingSteps share the timing and have no test of it. |
| Card dismiss corner; chip remove sign and label centring | done | 8c8fd7200 | |
| Default shadows (`shadow.strength` 70) | done | 1f5cc4457 | Compared in Chrome 157 only. |
| `InputMask` caret (#590) | done | 50839b27e | |
| Chirp nav stays put | done | 5debcc663 | |
| Site: code panels, dead controls disabled | done | 01323595b | |
| Site: Primitives gallery, 100 cards, 8 live examples | done | ad6cf2169 | `device` and `interaction` have no live example; the prerender test was not run. |
| Site: package h1, one home page, prose mental models | done | 90684a09b | Prerender and redirects not exercised; prose not checked sentence by sentence against source. |
| Site: remaining ASCII blocks never wrap, glyphs align, blocks are keyboard-scrollable | done | 5c7123f32 | Three diagrams are over 115 characters wide and need several swipes on a phone. |
| CMS: shell scroll, narrow editor, hero button | done | 4c71e6a73 | Follow-ups below. |
| CMS follow-ups: scroll-restore test, drag edge scroll, phone pill, toolbar by its own width, hero contrast | done | 5f0f4bc90 | |
| CMS: the `SchemaError` behind the flaky e2e (#593, in `foldkit-remote`); `keepScroll` on reload (#594); a More menu for the formatting bar's low tools | done, checks running | ac7390508 | Ten clean `cms.e2e.ts` runs not yet shown. The More menu overflows by 10px at 320px on CI's fonts and appears in a wide bar: being fixed. |
| `FileUpload` widget: seven stages, the ten reference examples as fixtures, the widgets island | done | 4c6b40a0e | Drop and form posting proven in Chromium only. |
| `FileUpload` look pass and four fixes found on the live page (empty cover, grid width, cover ring, and the DatePicker panel's fade) | done | 6f0425a6e | |

## CI

Every push to `ui-polish` cancels the run before it, so full readings come from snapshots pushed to `ui-polish-ci` (draft PR #592, never merged).

| Snapshot | Commit | Result |
| --- | --- | --- |
| 1 | b1ae69ada | 10 of 15 jobs passed. Failures: 110 site links (gallery cards), five budgets, a stale token list, the catalog count, a CMS phone drag test, a rich-text selection race. All fixed by 643d0a7ba. |
| 2 | b606a2c61 | 11 of 15 passed. Failures: `YearDropdown` in two ported examples (fixed, 1b04a91aa), three budgets (fixed, 091e16249), four formatting-bar tests from the More menu (being fixed). |
| 3 | 18f81b801 | 13 of 15. Failures: five README snippets (fixed, ab0d627fb), four rotted DatePicker mutation anchors (fixed, b0c1f8e21). |
| 4 | ab0d627fb | 14 of 15. One unformatted mutation spec (fixed in 0429de335). |
| 5 | a201c3cb2 | 15 of 15 after a rerun, with the site harness and gate pages in. The one first-run failure was `packages/ssr/test/loader.browser.test.ts`, a 3-second real-clock test whose code did not change. |
| 6 | f7d975e35 | 5 of 15, taken while families were mid-change. A stray `/` in `snippets/components.ts` stopped the site building (fixed, dd4a9b4e0) and hid the rest. Integration pass 1 then cleared the known list. |

An incident on 2026-11-17: a second tree linked into this one's `node_modules` was removed and emptied 159 installed packages; the disk was also full. Repaired by a forced reinstall after freeing space; the trap is in `AGENTS.md`.

## Open findings

- #595 is fixed (0830304b1); close it when CI is green.
- `Dialog.view` and `Popover.view` are not built; the dialog examples are long because of it.
- `Mixin.mapMessages` is missing from `foldkit-mixins`; the Sorting example on the file-upload page waits on it.
- `cms.e2e.ts` "the body shows what is selected" fails about one local run in ten; cause unknown; it passed on CI snapshots 3 to 5.
- The domains-plus Worker ceiling is an estimate; CI prints no size when the test passes.
- The site's prerender test had two failures at bac267981 that no family owns: the scroll-area page's `#native` example (a curly apostrophe in its title) and the thinking-steps page's `#tides` and `#moon` links. The second integration pass takes them.
- The gallery Model still holds fields the converted pages no longer read (`customers`, `news`, `photo`, `avatarCrop`, `signature`, `drop`, `attachments` and the overlay pages' state); phase 5 deletes them.
- Several bundle budgets sit within bytes of their ceilings and will need measured raises as the families land.

## Before the tag

- Close the gaps in the "not yet verified" column, or say in the changelog what is not covered.
- Recompute versions, the changelog summary and `docs/releases.md` from the final tree.
- CI green on the branch, then merge; redeploy the demos (the live ones still show the pink tint in Chrome 157).
