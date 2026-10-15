# UI systems: motion, sizes, type, surfaces, scrollbars and fluid hover

Fluid Functionalism's systems, read for what Foldkit Plus's tokens, recipes,
mixins and primitives should take from them. The parity plan
([`ui-parity-DESIGN.md`](./ui-parity-DESIGN.md)) names *which* components to
build. This plan is about the shared systems those components stand on. It is
step 3b there: it comes before the islands move into the package, so that
each one is built once, on the ladder.

## Sources, and how they were read

The docs pages (`/docs`, `/docs/fluid-hover`, `/docs/motion`,
`/docs/scrollbars`, `/docs/sizes`, `/docs/surfaces`, `/docs/typography`) are
install guides. Each one sends the reader to the skill's craft reference for
"the exact behaviors and values". The numbers below come from that reference
and from the registry's own source, read on 2026-10-14:

- `skills/fluid-functionalism/references/craft.md` (systems and per-component craft);
- `references/custom-motion.md`;
- `app/globals.css` (the surface, shadow, tint and type tokens, and `scroll-fade`);
- `registry/default/lib/springs.ts`, `surface-classes.ts`, `shape-context.tsx`
  and `font-weight.ts`;
- `registry/default/hooks/use-fluid-hover.ts`.

All of these are in `github.com/mickadesign/fluid-functionalism`.

Fluid is React, Motion and Tailwind; we are a CSS pipeline
(`tokens -> ref -> pieces -> slots -> sheet`) over Foldkit views. Each idea
below is translated, not copied:

| Fluid mechanism | Ours |
| --- | --- |
| React context (`SizeProvider`, `SurfaceProvider`) | Custom property inheritance: a knob set on a region, or by a recipe axis on its own element |
| Motion springs in JavaScript | CSS transitions with `linear()` easings, durations derived from knobs |
| `typeClass(role)`, Tailwind utilities | Tokens read through `Theme.ref`, set in recipes |
| `useFluidHover` hook | `FluidHover` Mount (exists), overlays drawn in Slots |
| Ghost span for weight changes | A piece over a slot attribute, with no second element |

## Where it stands (2026-10-14)

Steps 1 to 5, 3b, 6a and 7 are built. What was built differs from the sections
below in these ways, and the code is the word on each:

- **Motion (1).** As planned. Popups and dialogs enter and leave through
  upstream's `data-closed` and `data-leave` (`presence(tier, closed)`), a
  popup from the side its anchor writes in `data-placement`; Accordion's
  panel is the grid collapse, its row a `body` slot with no padding, since
  a grid item is never smaller than its padding.
- **Sizes (2).** The tokens hold the two ends (`control.height` and
  `height-compact`, …), and `Theme.ladder(name)` blends them on the element
  that reads it: a token would resolve the step at `:root`. A popup's `size`
  sets the step on its panel as well as its wrapper, since upstream portals
  the panel out of the page by default; a region reaches only a panel kept in
  place (`portal: false`).
- **Type (3).** Body is 14px on 20 (shadcn's), not Fluid's 13, and subtitle
  15 on 22 to stay above it; the text left the `control` group for the roles
  (`Theme.role`). `text-box` trim works on a block container only, so tabs
  and segmented options have it and the `inline-flex` Button does not.
  Weight without reflow (3b) is `Utilities.steady(weight)`: a zero-height
  `::after` block of `attr(data-label)` at the heavier weight, not a grid
  with a second span, so the element stays a block and keeps its trim.
- **Surfaces (4).** The `state` group holds `hover` (12%, our tuned ghost
  hover, not Fluid's 4 to 6%), `tint`, `tint-hover` and `edge`, each a mix of
  `currentColor` with its amount a knob; `selected` and `pressed` wait for a
  recipe that reads them. The image edge is `imageEdge` in the recipes'
  `design.ts`, not a `Surface` namespace (`foldkit-mixins-surface` is another
  package). The ladder (5) is `Theme.raise(offset)` and
  `Theme.raisedSurface()`: Chrome 156 has no `inherit()`, so the eight
  depth rules carry it, each handing the shallower depths back to the
  ancestor (`inherit`), since the element matches those rules too. Its
  level is the private `--_fk-level`, because the token gates count any
  `--fk-` read as a theme token. There is no shadow ladder: popups pin
  theirs, and nothing else read one.
- **Scroll (6).** The fade is `Utilities.scrollFade(axis)`, in the existing
  subpath, its size the `2xl` space step; the divider and the overlay bar
  (6b) are open.
- **Fluid hover (7).** The cap is a separate `gapReach` argument, not a
  `gapClick` struct. Table rows as a consumer need a wrapper slot, open.

## What changes, in one line each

1. **Motion** has three tiers (80, 160 and 240ms), each with an exit one tier
   quicker. Under reduced motion, objects stop travelling but fades keep their
   speed.
2. **Sizes** follow a two-step ladder (36px default, 28px compact). One `step`
   knob moves control height, padding, gap, icon and type together. A region
   sets it, and menus opened inside that region follow.
3. **Type** comes in six roles, each a size paired with a leading, at both
   steps. Labels change weight without reflow. Fields are 16px on touch.
4. **Surfaces** gain an eight-step elevation ladder that nests by itself.
   Hover and selected fills are tints relative to the surface beneath them.
   Nested corners are concentric.
5. **Scrollbars** are quiet until reached for, native on touch, with a
   scroll-aware edge fade done in CSS alone.
6. **Fluid hover** gains what ours lacks: a cap on how far a gap click
   reaches, never publishing a zero-sized rect, and keeping its fade under
   reduced motion. It also reaches more components: Table, Card grids,
   CarouselDots and Sidebar.

Each is a token, a knob or a piece. None adds a second set of sizes, which
CLAUDE.md forbids.

## What we keep

Fluid's values are hex colors, pixels and fixed timings, tuned for one look.
Ours derive from knobs, and that stays the point. Every change below has to
keep these:

- **Knobs are tokens, and every scale derives from one.** These knobs keep
  reaching what they reach today, and the new groups derive from them too:
  - `density` scales the control group;
  - `radius-factor` scales `control.radius` and the concentric radii;
  - `motion` scales the tiers;
  - `shadow-strength` scales the shadow ladder.

  A compact, rounder or stiller theme is still one override, through
  `Theme.scoped` or an inline variable.
- **The palette is derived, in OKLCH, from a few knobs.** The levels come
  from `surface.base`, so the accent, `neutral-h`, `surface-saturation` and
  `surface-contrast` reach them. Each level keeps the base's chroma, for the
  reason `oklch.ts` records: steps with less read grey on a tinted page.
  `light-dark()` pairs serve both schemes from one theme.
- **The menu looks.** `menu.accent` and `menu.color` (inverted, translucent)
  keep their `popup` tokens, and those win over the ladder's surface on a
  menu's panel. The ladder decides a panel's level only when its `color` is
  `default`.
- **Shadows in the page's own hue.** The ladder's shadows keep `shadow.color`,
  which is denser in a dark scheme so a shadow never glows.
- **Text zoom.** Sizes stay in rem.
- **The cascade.** Recipes select with axes and applications `.extend`
  them. Every value is read through `Theme.ref`, so a misspelt name is a type
  error.
- **shadcn's names.** A recipe's `size` axis keeps `sm`, `md` and `lg`. The
  plan maps them onto the ladder; it does not rename them.
- **What ours already does better:**
  - `FluidHover` lights nothing on touch;
  - its overlays anchor for right to left;
  - our popups never leave the DOM, which is what lets a region's knobs
    reach them.

## 1. Motion

**Fluid.**
- Three spring tiers:

  | Tier | Enter | Exit | Bounce | Used for |
  | --- | --- | --- | --- | --- |
  | `fast` | 0.08s | 0.06s | 0 | hover, fades, tooltips, focus rings |
  | `moderate` | 0.16s | 0.12s | 0, critically damped | dropdowns, tabs, drawers, merged selections |
  | `slow` | 0.24s | 0.16s | 0.12 | dialogs, large surfaces |

- The rule is that the bigger the thing that moves, the slower its tier, and
  no duration is written by hand.
- Exits are plain tweens one tier quicker, so a dismissal reads as final
  rather than as the entrance replayed in reverse.
- Reduced motion means "fewer and gentler, not none". Transform and layout
  animation stop, while opacity and color fades stay, because they aid
  comprehension: a dialog fades instead of scaling.
- Only `transform` and `opacity` animate.
- Two measured-height collapses must never stack.

**Ours.**
- Today we have `motion.fast` (150ms), `motion.normal` (250ms), `ease` and one
  underdamped `spring` (4% overshoot), all multiplied by the `motion` knob.
- `Defaults.reset` sets every duration to 0.01ms under
  `prefers-reduced-motion`, so the fades go too. That is the opposite of
  Fluid's rule.
- Nothing makes exits quicker than entries.

**Change.**
- `motion` tokens:
  - `fast` 80ms, `moderate` 160ms, `slow` 240ms;
  - exits `fast-exit` 60ms, `moderate-exit` 120ms, `slow-exit` 160ms;
  - all `calc(ms * var(--fk-knob-motion))` as now.
- `normal` is removed. This is a breaking change: the recipes that read it
  move to the tier their size implies.
- Two easings:
  - `settle`: a critically damped `linear()`, sampled like today's `spring`,
    for `fast` and `moderate`;
  - `spring`: re-sampled at Fluid's bounce of 0.12, for `slow`.
  - Exits use `ease-in`: they are tweens.
- **Travel versus fade.** A new knob, `travel` (default `1`), multiplies only
  the durations of `translate`, `transform`, `scale` and size properties.
  `Defaults.reset` sets `--fk-knob-travel: 0` under reduced motion instead of
  zeroing every duration.
  - It keeps zeroing `animation-duration`, because keyframes are a recipe's
    own business and unknown here.
  - Recipes write a travel duration with a helper in `recipes/design.ts`:
    `travel(ref.motion.moderate)`.
  - The `/create` motion control's "none" stays the `motion` knob at 0.
- **Exits.** A recipe states each transition once, with its exit duration as
  the default. The open state carries the enter duration:
  `&[open]`, `&:popover-open` or `[data-state="open"]`, whichever upstream
  marks.
  - Because CSS uses the duration of the state being entered, closing then
    runs at the exit speed and opening at the enter speed.
  - Entries from `display: none` use `@starting-style`.
- **Audit.** Every recipe transition moves to a tier, by size. Popups, tabs
  and segmented controls move to `moderate`, dialogs and sheets to `slow`, and
  hover, focus rings and tooltips to `fast`.
  - The overlays that transition `inline-size` and `block-size` keep doing so;
    Fluid's own highlight does too. Their durations become travel durations.
- **Collapse without measuring.** Accordion and Disclosure panels animate
  `grid-template-rows: 0fr` to `1fr` on a one-row grid, which is Fluid's
  Banner technique.
  - fr units resolve from layout, so a scaled ancestor cannot skew the result.
  - The clip goes on the grid container, not on the track item: below 1fr,
    Chrome sizes the track to f² of its content.
  - A nested panel that changes height snaps (`transition: none` while it is
    `[data-resizing]`), so two collapses never stack.

**Tests.**
- A browser test reads a popup's computed `transition-duration` open and
  closing, and asserts that the exit is shorter.
- Under `emulateMedia({ reducedMotion: 'reduce' })`, the highlight's
  `translate` duration is `0s` while its `opacity` duration is not.
- A mutation spec inverts the travel knob in the reset, and another swaps the
  enter and exit durations.

## 2. Sizes: one ladder, one knob

**Fluid.**
- Two steps: default 36px and compact 28px. Every dimension steps down
  together "so the whole control shrinks together, not just its box":

  | | Default | Compact |
  | --- | --- | --- |
  | Text | 13px | 12px |
  | Icon | 16px | 14px |
  | Control padding | 12px | 10px |
  | Row padding | 8px | 6px |
  | Gap | 8px | 4px |

- **One `control` height for bounded controls and for list rows**, so a popup
  row lines up with the trigger that opened it.
- A segmented control's pad plus its item height equals the control height
  (4 + 28 = 36, 2 + 24 = 28).
- Density is a region decision. One provider around a region resizes every
  control in it, menus included. A component's `size` prop beats the region,
  and the region beats the default.

**Ours.**
- The `density` knob scales `space`. Recipes have their own `size` axes
  (Button `sm`/`md`/`lg` from `space` and `size` tokens), and nothing ties a
  row's height to its trigger's.
- `/create`'s "compact" is density 0.8, which the parity plan recorded as an
  adaptation "until a size knob steps the type too".

**Change.**
- A `step` knob: `0` is default and `1` is compact. A `control` token group
  is derived from it with the blend the palette already uses for its 0-or-1
  knobs, `calc(default - step * (default - compact))`:
  - `control.height` 36 / 28px;
  - `control.pad` 12 / 10;
  - `control.row-pad` 8 / 6;
  - `control.gap` 8 / 4;
  - `control.icon` 16 / 14;
  - `control.radius`, from `radius.lg`.
  - Heights are written in rem, so text zoom still works. Every value,
    height included, also multiplies by `density`, as `space` does today, so
    the styles that compact through density (Nova, Mira) keep working. The
    rows and the controls share that one product, so they still line up at
    any density: `step` is the ladder, and `density` a continuous trim on
    top of it.
- **Regions.** `--fk-knob-step: 1` on any element (through `Theme.scoped`, or
  an inline variable from the Model) makes its subtree compact.
  - Our popups stay in the DOM (`portal: false`), and the top layer keeps DOM
    inheritance, so a menu opened in a compact toolbar is compact without any
    provider. Fluid needs React context crossing portals for the same result.
- **Per component.** Each control recipe's `size` axis keeps shadcn's names:
  - `sm` sets `--fk-knob-step: 1` on its own element, which beats the region;
  - `md` sets `0`;
  - `lg` stays outside the ladder, a step up, as shadcn's third size.

  A chosen size beats the region, and no size follows it, as in Fluid. So
  the recipes drop `size` from their `defaults`; today they default to `md`,
  which would pin every control to the default step. This is a breaking
  change: an unset size used to mean `md`, and now it means "the region's".
- **Rows on the ladder.** These read `control.height` as their
  `min-block-size`:
  - popup rows (menu, listbox, combobox, select);
  - table rows;
  - tabs;
  - segmented controls (the item height is the control height minus twice
    the pad);
  - inputs, select triggers and buttons.
- `/create`'s size control writes `step`, closing the parity plan's step 3
  adaptation.

**Tests.**
- A browser test opens a menu from a trigger inside a `step: 1` region and
  asserts that row height equals trigger height, both at 28px.
- A segmented control's outer height equals a button's at both steps.
- A mutation spec drops the knob from `control.height`.

## 3. Type: six roles, weight without reflow

**Fluid.**
- Six roles, each a size with a whole-pixel line height, at both steps:

  | Role | Default | Compact |
  | --- | --- | --- |
  | display | 28/34 | 24/30 |
  | title | 16/22 | 15/20 |
  | subtitle | 14/20 | 13/18 |
  | body | 13/20 | 12/18 |
  | caption | 12/16 | 11/14 |
  | micro | 11/14 | 10/12 |

- Body's leading puts a padded row on the ladder: 8 + 20 + 8 = 36. Micro is
  only for keycaps, counters and tiny badges.
- Three weights, each paired with an optical size so that a label turning
  semibold holds its width within ±0.4px:
  - normal `'wght' 400, 'opsz' 14`;
  - semibold `'wght' 550, 'opsz' 18`;
  - bold `'wght' 700, 'opsz' 25`, only for display.
- A label that turns semibold on selection reserves its bold width with an
  invisible copy, so nothing shifts.
- Fixed-height labels use `text-box: trim-both cap alphabetic` to center
  their letterforms.
- Editable fields are 16px on coarse pointers, because iOS Safari zooms into
  any smaller focused field. `maximum-scale=1` is never used, since it blocks
  pinch zoom elsewhere.
- Streamed text gets no `text-wrap: balance` or `pretty`, and prose spaces
  only above an element, so text arriving at the end never moves what is
  already drawn.

**Ours.**
- A `size` scale (xs to 4xl, in rem), `leading` separately, and four weights.
  The Typography recipe maps h1 to h4, lead, small and muted onto them.
- No pairing of size with leading, no step, nothing for weight changes, and
  nothing for fields on touch.

**Change.**
- A `type` token group: `display`, `title`, `subtitle`, `body`, `caption` and
  `micro`, each with `-size` and `-leading`. Each value blends on `step` like
  `control`, in rem.
- `size` and `leading` stay, for prose and marketing scales.
  `Theme.oklch` is untouched.
- **Recipes size text by role.** Buttons and fields use body. Badges, tooltips
  and kbd use caption. Dialog titles use title, and card titles use subtitle.
- The Typography recipe gains the roles as its `level` axis values beside its
  semantic ones. h1 stays display, but it now steps.
- **`weight` tokens gain `-axes` companions:**
  - `weight.normal-axes` is `"'wght' 400, 'opsz' 14"`, and likewise for
    semibold and bold, read as `font-variation-settings`;
  - a theme whose font has no `opsz` axis (Geist, the system font) sets them
    to `normal`, and keeps the reservation below.
- **Weight without reflow** is a piece, `Type.steady(weight)`, in the
  `prose` and `utilities` family, so it is unlayered:
  - the element is an inline grid;
  - its `::after` holds `content: attr(data-label)` at the heavier weight,
    `visibility: hidden` and zero block size, in the same cell;
  - the adapter writes `data-label` on the Slot (a structural fact on a Slot,
    as CLAUDE.md asks);
  - one element and no second span; `visibility: hidden` keeps the copy out
    of the accessibility tree, so nothing is read twice.
  - Users: Tabs, Segmented, Radio group, Checkbox, Accordion triggers and
    Card titles (selected state only, as Fluid does).
- **Trim:** `textBox: 'trim-both cap alphabetic'` on fixed-height labels:
  badge, tab, tooltip, segmented item and button. A browser without it draws
  the same box, because the height is fixed.
- **Fields on touch:** Input, Textarea and the Select trigger take
  `@media (pointer: coarse) { font-size: max(1rem, <role>) }`. A browser test
  emulates a coarse pointer and reads 16px.
- **Streaming:** `Prose` is checked for `margin-block-end` and
  `:last-child` rules, which move to space-above. Chat (parity step 7) never
  sets `text-wrap` on assistant text.
- **Text colors:** a recipe never fades text with `opacity`, because a
  fraction of a color has no contrast a theme can check. Muted text is
  `text.muted`. A test in `mixins-ui` scans the recipes' CSS for `opacity` on
  text slots. Fluid's other text rules (no uppercase, no letter spacing, no
  eyebrows) are a look, so they belong to a style preset and are not a rule.

## 4. Surfaces: a ladder that nests, tints that travel

**Fluid.**
- Eight levels, each paired 1:1 with a shadow.
- Light mode has two color steps (`#FAFAFA` floor, `#FCFCFC`) and is
  `#FFFFFF` from level 3 up, so shadow alone carries elevation there. Dark
  mode is an additive ladder from `#171717` to `#484848` in even steps.
- An elevated surface is `min(substrate + offset, 8)` and re-provides that
  level, so nesting climbs by itself. Popovers have offset 2, dialogs 4, and
  tabs' active pill 3.
- The motivating failure is a hard-coded dropdown inside a dialog, which
  melts into it.
- `shadowLevel` is decoupled: a dropdown always casts level 3's shadow,
  however deep it opens.
- Hover and selected are overlays of the ink, not colors, so they work at any
  level: light 4% and 7%, dark 6% and 10%. `--tint` is a see-through
  secondary fill (black 8%, white 25%).
- Concentric corners: inner = `max(0, outer - inset - border)`.
- Images get a 1px inset outline in black or white at 10%, so pale edges keep
  their shape.

**Ours.**
- Semantic surfaces (`base`, `subtle`, `muted`, `default`, `overt`,
  `bedrock`) and six shadow steps. The popup has its own surface tokens.
- `popup.highlight` is already an 8% tint of the ink: the right idea in one
  place.
- Nothing nests: a popover inside a dialog draws the same surface as one on
  the page.

**Change.**
- **The ladder.** `surface.level-1` to `level-8`, derived from `surface.base`
  in `Theme.oklch`:
  - in a light scheme, levels 1 and 2 step toward white and 3 to 8 are the
    lightest, each keeping the base's chroma (see "What we keep"), so shadow
    carries elevation there, as in Fluid;
  - in a dark scheme, each level adds an even step of lightness
    (`base-l-dark + k * level`, with `k` from `surface-contrast`, so the
    contrast knob reaches the ladder too).
  - A `shadow.level-1` to `level-8` group pairs with it, built by the same
    `shadow()` helper as today, so `shadow.color` and `shadow-strength` reach
    it. Today's six named shadows stay as aliases, so recipes and themes that
    name them keep working.
- **Roles and levels.** The named surfaces stay, for a different question:
  - `muted`, `subtle`, `default`, `overt` and `bedrock` are fills, saying
    *what* a region is (a well, a code block, a backdrop);
  - a level says *how high* a raised object sits.

  A recipe uses a level only for something that raises, and a role for
  everything else, so no surface has two ways to be chosen.
- **Nesting without context.** A raised element marks itself
  `data-fk-raise` and sets `--fk-raise: <offset>`. Its level is the sum of
  every raised ancestor's offset, plus 1 for the page. CSS cannot write
  `--d: calc(var(--d) + 2)` on one element, because that is a cycle, so
  `Theme` generates eight rules, one per nesting depth `k`:
  - the selector is `k` nested `[data-fk-raise]` descendant steps;
  - each rule sets `--fk-depth-k: calc(var(--fk-depth-(k-1)) + var(--fk-raise))`
    and `--fk-level: min(var(--fk-depth-k), 8)`;
  - a property per depth means no cycle, and the longer selector wins by
    specificity.
  - The background and shadow then read the level through a `calc`-indexed
    lookup: the dark ladder is a formula of the level, and the light one a
    `clamp`.
  - Before building, a probe checks the installed browsers for CSS
    `inherit()`. Where it exists, one rule
    (`--fk-level: calc(inherit(--fk-level) + var(--fk-raise))`) replaces the
    eight. Until every engine CI runs has it, the eight rules stay.
- **Which components raise.**
  - Popover, Menu, Listbox, Combobox and Select panels raise by 2, with the
    shadow pinned to level 3. A menu `color` other than `default` keeps its
    `popup` surface, and only its shadow comes from the ladder.
  - Dialog, Alert Dialog, Sheet and Drawer raise by 4.
  - Tooltip is inverted (`text.default` as the fill) and does not raise.
  - Card does not raise. It keeps shadcn's `outlined` default; Fluid's
    transparent, borderless card is a `surface` value a style preset picks.
- **State tints.** A `state` group: `hover` (4% light, 6% dark),
  `selected` (7% / 10%) and `pressed`, each a `color-mix` of the ink over
  transparent. Also `tint` and `tint-hover`, the see-through fills for a
  secondary button. These recipes move their hover and selected fills to
  them:
  - every row, ghost button, tab hover and the fluid overlays;
  - `popup.highlight` becomes `state.hover` under the menu's `subtle` accent.
- **Concentric radii.** `Theme.nested(outer, inset, border?)` returns
  `max(0px, calc(outer - inset - border))`. The popup panel's radius is the
  row radius plus the panel's padding, and Card media and segmented items
  read it. Popups keep the smaller radii under a pill theme, as Fluid's do,
  because "heavy pill bubbling distorts perceived padding at this scale".
- **Image edges.** A piece `Surface.imageEdge`: a 1px inset outline in black
  or white at 10%. Avatar images, Card image and media, and chat attachments
  use it.

**Tests.**
- A browser test draws a menu open on the page and inside a dialog, and
  asserts that the two panels' backgrounds differ and their shadows match.
- A mutation drops the depth rules.
- A dark-scheme test reads `level-1` to `level-8` and asserts that lightness
  strictly rises.
- Hovering a row on `level-5` reads a fill different from the panel's.

## 5. Scrollbars and scroll edges

**Fluid.**
- Native scrolling on touch-primary devices, where native physics beat any
  custom bar.
- The thumb rests 4px wide at an 8% ink tint and widens to 6px on hover
  (12%, and 16% while dragging), on a 10px track that is the hit target.
- The thumb sits 2px off the edge, while the track stays flush, so throws to
  the edge still land.
- Show is a 160ms fade and hide is 120ms, after a 160ms delay that lets the
  thumb narrow first.
- `scroll-fade`: a 48px mask dissolves content toward any edge with more to
  scroll. CSS scroll-driven animations keep the true start and end crisp, and
  a browser without them (Firefox) gets no fade rather than a wrong, static
  one.
- `scroll-divider` draws a hairline at that edge on the parent's
  pseudo-elements, because the mask would erase a line inside the scroller.

**Ours.** The ScrollArea recipe styles the native bars (`thin`, an 8px
webkit thumb in `outline.default`). There is no edge treatment.

**Change, in two parts.**
1. **CSS only, now.** `Scroll.fade({ axis, size })` and `Scroll.divider()` are
   pieces in a `scroll` subpath, unlayered like `layout`:
   - they use registered `--fk-fade-start` and `--fk-fade-end` properties,
     driven by `animation-timeline: scroll(self)` under
     `@supports (animation-timeline: scroll())`;
   - the size comes from a token, `space.fade` at 3rem.
   - ScrollArea's bars move to the ink tints (8%, and 12% hovered through
     `:hover` on the viewport) and gain `scrollbar-gutter: stable`.
2. **An overlay bar, as a Behavior.** `ScrollBars` in
   `foldkit-primitives/dom` is a Mount like `Measure`:
   - it writes `--fk-scroll-thumb-y/x`, `-size` and `-shown` on the viewport,
     and the recipe draws the thumb in a Slot of its own;
   - it does nothing under `(hover: none)`, so touch keeps native bars;
   - the timings are recipe transitions: `motion.moderate` in, `moderate-exit`
     out, with a 160ms delay.
   - Its acquire makes every observer before any observes: the Mount trap in
     CLAUDE.md.

**Tests.**
- A browser test scrolls a list and reads the mask's start stop, at 0 at the
  top and nonzero after a scroll.
- With a coarse pointer emulated, the overlay draws nothing.

## 6. Fluid hover: the remaining rules

**Fluid's rules we keep:**
- the item the pointer is inside wins, else the nearest center;
- one highlight per list;
- a fresh entry appears in place;
- what is lit is what a gap click presses;
- disabled items are skipped;
- keys and the pointer light the same row.

**Its rules we add:**
- **`gapClick: { maxDistance }`.** A card grid caps gap clicks at 16px,
  because grids have a lot of whitespace. The argument becomes
  `Schema.Union([Schema.Boolean, Schema.Struct({ maxDistance: Schema.Number })])`.
- **Never publish a zero rect.** A popup measured before it has layout keeps
  the last complete rect, and retries for up to three frames. Today a
  zero-sized `getBoundingClientRect` would write zeros.
- **Reduced motion keeps the fade.** This comes free from the `travel` knob
  (section 1): the travel snaps and the 80ms opacity fade stays.
- **Tabs' attention split.** While another tab is hovered, the chosen
  indicator dims to 0.85 (`:has(:hover)` on the list). On leaving, the hover
  returns to the chosen tab while it fades, which `from` already does, on
  `moderate`.
- **Only click targets join.** Card already registers only pressable cards;
  the rule is written into the `FluidHover` doc comment for everyone else.
- **When not to use it.** This goes in the docs: when a wrong click would
  hurt, when only some items are clickable, when items have a lot of empty
  space around them, or when rows move as you scroll.

**New consumers:**
- Table body rows, where the row borders on both sides of the lit row go
  transparent over 80ms;
- CarouselDots (parity step 6), whose buttons touch so the highlight never
  drops between dots;
- Sidebar (step 4), with one scope per menu tree that measures the row's
  button, not its `li`.

## 7. Component craft that rides on these systems

Each item becomes part of its component's brief, under the parity plan's
"Research the options", when that component is next touched. They are listed
here because each needs one of the systems above.

- **Button.**
  - The press shrinks the surface by exactly 1px per side: a 1px same-color
    `box-shadow` spread that collapses on `:active`, never a `scale`.
  - Press timing is 80ms; release is 180ms on `cubic-bezier(0.23, 1, 0.32, 1)`.
  - Icons sit 4px nearer the edge than text.
  - The secondary variant fills with `state.tint`.
- **Icons:** `--fk-icon-stroke` is 1.5, and 2 on hover or selected, on the
  fast tier. Icon reads it.
- **Selections that merge.** Contiguous checked rows draw as one block, in
  CSS alone:
  - `[aria-checked="true"]:has(+ [aria-checked="true"])` squares the bottom
    corners;
  - `[aria-checked="true"] + [aria-checked="true"]` squares the top corners.
  - This applies to Checkbox group, multi-select Listbox and multi-select
    Combobox.
  - Fluid's animated merge and split is left for later.
- **Checkbox and Radio:** the border turns transparent when checked, so the
  mark alone shows the state. The box is 16px (14px compact) and the dot 8px
  (7px).
- **Switch:** a 34×20 track with a 16px thumb (28×16 and 12px compact) and a
  2px inset. The thumb grows into a pill (2px wider) on hover and squashes on
  press. Dragging the thumb is a `PointerDrag` addition.
- **Popups:**
  - enter with `scaleY(0.96)` plus a 4px slide from the side they open on, read
    from the placement upstream resolves;
  - exit on `fast-exit`;
  - Select holds open 300ms after a pick, so the check is seen;
  - with a search field, the field is one stop in the ring of rows.
- **Tooltip:** 200ms delay, a 300ms skip window between neighbours, an 8px
  offset, and a 4px slide toward the trigger. Check what upstream's tooltip
  already offers before adding a Behavior.
- **Dialog:** widths sm 400, lg 540 and xl 880 (360, 480 and 800 compact), on
  the slow tier, scaling from 0.97. `position: top` anchors it at 12dvh.
- **Badge:** default 24px tall with 12px text and compact 20px with 11px,
  read from `type.caption` and the ladder.

## Order of work

Each step is a set of commits with its tests and mutation specs, a CHANGELOG
entry, the skill's `references/mixins.md` updated, and the `/create` control
or gallery page that shows it.

1. **Motion tiers and `travel`.** Tokens, the reset, the recipes' audit, and
   exits through open-state durations. Breaking: `motion.normal`.
2. **The ladder.** The `step` knob, the `control` group, and the recipes'
   heights and `size` axes. `/create`'s size control moves onto it.
3. **Type roles.** The `type` group, recipes by role, `weight` axes,
   `Type.steady`, trim, and fields on touch.
4. **State tints and concentric radii.** The `state` group,
   `Theme.nested` and `imageEdge`, with the recipes' fills moved onto them.
5. **The surface ladder.** The probe for `inherit()`, then the levels, the
   depth rules and the raising components. Shadow aliases keep old names
   working.
6. **Scroll edges**, then the `ScrollBars` overlay.
7. **Fluid hover's remaining rules** and its Table consumer.
8. **Component craft (section 7)**, folded into each component's next brief.

Steps 1 to 4 are small and touch every recipe; do them before the parity
plan's step 4, so the islands land on the ladder. Steps 5 and 6 can run beside
it.

## Not taken

- **React context.** Custom property inheritance gives the same "a region
  decides" model with no provider, and it crosses into our popups, which never
  leave the DOM.
- **Springs in JavaScript.** A `linear()` easing is a sampled spring, and a
  CSS transition lets the `motion` and `travel` knobs reach it. Fluid's Motion
  values do not follow knobs.
- **Inter as a requirement.** The optical-size pairing is opt-in through the
  `weight` axes tokens; the reflow guard works with any font.
- **Fluid's text bans** (no uppercase, no letter spacing, two text colors).
  They are a look, offered as a style preset in `/create`, not imposed on
  every theme.
- **An icon-rail Sidebar ban.** Fluid argues against icon rails, and shadcn
  ships one, so ours offers both and its brief records Fluid's argument.
