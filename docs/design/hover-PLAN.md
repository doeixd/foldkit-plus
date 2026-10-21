# Hover: one owner for every hover, fluid or not

**Status:** Proposed, 2026-10-21. Nothing here is built.
**Target:** `foldkit-mixins` (a knob), `foldkit-mixins-ui` (four highlights), `examples/site` (`/create`).

## 0. What is wrong

A hover is drawn two ways. A plain one tints the hovered row or button; a
fluid one (`FluidHover`, a component's `.fluid`) draws one highlight that
glides from item to item. Both should read as the same hover, governed by the
same knobs, and on `/create` they do not:

| Component | Its fluid highlight paints with | Follows **Color › Hover**? |
| --- | --- | --- |
| Nav, Sidebar, TreeView, Segmented (underline) | `unfilledHover` | Yes |
| Table | `ref.state.hover` (text over the surface) | No: the accent choice never reaches it |
| Segmented (filled, the default) | `accent.subtle` at 40% | No |
| Tabs (pill) | `accent.subtle` | No |
| Menu, Listbox, Combobox | the popup's highlight | No, by design: **Menu accent** governs popups |
| Card | half a plain card's film | No, by design (it lightens a dark page as it darkens a light one) |

`/create`'s Components canvas draws Table, Tabs (pill), Segmented and Menu, all
fluid, so choosing Hover = neutral or accent changes none of the highlights a
reader is looking at, while every button and row beside them follows it. And
how strong a hover is cannot be chosen at all: `state-hover` is a fixed `12%`
in the palette (`packages/mixins/src/theme/oklch.ts`), read by every hover
token (about 90 uses).

What is right already: radius (`radius.md`, or the option's own corner), motion
(`glide` reads the motion durations and easings), and the accent's hue for the
highlights that use it. The controls of `/create` itself (its section tabs, the
scheme and direction rows, the pickers) are drawn in the site's theme on
purpose and stay out of this: a knob that changed them would change the
controls setting it.

## 1. Decisions

- **The fluid highlight is the hover.** It paints what a plain hover of the same
  component paints, so a fluid list and a plain one on one page agree. There is
  no fluid-only knob.
- **Color › Hover owns the hover's ink** (surface step, grey, accent) for every
  component whose hover is a tint. Segmented and Tabs (pill) move from
  `accent.subtle` to `unfilledHover`; their pressed indicator keeps the accent,
  which already says which option is chosen. This gives something up: their
  hover was drawn on purpose as "the chosen pill, faint, as if it were trying
  the tab on" (`recipes/tabs.ts`). Under Hover = accent the two still look
  alike; under surface or neutral the hover becomes a plain tint. If that
  effect should stay, the alternative is a fourth Hover option, `chosen`, that
  tints every hover with the accent's subtle fill, rather than two components
  ignoring the knob.
- **A new knob owns the hover's strength**: `surface.hoverStrength`, a
  percentage written to the same `state-hover` variable the palette reads now,
  default `12%`, so a theme that does not set it is unchanged.
- **Popups keep Menu accent; Card keeps its film.** Each says so where it is
  drawn, as now.

## 2. Slices

Each lands with its README, skill and changelog lines, tests that can fail and
their mutations, and is checked in a browser where the claim is about what
shows.

### 2.1 The hover strength knob (`foldkit-mixins`)

- `Knobs.standard.surface.hoverStrength`: `Knob.percent({ title: 'Hover
  strength', variable: 'state-hover', default: 12, min: 4, max: 24, step: 1 })`,
  described as "How strongly a hovered row or button is tinted, and a fluid
  highlight with it." The palette's constant `'state-hover': '12%'` goes; the
  palette keeps reading `v('knob', 'state-hover')`.
- Tests: the default theme's sheet is byte-for-byte what it was (the default is
  the old constant); `Theme.make({ surface: { hoverStrength: 20 } })` writes
  `--fk-knob-state-hover: 20%`; a value outside the range is refused, as other
  knobs refuse. A browser test reads a hovered Button's computed background at
  6% and at 20% and finds them different, with the pointer parked first (the
  repository's shared-pointer trap).
- Mutations: the knob writes nothing; the palette keeps its constant beside it.

### 2.2 Table, Segmented and Tabs (pill) follow Hover (`foldkit-mixins-ui`)

- Table's highlight: `background: unfilledHover`, in place of `ref.state.hover`.
  Check its rows' washes in a browser first: the table frame must not set a
  `--_fk-state-ink` that tints the highlight wrongly.
- Segmented's base highlight: `background: unfilledHover`, opacity
  `var(--fk-segmented-hover-shown)` (the `0.4` multiplier was there to soften the
  accent). The underline variant then sets what the base does: delete its
  override.
- Tabs' pill variant: the same change to its highlight.
- Tests, in the existing fluid browser tests (`tableFluid`, Segmented's and
  Tabs' fluid tests): with Hover set to `accent`, the lit highlight's computed
  background has the accent's hue; with `neutral`, it has none. Assert the
  computed colour, not the CSS text: a state's declaration can lose to a
  variant (the Card trap).
- Mutations: each highlight back to its old background, one at a time.

### 2.3 `/create`

- A **Hover strength** slider in the Color pane, after **Hover**.
- The Components canvas needs no new components: its Table, Tabs (pill),
  Segmented and Menu are already fluid. Its end-to-end test (`theme.e2e.ts`)
  gains one claim: after choosing Hover = accent, hovering a Segmented option
  in the preview gives its highlight the accent's hue. No hydration warning on
  load, checked as `1681dfad` was.
- The generated theme code writes `hoverStrength` when it is not the default,
  as every knob does (`Theme.print`); the address keeps it, as it keeps every
  knob path.

### 2.4 Docs and deploy

- `foldkit-mixins` README and the skill's `mixins.md`: the knob in the knob
  list; one sentence that a fluid highlight paints the hover, so the same knobs
  govern both.
- `foldkit-mixins-ui` README: Segmented's and Tabs' highlight follow Hover.
- Changelog: the knob under Added; the three highlights under Changed (a theme
  relying on Segmented's accent hover sees its Hover choice instead).
- Redeploy the site after the release that carries it.

## 3. Open questions

- **Range and default.** `4%` to `24%` around `12%` is a guess at what still
  reads as a hover and not as a selection. Check the extremes in light and dark
  on the Components canvas before fixing them.
- **One strength for both schemes?** `state-tint` has a dark twin
  (`state-tint-dark`); `state-hover` does not. If 12% reads weak on dark pages,
  a schemed knob (`Knob.schemed`, as surface lightness is) answers it; start
  with one and look.
- **Plain Segmented's hover** darkens the text and tints nothing. With `.fluid`
  it now tints with the hover. Should a plain one tint too, so the two agree?
  Recommend yes, with the same `unfilledHover`, in 2.2, unless a browser look
  says a tray of tinted options is too busy.
