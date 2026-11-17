# Progress: examples and variations from the packages' own factories (#589)

The design is [589-example-factories-DESIGN.md](./589-example-factories-DESIGN.md); its §8 is the plan this file follows. The maintainer decided on 2026-11-17 that all of it ships in 0.41.0. The work is on the `ui-polish` branch (draft PR #591), pushed as it goes. The coordinator updates this file after each agent reports; a row's commit is the last one of that piece of work.

Status words: **done** (committed, pushed, its own checks green), **running**, **waiting** (blocked on the row named), **not started**.

## Phases

| Phase | What | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| Design | The consolidated design note and issue body | done | 53ed8ba81 | |
| 0 | Measurements M1 to M9 and probes P1 to P3 | running | | Started 2026-11-17. Decides export names (P1, M7). |
| 1.1 | `recipe.add` | waiting on 0 | | |
| 1.2 | Conventions as code: `configure`, `words`, row content, press, `Choice`, tones and sizes | waiting on 0 | | |
| 1.3 | `Bundles` index, the `foldkit-bundle` peer, the five gate Bundles | waiting on 0 | | |
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
| `FileInput.accept` as an array; FileUpload's slot and feature export names | running | |
| `foldkit-bundle` as a peer of `foldkit-mixins-ui` | not started | |

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
| CMS follow-ups: scroll-restore test, drag edge scroll, toolbar width, contrast numbers, the flaky e2e | running | | |
| `FileUpload` widget | running | | |

## Before the tag

- Close the gaps in the "not yet verified" column, or say in the changelog what is not covered.
- Recompute versions, the changelog summary and `docs/releases.md` from the final tree.
- CI green on the branch, then merge; redeploy the demos (the live ones still show the pink tint in Chrome 157).
