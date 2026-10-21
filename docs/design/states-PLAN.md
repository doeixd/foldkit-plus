# States: one owner for hover, press and disabled

**Status:** Built, 2026-10-21: slices 2.1 to 2.7 landed; the release follows.
**Target:** `foldkit-mixins` (knobs and tokens), `foldkit-mixins-ui` (recipes),
`examples/site` (`/create`).

## 0. What is wrong

A component's interactive states (rest, hovered, pressed, selected, focused,
disabled) should each be drawn from one token that one knob, at most, governs,
so every component on a page agrees and a theme changes them all at once. A
survey of the recipes (`packages/mixins-ui/src/recipes`) finds three states
that do not hold to that, and two that do.

### 0.1 Hover has an owner most highlights skip

A hover is drawn two ways: a plain one tints the row or button under the
pointer; a fluid one (`FluidHover`, a component's `.fluid`) is one highlight
that glides from item to item. **Color › Hover** chooses the hover's ink
(a surface step, grey, or the accent) through `unfilledHover`, which 34 recipe
files use. These do not:

| Component | Its hover paints with | Follows Hover? |
| --- | --- | --- |
| Table, fluid highlight and plain row (`table.ts`) | `ref.state.hover`: the text, never the chosen ink | No |
| Segmented, filled (the default) | `accent.subtle` at 40% | No |
| Tabs, pill variant | `accent.subtle` at 40% | No |
| Segmented without `.fluid` | the text darkens; nothing is tinted | No tint at all |
| Menu, Listbox, Combobox | the popup's highlight | No, by design: **Menu accent** governs popups |
| Card | half a plain card's film | No, by design: it lightens a dark page as it darkens a light one |

`/create`'s Components canvas draws Table, Tabs (pill), Segmented and Menu,
all fluid. Choosing Hover = neutral or accent there changes none of the
highlights a reader looks at, while every button and row beside them follows.

How strong a hover is cannot be chosen at all: `state-hover` is a fixed `12%`
in the palette (`theme/oklch.ts`).

### 0.2 A press looks like a hover

The palette says of its states: "lighter when hovered, as Fluid's: the press
is what darkens" (`theme/oklch.ts`). Buttons keep that: they have a held look
of their own (`recipes/button.ts`, `held`, `pressCorner`). Rows do not: the
shared `hover()` piece and most rows style `:is(:hover, :active)` with one
declaration (`recipes/design.ts`, `nav.ts`, `sidebar.ts`, `accordion.ts`,
`table.ts`), so pressing a row, a tab or a menu item shows nothing new. A
press gives no feedback on exactly the components a fluid highlight runs on.

### 0.3 Disabled is a copied number

`recipes/design.ts` exports `disabled`, `opacity: 0.5` for
`:is([aria-disabled="true"], :disabled)`. Several recipes write their own
instead: `0.5` again in Card, CheckboxGroup, ColorPicker, AngleSlider and
Command, and `0.4` in Calendar. A theme cannot choose how faded a disabled
control is, and the two values disagree on one page.

### 0.4 What holds already

- **Focus** is one piece, `focusRing` (about 120 uses): one outline token, one
  offset.
- **Selected and current** read `accent.subtle` throughout (19 files), with
  **Menu accent** for popups.
- **Radius and motion** reach every highlight: corners from `radius.md` or the
  option's own, glides from the theme's durations and easings (`glide`).

The controls of `/create` itself (its section tabs, the scheme and direction
rows, the pickers) are drawn in the site's theme on purpose and stay out of
all of this: a knob that changed them would change the controls setting it.

## 1. The model

```text
rest -> hover -> press      one ink (Color › Hover), two strengths
selected / current          accent.subtle (Menu accent in popups)
focus                       focusRing, beside any of the above
disabled                    one opacity token, nothing else changes
```

- **Hover and press are one film at two strengths.** Both mix the hover ink;
  the press is stronger. A fluid highlight is the hover, so it reads the same
  film, and darkens to the press while its item is held.
- **One knob per thing a theme varies:** the ink (Hover, as now), the
  strength (new), the disabled fade (new). Press strength follows hover
  strength by a fixed ratio rather than a knob of its own: two sliders that
  must move together are one slider.
- **No fluid-only knob.** A fluid list and a plain list on one page hover alike.
- **Popups and Card keep their own,** as designed, and say so where drawn.

## 2. Slices

Each lands with its README, skill and changelog lines, tests that can fail,
their mutations, and a browser check where the claim is about what shows.

### 2.1 Hover strength (`foldkit-mixins`)

- `Knobs.standard.surface.hoverStrength`: `Knob.percent({ title: 'Hover
  strength', variable: 'state-hover', default: 12, min: 4, max: 24, step: 1 })`,
  "How strongly a hovered row or button is tinted, a fluid highlight with it,
  and a press more." The palette's constant goes; it keeps reading
  `v('knob', 'state-hover')`, so the variable's name does not change.
- Tests: the default theme's sheet is byte-for-byte what it was; a set value
  writes `--fk-knob-state-hover`; an out-of-range one is refused. In a
  browser, a hovered Button's computed background differs at 6% and 20%, the
  pointer parked first (the shared-pointer trap).
- Mutations: the knob writes nothing; the palette keeps its constant.

### 2.2 Every tinted hover follows Hover (`foldkit-mixins-ui`)

- Table: its fluid highlight and its plain row hover take `unfilledHover`.
  Check the rows' washes in a browser first: nothing in the frame may set a
  `--_fk-state-ink` that tints the hover wrongly.
- Segmented (filled) and Tabs (pill): their highlights take `unfilledHover`,
  opacity the plain `shown` (the `0.4` softened the accent). Segmented's
  underline variant then repeats the base: delete its override.
- Segmented without `.fluid`: its options tint on hover with the same film, so
  the plain and fluid trays agree.
- What this gives up: Tabs' pill hover was drawn as "the chosen pill, faint, as
  if it were trying the tab on" (`recipes/tabs.ts`), as Segmented's is. Under
  Hover = accent they still look so; under surface or neutral the hover becomes
  a plain tint. If that look must stay, the alternative is a fourth Hover
  option, `chosen`, that tints every hover with the accent's subtle fill, so the
  look is a theme's choice and no component ignores the knob. Decide before
  building.
- Tests, in the fluid browser tests (`tableFluid`, Segmented's, Tabs'): under
  Hover = accent the lit highlight's computed background carries the accent's
  hue; under neutral it carries none. Assert computed colour, not CSS text: a
  state's declaration can lose to a variant's (the Card trap).

### 2.3 A press of its own (`foldkit-mixins`, `foldkit-mixins-ui`)

- A token, `state.press`: the hover's film at `calc(state-hover * 1.75)`, and
  `pressedHover` beside `unfilledHover` for the surface's ink.
- `hover()` in `design.ts` splits into a hover rule and a press rule, the press
  reading `pressedHover`; the rows that wrote `:is(:hover, :active)` by hand
  (Nav, Sidebar, Accordion, Table, Listbox, NumberField, CascadeSelect) use the
  piece instead, which also removes the copies.
- Fluid highlights: `FluidHover` marks its container while the lit item is
  pressed (`data-fluid-held`), and each highlight darkens to `pressedHover`
  under it. A press on a gap, which `gapClick` turns into a press of the lit
  item, darkens it too.
- Buttons keep their held look, which already presses into the page.
- Tests: in a browser, a held row's computed background is darker than its
  hovered one, and a held fluid highlight's likewise; press with
  `CSS.forcePseudoState` (the held-mouse trap), not a real held button.
- Mutations: the press reads the hover's film; the mark is never set.

### 2.4 One disabled fade (`foldkit-mixins`, `foldkit-mixins-ui`)

- A knob, `state.disabledOpacity`: `Knob.number({ title: 'Disabled', variable:
  'state-disabled', default: 0.5, min: 0.3, max: 0.7, step: 0.05 })`, and
  `disabled` reads it.
- Every recipe that fades a disabled control uses `disabled` (or reads the
  token where its selector differs, as Calendar's `[data-disabled] > &`):
  Card, CheckboxGroup, ColorPicker, AngleSlider, Command, Calendar. Calendar's
  `0.4` becomes the theme's value; check the calendar still reads in a browser.
- Opacities that are not a disabled state stay as they are (Carousel's resting
  dots, a muted icon): they are drawing choices, named where written.
- Tests: the default sheet unchanged; each listed recipe's disabled rule reads
  the token (a unit test over the stylesheet); one browser check that a
  disabled button's computed opacity follows the knob.

### 2.5 A gate that keeps it so (`foldkit-mixins-ui`)

A test over the standard stylesheet, as `missingTokens` is: every rule whose
selector holds `:hover` or `:active` and that sets a background reads the
state films (`--fk-state-…`, `unfilledHover`, `pressedHover`) or a selected
token, and every rule for `:disabled` or `[aria-disabled="true"]` that sets an
opacity reads `--fk-knob-state-disabled`. Exceptions are listed by recipe with
their reason (Card's film, the popups' highlight, Button's relief), so a new
one is a decision, not a drift. It is the check that would have caught Table.

### 2.6 `/create`

- In the Color pane, after **Hover**: a **Hover strength** slider. In Shape, or
  a new **States** group: **Disabled**.
- No new components: the canvas's Table, Tabs (pill), Segmented and Menu are
  already fluid. Its end-to-end test (`theme.e2e.ts`) gains: under Hover =
  accent, hovering a Segmented option in the preview gives its highlight the
  accent's hue; with Hover strength raised, the tint deepens. No hydration
  warning on load, checked as `1681dfad` was.
- The generated code writes each knob when it is not the default
  (`Theme.print`), and the address keeps it, as for every knob path.

### 2.7 Docs and release

- `foldkit-mixins` README and the skill's `mixins.md`: a short **States**
  section with §1's table, the new knobs in the knob list, and that a fluid
  highlight is the hover.
- `foldkit-mixins-ui` README: Table, Segmented and Tabs follow Hover; a press
  darkens rows.
- Changelog: the knobs and the press under Added; the hovers under Changed (a
  theme that relied on Segmented's or Tabs' accent hover now sees its Hover
  choice, or `chosen` if §2.2's alternative is taken).
- Release, then redeploy the site.

## 3. Order and size

2.1 and 2.2 are small and independent, and fix what a reader of `/create` sees
first. 2.5 lands right after 2.2, so the gate holds from then on. 2.3 is the
largest, touching `FluidHover` itself. 2.4 is mechanical. 2.6 follows each knob
as it lands.

## 4. Open questions

Settled in the build: `4%` to `24%` around `12%` by default, one strength for
both schemes, a press at `1.75`, and no fourth Hover option — under `accent`
the pill look is the hover a theme chose.

- **Range and default of Hover strength.** `4%` to `24%` around `12%` is a
  guess at what still reads as a hover and not a selection. Look at the
  extremes in light and dark on the Components canvas.
- **One strength for both schemes?** `state-tint` has a dark twin;
  `state-hover` has none. If 12% reads weak on dark pages, a schemed knob
  (`Knob.schemed`, as surface lightness is) answers it.
- **The press ratio.** `1.75` is a starting point; check that a press reads as
  darker than a hover at both ends of the strength range without reaching the
  selected fill.
- **`chosen` as a Hover option** (§2.2): keep the pill look as a theme's choice,
  or let it go.
