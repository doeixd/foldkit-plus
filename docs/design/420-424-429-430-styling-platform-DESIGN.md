# Styles at build, defaults, long lists and popups on the platform (#420, #424, #429, #430)

Status: decided 2026-11-10 (decisions delegated by the owner). #420's phase 0 measured 30.1 KB and phase 1 (static style modules) is built and passed its gate, 26.0 KB off domains-plus; #424 closed at 108 lines, its target withdrawn, and #420 and #429 closed, and #430's trace condition retired so it waits on upstream alone (decisions-2026-11-12-ui.md, decisions-2026-11-12-ssr-styling.md).

Four issues from [performance-PLAN.md](./performance-PLAN.md) that all change
what `foldkit-mixins` and `foldkit-mixins-ui` hand a browser: less script
for styles (#420), less restyling per application (#424), a long list the
browser lays out itself (#429), and popups the browser places and layers
(#430). They share one pipeline (`tokens -> ref -> pieces -> slots -> sheet`)
and one constraint: `@foldkit/ui` owns each component's Model, Messages,
`update` and Mounts, and is not forked.

Nothing here is built. Every statement about today's code names its file and
line, read on 2026-11-10 at `1c1956b`. Three of the four issues describe the
code as it stood on 2026-11-02; section 1 says where that has moved.

The decisions are in [Decisions](#decisions), after the options they choose
between, with the premises that were re-checked and found wrong. The plan in
section 6 is the plan as decided, and [Issue actions](#issue-actions) ends
the note.

## 1. The problems, and what was measured

### #420: the style system runs in the browser

Measured (performance-PLAN.md lines 89-116, `scripts/bundle-report.mjs`,
2026-11-02, domains-plus, one chunk of 210.5 KB brotli; the per-package
split is an estimate, the total is real):

| Part | Brotli (est.) |
| --- | ---: |
| `foldkit-mixins` style runtime (compile, hash, inject, theme builder) | 12.8 KB |
| `foldkit-mixins-ui` (recipes as data) | 10.7 KB |
| `foldkit-mixins` style data (tokens, defaults, utilities, layout, prose) | 5.8 KB |
| the rest of `foldkit-mixins` (Slots, Mixins, the resolver) | 3.3 KB |

The first three are about 29 KB, 14% of the chunk. The chunk now measures
216.9 KB under a ceiling of 217.5 KB
(`examples/foldkit/domains-plus/test/bundle.test.ts:14-22`) against
the plan's target of under stock Foldkit's 215 KB. Nothing else left on the
plan removes this much from the first chunk.

Run time was unmeasured. A probe for this note (Node 22.23.4, Linux, source
through `tsx`, 2026-11-10) compiled the four shipped styles domains-plus
uses (`Recipes.Listbox()`, `Recipes.Sheet()` twice, `Recipes.WindowList()`;
47 classes): 6.4 ms the first time and 2.0 ms warm. domains-plus compiles 148
classes (performance-PLAN.md line 259), so its module load spends a few
milliseconds on a desktop and several times that on a phone, before the
first frame, to compute names the build already wrote into the sheet. That
is a probe in Node, not a browser measurement; phase 0 below replaces it.

Since #419 the CSS itself is already a build product: a hashed file of
10.6 KB brotli (performance-PLAN.md line 265). What is left at run time is
only the work of finding out each class's name.

### #424: `style.ts` is longer than the CSS it replaces

The issue says 1,126 lines, mostly restyling shipped components through
`.extend`. Today the file is 1,219 lines and that description does not fit
it:

| Lines of `examples/foldkit/domains-plus/src/client/style.ts` | What |
| --- | --- |
| 1-159 | The theme (three knobs, 19 colour tokens of its own), shared pieces (`srOnly`, `focusRing`, `control`, the no-script pair) |
| 160-1094 | `Page = slots({ … })`: 935 lines of the application's own Slots, written by hand |
| 1096-1219 | Shipped components: `WindowList` (the file's one `.extend`), `Listbox`, five `Sheet` styles: 124 lines |

The application imports three shipped components (`WindowList`, `Listbox`,
`Sheet`; `grep "from 'foldkit-mixins-ui'" src`) and draws everything else
itself: four kinds of button, the cards, the search field, the filter
choices, the skeletons, the `kbd`, the banner. 221 lines carry a `px` or
`rem` literal, 72 carry a `Style.class(…)` that upstream's Playwright suites
select by, and 39 a `Style.media(NARROW, …)`. The file's own header says why
(lines 1-11): the port's goal was upstream's look by eye, with upstream's
exact greys.

So raising recipe defaults can shorten at most the last 124 lines. The 935
are not restyling; they are an application that did not use the components.
The goal "under 700 lines, visually unchanged" cannot be met by recipe
defaults alone.

### #429: a long list measured in JavaScript

`WindowList` estimates heights, measures rows with ResizeObservers, keeps two
spacers and corrects the scroll offset on take-over
(`packages/mixins-ui/src/windowList.ts:338-361`, `:304-311`, `:386-396`).
#392, #398, #399 and #406 were all in that machinery.

Two of the issue's reasons have moved:

- **The layout shift is gone, and was never the list's.** #418's test found
  every shift was the page painting unstyled; with the sheet linked from the
  head the total is 0.001 on desktop and phone
  (`examples/foldkit/domains-plus/e2e/layoutShift.e2e.ts:7-10`,
  performance-PLAN.md line 348). "Its layout shift is zero" already holds.
- **The server no longer draws 66 rows.** Since #415 it draws and prices the
  first 24 names (`resultsList.ts`, `RESULTS_FIRST_SCREEN_GROUPS`).

What still stands: the measuring code ships and runs; find-in-page reaches
only the rows drawn; a page without scripts pages by links
(`WindowList.pageOf`, `windowList.ts:255`). The bytes are unmeasured:
`foldkit-primitives` is 5.5 KB brotli in all, and the list's share of it and
of `foldkit-mixins-ui` is not split out.

The cost of the alternative is measured. An interpreted row view takes
3.6-4.7 ms for 24 names on the server (performance-PLAN.md lines 324-326),
about 0.17 ms a name, so 556 names is about 95 ms: three times a whole
search without Foldkit's checks, against a 10 ms goal. The compiled row
fills 24 in 0.08-0.15 ms. And the HTML is at 11.1 KB brotli against an 8 KB
goal with 24 names in it.

### #430: popups placed and layered by script

`@floating-ui/*` is 4.7 KB brotli and `@foldkit/ui` 11.7 KB
(performance-PLAN.md lines 102, 107). The issue lists a relocating portal,
35 s burned under jsdom, panels a region's knobs cannot reach, and sheets
that manage focus and the top layer in code.

Much of that is already done or is upstream's by choice:

- **The top layer is already the browser's.** Menu, Menubar, Listbox,
  Combobox, the nav menu, hover cards, CascadeSelect and Tour draw their
  panel as `popover="manual"`, shown by `Anchor.topLayer`
  (`packages/mixins-ui/src/anchor.ts:128-134`;
  `listboxShared.ts:367-372`, `menuView.ts:313-317`,
  `comboboxShared.ts:390-395`, `nav.ts:441-446`, `hoverIntent.ts:83-85`,
  `cascadeSelect.ts:647-649`, `tour.ts:413-420`). Popover and Tooltip stand
  inside a top-layer box (`anchor.ts:154-157`). No panel is portaled when
  drawn with `portal: false`, as domains-plus draws its own
  (`filters.ts:120`).
- **A Sheet is already a `<dialog>`.** `Sheet.view` draws through
  `UiDialog.view` (`sheet.ts:352`), which draws the native element
  (`@foldkit/ui/dist/dialog/index.js:361-392`). Upstream opens it with
  `show()`, not `showModal()`, on purpose, so its DevTools stay usable
  (`foldkit/dist/dom/dom.js:227-232`, `:276`), and supplies the z-index
  (`dialog/index.js:381`), the inert background, the focus trap and Escape
  in script.

What is left is narrower than the issue: placement (floating-ui), the
click-away backdrop element, and `showModal()`.

## 2. How it works today

### Styles: compiled wherever the module loads

A Style is data until `Style.forSlots` compiles it
(`packages/mixins/src/style.ts:247`). `compileTree` (`style.ts:174-195`)
names each rule list's class as an FNV-1a hash of its canonical text
(`styleRules.ts:118-125`, `:143-144`), writes the CSS
(`styleRules.ts:219-231`, declarations sorted at `:95-99`), and records
class, CSS and the Style's globals in a process-wide registry
(`inject.ts:31`, `:38-45`). All of it happens at module load, on the server
and in the browser alike; the hash is why both agree.

When a Slot draws, `ensure` queues the CSS of any class the page lacks
(`slotView.ts:110`, `inject.ts:254-302`) and a microtask appends it to one
`<style>` (`inject.ts:212-230`). A linked build sheet counts as holding its
classes (`inject.ts:185-187`).

The build half exists. `styles({ sheet })` builds the sheet module in a
build of its own with tree-shaking off, evaluates it in Node, completes it
with every class the registry holds (`Style.complete`, `inject.ts:103-113`),
prunes unread tokens, and emits `assets/styles-<hash>.css`
(`packages/mixins/src/vite.ts:38-43`, `:56-96`, `:111-120`, `:169-174`).
The build already evaluates every style module to produce every class. It
throws the names away, and the browser computes them again.

Conditional pieces are the one part that is not fixed per build:
`Style.whenInput` holds a predicate run per render (`style.ts:101-106`,
resolved at `:137-150`). The classes it chooses between are still static.
No recipe in `packages/mixins-ui/src/recipes` uses `whenInput` or `perItem`,
and neither does domains-plus's `style.ts`.

### Recipes: how a default is chosen

A recipe is `base` pieces per Slot, `variants` per axis, `defaults`, and
`compound` (`style.ts:542`). A selection takes the caller's value, else the
default, and `null` unsets an axis. Bases go in the `components` layer and
selections in `variants` (`packages/mixins-ui/src/recipes/design.ts:18-23`),
under `app` (`layers.ts:171`), so an application overrides either with a
plain piece. Every value is `Theme.ref` (`design.ts:15`), so a default's
look is decided by knobs, and a control's size by the `step` ladder
(`design.ts:38-50`).

An application has three ways to move a default, in rising cost: a knob in
`Theme.make` (domains-plus sets three, `style.ts:27-32`), a variant
selection, and `.extend` or an extra `forSlots` in the `app` layer. Chirp's
and domains-plus's fourth way, a Slot of its own, is outside the recipes
altogether.

### A long list: window, spacers, measure, correct

```text
Track (root) -> Placed { top, height } -> viewport
             -> Measured { rows }      -> heights
view: windowOf(model, keys) -> start spacer, rows [start, end), end spacer
```

`Track` is one Mount on the root merging `WindowViewport` (a window `scroll`
listener and a ResizeObserver, `packages/primitives/src/state/virtual.ts:393`,
`:459`) with `MeasureRows` (`virtual.ts:554`). A list opened at a row gives
the rows above their room and scrolls by what that moved
(`windowList.ts:304-311`). The application reads prices for `windowOf`'s
range (`examples/foldkit/domains-plus/src/client/app.ts:541`), so the window
is also what decides which rows are priced. Without scripts the spacers take
no room (`recipes/windowList.ts:13`) and links page the list.

Foldkit draws the whole view on every Message, so the window also bounds the
virtual DOM: 24 names, not 556. `content-visibility` skips the browser's
layout and paint of a row; it does not skip Foldkit's drawing of it.

### Popups: who does what

| Concern | Today | Owner |
| --- | --- | --- |
| Open state, keys, typeahead, active item | The component's Model and `update` | `@foldkit/ui` |
| Placement, flip, shift, max height | `anchorSetup`: floating-ui's `computePosition` under `autoUpdate` (`@foldkit/ui/dist/anchor/anchor.js:3`, `:288-326`, `:382`), writing `left`, `top`, `max-height`, `--button-width` and `data-placement` inline (`:304-305`, `:334-339`) | `@foldkit/ui`, through its `Anchor*` Mounts |
| Portal | On by default (`anchor.js:231-232`); our views pass `portal: false` | `@foldkit/ui` |
| Top layer | `popover="manual"` and `showPopover()` around the Mount's acquire (`anchor.ts:95-110`) | `foldkit-mixins-ui` |
| Outside press | A full-window backdrop element with `OnClick(Closed)`, relocated by `PortalListboxBackdrop` (`listboxShared.ts:407-412`) | `@foldkit/ui` Mount, our forked view |
| Escape | A key handler on the panel (`listboxShared.ts:300`) | forked view, upstream's Message |
| Focus | `focusAfterPosition` in the anchor (`anchor.js:348-358`), `FocusItems`/`FocusButton` Commands (`@foldkit/ui/dist/listbox/shared.js:253-254`) | `@foldkit/ui` |
| Scroll lock, inert background | Only for `isModal` (`listbox/shared.js:249-252`) | `@foldkit/ui` |
| Leave animation | `data-closed`, `data-leave` while the panel stays drawn; ended after the commit (`leaveDrawn.ts`) | `@foldkit/ui` state, our timing |
| Dialog and Sheet | `<dialog>` opened by `show()`, z-index 2147483600, script focus trap and Escape (`dialog/index.js:66-70`, `:370`, `:381`) | `@foldkit/ui` and Foldkit's `Dom` |

Menu, Listbox and Combobox views are transcriptions in this repository
(`listboxView.ts:1-7`), so the Mount on their panel is ours to choose.
Popover, Tooltip, the DatePicker panel, Select and Dialog draw through
upstream's views, whose Mounts we cannot reach
(`ui-polish-DESIGN.md` A4, "Deferred to upstream support").

The recipes read what floating-ui writes: `--button-width`
(`recipes/popup.ts:78`) and `data-placement` for the leave's direction and
the arrow's side (`recipes/popup.ts:56-57`, `recipes/popover.ts:66`,
`recipes/tooltip.ts:46-48`).

`foldkit-primitives`' `Overlay`, `DismissLayer` and `Placing` are a second,
upstream-free stack (`packages/primitives/src/interaction/overlay.ts`,
`dismiss-layer.ts`, `placing.ts`). No `foldkit-mixins-ui` component uses
them; `examples/drawer` and `examples/widgets` do.

## 3. Browser support assumed

From MDN and caniuse as known in mid-2026, not re-checked on 2026-11-10.
Phase 0 confirms each against the browsers CI runs before anything depends
on it.

| Feature | Chromium | Safari | Firefox | Assumed status |
| --- | --- | --- | --- | --- |
| `popover` attribute, `showPopover`, `beforetoggle` | 114 | 17 | 125 | Baseline since April 2024 |
| CSS anchor positioning (`anchor-name`, `position-anchor`, `position-area`, `position-try-fallbacks`, `anchor-size()`) | 125 | 26 | 147 | Newly available since January 2026; **not in Safari 18** |
| `<dialog>.showModal()`, `::backdrop` | 37 | 15.4 | 98 | Baseline since 2022 |
| `closedby` on `<dialog>` | 134 | no | 141 | Not usable alone |
| `@starting-style`, `transition-behavior: allow-discrete` | 117 | 17.5 | 129 | Baseline since August 2024 |
| `overlay` (keeps a leaving element in the top layer) | 117 | no | no | Chromium only |
| A selector or query for the side a flip chose (`@container anchored(…)`) | 143 | no | no | Chromium only |
| `content-visibility: auto` | 85 | 18 | 125 | Baseline since September 2024 |
| `contain-intrinsic-size: auto <length>` | 98 | 17 | 107 | Available |
| Scroll anchoring (`overflow-anchor`) | 56 | no (assumed) | 66 | Not in Safari |

Two of these change the issues as written. #430 asks for the platform path
in "Chromium and Safari 18": Safari 18 has popover but no anchor
positioning, so there it is the fallback that runs. And without `overlay` or
a flip query outside Chromium, a leave animation and an arrow's side still
need what script writes today.

## 4. Options

### #420: zero-runtime style modules

**A. Evaluate style modules at build and ship their results (the issue).**
The plugin already evaluates them. A second output beside the CSS replaces
each named style module, in the client build, with data:

| Export today | Shipped instead |
| --- | --- |
| A `NamedStyle` (`forSlots(…)(…)`, `slots({ … })`) | A Mixin whose contributions are frozen `{ classes, style }` per Slot |
| A token reference object (`t`) | The same strings |
| `Style.whenInput` in a piece | The predicate, kept as code, choosing between class lists |
| A recipe called at module level | Its result, as above |
| Anything else (a function, a recipe exported uncalled, an import of app state or a browser global) | The build fails, naming the export and the import |

The client then imports `Slot`, `Mixin`, `SlotView` and the resolver (the
3.3 KB "rest") and none of `Style`'s compiler, `Rules`, `Theme`, the
utilities or the recipes. `ensure` stays as a development check only.
Estimated saving: up to about 27 KB brotli of 216.9 (29 KB less a class
table of about 150 short strings). The server takes the same module, so a
Worker isolate stops compiling at start (#416).

It needs one new seam: keeping a predicate while replacing its pieces is a
source transform, not an evaluation. Version one can refuse `whenInput`
and `perItem` in a build-evaluated module (neither domains-plus nor any
shipped recipe uses them) and leave such a module on the runtime path by an
explicit option.

**B. Keep the runtime, shrink it.** Split `Style` so the browser build drops
the theme builder and the sheet text (as `server/sheet.ts` does by hand
today) but keeps the compiler. It saves the theme's share only, and the
names are still computed twice.

**C. Do nothing.** 14% of the chunk stays, and the JavaScript target is
missed by about 2 KB.

**Which modules.** The issue asks for a convention, not a guess. Three were
considered: a file pattern (`*.style.ts`), an import attribute, and a list
in the plugin's options beside `sheet` (`vite.ts:27`). The list is the same
shape the plugin has, is checked at build, and needs no rename; a package
contributes through the application's style module, which is where its
recipes are called.

**Composition with the pipeline.** Layers, tokens and knobs are untouched:
they are in the CSS, and a knob is still a custom property a region can set
at run time. What stops working in a build-evaluated module is compiling a
new Style from run-time data, which `inject.ts:17-21` already calls a
mistake. An inline value (`Style.inline`, a custom property per item) is
data and survives.

**The checker** (declared-optimization-DESIGN.md's rule that a pass ships
with one): a conformance test that, for every fixture and example, the
build's class lists and CSS equal the runtime's; and in development the
runtime path stays, so a class the build missed is injected and reported
rather than missing.

### #424: defaults that need less restyling

**A. Raise defaults in the shipped recipes (the issue).** Reaches the 124
lines. Candidates, each a line or block an application should not have to
write:

| In `style.ts` | Becomes |
| --- | --- |
| `SheetLook`'s title and description type (`:1149-1157`) | The Sheet recipe's own roles; already close |
| The backdrop's scrim (`:1151`) | A scrim token every overlay reads |
| `phoneSheet.title: srOnly` (`:1182-1186`) | A `title: 'hidden'` axis on Dialog and Sheet |
| `slide(d.slide)` (`:1177-1180`) | A duration knob for sheets, multiplied by `travel` in the recipe |
| `CartSheetLook`'s zero durations (`:1163-1170`) | A `motion: 'none'` axis |
| Safe-area padding on the phone sheets (`:1200`, `:1214`) | The recipe's base, from `ref.safe` |
| The WindowList root's reset (`:1101-1115`) | The recipe's base |

Perhaps 50-70 lines, with a recipe test each. It does not approach 700.

**B. Draw the application's controls with shipped components.** Buttons,
cards, the search field, choice rows, skeletons, `kbd`, the banner and the
empty and error states have recipes (`recipes/button.ts`, `card.ts`,
`field.ts`, `skeleton.ts`, `kbd.ts`, `alert.ts`, `empty.ts`, `item.ts`).
Using them, with the look carried by knobs and a few `.extend`s, is what
would remove hundreds of lines. It changes pixels: the recipes size by the
ladder and the theme's radius, not by upstream's `34px` and `7px`. "Visually
unchanged" becomes "the look tests and the parity suites pass, and a reader
sees the same page", which is a decision, not a refactor.

**C. Ship the shared pieces applications keep rewriting.** `srOnly` is
already `Utilities.srOnly` (`packages/mixins/src/utilities.ts:197`) and the
application wrote its own (`style.ts:79-89`). The no-script pair
(`scriptedOnly`, `plainOnly`, `:125-132`) and a `control` base (`:142-158`,
the Button recipe's outline variant by another name) are the same kind.
Small, and independent of A and B.

**D. Change the goal.** Keep `style.ts` as an exact port, record that 935 of
its lines are an application's own Slots, and measure #424 on the 124.

A and C are worth doing whatever is decided about B. B is the only route to
the number in the issue.

### #429: a long list through `content-visibility`

The design common to every option below is a sibling component, `LongList`,
not a mode of `WindowList`: its Model has no heights, estimate or viewport,
so a flag on `WindowList.Model` would leave most of that Model unused in one
mode.

```text
view: every row in [0, drawn), each `content-visibility: auto`
Seen (one IntersectionObserver Mount on root) -> Seen { start, end } -> update
```

- The row's rule is the recipe's, in `components`:
  `content-visibility: auto` and
  `contain-intrinsic-block-size: auto var(--fk-long-list-row)`. The estimate
  is a custom property, so an application sets it per breakpoint in CSS
  (domains-plus's group is 114px on a desktop and three times that on a
  phone, which `WindowList` handles with `unmeasured: 'mean'`), and a
  per-list value is inline, never a new class.
- `Seen` replaces `windowOf` for "which rows to read". It sends a Message, so
  a Scene test can resolve it and it may be on by default (the trap about
  Mounts that send none does not apply).
- Each row is drawn through the Slot's `lazy`, keyed by the item, so a
  Message that changes nothing in a row costs an identity check per row and
  not a redraw. Without that, 556 rows are drawn into the virtual DOM on
  every Message.

The options differ in how many rows exist, and when.

| | A. The server draws every row | B. The server draws the first screen, the client grows the list | C. Keep `WindowList` |
| --- | --- | --- | --- |
| Server CPU for 556 names | About 95 ms interpreted; near 3 ms compiled (extrapolated) | As today | As today |
| HTML | Every row, in a page already over its budget | As today | As today |
| Without scripts | The whole list, unpriced below the first screen unless every price is read | Links page it, as today | Links |
| Find-in-page | Every row | Rows drawn so far | Rows in the window |
| Measuring, spacers, take-over correction | None | None (rows are only added below; one end spacer of `rows left × estimate` in CSS) | All of it |
| Client drawing | Adopted, then identity checks | Grows by a chunk as the end nears | 24 names |

B's list is append-only: its start is always row 0, so nothing above the
viewport ever changes size by the list's own doing, and there is nothing to
correct. A list opened at a row (`?from=`) is the exception: the rows above
it must appear above, which is the take-over problem again. There the
honest choices are to keep `WindowList` for `?from=` pages or to draw from
row 0 on the server for them.

A is the best page and the issue's own first choice, and the owner's comment
on the issue already says it waits on the per-row cost. That cost is now
known: it needs the compiled row (#473, #433) or streaming (#427) first.

**Where the line is.** `content-visibility` rows are real DOM. 556 names at
some 15 nodes each is about 8,000 nodes; ten thousand rows would be 150,000,
which costs memory and style recalculation whatever is skipped. The README
should say: a bounded list of up to a few thousand rows of known order is a
`LongList`; an unbounded or cursor-paged one is a `WindowList`. The number
is a guess until phase 0 measures it.

**Safari.** Without scroll anchoring, a row above the viewport that takes
its real size after being estimated moves the page. Rows of one height do
not have the problem, and `contain-intrinsic-size: auto` remembers a size
once a row has been rendered; a jump to the end and a scroll back up is the
case to test.

### #430: popups through the platform

Three separate moves, with different owners.

**Placement by CSS anchor positioning.** For a panel whose view is ours
(Listbox, Combobox, Menu and its submenus, Menubar, the nav menu,
CascadeSelect), the panel's rule can place it: `anchor-name` on the trigger,
`position-anchor` and `position-area` on the panel, `position-try-fallbacks:
flip-block, flip-inline`, `min-inline-size: anchor-size(width)` for
`--button-width`, and `max-block-size: 100%` of the area for floating-ui's
`size`. The anchor's name is per instance, so it is an inline custom
property on both elements and the rule reads it; `gap` and `padding` are
tokens. This lives in the recipe, in `components`, inside `@supports
(anchor-name: --a)`, so it composes with layers and a theme can override it.

What it cannot do outside Chromium is tell the recipe which side won: the
leave's direction (`recipes/popup.ts:56-57`) and an arrow's side read
`data-placement`. Arrowless panels lose only the 4px direction of a leave
after a flip. Arrowed ones (Popover, Tooltip, Hover Card, Tour) are not
candidates yet.

The bytes are the catch. Each upstream component module defines its anchor
Mount at module level with `anchorSetup` in its closure
(`@foldkit/ui/dist/listbox/shared.js:425-436`), and our views must keep that
Mount's identity so an application's `Scene.Mount.resolve(AnchorListbox, …)`
still matches (`anchor.ts:24-25`). So floating-ui stays in the chunk
whichever path runs, and the fallback needs it anyway. Removing it for
browsers that do not need it takes an upstream change: `anchorSetup` loaded
on demand, or an `AnchorConfig` strategy upstream owns. Until then the gain
is run-time work (no `autoUpdate` loop, no inline writes, no positioning
under jsdom), not bytes. This is the plan's own lesson, "remove code; do not
defer it" (performance-PLAN.md line 268), met from the other side: we can
skip the code but not remove it.

**Dismissal by `popover="auto"`.** The browser would close the panel on an
outside press or Escape and fire `beforetoggle`; a handler sends upstream's
`Closed`, so the Model stays the owner. It would retire the backdrop
element and its Mount. Against it: the browser hides the popover at once, so
the leave animation upstream's Model runs (`data-closed` with the panel
still drawn) has nothing to show outside Chromium, where `overlay` is
missing; a nested submenu needs the popovers to be DOM-nested or linked to
stay open together; and upstream's press-origin logic (a release on a row
after a press on the trigger) meets the browser's own toggle. Today's
`popover="manual"` with upstream's Messages has none of these problems and
costs one transparent element.

**`showModal()` for Dialog and Sheet.** It is upstream's, deliberately not
used, and already requested as an opt-in (foldkit/foldkit#1689, with
#1683, #1686 and #1688 beside it; `ui-polish-DESIGN.md:797-804`; their
state was not readable from this session). Nothing here should work around
it: the dialog's Mount is inside upstream's view and an element holds one
Mount.

## 5. #430 component by component

"CSS" is anchor positioning under `@supports`, with today's floating-ui path
as the fallback in the same build. Every row keeps `popover="manual"`,
upstream's Messages and upstream's Mount identity.

| Component | Placement | Layer | Dismiss and focus | Blocked on |
| --- | --- | --- | --- | --- |
| Listbox, `ListboxView` | CSS | as today | as today | nothing; first, since domains-plus uses it |
| Combobox | CSS; width `anchor-size(width)` | as today | as today | nothing |
| Menu, submenus, Menubar, nav menu | CSS; a submenu is `position-area: inline-end` with `flip-inline` | as today | as today | the press-origin test below |
| CascadeSelect | CSS; replaces its own `anchorSetup` call (`cascadeSelect.ts:233`) | as today | as today | nothing |
| Picker | follows Listbox above its breakpoint, Sheet below | as today | as today | nothing |
| Context menu at a point (`menu.ts:1188`) | stays script: a point is not an element | as today | as today | not planned |
| Popover, Hover Card, Tooltip, ColorPicker, DatePicker panel, Tour | stay on floating-ui | as today (`Anchor.layer`) | as today | a flip query outside Chromium, and upstream's Mounts |
| Dialog, Sheet, Drawer | n/a | `show()` and z-index, upstream's | upstream's | foldkit/foldkit#1689 |

Parity is proved in a browser, not by markup. The existing files are the
baseline and must pass on both paths: `listbox.browser.test.ts`,
`listboxSelect.browser.test.ts`, `menu.browser.test.ts`,
`menuRows.browser.test.ts`, `menubar.browser.test.ts`,
`navMenu.browser.test.ts`, `popup.browser.test.ts`,
`popupTopLayer.browser.test.ts` (right to left), `popupWidth.browser.test.ts`,
`popupLadder.browser.test.ts`, `comboboxLeave.browser.test.ts`,
`sheet.browser.test.ts` and domains-plus's `look.browser.test.ts`. Each
runs twice: as the browser is, and with the fallback forced by an option on
the view (not by stubbing `CSS.supports`, which the recipe's `@supports`
would not see). New cases, each with a mutation that deletes the rule it
proves:

- the panel's box against the trigger's, by geometry, at the default
  placement, near the bottom edge (flipped), near the inline end (shifted),
  and right to left;
- the panel no taller than the room left, and scrolling inside;
- the width axis: `anchor-size(width)` equals the trigger's width;
- focus lands on the items after opening and returns to the trigger on
  Escape, with `userEvent`, since a synthetic event moves no focus;
- a press on the trigger, held past 200ms and released on a row, chooses
  once (the Menu trap);
- a panel inside an `overflow: hidden` box and inside a Sheet paints past
  both;
- a region's `step` knob reaches the rows of a panel opened in it (the
  portal trap, which in-place panels already avoid);
- the page scrolls under an open panel and the panel follows, without a
  frame of lag to assert on.

## 6. The plan, as decided

Section 7 holds the questions as they were asked and
[Decisions](#decisions) the answers. In short: measure, then build #420 if
the number allows it; do #424 as recipe defaults and shared pieces; leave
`WindowList` in place until every row can be server-drawn; leave popup
placement on floating-ui until upstream can drop it or a measurement says
it costs a frame.

Each phase ships alone and records a number.

**Phase 0: measure #420 (no API).** Run `node scripts/bundle-report.mjs
examples/foldkit/domains-plus` at the commit phase 1 would start from, and
add three rows: `foldkit-mixins` style runtime, `foldkit-mixins` style data,
and `foldkit-mixins-ui`. Record the sum in performance-PLAN.md beside the
`@floating-ui/*` row from the same run, which the upstream request quotes.

- Over 15 KB brotli: build phase 1.
- 15 KB or under: close #420 as not planned, with the number.

The split is an estimate (each module's share of the minified bytes, scaled),
so it decides only whether to start. Phase 1's own gate reads the real total.
Module-evaluation time in Chromium at 4x throttling is recorded if phase 1 is
built, as a before and after; it gates nothing.

The list's share of the chunk, the cost of 556 rows and the browser probes
are no longer phase 0: they are measured when #429's or #430's condition is
met, by whoever builds them.

**Phase 0 result (2026-11-10).** `node scripts/bundle-report.mjs examples/foldkit/domains-plus` at commit dbfbbe8, run on a clean tree before another session's edits to `packages/remote` began (17:43 UTC). The three style rows: `foldkit-mixins: style runtime` 13.3 kB brotli, `foldkit-mixins: style data` 5.8 kB, `foldkit-mixins-ui` 11.0 kB. Sum 30.1 kB brotli. The split is the report's estimate; the chunk's 217.6 kB brotli is real. The gate is 15 kB, so the sum is over it: build phase 1. #420 stays open for phase 1 and does not close as not planned. `@floating-ui/*` in the same run is 4.7 kB. The Chromium module-evaluation time at 4x is not measured here; phase 1 records it if built.

**Phase 1: #420, static styles.** `styles({ sheet, modules })`: the plugin
emits class data for the modules listed and the client build resolves those
modules to it. The class data and the sheet come from one evaluation, and
the build fails if a frozen class has no rule in the CSS it emits. A listed
module that holds a `whenInput`, a `perItem`, or an export that is not a
`NamedStyle`, a token reference object or a plain string fails the build,
naming the export. A module that needs any of those is left off the list and
stays on the runtime path.

Two things to settle before the transform is written, both read from the
code on 2026-11-10:

- domains-plus's views read more of a style module than its classes:
  `CartSheetStyle.mixin` (`cart.ts:117`, `filters.ts:106`, `:149`, `:241`)
  and `Style.attach(Page.style)` (`view.ts:681`). The frozen value keeps
  `.mixin` and `.style`, and `Style.attach` must be importable without
  `styleRules`; if it is not, it moves beside `SlotView` first.
- `view.ts:383` calls `Behavior.forSlots`, not `Style.forSlots`: no view
  module of domains-plus compiles a Style, so `style.ts` is the one module
  to list.

Tests: the conformance test over every example (the build's class lists and
CSS equal the runtime's); the refusal's message; a browser test that a page
drawn from class data computes the same styles as one compiled at run time
(`look.browser.test.ts`'s method); the page test that every drawn class has
a rule (#271's) on the built output.

Exit gate, as #423's was: `bundle.test.ts`'s measured total falls by at
least 12 KB brotli, and `report.included` holds no `styleRules` and no
`foldkit-mixins-ui` recipe module. The ceiling is then lowered to the new
reading plus 1%. A smaller fall means the compiler is still reachable from
something; find it or revert the phase, and say which in #420.

**Phase 1 result (2026-11-10).** Built: `styles({ sheet, modules })` in `foldkit-mixins/vite` (`viteFreeze.ts`), with domains-plus's `style.ts` listed. `node scripts/bundle-report.mjs examples/foldkit/domains-plus`, run before and after in one tree: 217,518 bytes brotli to 191,556, a fall of 25,962 against the 12 KB gate, so the phase stays. `report.included` holds no `foldkit-mixins/styleRules` and no `foldkit-mixins-ui/recipes/` module (`bundle.test.ts` asserts both); the three style rows sum to 6.4 KB, all components that draw. The ceiling is now 193.5 KB. Two changes the premises asked for: the `AppStyle` moved to `appStyle.ts`, since a frozen module holds no function, and `view.ts` attaches with `SlotView.attach(Page.style.mixin)`, since `Style` is one object and importing it keeps the compiler. `Style.attach` itself did not move. `inject.js` stays in the chunk for its `DRAWN_CLASSES` symbol alone; `ensure` is defined away. Not done: the conformance test over every example (only domains-plus lists a module; `frozen.test.ts` checks its exports against the run-time ones), the browser test comparing a page drawn from class data with one compiled at run time (`look.browser.test.ts` passes against source); the built e2e's check is done (below), and the Chromium module-evaluation time at 4x.

**Phase 1 parity on the build (2026-11-10).** `examples/foldkit/domains-plus/e2e/built.e2e.ts` loads the built Worker with the bundle held and asserts the served card and header read their frozen values (padding, border, sticky, flex), then releases it, types a search, and asserts the rows the runtime draws are styled, that every `style-` class in the document has a rule in a linked sheet, that no `<style>` was present at first paint and only the devtools overlay's is there after, and that no console error is logged. Dropping `modules` from the plugin turned it red at the card's padding (0px for 20px). Found while running it: the build names `geist-latin-wght-normal-*.woff2` in its sheet and preload but emits no such file (404 in the browser); the e2e lets that one through.

**Phase 2: #420, conditional pieces.** Not planned. It is reopened by an
application or shipped recipe that needs `whenInput` in a listed module.

**Phase 3: #424, recipe defaults and shared pieces.** One recipe change per
commit, each with a recipe test, and a browser test where the claim is
layout or a state's fill. In scope:

- Sheet: the title and description roles, safe-area padding from
  `ref.safe`, a scrim token every overlay reads, and a `title: 'hidden'`
  axis on Dialog and Sheet.
- WindowList: the root's reset in the recipe's base.
- `Utilities.scriptedOnly` and `Utilities.plainOnly`, which
  `recipes/windowList.ts` then reads too.
- domains-plus's own `srOnly` (`style.ts:79-89`) replaced by
  `Utilities.srOnly`, after a computed-style comparison: the utility writes
  `border: '0'` where the application writes `borderWidth: '0'`.

Done when `style.ts`'s shipped-component block (lines 1096-1219, 124 lines)
is 75 lines or fewer and domains-plus's look tests and upstream's parity
suites pass unchanged.

Not in scope until a second consumer writes the same override (grep the
examples and packages before adding): a `motion: 'none'` axis and a sheet
duration knob. Not shipped at all: a `control` base, which is the Button
recipe's outline variant under a second name.

**Phase 3 result (2026-11-10): not met, 124 to 108 lines.** The block is
counted from the doc comment of `ResultsListStyle` to the end of
`examples/foldkit/domains-plus/src/client/style.ts`, blank and comment lines
included (`sed -n '<first line>,$p' style.ts | wc -l`): 124 lines before, 108 after. Built: `Utilities.scriptedOnly` and `plainOnly`
(the WindowList recipe reads the first); an `overlay.scrim` token the
Dialog's backdrop reads, which domains-plus overrides in its own tokens; a
`title: 'hidden'` axis on Dialog and Sheet; the Sheet's padding from
`ref.safe` instead of a literal `env()`, so a browser test can move it. In
the application: its own `srOnly`, `scriptedOnly`, `plainOnly` and `NO_SCRIPT`
are the shipped ones (a computed-style comparison on `a`, `div`, `h2` and `p`
under the reset found no difference between `border: 0` and `borderWidth:
0`), the phone sheets say `title: 'hidden'`, and the compiled CSS differs
from before in exactly those rules and the dead ones below. Two premises did
not hold. The WindowList root's reset (`margin`, `list-style`, `padding`) is
written on a `div`, where all three are the initial values: it was dead, so
it is deleted and no recipe default carries it. The sheets' padding is the
application's (`0 0 safe` for the extensions' sheet, `6px 6px max(6px, safe)`
for the filters'), not a default every application would write. What is left
of the 108 is the application's own look (classes upstream's suites select
by, its greys, its `22px` heading), the slide duration (`slide`, 14 lines)
and the cart's zero durations (10), which the decision above puts out of
scope, and about 25 lines of comments. With both out of scope items removed
the block would still be near 85, so 75 needs more than recipe defaults;
the list's focus ring, the Listbox's `z-index`es and the Sheet's two
bespoke panels are the remaining candidates, and each is one application's.

**Phase 4: `LongList`.** Waits. Built as option A, every row server-drawn,
when `pnpm bench:render` shows the server drawing domains-plus's 556 rows in
10 ms or less and the page's HTML is within its budget or the rows below
the first screen are streamed (#473 or #433, and #427). Then: the
component, its recipe, `Seen`, keyed lazy rows, and All Results moves whole,
`?from=` included. Browser tests: no shift (#418's test); find-in-page
reaches a row far below the fold; scroll at 4x throttling holds its frame
budget on 556 rows; a Message that changes no row draws no row, counted
after a second change. The recipe's `content-visibility` rule stands inside
`@supports (overflow-anchor: auto)`.

**Phase 5: #430, CSS placement.** Waits. The trace condition below is superseded by decisions-2026-11-12-ui.md: the trace is taken, and only upstream's request remains. Built for Listbox first when either
condition holds:

- upstream ships a way to leave floating-ui out of the chunk (the request
  below), so the CSS path removes about 4.7 KB; or
- a trace of domains-plus at 4x CPU throttling shows a Listbox taking more
  than 16 ms from its open Message to its first positioned frame, or
  `autoUpdate`'s handlers taking more than 1 ms of a scroll frame while a
  panel is open.

Section 5 is its design and its tests. It adds one requirement the section
did not state: upstream's anchor also focuses the panel after its first
position (`focusAfterPosition`), so a CSS-placed panel must show the same
focus on open and on Escape, proved with `userEvent` on both paths, before
any other parity test counts.

**Phase 6, with upstream.** One request, in Issue actions, posted by the
coordinator after phase 0 has the floating-ui figure.

## 7. Decisions for the owner

1. **#420: build it, or wait for phase 0's number?**
   (a) Build phase 1 now on the 2026-11-02 measurement. (b) Measure first
   and build only above 15 KB. (c) Leave open at low priority.
   Recommended: (b); the measurement is a morning and the issue asks for it.

2. **#420: how a style module is named.**
   (a) A list in the plugin's options. (b) A file pattern. (c) An import
   attribute. Recommended: (a).

3. **#420: a conditional piece in version one.**
   (a) Refused in a build-evaluated module, with an option to leave that
   module at run time. (b) Supported from the start by a source transform.
   Recommended: (a); nothing shipped uses one.

4. **#420: is the runtime path kept in production as a fallback?**
   (a) No: a missing class is a failed conformance test, not an injection.
   (b) Yes: `ensure` stays and injects. Recommended: (a) in production and
   (b) in development, or the compiler never leaves the bundle.

5. **#424: what "done" means.**
   (a) Under 700 lines by redrawing the page's controls with shipped
   components, accepting a look that passes the look tests but is not
   upstream's to the pixel. (b) Recipe defaults and shared pieces only, with
   the goal restated as the shipped-component block (124 lines) halved.
   (c) Both, B after A. Recommended: (b) now; (a) is a product choice about
   what domains-plus is for, an exact port or a showcase of the components.

6. **#429: a sibling component or a mode?**
   (a) `LongList`, its own Model. (b) A mode of `WindowList`.
   Recommended: (a).

7. **#429: how much the server draws.**
   (a) Every row now. (b) The first screen, the client growing the list,
   and every row once a compiled row or streaming lands. (c) Stay on
   `WindowList`. Recommended: (b).

8. **#429: a list opened at a row (`?from=`).**
   (a) Keeps `WindowList`. (b) `LongList` draws from row 0 for it.
   (c) Dropped where scripts run. Recommended: (a) until option A exists.

9. **#430: is CSS placement worth building with no byte saving?**
   (a) Yes, for arrowless panels: no positioning loop, no inline writes, no
   work under jsdom. (b) No: wait until upstream can drop floating-ui.
   Recommended: (a) for Listbox as a trial, then decide the rest on what the
   doubled tests cost to keep.

10. **#430: `popover="auto"`.**
    (a) Stay on `manual` with upstream's Messages. (b) Move to `auto`.
    Recommended: (a) until `overlay` or an equivalent is in three engines.

11. **#430: the issue's "Safari 18".**
    (a) Restate as Safari 26 for placement and Safari 17 for the top layer.
    (b) Keep Safari 18 and count the fallback as the platform path there.
    Recommended: (a).

12. **Upstream requests.** Whether to post the two new ones (`anchorSetup`
    on demand or a CSS strategy in `AnchorConfig`; the side a flip chose as
    an event or attribute a CSS path can also set) and to add our numbers to
    foldkit/foldkit#1689. Recommended: yes, after phase 0's figures.

## Decisions

Decided 2026-11-10; the owner delegated them. Each answers the question of
the same number in section 7.

### Premises re-checked

Read at `922b0ab` on 2026-11-10. Where a premise was wrong, the decision
rests on the corrected one.

- **CI runs Chromium only.** `vitest.config.ts:29` lists one browser
  instance, `chromium`, and no test or workflow names WebKit or Firefox.
  Section 3 says phase 0 "confirms each against the browsers CI runs", phase
  4 asked for "a jump to the end and back in WebKit", and section 5 runs each
  popup test "as the browser is": all three would have exercised Chromium
  alone. No Safari or Firefox claim in this note can be tested here today.
- **Keeping `WindowList` for `?from=` keeps its code.** Phase 4 said the
  bundle report "records the measuring code leaving the page", and question
  8's recommendation kept `WindowList` for pages opened at a row. An
  application that imports both components ships both, so option B with 8(a)
  adds a component and removes none.
- **A CSS-placed panel loses more than `data-placement`.** Upstream's anchor
  Mount also carries the focus on open: the panel is `visibility: hidden`
  until the first position and `focusAfterPosition` focuses it then
  (`@foldkit/ui/dist/listbox/shared.js:429-440`, the Mount at `:446-456`).
  A Mount of the same name that skips `anchorSetup` has to do that itself.
- **floating-ui is imported by this repository too.** `anchor.ts:33`,
  `cascadeSelect.ts:1` and `tour.ts:1` import `anchorSetup`. An upstream
  change that lets Listbox drop it does not empty the chunk of it until
  those three move as well.
- **The budget.** The test's ceiling is 217.5 KB and the measured chunk
  216.9 KB (`bundle.test.ts:14-22`); section 1 read the second as the first.
  Corrected in place.
- **Confirmed:** `style.ts` is 1,219 lines with one `.extend` (`:1101`) and
  `Page = slots({` at `:160`; domains-plus imports three shipped components;
  no file under `packages/mixins-ui/src` or domains-plus's `src` uses
  `whenInput` or `perItem`; `Utilities.srOnly` is at `utilities.ts:197`;
  upstream's dialog opens with `show()` (`foldkit/dist/dom/dom.js:276`).
  The upstream line numbers are those of `@foldkit/ui`
  `0.169.0-canary.90746b32d2ca`.
- **Not measured in this session:** the bundle report was not rerun, since
  it needs every package built in a tree other sessions were writing. The
  thresholds below are rules for whoever runs it.

### #420

1. **(b), with the rule written down: build phase 1 if the style system is
   over 15 KB brotli, else close.** The measure is the sum of three rows of
   `node scripts/bundle-report.mjs examples/foldkit/domains-plus`. The
   2026-11-02 figure, 29.3 KB, passes by a wide margin, but it is an
   estimated split of a chunk that has since grown by 6 KB, and #423 was
   built on an expectation and reverted at 0.9 KB. Phase 1 also carries an
   exit gate on the real total (12 KB or more off `bundle.test.ts`'s
   reading), because the estimate cannot say whether the compiler is
   reachable from somewhere else. Closing at 15 KB or under, not parking at
   low priority, is deliberate: an open issue with no condition is never
   picked up.

2. **(a), a `modules` list beside `sheet` in `styles({ … })`.** The plugin
   already names its one input by module id (`vite.ts:25-27`), so the list
   is the same shape and is checked at build. A file pattern would rename
   `style.ts` in every example and still guess; an import attribute puts the
   mark at every importer, where one forgotten attribute leaves the compiler
   in the chunk with nothing said. Packages need no marker: their recipes
   are called in the application's style module.

3. **(a), narrower: refused, and no opt-out option.** A listed module that
   holds a `whenInput` or `perItem` fails the build with the export named.
   The way to keep such a module at run time is to leave it off the list,
   which decision 2 already provides, so a second option would be a second
   way to say the same thing. Nothing shipped and no example uses either
   piece in a style module.

4. **(a) in production and (b) in development, plus a build assertion.**
   Keeping `ensure`'s injection in production keeps the registry and the
   CSS text reachable, which is the code the phase removes. The risk it
   covered, a class with no rule, moves to the build: class data and sheet
   come from one evaluation, and the plugin fails when a frozen class has no
   rule in the emitted CSS. That is checked on every build, where the
   conformance test is checked only when the tests run.

### #424

5. **(b), with the goal restated as a number: the shipped-component block
   from 124 lines to 75 or fewer, look tests and parity suites unchanged.**
   The issue's 700 lines can only come from redrawing the page with shipped
   components (option B), and domains-plus is an exact port by its own
   header (`style.ts:1-11`): 72 of its lines carry a class upstream's
   Playwright suites select by. So B is not planned for domains-plus; an
   application that shows the components is a different example, and Chirp
   already is one. Within A and C, a default moves into a recipe when every
   application would write it (safe-area padding, the scrim, the list
   root's reset, the no-script pair, which `recipes/windowList.ts` already
   writes by hand). `title: 'hidden'` ships because the wrong way to hide a
   dialog's title removes its accessible name. `motion: 'none'` and a sheet
   duration knob wait for a second consumer: an axis one application passes
   is an option nobody else passes. The `control` base is not shipped.

### #429

6. **(a), a sibling `LongList`, when it is built.** Its Model has no
   heights, estimate or viewport; a mode would leave most of
   `WindowList.Model` unread in one mode. This stands whatever 7 decides.

7. **(c) now, and option A when its condition is met; option B is not
   built.** B's gains over today are small: find-in-page reaches the rows
   drawn so far and not the rows in the window, and the measuring code stops
   running. Its costs are a new component, 556 keyed rows checked on every
   Message, about 8,000 nodes, and an untested Safari path. With `?from=`
   kept on `WindowList` it removes no code, and the two reasons that made
   the issue urgent are gone (the shift is 0.001 and was never the list's;
   the server draws 24 names). Option A is what the issue asks for and it
   does replace `WindowList` on the page. Its condition: `pnpm bench:render`
   shows the server drawing 556 rows in 10 ms or less, and the HTML is
   within its budget or the rows below the first screen are streamed. Today
   the interpreted row costs about 95 ms and the page is at 11.1 KB against
   8 KB with 24 names.

8. **(a) today, by default; under option A, `LongList` draws from row 0 and
   `?from=` is a row to scroll to.** Until `LongList` exists nothing
   changes. When the server draws every row, a page opened at a row needs no
   take-over correction: the rows above are in the document, so the page
   links to the row's id and `WindowList` leaves the application. That is
   the only arrangement in which the measuring code leaves the chunk.

   One rule for when it is built, since CI has no Safari: the recipe's
   `content-visibility` rule stands inside `@supports (overflow-anchor:
   auto)`. A browser without scroll anchoring then lays out an ordinary
   long list, correct and slower, and cannot move the page when a row above
   the viewport takes its real size. If Safari has gained scroll anchoring
   by then, the same rule turns the feature on there with nothing changed.

### #430

9. **(Superseded for the trace condition by decisions-2026-11-12-ui.md.) (b): not built now. Built for Listbox when upstream can drop
   floating-ui, or when a trace shows placement costing a frame.** The
   trial saves no bytes (floating-ui stays for the fallback and for
   `anchor.ts`, `cascadeSelect.ts` and `tour.ts`), nothing has measured the
   `autoUpdate` loop as a cost on any page, and it makes two placement paths
   for every panel. Only one of the two would run in CI's one browser as
   the default, and the path Safari 26 and Firefox 147 take would be tested
   nowhere. It would also take over the focus on open from upstream's
   anchor, and accessibility parity is not something to try on a trial. The
   thresholds are in phase 5: over 16 ms from open to the first positioned
   frame, or over 1 ms of a scroll frame in `autoUpdate`, at 4x throttling
   on domains-plus.

10. **(a): stay on `popover="manual"` with upstream's Messages.**
    `popover="auto"` hides the panel at once, so upstream's leave has
    nothing to show outside Chromium, a submenu needs nested or linked
    popovers, and the browser's toggle meets upstream's press-origin logic
    (the Menu trap). It would retire one transparent element. Revisit when
    `overlay` or an equivalent is in three engines.

11. **(a): restated.** The top layer needs Chromium 114, Safari 17 and
    Firefox 125 and is already shipped; placement needs Chromium 125,
    Safari 26 and Firefox 147 and is the part left. "Safari 18" in the
    issue names a browser with the first and not the second, so the
    fallback is what would run there. The issue takes a new title below.

12. **One request, not two, and no comment on foldkit/foldkit#1689.** The
    request that changes a number is a way to place a panel without
    `anchorSetup` in the chunk; it is posted after phase 0 has today's
    floating-ui figure. The side a flip chose matters only on a CSS path, so
    it is one sentence of that request and not an issue of its own. #1689
    already asks for `showModal()` as an opt-in and this note has no number
    to add to it: a comment with none is noise on someone else's tracker.

## 8. Risks, review points, rejected alternatives

**Risks.**

- *A class the build missed.* The registry holds what the process compiled,
  so a style module the sheet build never loads has no rule
  (`inject.ts:98-101`). Today injection covers it; without the runtime
  nothing does. The conformance test and the development path are the
  guard, and a page test that every drawn class has a rule (#271's) stays.
- *Two paths per popup.* Every CSS-placed panel has a fallback that most
  developers never see. The doubled browser tests are the only thing that
  keeps it working; if they are too slow to keep, the feature should not
  ship. CI runs Chromium alone, so "doubled" means the CSS path and the
  forced fallback in one engine; decision 9 waits partly for that reason.
- *Accessibility.* `content-visibility: auto` keeps skipped rows in the
  accessibility tree and the tab order, which is wanted, and makes a
  screen reader's list as long as the list; `aria-setsize` and
  `aria-posinset` stay as `WindowList` writes them
  (`windowList.ts:415-416`). A popover's focus is not managed by the
  browser for `manual`; ours is upstream's and unchanged. `showModal()`
  would change focus return and the inert set, which is why it is
  upstream's to switch.
- *Server markup.* A row's `content-visibility` is a class, so the server's
  HTML is what a parser builds. Anchor names are inline custom properties,
  which Foldkit serializes; a test renders one to a string and parses it
  back. `popover` stays an attribute the view writes, as today.
- *Browsers without support.* Anchor positioning falls back by `@supports`;
  `content-visibility` and `contain-intrinsic-size` degrade to an ordinary
  long list, correct and slower. No path depends on a Chromium-only feature.
- *The sorted-declaration trap.* A rule that sets `inset` beside `top` or
  `left` would be reordered (`styleRules.ts:95-99`); the placement rule
  writes longhands only.
- *Stale numbers.* The bundle split is from 2026-11-02 and the chunk has
  grown by 6 KB since. Phase 0 exists so no phase rests on it.

**Review points.**

- Does the client chunk of domains-plus contain `styleRules` after phase 1?
  Check which modules the chunk holds, not only its size.
- Is every CSS-placed panel tested by geometry on both paths, and does each
  new test fail with its rule deleted?
- Does `LongList` redraw a row whose item did not change? Count draws, with
  a second change (the memo trap).
- Does any recipe default raised for #424 sit in `components` with its
  state rules beside each variant that sets the same property?

**Rejected.**

- *A stylesheet per page (#471).* Measured: 34 of 148 classes, about 1.2 KB
  brotli, nearly all drawn later by the client (performance-PLAN.md lines
  254-266).
- *Deferring the style runtime or the popups behind `Resource.lazy`.* #423
  saved 0.9 KB of 214.8 and was reverted; a view cannot wait on a lazy
  module.
- *Atomic classes (one per declaration).* Smaller CSS for large systems,
  but it gives up one class per piece, which is what lets a layer order
  decide between a base and a variant.
- *Forking `@foldkit/ui`'s Dialog to call `showModal()`*, or its anchor to
  drop floating-ui. Both are upstream's by the standing rule, and the first
  is a deliberate choice there.
- *Replacing upstream's popups with `foldkit-primitives`' `Overlay` and
  `Placing`.* It removes floating-ui today, and makes a second
  implementation of every popup's keys and state.
- *`content-visibility` as a mode of `WindowList`.* Its Model would carry
  heights, an estimate and a viewport that one mode never reads.
- *A client-only long list (every row drawn after boot).* About 95 ms of
  drawing at desktop speed in one task, several times that on a phone.
- *An interest or invoker attribute (`interestfor`, `commandfor`) for hover
  cards and triggers.* Not in three engines, and the open state is the
  Model's.

## Issue actions

For the coordinator. Nothing here has been done.

**#420, keep open**, title unchanged. Comment: decided to measure first;
build if the three style rows of the bundle report sum to over 15 KB brotli
on domains-plus, close as not planned at 15 KB or under; modules are named
by a `modules` list in `styles({ … })`; `whenInput` and `perItem` are
refused in a listed module; production has no runtime fallback and the
build fails on a class with no rule; phase 1 must take 12 KB or more off the
measured chunk or be reverted.

**#424, narrow.** New title: "mixins-ui: Sheet and WindowList defaults an
application should not restate (domains-plus's shipped-component block from
124 lines to 75)". Comment: `style.ts` is 1,219 lines, of which 935 are the
application's own Slots and 124 restyle shipped components, so recipe
defaults cannot reach 700; redrawing the page with shipped components is not
planned, since domains-plus is an exact port.

**#429, keep open and narrow.** New title: "mixins-ui: LongList, every row
server-drawn through content-visibility (waits on a compiled row or
streaming)". Comment: the layout-shift reason is gone (#418, 0.001) and the
server draws 24 names (#415); the client-grown variant is not built because
it removes no code while `?from=` keeps `WindowList`; built when the server
draws 556 rows in 10 ms or less and the HTML is within budget or streamed
(#473 or #433, #427); then a sibling component, `?from=` a row to scroll
to, and `content-visibility` only where the browser has scroll anchoring.

**#430, keep open and narrow.** New title: "mixins-ui: CSS anchor placement
for arrowless panels (Chromium 125, Safari 26, Firefox 147), floating-ui as
the fallback". Comment: the top layer is already the browser's
(`popover="manual"`, Safari 17) and a Sheet is already a `<dialog>`;
`showModal()` is upstream's (foldkit/foldkit#1689); `popover="auto"` is
declined; placement waits for upstream to make floating-ui droppable or for
a trace over the thresholds in this note; Safari 18 has no anchor
positioning, so the issue's "Safari 18" is restated.

**No issue is closed today.** #420 closes on phase 0's number if it is 15 KB
or under.

**Upstream request to post on foldkit/foldkit**, after phase 0, with the
bracketed figure filled in from the same bundle report. Title: "ui: place
an anchored panel without Floating UI in the chunk". Text:

> Each component module defines its anchor Mount at module level with
> `anchorSetup` in its closure (for example `AnchorListbox` in
> `listbox/shared.js`), so an application that draws one Listbox ships
> `@floating-ui/dom` whether or not the browser needs it: [N] KB brotli of a
> [M] KB first chunk in our measurement. Chromium 125, Safari 26 and Firefox
> 147 can place such a panel with CSS anchor positioning. Would you take
> either of these: a `strategy` in `AnchorConfig` that the anchor Mount
> honours, where `'css'` writes an anchor name on the button and the panel,
> keeps the first-position focus (`focusAfterPosition`) and the
> `CompletedAnchor…` Message, and does not import Floating UI; or
> `anchorSetup` loaded on demand, so a build that never calls it drops it?
> Either keeps the Mount's name and Messages, so `Scene.Mount.resolve` is
> unchanged. One thing a CSS path cannot do outside Chromium is say which
> side a flip chose; if the Mount could still set `data-placement` there (a
> single read after layout would do), recipes that turn an arrow or a leave
> by it keep working. We can send the Listbox change as a pull request if
> the shape is acceptable.

**No comment on foldkit/foldkit#1689**, and no request for the flip side
alone.
