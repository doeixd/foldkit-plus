# Fluid typography without `clamp()` magic numbers

**Status:** Phases 1-4, the reading knobs, and container-based fluid type are
implemented, 2026-10-21. Phase 5 is not needed: the fluid growth already uses
`pow`, and the size table remains the fixed small end. The CMS's `cqi` padding
and screenshots remain.

**Scope:** the `foldkit-mixins` type scale and theme tokens, `Defaults`,
`Prose`, the `Typography` recipe, and the examples that write per-component
`clamp()` numbers.

**Out of scope:** fluid spacing, fluid radii, fluid control heights,
container-query fluidity (phase 6), and a redesign of the type scale itself.

## 1. The problem here

Today the type system has three separate size mechanisms:

- `size.*` is a fixed rem table (`0.75` to `2.25`) multiplied by `type.scale`,
  with headings above 1rem also multiplied by `type.headingScale`.
- `role()` is a fixed size-and-leading table blended between its default and
  compact ends by `type.size` (`--fk-knob-step`).
- Applications add per-component `clamp()` with hand-picked `vw` numbers:
  `examples/site/src/style.ts:324`, `:694`,
  `examples/design-system/src/style.ts:116`,
  `examples/cms/src/styles/siteStyle.ts:148`, `:176`,
  `examples/richtext-playground/src/style.ts:119`, `:631`.

Those `clamp()` numbers are independent. A heading, its line height, and the
same heading in another example do not share a range, so they drift.

The aim is one shared, inspectable ratio. A component says "between these two
sizes"; the page owns where the viewport is.

## 2. The model

```text
viewport range (px) -> ratio (0..1) -> size = min + (max - min) * ratio
```

- The ratio is CSS, not a Model field: no JavaScript, SSR-safe, deterministic.
- Sizes stay in `rem`, so the reader's font size and browser zoom still apply.
- Boundaries are in `px`, so the range describes a screen width, not text.

The ratio is `--fk-fluid-ratio`; the theme's strength is `--fk-knob-fluid`.

## 3. The math, and a correction to the source guide

Native form:

```css
--fk-fluid-ratio: progress(100vw, 320px, 1440px);
```

`progress()` returns a unitless number and clamps to 0..1 by default. It became
Baseline in September 2026 (Chrome 138, Safari 26, Firefox 155).

Exact fallback for older engines:

```css
--fk-fluid-ratio: clamp(
  0,
  tan(atan2(100vw - 320px, 1440px - 320px)),
  1
);
```

Why `tan()` is required: `atan2(y, x)` returns an **angle**, not a ratio.
`tan(atan2(y, x))` is `y / x`, unitless and exactly linear: 0 when `y = 0`, 1
when `y = x`, clamped outside. The guide's
`clamp(0, atan2(...), 1)` is not valid CSS (an angle where a number is
required), and `atan2` alone is a curve rather than a line. `tan(atan2())` is
the correct equivalent.

`tan()` and `atan2()` are Baseline 2023 (Chrome 111, Safari 15.4, Firefox 108),
which is below this library's existing floor: `light-dark()` and relative color
syntax need Chrome 123, Firefox 128, Safari 17.5.

Validate the range: both boundaries must be `px`, and `min < max`. Otherwise the
expression is invalid or inverted. That check belongs at `Theme.make`.

## 4. Browser-support decision

- The library's current floor already excludes browsers without
  `tan(atan2())`.
- Requiring `progress()` would raise the floor to Chrome 138, Safari 26,
  Firefox 155 for no visual difference.
- Recommendation: ship `tan(atan2())` as the only production expression.
  Document `progress()` as the modern spelling and revisit it when the support
  floor rises. If the project chooses Baseline 2026 as the new floor, replace
  the token value and keep the public API unchanged.

If both expressions ever ship, the `@supports` rule must not clobber a theme
that overrides `fluid.ratio` directly. That is why one shipped expression is
the cleaner choice.

## 5. Design

### 5.1 Knobs

Add three knobs under `type`:

| Knob | Kind | Default | Writes |
| --- | --- | --- | --- |
| `type.fluid` | number, 0..1 | `0` in the first release | `--fk-knob-fluid` |
| `type.viewportMin` | length `px` | `320` | `--fk-knob-fluid-viewport-min` |
| `type.viewportMax` | length `px` | `1440` | `--fk-knob-fluid-viewport-max` |

`type.fluid` is the strength: `0` reproduces today's CSS exactly; `1` uses the
full calibrated curve. `Knob.length('px')` gives `/create` sliders and
`Theme.print` output for free.

Why knobs rather than tokens: `Themes.make` writes only knob variables under
`:root[data-theme="name"]`. A theme that changes the range or strength must
re-derive every size on the same root element, which knobs do and plain tokens
would not.

Cross-knob validation: each schema checks its own value, but only
`viewportMin < viewportMax` makes the expression valid. Add a group-level check
after the merge in `make` and `set`, reading each half's knob default where the
partial leaves it unset. Throw a `theme:fluid-range` diagnostic.

### 5.2 Derived token

`Theme.tokens` gains a `fluid` group:

```ts
fluid: {
  ratio: `clamp(0, tan(atan2(100vw - var(--fk-knob-fluid-viewport-min), var(--fk-knob-fluid-viewport-max) - var(--fk-knob-fluid-viewport-min))), 1)`,
  progress: 'calc(var(--fk-fluid-ratio) * var(--fk-knob-fluid))',
}
```

- `:root` declares it once.
- `Theme.scope` re-declares it because it is in the derived set, so a subtree
  with its own knobs gets its own ratio.
- A named theme on the same `:root` re-derives it from the swapped knob values
  automatically.
- It inherits, so a component reads `var(--fk-fluid-ratio)` with no local math.
- A theme can override `fluid.ratio` directly with `Theme.define` if it needs a
  range measured on a container rather than the viewport (phase 6).

### 5.3 Size scale

Keep the token names and the small-end values. Add a large end per step:

```ts
const text = (rem: number, step: number) => {
  const base = /* today's expression, unchanged */
  const growth = `calc(${FLUID_BASE} * pow(${FLUID_RATIO}, ${step}) * var(--fk-fluid-progress))`
  return `calc(${base} * (1 + ${growth}))`
}
```

- `step` is the token's distance from `md`: `xs` -2, `sm` -1, `md` 0, `lg` 1,
  `xl` 2, `2xl` 3, `3xl` 4, `4xl` 5.
- `FLUID_BASE` and `FLUID_RATIO` are library constants calibrated in Phase 0,
  not per-component numbers. `pow()` is Baseline 2023.
- `type.scale` and `type.headingScale` still apply inside `base`; fluidity
  composes with them.
- `type.fluid: 0` yields today's computed sizes exactly.
- Line height stays proportional: `leading.*` is a unitless ratio
  (`leading()`), and `Defaults.body`, `Defaults.headings`, `Prose`, and the
  `Typography` headings already use it.
- `role()` is deliberately unchanged in this phase. Its leading is a fixed rem
  value (`type.*-leading`); growing the size without growing the leading would
  tighten UI text. Roles are phase 4.

Calibration target (example values, not final):

| token | small | large |
| --- | --- | --- |
| `xs` | 0.75 | 0.784 |
| `sm` | 0.875 | 0.9207 |
| `md` | 1 | 1.06 |
| `lg` | 1.125 | 1.2026 |
| `xl` | 1.25 | 1.3492 |
| `2xl` | 1.5 | 1.6369 |
| `3xl` | 1.875 | 2.0718 |
| `4xl` | 2.25 | 2.5215 |

The shipped `FLUID_BASE = 0.06` and `FLUID_RATIO = 1.15` produce this table.
The values are the acceptance target; a visual review can tune the constants.

### 5.4 Author helper

`Theme.fluidType` replaces the `clamp()` an application writes today:

```ts
Theme.fluidType({ min: '1.75rem', max: '2.5rem' })
// 'calc(1.75rem + (2.5rem - 1.75rem) * var(--fk-fluid-progress))'

Theme.fluidType({
  min: '1.75rem',
  max: '2.5rem',
  viewport: { min: '500px', max: '1000px' },
})
// the same, with an inline ratio for a one-off range
```

- `min` and `max` are CSS lengths, usually `rem`.
- `viewport` is optional; when omitted, the theme's range applies.
- With `viewport`, both boundaries must be `px` (or both compatible lengths)
  and `min < max`; otherwise throw a `DiagnosticError`.
- It returns a CSS string, not a `StyleValue`:
  `Style.self({ fontSize: Theme.fluidType(...) })`.

### 5.5 What stays fixed

- Control heights, padding, gaps, radii, and icon sizes. The ladder is
  density-driven; fluid controls would fight the fixed `2.25rem` row and the
  `text-box` centering.
- `role()` and the `Typography` interface levels, until phase 4.
- `space` tokens. Fluid spacing is a separate design decision.
- `Prose` rhythm. Its measure is `ch`; its rhythm is space tokens.

### 5.6 The `/create` studio

The website's theme creator should expose the new knobs, not just the library.
Most of the plumbing already reads `Knobs.standard`, but three places are
explicit:

1. **The Type pane.** `examples/site/src/view/create.ts` lists its sliders by
   hand in `typePane`. Add, after `type.headingTracking`:
   ```ts
   slider(model, slots, h, 'type.fluid'),
   slider(model, slots, h, 'type.viewportMin'),
   slider(model, slots, h, 'type.viewportMax'),
   ```
   Add `'type.fluid': '×'` (or no unit) to the `shown` map, since the value is
   a unitless multiplier. The viewport sliders already read `px` from
   `Knob.length('px').control.unit`.

2. **The presets and looks.** `examples/site/src/gallery/theme.ts` should show
   the feature, not leave it at zero everywhere:
   - `Cobalt`, `Material` and `Ember` presets set `type.fluid` between `0.5`
     and `1`; the `Nova` look can carry a lower value.
   - Period presets (`Windows 95`, `Terminal`) set `type.fluid: 0`; a fixed
     type size is part of their look.
   - The `looks` list is a shape-and-type axis, so each look sets
     `type.fluid` with its other type values. That keeps "apply a look"
     coherent and undoable.
   - `shuffled` picks `type.fluid`, `type.viewportMin` and
     `type.viewportMax` within their ranges, like every other slider. Pick the
     viewport halves so `min < max` (for example min `240..600`, max
     `900..1600`); otherwise the cross-knob check refuses the shuffle.
   - `defaults` (Iris) sets `type.fluid` only when it should differ from the
     knob's default; otherwise the default applies and the snippet stays
     unchanged.

3. **The preview and the code panel.**
   - `declared` in `gallery/theme.ts` is `Theme.standard(iris)`; it will carry
     `--fk-fluid-ratio` automatically. The preview declares every token on
     itself, and `knobScript`/`chooseKnobs` write only `--fk-knob-*` to
     `[data-size]`; the preview's own ratio re-derives there, as the other
     derived tokens do. Add a test for this.
   - The preview ratio is measured on the window (`100vw`). A narrow preview
     pane on a wide screen therefore shows the large end. Until phase 6, say
     so in the Type pane's hint, or keep the preview's own width wide enough
     that the difference is small. When phase 6 lands, wrap the preview
     contents in a named `inline-size` container and declare the ratio with
     `100cqw`, so the Typography canvas follows the preview frame rather than
     the window.
   - `codeOf` uses `Theme.print`, so `type: { fluid: 1, viewportMin: 360,
     viewportMax: 1440 }` appears in the copied module with no new generator
     code. `sameTheme` and the URL codec read the same schema, so links and
     "is this theme the default?" keep working.

Tests in `examples/site/test/theme.test.ts`:
- [x] `codeOf(withValue(defaults, 'type.fluid', 1))` contains `fluid: 1`.
- [x] `codeOf(withValue(defaults, 'type.viewportMax', 1600))` contains
      `viewportMax: 1600`.
- [x] `declared['--fk-fluid-ratio']` exists and reads
      `var(--fk-knob-fluid-viewport-min)`.
- [x] `shuffled` returns `type.fluid` within `0..1`, and the viewport values
      within their ranges and on their steps.
- [x] `presets` and `looks` still pass `sameTheme` and the schema decode.
- [ ] A browser test on `/create`: set `type.fluid` to `0`, then `1`, and the
      Typography canvas's `h1` / `display` computed size changes at a wide
      window; set `type.viewportMax` and it changes again. (The site unit tests
      and the mixins browser tests cover the blend; a real `/create` browser
      test is still open.)

### 5.7 Reading knobs

Fluidity is only one reading decision. The same theme should own the measure,
the wrap and the alignment, so a page does not repeat `65ch`, `balance` and
`start` in every article.

| Knob | Kind | Default | Writes |
| --- | --- | --- | --- |
| `reading.measure` | length `ch` | 65 | `--fk-knob-measure` |
| `reading.headingWrap` | choice `balance` / `pretty` / `wrap` | `balance` | `--fk-knob-heading-wrap` |
| `reading.bodyWrap` | choice `pretty` / `wrap` / `balance` | `pretty` | `--fk-knob-body-wrap` |
| `reading.align` | choice `start` / `center` / `end` / `justify` | `start` | `--fk-knob-reading-align` |

- `Theme.tokens.reading` is `measure`, `heading-wrap`, `body-wrap` and `align`,
  each `var(--fk-knob-…)`, so `Theme.ref` is typed and a theme re-derives them.
- `Defaults.reset` reads `--fk-reading-heading-wrap` and
  `--fk-reading-body-wrap` for its `h1`-`h6` and `p` rules.
- `Prose.style` uses `var(--fk-prose-measure, var(--fk-reading-measure, 65ch))`
  and `var(--fk-prose-align, var(--fk-reading-align, start))`; its own options
  still win.
- `Typography`'s base aligns its text, and `body`, `lead` and `quote` cap
  themselves at `reading.measure`.
- `/create` gets the measure slider and the three choice rows in its Type
  pane, below the fluid knobs; the presets, looks and shuffle set them, and the
  Typography canvas shows the result because its `body`/`lead` samples use the
  measure and its headings use the wrap tokens.

Tests:
- [x] `Theme.tokens.knob` carries `measure`, `heading-wrap`, `body-wrap` and
      `reading-align`; `Theme.tokens` has the `reading` group.
- [x] `Theme.make({ reading: { measure: '65ch' } })` is a type error; a measure
      is a number of `ch`.
- [x] `Theme.make({ reading: { headingWrap: 'balanced' } })` is a type error.
- [x] `Prose.style({ align })` writes `--fk-prose-align` and still shares one
      class.
- [x] `Defaults.reset` reads only `reading-heading-wrap` and
      `reading-body-wrap`, with fallbacks.
- [x] `/create` code output includes `measure`, `headingWrap`, `bodyWrap` and
      `align` when they differ from their defaults.
- [x] `declared` carries the four `--fk-reading-*` tokens and their knobs.

## 6. Phases

### Phase 0: probe and calibrate (done)

- [x] Probe the repo's Playwright Chromium: `CSS.supports('opacity',
      'progress(0, 0, 1))`, compare `progress()` with `tan(atan2())` at the
      current window. The browser test asserts they agree.
- [x] Confirm the existing browser floor from `packages/mixins/README.md` and
      choose the fallback only: `progress()` would raise the floor.
- [x] Choose `type.fluid` default `0` (no visual change) and the shipped
      `FLUID_BASE = 0.06`, `FLUID_RATIO = 1.15` curve.
- [x] Keep UI roles out of phase 1; only the size scale and reading type grow.
- [x] Record the decisions in this document.

### Phase 1: fluid primitive (done)

- [x] `packages/mixins/src/theme/fluid.ts`: the ratio expression,
      `fluidType`, `FLUID_BASE`, `FLUID_RATIO`, and diagnostics.
- [x] `packages/mixins/src/theme/knobs.ts`: the three knobs, the cross-knob
      check, and their `standard` entries.
- [x] `packages/mixins/src/theme/tokens.ts`: `fluid.ratio` and `fluid.progress`;
      the knob defaults in the `knob` group; `text()` takes a step and
      multiplies by the progress.
- [x] `packages/mixins/src/theme.ts`: export `fluidType` and `fluidRatio`.
- [x] Unit tests for the expression, diagnostics, and the size blend.
- [x] Type tests: a non-px viewport, a crossing range, and the reading choices.
- [x] Mutations: drop `tan`, drop the strength multiplier, rename the measure
      variable, swap the heading wrap variable.

### Phase 2: size scale and defaults (done, screenshots open)

- [x] Update every `text()` call with its step.
- [x] Update `packages/mixins/test/themePage.test.ts` expected token keys and
      values, and the `tokens.ts` test helper.
- [x] Browser test: the viewport ratio agrees with `progress()`, and the
      strength blends `size.md` from 16px to 16.96px.
- [x] Confirm `Defaults.body`, `Defaults.headings`, `Prose`, and the
      `Typography` headings all use unitless leading, so no line-height change
      is needed.
- [ ] Screenshots at 320, 768 and 1440 for `examples/site` and
      `examples/design-system`.
- [x] CHANGELOG, README, `docs/theme-knobs.md`, and the skill reference.

### Phase 3: examples and `/create` (done, `cqi` clamps wait for phase 6)

- [x] `examples/site/src/style.ts:324`, `:694`: replaced `clamp()` with
      `Theme.fluidType`.
- [x] `examples/design-system/src/style.ts:116`: the same.
- [x] `examples/cms/src/styles/siteStyle.ts:148`, `:176`, `:184`;
      `examples/cms/src/content/site.ts:719`; `examples/cms/src/styles/formStyles.ts:104`;
      `examples/richtext-playground/src/style.ts:119`, `:631`. The last two
      share `h1Size`, so the handle's line height cannot drift.
- [ ] The `cqi` clamps in `examples/cms/src/content/site.ts` (a page measured
      by its container) wait for phase 6.
- [x] Leave padding `clamp()`s alone in this phase; they are spacing, not type.
- [x] `/create`: the Type pane's three fluid sliders and four reading knobs,
      the presets and looks, the shuffle, and the `examples/site/test/theme.test.ts`
      cases in §5.6 and §5.7. They share one pane so the six section tabs fit
      the studio's column.
- [x] The site e2e checks the Type pane's fluid and reading controls, the
      fluid/reading values on the Typography canvas, and the preview container.
- [x] The richtext-playground e2e uses `caretAtEnd` for the slash-menu hint:
      the fluid h1 makes the paragraph wrap, and `End` stops at the line.
- [ ] State in the Type pane's hint that previews follow the window, not the
      preview frame, until phase 6.

### Phase 4: roles and the `Typography` recipe (done)

- [x] The role's rem leading is multiplied by the same progress as its size,
      so the line box grows with the type.
- [x] `Theme.role('display' | 'title' | 'subtitle', { fluid: true })` grows
      only those three; `body`, `caption` and `micro` stay fixed to protect the
      control ladder.
- [x] `Typography` levels `display`, `title` and `subtitle` use it; the
      `typography.test.ts` case and the browser role-growth test cover it.
- [x] A type test refuses `{ fluid: true }` on `body`.
- [x] Docs.

### Phase 5: exponential scale (not needed)

The size table is the fixed small end, and the fluid growth already uses
`pow(FLUID_RATIO, step)`, so a heading's share grows exponentially rather than
linearly with the step. Replacing the table with `base * pow(ratio, step)` for
both ends would change every fixed `type.fluid: 0` size, which is a separate,
breaking scale redesign, not a fluid-type refinement.

- [x] The fluid growth is exponential per step.
- [x] The table stays the small end, so `type.fluid: 0` is unchanged.
- [ ] Revisit only if the fixed scale itself is redesigned; then compare against
      the phase 2 table as a visual regression.

### Phase 6: container-based fluid type (done)

- [x] `Theme.containerFluidRatio()` and `Theme.containerFluidProgress()` use
      `100cqw` with the same `tan(atan2())` ratio; no `container-progress()`
      dependency.
- [x] `Theme.fluidType({ min, max, container: true })` uses the container
      progress directly; a type test refuses `container` with `viewport`.
- [x] `/create`'s preview is `container-type: inline-size` and sets
      `--fk-fluid-progress` on its children, so a narrow preview reads as a
      narrow page. The site e2e checks the container and the type it produces.
- [x] The CMS hero sets the container progress on its root and uses
      `Theme.fluidType` for its title.
- [ ] The CMS's `cqi` padding clamp stays spacing, not type; a future fluid
      spacing pass can share the same progress.
- [ ] Do not use this for the page root; `100vw` is correct there.

## 7. Tests that can fail

- [ ] `type.fluid: 0` computes the same font size at 320px and 2560px.
- [ ] `type.fluid: 1` computes the min at 320px, the max at 1440px, and the
      midpoint at 880px (within 0.1px).
- [ ] 2560px clamps at the max, not beyond.
- [ ] 200px clamps at the min, not below.
- [ ] The fallback and native ratios agree at 25, 50 and 75 percent in
      Chromium.
- [ ] Dropping `tan()` makes the midpoint test fail.
- [ ] Dropping `clamp()` makes the 2560px or 200px test fail.
- [ ] Swapping `min`/`max` makes the midpoint test fail or throws.
- [ ] `Theme.scope(theme, '.region')` with a different range re-derives inside
      the region.
- [ ] `Themes.make` with different `type.fluid` values re-derives under
      `[data-theme]`.
- [ ] A 200 percent zoom check: no reading text below the min, and the page
      remains usable.
- [ ] `Theme.fluidType` refuses a mixed-unit or inverted range.
- [ ] `pnpm mutate` kills every new mutation, and `pnpm mutate:check` passes.

## 8. Risks and decisions

- **Support floor.** `progress()` is newer than the library's floor.
  Recommendation: fallback only.
- **Zoom.** Viewport interpolation moves toward the min as the CSS viewport
  narrows under zoom. `rem` preserves zoom, but the ratio can still shrink
  type. Keep `type.fluid: 0` available and test 200 percent.
- **Scrollbars.** `100vw` includes the scrollbar, so a page that gains one
  shifts the ratio slightly. Accept it, or use `100cqw` in phase 6.
- **Cross-knob validation.** `Theme.make` checks each value alone; the
  `min < max` check must run on the merged values.
- **Named themes.** Keep the range and strength as knobs, because
  `Themes.make` writes only knobs under `[data-theme]`.
- **Role leading.** Fixed rem leading means roles cannot grow without a leading
  decision; keep roles out of phase 1.
- **Two expressions.** If both `progress()` and `tan(atan2())` ship, a custom
  `fluid.ratio` override can be clobbered by the `@supports` rule. Prefer one
  shipped expression.
- **Default.** Default `type.fluid: 0` in the first release, then flip it after
  examples and screenshots. A default change belongs in its own commit and
  CHANGELOG entry.

## 9. Done when

- A heading in `examples/site` and the same heading in
  `examples/design-system` share one viewport range and no `vw` number.
- The theme's range is one knob pair; changing it moves every fluid size
  together.
- `type.fluid: 0` reproduces the old computed sizes, even if the CSS text
  differs.
- The fallback is exact and tested against native in Chromium.
- `/create` draws the three knobs in its Type pane, the presets and looks set
  them, the shuffle stays in range, and the copied module includes them.
- README, `docs/theme-knobs.md`, the skill reference, and CHANGELOG describe
  the knobs and the helper.
- `pnpm check`, `pnpm mutate`, and the browser tests pass; screenshots are
  reviewed at 320, 768 and 1440.
