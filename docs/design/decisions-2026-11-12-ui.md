# Decisions, 2026-11-12: mixins-ui defaults and popup placement (#424, #430)

Two issues from
[420-424-429-430-styling-platform-DESIGN.md](./420-424-429-430-styling-platform-DESIGN.md)
that were left waiting on us after its decisions of 2026-11-10: #424 on a
target the owner had to restate, and #430 on a trace nobody had taken. Both
are decided here. The code was read at `d2b4eff3`; the trace was taken the
same day and its method is in the #430 section.

| Issue | Decision | GitHub state |
| --- | --- | --- |
| #424 | Done at 108 lines. The 75-line target is withdrawn. The motion items are built after all, by [decisions-2026-11-12-build-deferred.md](./decisions-2026-11-12-build-deferred.md) (B1). | Close as completed |
| #430 | The trace is taken. Placement is not what makes a frame slow, so the trace condition is retired and CSS placement is not built. It waits on upstream alone. | Stay open, `waiting on upstream`; no retitle |

Other groups decided today: performance (#411, #417, #426, #473, #474,
#475), SSR and styling (#472, #471, #420, #429), and Remote, contract and
platform. Two numbers below belong to the performance group and are passed
on, not decided here.

## #424: Sheet and WindowList defaults

### Question

Phase 3 of the styling note moved every default it found into the recipes
and took domains-plus's shipped-component block from 124 lines to 108. The
target was 75. The issue was left open for the owner to restate the target,
or to bring `motion: 'none'` and a sheet duration knob back into scope.

### Evidence

- **The block is still 108 lines.** `examples/foldkit/domains-plus/src/client/style.ts`
  is 1,134 lines; the block runs from `ResultsListStyle`'s doc comment (line
  1027) to the end. Nothing has touched it since `6ad14c8c` except
  `8d8041c4` (logical properties, no line added or removed in the block).
- **What the 108 lines are**, read line by line:

  | Lines | What | Whose |
  | --- | --- | --- |
  | 13 | `ResultsListStyle`: a class upstream's suites select, the header's scroll margin, an inset focus ring | the application's |
  | 17 | `ListboxStyle`, `ListboxLook`: two upstream classes, sRGB greys, a `z-index` over the sticky header | the application's |
  | 10 | `SheetStyle`, `CartSheetStyle`: recipe selections (`title: 'hidden'`, `size: 'full'`, `handle: 'none'`) | selections, already the shortest form |
  | 10 | `SheetLook`: upstream's greys, its `22px` heading, its note | the application's |
  | 9 | `CartSheetLook`: zero durations, `420px` | the motion item below |
  | 11 | `slide`, `phoneSheet`: upstream's half second, times `travel` | the motion item below |
  | 31 | `TldSheetLook`, `FiltersSheetLook`: two bespoke panels | the application's |
  | 7 | blank lines between them | |

- **The 75 was an estimate, and two of its premises were false.** Option A
  in the note guessed "perhaps 50-70 lines". Phase 3 found the WindowList
  root's reset was dead (written on a `div`, where its values are the
  initial ones) and the sheets' padding was the application's, not a
  default (the note's "Phase 3 result"). With both motion items removed the
  block would still be near 85.
- **No second consumer of either motion item exists.** Searched
  `examples` and `packages` for `transitionDuration` outside tests:
  - a zero duration on a Dialog or Sheet's `backdrop` and `panel` appears
    only at `style.ts:1084-1085`;
  - a duration of an application's own on a Sheet appears only in `slide`
    (`style.ts:1096-1099`);
  - the three other callers of `Recipes.Sheet` (`examples/design-system/src/style.ts:98`,
    `examples/widgets/src/picker/view.ts:22`, the site's snippet) pass `{}`;
  - `examples/foldkit/ui-showcase/src/ui/style/dialog.ts:49-62` retimes a
    centered Dialog, not a Sheet, and replaces the whole transition (opacity
    and scale, with an exit tween), which neither proposed axis would
    express.

### Decision

**Close #424 as completed. The line target is withdrawn, not lowered.** The
issue's purpose was that an application should not restate a default. Every
such default found in the block has shipped (`overlay.scrim`, the `title`
axis, `ref.safe` padding, `Utilities.scriptedOnly` and `plainOnly`,
`Utilities.srOnly` in place of a copy), each with a recipe test, with
domains-plus's look and parity tests unchanged. What is left is one
application's look. A line count was a stand-in for that, and chasing 75 now
would mean moving one application's choices into shared recipes.

**The motion items.** This note kept them out, on the 2026-11-10 rule that
an axis one application passes is an option nobody else passes. [decisions-2026-11-12-build-deferred.md](./decisions-2026-11-12-build-deferred.md)
(B1) builds them: a test or an example is a consumer.

### Next step

None for #424. A new issue, not a reopening, when either is seen in a
second example or package:

- a Sheet or Dialog whose `backdrop` and `panel` are both given
  `transitionDuration: '0s'` (then `motion: 'none'`); or
- a Sheet whose slide is retimed to a duration of the application's own
  multiplied by `travel` (then a duration knob).

One thing noticed and not probed: `ListboxLook` gives the panel
`zIndex: '50'` (`style.ts:1054`), and domains-plus draws that panel as
`popover="manual"` in the top layer (`filters.ts:120`,
`listboxShared.ts:367-372`), where `z-index` against the page does nothing.
It may be dead. Whoever next edits that block should delete it and run the
look and parity tests; it is not a reason to keep an issue open.

### GitHub

Close as completed. Title unchanged.

## #430: CSS anchor placement for arrowless panels

### Question

Only our part. The 2026-11-10 decision was not to build CSS placement until
one of two things happens: upstream makes floating-ui droppable (theirs,
with `showModal`, foldkit/foldkit#1689), or a trace of domains-plus at 4x
CPU throttling shows

- a Listbox taking more than 16 ms from its open Message to its first
  positioned frame, or
- `autoUpdate`'s handlers taking more than 1 ms of a scroll frame while a
  panel is open.

Should we take that trace, and what does it show?

### Evidence

**The trace was taken on 2026-11-12.** Method, so it can be repeated:

- The domains-plus client mounted as `test/look.browser.test.ts` mounts it
  (`/?q=acme`, reads answered in process, no Worker), in Vitest's browser
  project: Chrome for Testing 153 headless, 1440 by 900, a 4-core
  container. This is the development build: unbundled source, unminified
  dependencies.
- `Emulation.setCPUThrottlingRate` at 1 and at 4, and the CDP sampling
  profiler at 100 µs around each step.
- Open: from the trigger's `click` to the frame after the panel's inline
  `left` and `top` are written.
- Scroll: 40 frames of `scrollBy(0, 12)`, one per animation frame, with no
  panel, then with a panel open.
- "Placement" is self time in the one dependency chunk that holds
  `@floating-ui/*` and `@foldkit/ui`'s `anchor.js` and nothing else. "Busy"
  is profile time that is not idle, so it includes layout and paint.
- Two panels: the availability dropdown (a short list) and the TLD dropdown
  (557 rows). Five repetitions each; the table gives the medians of three
  whole runs.

At 4x throttling:

| | Short list | TLD, 557 rows |
| --- | ---: | ---: |
| Open click to positioned frame | 71, 83, 86 ms | 366, 374, 413 ms |
| of which placement, self time | 8.4, 9.1, 9.3 ms | 35, 42, 44 ms |
| Scroll frame, no panel, busy | 38, 39, 44 ms | 40, 43, 44 ms |
| Scroll frame, panel open, busy | 44, 45, 47 ms | 56, 61, 67 ms |
| Placement per scroll frame, self time | 3.4, 3.4, 3.8 ms | 5.0, 5.0, 5.1 ms |

Unthrottled, placement is 1.0 to 1.2 ms of a scroll frame of 9 to 12 ms,
and 2 ms of a 15 to 22 ms open (9 ms of 85 ms for the TLD panel).

Read literally, both thresholds are exceeded. Neither says what it was
written to say:

- **Open is slow because of drawing, not placement.** Placement is about a
  tenth of the interval for both panels. The largest single function in it
  is floating-ui's `getCssDimensions` (half of the short list's share,
  nine tenths of the TLD panel's): a `getComputedStyle` and an
  `offsetWidth`, which is the new panel's first layout. A CSS-placed panel
  needs that layout before its first paint too. What CSS placement could
  remove from an open is a few milliseconds of 71 to 413.
- **A scroll frame is 38 to 44 ms at 4x with no panel on the page.** That is
  the page's own scroll work and is over budget before any popup opens.
  Placement adds 3.4 to 5.1 ms of self time, again mostly
  `getCssDimensions`. For the short list the busy time with the panel open
  is within the run-to-run spread of the busy time without it.
- **The TLD panel's extra 12 to 23 ms per scroll frame is not explained.**
  Placement's own share is 5 ms of it. The rest is layout or paint with a
  557-row panel on the page. An attempt to scroll with the panel open and
  floating-ui's listeners and observers removed did not silence placement
  (its self time fell by about a third), so that comparison is not reported
  and no saving is claimed from it.

**Limits of the trace.** It is a development build under a sampling
profiler, so every script figure is an upper bound on production. It ran in
Chromium alone, as CI does. It did not measure a CSS-placed panel, because
none exists.

**The cost side is unchanged since 2026-11-10** (the note's decision 9):
floating-ui stays in the chunk for the fallback and for `anchor.ts`,
`cascadeSelect.ts` and `tour.ts`, so no bytes leave; every panel gets two
placement paths; CI's one browser runs only one of them by default; and the
CSS path must take over the focus on open from upstream's anchor.

### Decision

**The trace is taken, and it does not justify building. CSS placement is
not built, and the trace condition is retired rather than left standing.**

- On open, placement is a tenth of an interval that drawing dominates.
- On scroll, placement is 3 to 5 ms of a frame that is 38 to 44 ms without
  it, during an interaction (scrolling the page under an open dropdown)
  that domains-plus does not invite: a backdrop covers the page and the TLD
  panel scrolls inside itself.
- Against that stand two code paths per panel, a focus hand-over, and a
  path Safari and Firefox would run that no test here would.

Leaving the thresholds in place would leave an issue that reads as
"tripped" to the next person who measures. They are withdrawn. If a trace
condition is ever wanted again, it must compare a frame with CSS placement
against one with floating-ui, not time floating-ui alone.

**#430 now waits on upstream only**: a way to leave floating-ui out of the
chunk (about 4.7 KB brotli by the note's figure), which is the one change
that turns CSS placement into removed code. The request text is already in
the styling note's Issue actions; posting it is the owner's, as TODO.md
says.

### Next step

Nothing to build. Two findings go to the performance group, which decides
them:

- a scroll frame of the results page costs 38 to 44 ms at 4x in the
  development build with no popup open;
- opening the TLD dropdown takes 366 to 413 ms at 4x, nearly all of it
  drawing 557 rows.

Done when upstream ships a way to place a panel without `anchorSetup` in
the chunk; then phase 5 of the styling note is built for Listbox first, to
that note's section 5 tests.

### GitHub

Stay open, keep `waiting on upstream`, title unchanged.

## Corrections for shared files

Reported, not made, since other groups share these files.

- `TODO.md:291`: drop "#424's defaults (its 75-line target is out of
  reach)," from "Waiting on the owner". The upstream posts, floating-ui
  among them, stay.
- `docs/design/TODO.md:53-57`: "#424 phase 3 built … the target is the
  owner's" becomes "#424 closed at 108 lines, the target withdrawn
  (decisions-2026-11-12-ui.md)", and "#429 and #430 wait on their named
  conditions" becomes, for #430, "waits on upstream alone; the trace was
  taken and its condition retired".
- `420-424-429-430-styling-platform-DESIGN.md`, phase 5 and decision 9:
  the second condition (the trace) is superseded by this file.
