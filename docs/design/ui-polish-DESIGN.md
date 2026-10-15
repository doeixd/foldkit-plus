# UI polish: bugs, consolidation and depth

The parity work ([ui-parity-DESIGN.md](./ui-parity-DESIGN.md)) put a component
behind every name shadcn has. This plan is the second pass a user's review of
the gallery asked for: what is broken, what should be one component instead of
two, and where each component is thinner than the sources it is measured
against. The bar is the one in [TODO.md](./TODO.md) ("The bar"): Zag's
robustness, the APG's standards, Base UI's usefulness, Fluid Functionalism's
beauty and defaults, shadcn's completeness, CSS-Tags' customizability, while
primitives stay reused, everything works unstyled, and every part composes.

Each finding below is marked **confirmed** (read in the source) or
**hypothesis** (to be reproduced in a browser before the fix).

## How the work runs

1. **Look before fixing.** Every visual claim is checked in Chrome on the
   gallery at three widths (phone, 768px, desktop), in light and dark, and in
   `dir="rtl"`. A bug gets a screenshot and, once fixed, a browser test that
   asserts geometry or computed style (AGENTS.md: "A claim about focus, layout
   or the pointer is a browser test").
2. **A brief before a redesign.** A component that is redesigned (not just
   fixed) gets the research table from ui-parity-DESIGN.md §"How each
   component is built" first: shadcn, ReUI, Base UI, Zag, Fluid
   Functionalism, the APG, and where named, blobz. The brief lands with the
   first code.
3. **Systems before components.** Part A fixes rules that many components
   share; doing them first fixes a dozen findings at once and keeps a
   component from patching its own copy of a shared fault.
4. **Many examples per page.** A gallery page shows a component's range, the
   way Fluid's presets do: several named examples, not one (A8).
5. **The untested backlog first.** About 26 components since NumberField
   have tests that have never run (TODO.md, parity 6). Phase 0 runs them.

## Part A: shared systems

### A1. State colour on coloured surfaces

**Seen in:** Button Group hover, Table row hover, NumberField, Command,
Context Menu, Sidebar, Menubar, VirtualList, the date range, TreeView, Nested
Menu, Tabs.

**Confirmed cause.** `unfilledHover` is `ref.state.hover`
(`recipes/design.ts:180`), which `Theme.oklch` defines as
`color-mix(in oklab, currentColor 12%, transparent)` (`theme/oklch.ts:269`).
The ink is the text colour, a neutral grey, so every hover lays a grey film.
On a neutral page that reads as a tint; on an accent, a raised popup in dark
mode or any toned surface it reads as dirt, because grey mixed into a hue
desaturates it.

**Plan.**
- Separate *what the state is made of* from *the text*: a `--fk-state-ink`
  custom property that the state tokens mix instead of `currentColor`. It
  defaults to the surface's own ink, and every surface that changes hue
  (an accent or tone fill, `Theme.raise` levels, `surface.*` regions, popups)
  sets it to its own ink, so a hover on blue is a deeper blue, not grey.
- A knob `state-hue`: `neutral` (today), `surface` (the surface's hue, the
  new default), `accent` (Fluid's look: hovers lean on the accent at low
  chroma). One override changes every component.
- Audit every reader of `state.*`, `surface.muted` used as a hover, and
  `text.muted` used on fills; list them in the commit.
- Browser test: computed hover background on an accent card and in a dark
  popup has the surface's hue (OKLCH hue within a few degrees), not chroma 0.

### A2. Concentric corners

**Seen in:** Command, Context Menu, Menubar, Segmented, Carousel, InputCopy's
focus ring, the popup highlight.

**Confirmed causes.**
- Popup rows and the fluid highlight use a fixed `radius.md`
  (`recipes/popup.ts:114`) inside a `radius.xl` panel with padding. The rows
  box itself is `nested(xl, 2xs, thin)` (`popup.ts:80`), but its children are
  not.
- Segmented: the options use `nested(radius.md, inset)` while the indicator
  and highlight overlays use `radius.sm` (`recipes/segmented.ts:32, 74`), so
  the pill and the option it marks have different corners.
- Command's list and rows (`recipes/command.ts:23, 65`) and Menubar's bar
  (`recipes/menubar.ts:23`) set radii by hand, unrelated to their containers.

**Plan.** Make concentricity the default instead of each recipe's
arithmetic. A container that pads its children publishes `--fk-outer-radius`
and `--fk-inset`; `Theme.nested()` with no arguments reads them, so a child's
radius is `max(outer - inset, minimum)`. A popup panel, a tray, a card, the
Command list, Carousel's track and a field group publish them; rows, pills,
highlights and focus rings read them. Audit: every `borderRadius` inside a
padded container in `recipes/`.

### A3. Collapse motion: "taller, then shorter, text jumping"

**Seen in:** Sidebar sections, TreeView groups (and likely Accordion).

**Done in Phase 0.** Hypothesis 1 was wrong and 2 was close: the cause was
the stretched `auto` heading row (Part B). Sidebar and TreeView now share
`opensBelow` in `design.ts`. Accordion animates a one-track panel, has no
`auto` row, and did not jump. The original hypotheses are kept below for
the record.

**Hypotheses, to reproduce first.**
1. The open transition uses `ref.motion.ease` (`recipes/sidebar.ts:78`,
   `recipes/treeView.ts:31`). `/create`'s motion presets can set `ease` to
   `spring`, a `linear()` curve that overshoots, and an overshoot on
   `grid-template-rows` is a height that passes its end and comes back:
   "taller, then shorter".
2. The collapsing row's content reflows during the animation (padding or a
   min-height inside the clipped row, or the sidebar's width transition),
   which reads as text jumping.

**Plan.** A rule for the motion system: layout properties (`*-size`,
`grid-template-*`) never take an overshooting curve; `glide`/`presence`
already separate travel from fade, so add `collapse(tier)` to `design.ts`
that every disclosure uses (Accordion, Sidebar, TreeView, NestedMenu later).
The content keeps its final layout while the row clips it. Browser test:
sample the section's height every frame while it opens; it never exceeds
its final height, and the first label's x never moves.

### A4. The overlay layer: stacking, collision, arrows, anchors

**Seen in:** Popover, Tooltip, Hover Card (the link moves), Nested Menu (the
submenu scrolls), Combobox (width), Select, Menus.

**Confirmed and reported causes.**
- The gallery draws popups with `portal: false` (AGENTS.md: upstream's
  portal relocates the node and the runtime that drew it crashes), so a
  panel stays inside its trigger's stacking context and its overflow. That is
  where z-index fights and clipping come from.
- Nested Menu draws each submenu inside its row, and the rows sit in the
  panel's scrolling slot, so the submenu is clipped by and scrolls with the
  parent's list (the agent's report on `nestedMenu.ts`).
- Hover Card, hypothesis: the card is in flow beside the link, or the anchor
  restyles the trigger, so showing it shifts the link.

**Plan.**
- **The top layer.** Draw every floating panel in the browser's top layer
  with the Popover API (`popover="manual"`, `showPopover()`), and dialogs as
  modal `<dialog>`. The node stays where the runtime drew it, so nothing is
  relocated, and no z-index or ancestor `overflow` can reach it. This
  replaces the portal for good. Check upstream's anchor (Floating UI) works
  with a top-layer element; if a fix belongs upstream, write it up.
- **Collision.** Placement with flip, shift and a size limit to the viewport
  (Floating UI's `flip`, `shift`, `size`) as defaults, configurable per use.
- **Arrows.** An `arrow` slot on Popover, Tooltip and Hover Card, positioned
  by the anchor's arrow data, drawn in CSS, with a recipe axis to hide it.
- **Anchors and alignment.** Placement (`side` × `align`), offset, cross
  offset, and *match the trigger's width* (`sameWidth`: on for Combobox and
  Select, configurable).
- Nested Menu's submenus then live in the top layer too, out of the parent's
  scroll box.

### A5. Scrollbars and scroll areas

**Seen in:** every scrolling surface. Fluid's
[scrollbars](https://www.fluidfunctionalism.com/docs/scrollbars) are the
reference: a thin thumb that rests, widens on hover, fades when idle, native
on touch, with fades at the edges that have more.

**Plan.** This is systems 6b, now with a brief. A `ScrollBars` Mount draws an
overlay thumb (rest 4px, hover 6px, idle fade after a pause, travel-aware),
and keeps the native bar on coarse pointers. `Utilities.scrollFade` (6a)
stays the edge gradient; add the hairline divider at a scrolled edge (needs
`timeline-scope` or a scroll-driven animation). Every scrolling recipe
(ScrollArea, popup lists, Command, VirtualList, Sidebar, Table, Dialog body,
Sheet) uses the same pieces.

### A6. Right to left

**Confirmed:** the Switch thumb starts at `inset-inline-start` (logical) but
moves by a positive physical `translate` (`recipes/toggle.ts:125, 138`), so
in RTL it slides off the far side. **Plan:** a `--_fk-dir` of `1` or `-1`
set under `:dir(rtl)` that every physical translate multiplies by; then the
audit TODO.md already lists (physical `left`/`right`), extended to
translates and arrow keys: Switch, Carousel arrows, NestedMenu's
ArrowRight/Left, TreeView's, RangeSlider, Steps' connector, the popup
overlays (`left: 0`, measured from the left). Every gallery page gets an RTL
toggle, and a browser test per component flips `dir`.

### A7. Optical centring and text boxes

**Seen in:** Segmented (space under the text), Kbd, the Checkbox mark,
Radio's dot against its label, Steps.

**Segmented, measured in Phase 0:** each option carries both `trimmed`
(`text-box`) and `Utilities.steady`'s hidden `::after` copy
(`recipes/segmented.ts`). The guess was that the trim did nothing on a flex
button and the copy added a line. Neither holds: the option computes
`inline-block` (a block container, so the trim applies) and the copy is
`height: 0`. The text still sits about 2.5px above centre, so the offset
comes from the trimmed glyphs themselves; measure ink, not line boxes,
before choosing the fix. **Plan:** one checked recipe for "a label centred in a fixed
height": a block inner span with the trim, the steady copy laid over it
(grid stacking, not a second line). Kbd, Badge, Segmented, Tabs and Button
use it. The Checkbox and Radio marks are centred with `place-items: center`
on the box and a mask glyph, not percentage offsets (the check sits at
`inset-inline-start: 32%`, `toggle.ts:67`). Browser test: the glyph's and
the text's boxes share a centre within 0.5px.

### A8. Gallery pages with many examples

Most findings say "show more examples". **Plan:** let a showcase carry
several named examples, as Fluid's presets do, each with its own snippet
region, the recipe axes still switchable over all of them, and a link to an
example (`#preset-name`). Then each Part C entry lists the examples to draw.

### A9. One component where there are two

Breaking changes are fine at 0.x. Each merge keeps one API, one recipe and one
gallery page with the variants as examples.

| Today | Becomes | How |
|---|---|---|
| `Alert`, `Banner` | `Alert` with `layout: inline \| banner` | Banner's region landmark and full-width strip as a layout; Alert's tones and emphasis shared; Fluid's [Banner](https://www.fluidfunctionalism.com/docs/banner) as the reference |
| Dialog, Alert Dialog | Dialog, `role: dialog \| alertdialog` | `Dialog.isDismissal` stays; one page |
| `Recipes.Sheet`, `Recipes.Drawer` | `Sheet` with `side` and a `handle`, plus drag (C, Sheet) | one recipe, one page |
| Calendar, DatePicker, DateRange | one date system: `selection: single \| range \| multiple`, inline or in a popover | DateRange's `picked` becomes the range mode; the DatePicker stays open in range mode (needs upstream, or our own popover over the Calendar) |
| Slider, RangeSlider | Slider with a `number` or a `{ low, high }` value | one recipe in Fluid's [slider](https://www.fluidfunctionalism.com/docs/slider) look |
| Menu, ContextMenu, NestedMenu | one Menu page: a button, a point or a row opens it | shared panel recipe, submenus available to all three |

## Part B: bugs

Phase 0 (2026-10-15) reproduced each row in Chromium on the gallery, by
script: geometry, computed style and hit tests, plus screenshots of every
page at 390, 768 and 1440px, dark, and `dir="rtl"`. No page logs an error.
**Fixed** rows name the commit's subject.

| Component | Symptom | Cause | Fix |
|---|---|---|---|
| Input OTP | The gallery example does not work | **confirmed:** the cells are drawn over the input, so a press on a cell lands on a `div` and focuses nothing; typing after focusing the input works | the cells take no pointer (`pointer-events: none`) or the input sits above them; a browser test that clicks a cell, types six digits and pastes |
| Hover Card | The link moves when the card shows | **confirmed:** the card is drawn in flow inside the trigger's `span`; the centred preview re-centres on the wider pair and the link jumps about 140px | A4 (top layer); until then, the card out of flow |
| Nested Menu | The submenu scrolls inside the parent | **confirmed, worse:** the submenu's nearest clipping ancestor is the parent `role="menu"` (`overflow: auto`), and it is placed beside the parent, so it is clipped away entirely and never shows | A4 |
| Radio Group | The label cannot be clicked; the dot sits off the text | **confirmed:** the radio is a `button`, the label a `<label>` with no `for` and no click, so a press on it changes nothing; the dot's centre sits 3px above the label's | a press on the label chooses (an `OnClick`, or the label wrapping the row); A7 |
| Skeleton | Looks broken on the website | **confirmed:** every shape computes 0px wide (16px tall), so nothing shows | intrinsic sizes for shapes; the composites in C |
| VirtualList | The width changes while scrolling | **confirmed:** the list sizes to its widest drawn row, 121–131px as rows change | `grid-template-columns: minmax(0, 1fr)`, full width |
| Carousel | The corners are cropped | **confirmed, two causes:** the gallery's slides drew a square `1px currentColor` border that the slide's rounded clip cut (**fixed**: "the carousel demo's slides are a fill"); and a focused slide's ring is cut at the sides by the track's `overflow` | inset the ring, or pad the snap area (`scroll-padding`) |
| Segmented | Corners and vertical centring | **confirmed:** the text sits about 2.5px above centre in its 28px option. The trim is on an `inline-block`, which is a block container, and the steady copy is `height: 0` and adds no line, so the cause in A7 is wrong; the trimmed line's glyphs sit high | A2; find the real offset in A7 |
| Switch | Broken in RTL | confirmed, A6 | — |
| Checkbox | The mark is off centre | at 3×, the check sits a little up and left of centre; slight | A7 |
| Kbd | Not optically centred | the line box is 1px above centre; at 3× the K reads slightly low. Minor | A7 |
| Sidebar, TreeView | Jumps while a section opens | **confirmed, not the spring:** the shipped spring overshoots 0.3% (a fifth of a pixel on 72px). The heading row is an `auto` track, and mid-transition `align-content: normal` stretched it into the room the `fr` row left, so the links dropped about 16px and rose back. **Fixed**: "a Sidebar section or TreeView group holds its rows still while it opens" (`opensBelow`, with a frame-sampling browser test) | — |
| InputCopy | The focus ring is cut by the corners | **confirmed:** the input's ring is an inset square outline (`outline-offset: -2px`, radius 0) inside a group with `overflow: hidden` and an 8.4px radius | ring on the group with `:focus-within`, concentric (A2) |
| Steps | Misaligned by default | **partly:** the connector is centred on the marker (both at y 467.9). What reads as misaligned: the titles sit at different heights, because each text block is centred on its marker and the descriptions differ in length; the connectors' widths differ (16–28px); and at 390px the labels overlap the markers | align titles to the marker's top line; equal connectors; vertical below a width |

**Found in Phase 0, not in the review:**

| Component | Symptom | Cause | Fix |
|---|---|---|---|
| Accordion, Sidebar, TreeView, Nested Menu, Carousel, Steps | RTL: a shut row's chevron pointed up, the Sidebar's open one left, the carousel's arrows up and down | the marks were drawn with logical borders, which mirror under `dir="rtl"`, so each recipe's RTL turn landed a quarter off; the Sidebar had no RTL turn | **Fixed**: "chevrons and arrows point the right way right to left" (`cornerSides`, physical sides; a browser test reads where each mark points) |
| Alert | At 390px the title is squeezed into a three-line column beside the description | title and description sit side by side at every width | stack below a width, or wrap the pair (the merge in A9) |
| Banner | At 390px the text is indented behind an empty gutter and the action centred under it | the strip's layout assumes a wide row | A9 merge with Alert |
| Pagination | At 390px it overflows: "Previous1" touches | no compact layout | Part C: compact at narrow widths |
| Radio Group | Drawn as a row though it says `aria-orientation="vertical"`; at 390px three narrow columns wrap | the layout ignores the orientation | lay out by the orientation |
| Item | The demo's media is a bare black `●` | gallery content | Part C examples |
| Resizable | The demo's file list shows default list bullets | gallery content | gallery fix |
| OTP, Steps (dark) | Cell borders and the upcoming marker are faint on the dark page | low-contrast outline token | check against A1 |

## Part C: component by component

Each entry lists the sources to read and the options to decide on. The brief
decides adopt, adapt or skip.

### Actions and display

- **Button.** Systems 8 shipped a 1px press, which a user did not notice.
  Make `:active` visible: the family's `active` fill (it exists,
  `oklch.ts:136`), a 0.98 scale on the fast tier through `travel`, and
  pressed (`aria-pressed`) as a filled state for toggles. Compare Fluid and
  shadcn, and Base UI's states.
- **Badge.** New appearances beside the tinted one: `dot` (a coloured dot,
  plain text, no fill), `outline` (a tone border, plain or tone text), and
  `solid`. Badge's dot already exists; make it an axis, not a fixed part.
- **Alert / Banner.** Merge (A9). From Fluid's Banner: icon, title and
  description, actions on the end or below, dismiss, tone and emphasis, a
  compact layout.
- **Card and Card Group.** The elevated look is the weakest:
  - Layered shadows (a tight contact shadow and a soft ambient one), tinted
    by the surface's hue through a `shadow-hue` knob, with
    `shadow-strength` scaling both.
  - Elevation in dark mode by surface lightness (`Theme.raise`), not by
    shadows that do not show on dark.
  - An `elevation` axis 0–3 tied to the surface ladder; hover lift as an
    option.
  - Examples from Fluid's [card presets](https://www.fluidfunctionalism.com/docs/card?preset=caI9E8):
    media, stat, pricing, profile, selectable, link card, card group as a
    grid.
- **Avatar.** Recipes from [blobz](https://blobz.lirena.in/docs/components/):
  a stacked group with overlap and a "+3", a status dot, a ring, initials
  with a colour from the name, shapes, an avatar with name and caption, an
  avatar inside a badge.
- **Kbd.** A7, a keycap look (inner shadow), and `Kbd.combo(['⌘', 'K'])`.
- **Separator.** Examples: horizontal and vertical, a label in the middle,
  spacing and inset options, dashed, thickness.
- **Skeleton.** Fix (B), then: a shimmer wave option (travel-aware), text
  lines (`lines: 3`, a short last line), and composites (an avatar row, a
  card, a table row) built from the existing shapes.
- **Spinner.** Kinds: ring (today), dots, bars, pulse, orbit, an
  indeterminate ring shared with Progress; sizes and tones; a label beside
  it.
- **Item.** Say what it is (the row primitive: media, title, description,
  actions) and show it: settings rows, a notification list, a file row, a
  selectable item, a link item.
- **Empty.** Make it read as empty: a muted icon or illustration slot, a
  dashed border option, title, description, actions; examples for no
  results, first use and an error.

### Form controls

- **Input.** The filled variant's fill needs more contrast with the page: a
  `field` token (or the `surface-contrast` knob) rather than
  `surface.muted`.
- **Select.** Fluid's [select](https://www.fluidfunctionalism.com/docs/select)
  examples: icons, descriptions, groups and headings, sizes, a placeholder,
  disabled options, the check's position, trigger variants; `sameWidth`
  (A4).
- **Checkbox.** Centre the mark (A7), animate the check (drawn in, on the
  fast tier, travel-aware), indeterminate, sizes, tones, a card checkbox
  (the whole card the label).
- **Checkbox Group.** Spacing on the ladder, a description per option,
  select-all with indeterminate, horizontal and vertical, an error.
- **Radio Group.** Fix (B); card radios, descriptions, horizontal.
- **Switch.** RTL (A6); a thumb drag (systems 8, open).
- **Input OTP.** Fix (B); separators and groups (3-3), masked, numeric or
  alphanumeric, sizes.
- **Password Input.** Check its slots against shadcn's and Zag's: a strength
  Meter slot (Meter synergy), a caps-lock hint, a requirements list, the
  toggle's placement.
- **Tags Input.** Show a refused tag (a repeat or an empty part): a message
  slot and a brief shake, travel-aware, announced politely; suggestions
  through the Combobox; a maximum; chips as Badges.
- **InputCopy.** The focus ring (B, A2); go back to "Copy" after a delay the
  application sets (`InputCopy.Reset` after `ms`, as a Command).
- **Slider / Range Slider.** Merge (A9); Fluid's look: a thick rounded
  track, the value inside or above the thumb, marks and ticks, steps,
  vertical.
- **Color Picker.** Rebuild after ReUI's: a 2D saturation and brightness
  area, hue and alpha sliders (the merged Slider), an eyedropper where
  supported, a format switch (hex, rgb, hsl, oklch) with an input, swatches,
  and a popover trigger.
- **Combobox.** A research brief first (ReUI, shadcn, Fluid, Base UI, Zag,
  the APG): width matched to the input and configurable (A4); icons and
  descriptions; multiple selection with chips (TagsInput synergy); async
  loading; creatable; groups; matched text highlighted; an empty state;
  clear; long lists through VirtualList.
- **Dates.** Merge (A9). Typography like shadcn's and ReUI's (weights,
  tabular numbers, muted weekday labels and outside days). Edge cases: min
  and max, disabled dates, outside days, the locale's first day, week
  numbers, RTL, today. Month and year choosing: dropdowns, a grid of months
  and of years, a caption layout. Presets ("Last 7 days"), two months, a
  hover preview of a range.

### Navigation

- **Breadcrumb.** Separators (chevron, slash, dot, custom), truncation (the
  middle into an ellipsis menu), a maximum, icons.
- **Pagination.** Simple (previous and next), numbered with ellipses,
  siblings and boundaries, a page size select, "1–10 of 97", compact,
  first and last.
- **Tabs.** Examples: underline, pill, vertical, with icons and counts,
  scrolling overflow, closable.
- **Segmented.** Fix (A2, A7); examples: icons, sizes, full width, tray and
  underline.
- **Navigation menu.** Dropdown panels (a mega menu), the indicator styles
  (pill, underline), vertical.
- **Sidebar.** Fix (A3), then after Fluid's sidebar: header and footer
  slots, groups, counts and badges, icons, nested items, a gliding active
  marker, collapse to an icon rail with tooltips, a resizable width (the
  Resizable handle), a sheet on a phone, the collapsed state remembered.
- **Steps.** Fix (B); markers on the Badge and Avatar sizes, icons per
  step, vertical with content, the connector as a Progress.
- **Carousel.** Fix (B); dots after Fluid's
  [carousel dots](https://www.fluidfunctionalism.com/docs/carousel-dots),
  thumbnails, several per view, the swipe reported back (a `scrollend`
  Mount), autoplay with pause and a stop control.
- **Tree View.** Fix (A3); icons, guide lines, checkboxes, drag to reorder
  later.

### Overlays and menus

- **Menus.** Merge the pages (A9); concentric rows (A2); checkbox and radio
  items, shortcuts, submenus in the top layer (A4). Menubar gets the same.
- **Command.** Concentric (A2); from Fluid's
  [command menu](https://www.fluidfunctionalism.com/docs/command-menu?preset=kd4OW):
  groups with headings, shortcuts as Kbd, icons, a footer with key hints, an
  empty and a loading state, nested pages, ⌘K in a dialog.
- **Popover, Tooltip, Hover Card.** A4 (top layer, collision, arrows,
  anchors), and more examples per page.
- **Dialog.** Merge (A9); sizes, a scrolling body with a sticky footer
  (A5), a form, a destructive confirmation, nested.
- **Sheet / Drawer.** The hardest. A brief over vaul, Radix and Base UI
  dialogs, Zag's dialog, Fluid and ReUI: drag to dismiss with velocity,
  snap points, the handle as a real slot, nested drawers, scaling the page
  behind, scroll lock, safe areas on a phone, the top layer (A4), focus,
  sides and sizes, non-modal. One component (A9).
- **Toast.** Rebuild after Sonner, Fluid and ReUI: a stack that expands on
  hover, swipe to dismiss, positions, a type with its icon, promise toasts
  (loading to success), actions, a duration that pauses on hover and focus,
  a maximum shown, reduced motion.

### Data

- **Table.** ReUI's tables are the reference. Decide the boundary with the
  DataGrid first: Table stays the presentational table (sortable headers
  with `aria-sort`, striped, density, a sticky header, row selection with
  checkboxes, an empty state, an expandable row), and filtering, column
  reordering, resizing and virtualized rows point to `foldkit-data-grid`.
  Examples for each.
- **VirtualList.** Fix (B); use the project's pieces: ScrollArea and the
  scroll fades (A5), `ListNavigation` and Selection for a selectable list.
- **Progress.** Examples: a label with the value, segmented and stacked,
  buffered, striped and moving (travel-aware), the ring with the value
  inside, an upload list, steps as progress; tones shared with Meter.
- **Rating.** A brief (Zag, MUI, Mantine): a fractional read-only value
  (4.3 drawn as a partial star by a clip), half stars, other glyphs
  (hearts), sizes, a label per value, clearing, Home and End.
- **Resizable.** A nicer handle (grip dots, an accent line on hover),
  vertical, nested both ways, collapsible panels.

## Part D: sequence

| Phase | Work | Why first |
|---|---|---|
| 0 | Run the untested backlog (unit, browser, mutation); screenshot every gallery page at three widths, light and dark, LTR and RTL; confirm or drop each hypothesis in Part B | nothing above is trusted until it runs. **Done 2026-10-15** apart from the mutation specs still being written (Part B records the rest) |
| 1 | A1, A2, A3, A7 | shared rules; each fixes several findings |
| 2 | Part B | broken things before better things |
| 3 | A4 and A5 | larger systems; menus, popovers, combobox and scroll areas wait on them |
| 4 | A9 merges | the API settles before examples are drawn for it |
| 5 | A8, then Part C in this order: form controls, overlays and menus, navigation, display, data | most-used first |
| 6 | A6 audit and an RTL test per component | after the shapes stop moving |

Part C entries are independent once Phases 1–4 land, so they split across
agents the way parity 6 did: each writes its own files and reports the
shared registration text.

## Open questions

- **The merged names.** `Alert` with a banner layout, or `Notice`? `Sheet`
  or `Drawer` for the merged edge dialog? The plan assumes `Alert` and
  `Sheet`.
- **Table and DataGrid.** Is the boundary above right: sorting and selection
  in Table, the rest in the DataGrid?
- **Color Picker scope.** A ReUI-like picker needs a 2D area with pointer
  and keyboard handling; is the area wanted in the first rebuild?
- **The top layer.** Moving every floating panel into the top layer changes
  how applications stack their own overlays; worth confirming before Phase 3.
