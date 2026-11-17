# Progress: examples and variations from the packages' own factories (#589)

The design is [589-example-factories-DESIGN.md](./589-example-factories-DESIGN.md); its §8 is the plan this file follows. The maintainer decided on 2026-11-17 that all of it ships in 0.41.0. The work is on the `ui-polish` branch (draft PR #591), pushed as it goes. The coordinator updates this file after each agent reports; a row's commit is the last one of that piece of work.

Status words: **done** (committed, pushed, its own checks green), **running**, **waiting** (blocked on the row named), **not started**.

## Phases

| Phase | What | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| Design | The consolidated design note and issue body | done | 53ed8ba81 | |
| 0 | Measurements M1 to M7 and probes P1 to P3 | done | (measured, no commit) | Every design choice held. Freezing styles saves 22.4 kB brotli on a one-Button page; a narrowed recipe saves 136 B, so per-value recipe files stay rejected; a placed Bundle costs 6.2 kB over a hand fold, so the README shows the hand fold first; unread feature files drop from a page; P1 and P3 pass. Largest kept-for-nothing imports: Breadcrumb to Menu 21.1 kB, Sidebar 16.9 kB, ColorPicker to Popover 7.6 kB. Not measured: M8, M9, bundlers other than Vite 8, `pack:check` for the probes. |
| 1.1 | `recipe.add` | done | 5122b5d1d | A value an axis already has is a type error and throws; `MergeAxes` exported. |
| 1.2 | Conventions as code | partly done | 80fbf05b1 | `configure.ts`, `words.ts`, `choice.ts` with `one`, `many`, `text`. Deferred to their first reader: row content, press, tone and size names, the anchor helper. Nothing shipped calls `words.ts` yet. |
| 1.3 | `Bundles` index, the `foldkit-bundle` peer, the gate Bundles and `configure` | running | efb186d29 | Done: `Bundles.TagsInput`, `Bundles.Combobox`, `configure` on Button and TagsInput, `Bundle.ComposedChild` exported (2d8cb3e25), docs (eca2f9c61). Running: Calendar, DatePicker and Combobox options-level views, their Bundles and `configure`. Waiting: FileUpload's Bundle and `configure`. `foldkit-bundle` needs a version bump at the end. Not run: `pnpm install --frozen-lockfile`, `pack:check`, `typecheck:force`. |
| 1.4 | The site harness: one module per example, shown whole | waiting on 1.3 | | |
| 1.5 | The gate: button, tags-input, calendar with date-picker, combobox, file-upload | waiting on 1.4 | | FileUpload itself is being built now (see below). |
| 2 | The families F1 to F11 | not started | | Parallel after the gate. One row each is added here when they start. |
| 3 | `make` for Sidebar and Questionnaire; the DataGrid features split; Chart fills | not started | | Only if P3 passes. |
| 4 | New widgets: Sortable, time field, Attachment, File Type, Scrollspy, Kanban page, Toggle pages | not started | | Frame is in F2. |
| 5 | Integration: shared files, README, skill, changelog, generated entries, site state deleted, Jev, CI | not started | | |

## The breaking set (must land before the `v0.41.0` tag)

| Change | Status | Commit |
| --- | --- | --- |
| `words` as one object per widget | not started | |
| Flags that become passed values: breadcrumb, avatar, card-group, table, image-cropper, chart | not started | |
| `Recipes.Badge` as a `recipeFor`; Typography's `level` axis removed | not started | |
| Tone `error` renamed `danger` | not started | |
| One `clear` option: combobox, search-field, cascade-select | not started | |
| `AppShell.view`'s `main` argument | not started | |
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
| Site: remaining ASCII blocks never wrap, on a phone too | running | | |
| CMS: shell scroll, narrow editor, hero button | done | 4c71e6a73 | Follow-ups below. |
| CMS follow-ups: scroll-restore test, drag edge scroll, phone pill, toolbar by its own width, hero contrast | done | 5f0f4bc90 | |
| CMS: the `SchemaError` behind the flaky e2e; `keepScroll` on reload; an overflow menu for the formatting bar's low tools | running | | The CMS changes may carry a regression until the first is found. |
| `FileUpload` widget: seven stages, the ten reference examples as fixtures, the widgets island | done | 4c6b40a0e | Drop and form posting proven in Chromium only. |
| `FileUpload` look pass (zone, link colour, concentric buttons, grid tile) | running | | |

## Before the tag

- Close the gaps in the "not yet verified" column, or say in the changelog what is not covered.
- Recompute versions, the changelog summary and `docs/releases.md` from the final tree.
- CI green on the branch, then merge; redeploy the demos (the live ones still show the pink tint in Chrome 157).
