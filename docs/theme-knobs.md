# Typed knobs and themes

A design for how an application writes a theme. It replaces the string token
maps an application writes today (`Theme.oklch({...})` beside
`Theme.define({ knob: { 'radius-factor': '1.8' } })`) with typed knobs, and a
theme with a typed value over them. The token pipeline beneath is unchanged:

```text
knobs -> tokens -> ref -> pieces -> slots -> sheet
```

## The problem

A knob is a string in the `knob` group today. Nothing declares which knobs
exist, what type each takes, its range or its unit:

- `Theme.define({ knob: { 'radius-fator': '1.8' } })` compiles and does
  nothing.
- Every value is a string with its unit inside it (`'97%'`, `'-0.025em'`),
  and a choice is a hand-written CSS reference
  (`motion: { ease: 'var(--fk-motion-spring)' }`).
- What a theme varies is spread over three shapes: `Theme.oklch`'s config
  object, knob strings, and whole token sets (`Theme.relief.bevel`,
  `Theme.hardShadows`) composed two at a time.
- The site's `/create` had to build what the library lacks: its own `Knobs`
  schema, slider ranges, Shuffle bounds, URL decoding, an equivalence, and a
  code generator that prints strings.

## The model

Three things, kept apart:

1. **Knobs** are the inputs: a declared, typed set. Each has a kind (a number
   in a range, an angle, a percentage, a length, a choice, a font), a default,
   a description, and the CSS variable it writes.
2. **Derivations** are the tokens: CSS expressions over the knobs' variables.
   They are one fixed stylesheet that every theme shares. What `Theme.tokens`
   and `Theme.oklch` produce today becomes `Theme.standard`, the derivations
   over the standard knobs, the same CSS whatever the theme.
3. **A theme** is a typed set of knob values. Every token derives from knobs,
   so a theme is only its knob values.

```text
theme (knob values) -> knob variables -> derivations (fixed) -> tokens
```

### Choices are CSS too

A choice knob's options are each the CSS its variables hold, so choosing one
writes variables like any other knob, and every knob switches at runtime:

| Knob | Option | Writes |
| --- | --- | --- |
| `motion.easing` | `spring` | the ease variable: `var(--fk-motion-spring)` |
| `shadow.relief` | `bevel` | the raised, pressed and field shadow lists |
| `shadow.style` | `hard` | the seven elevation shadow lists |
| `shape.controls` | `pill` | `control-round: 1` |
| `menu.panel` | `inverted` | `popup-invert: 1`, `popup-alpha: 1`, `popup-blur: 0px` |

The token sets `Theme.relief.*` and `Theme.hardShadows` become these options;
nothing composes token sets to make a theme any more.

### What does not change

- The derivations, `Theme.ref`, recipes, `Style`, `Layers` and the sheet.
- The CSS variable names. A knob names the variable it writes, so recipes
  keep reading `ref.knob['radius-factor']`; the grouped path (`shape.radius`)
  is the authoring name.
- `Theme.define`, the token-level escape hatch, for what is not a theme: an
  override of a derived token, composed over the standard derivations.

## Decisions

### A theme holds knob values only

Whatever a theme varies is a knob. A theme that needs a token no knob reaches
is a missing knob, added to the standard set, not a token override in the
theme. This keeps a theme:

- **validated**: it is an Effect Schema value, decoded, never cast;
- **comparable**: two themes are equal exactly when their knobs are
  (`Schema.toEquivalence`), which `/create` hand-rolled;
- **serializable**: a URL, a saved preference or a CMS field decodes through
  the schema;
- **cheap to switch at the root**: the derivations are declared on `:root`,
  where the knobs a theme writes resolve, so a theme selected with
  `:root[data-theme="cobalt"]` writes only its knob variables.

Overriding a derived token (one exact accent hover) is `Theme.define`,
composed over the standard derivations: an application's stylesheet, not a
theme.

### Knobs are grouped, one level deep

`accent`, `surface`, `shape`, `type`, `motion`, `shadow`, `menu`, `feedback`,
`code`, `chart`, `scales`: each a flat record of knobs. `type.headingWeight`,
not `type.headings.weight`.

- It reads as the concepts read, and as `/create`'s panes are laid out.
- A value that differs per scheme has a shape of its own:
  `lightness: { light: 55, dark: 70 }`.
- One level keeps `Theme.set` a one-level merge, typed references shallow,
  and an application's own knobs one more group.

### A theme is named by the record that installs it

```ts
const themes = Themes.make({ iris, cobalt, cobaltDense }, { initial: 'iris' })
```

A name is a record key, as a Slot's and a Message's are, so it is unique
(an object holds no two equal keys), and `themes.Name` is a
`Schema.Literals` for the Model field that owns which theme is active. A name
on the value would travel through `pipe` onto a different theme: `cobalt`,
denser, still called "cobalt". A theme carries an optional title and
description, as annotations, which are not its identity.

### The whole move, in green steps

The current authoring API is replaced, not kept beside the new one: two ways
to write a theme is the duplication this project removes elsewhere. Each
step below is a commit that passes every check on its own.

## The API

```ts
import { Knob, Knobs, Theme, Themes } from 'foldkit-mixins/theme'

// A theme: only the knobs it changes; the rest keep their defaults.
export const cobalt = Theme.make({
  accent: { hue: 235, chroma: 0.225, lightness: 55 },
  surface: { saturation: 0, contrast: 24, lightness: { light: 97, dark: 24.5 }, hue: 0 },
  shape: { radius: 1.8, density: 1.1 },
  motion: { scale: 0.5, easing: 'spring' },
  shadow: { strength: 0 },
  type: { body: Theme.fonts.geist, scale: 1.025, leading: 1.05, headingScale: 1.2, headingWeight: 700, headingTracking: -0.025 },
  menu: { panel: 'inverted' },
  scales: { chroma: 1.1 },
}).pipe(Theme.describe({ title: 'Cobalt', description: 'A vivid blue on pure greys' }))

// A theme built on another.
export const cobaltDense = cobalt.pipe(Theme.set({ shape: { density: 0.9 } }))

// Installed: the standard derivations at the root, the initial theme's knobs
// there too, and each other theme's knobs under `:root[data-theme="name"]`.
export const themes = Themes.make({ cobalt, cobaltDense }, { initial: 'cobalt' })
export const { t, slots, forSlots, stylesheet } = AppStyle.make({ themes })

// The Model owns which one is active.
const Model = Schema.Struct({ theme: themes.Name })
```

- `Theme.make(values)` takes a deep partial of the standard knob values:
  each key typed by its group, each value by its kind, so a misspelt knob, a
  choice outside its options and a number of the wrong kind are type errors,
  and a number out of range is refused when it is made (the schema's check).
- A `Theme` is `Pipeable`. `Theme.set(partial)` and `Theme.describe(meta)`
  are `(theme) => theme`.
- `Theme.print(theme)` writes the `Theme.make({...})` source of a theme,
  only the knobs that differ from the defaults: `/create`'s code panel.
- `Theme.fonts` names the shipped font stacks (`geist`, `system`, `serif`,
  `mono`, ...); a font knob takes any stack.

### An application's own knobs

```ts
const AppKnobs = Knobs.standard.pipe(
  Knobs.add({ brand: { glow: Knob.percent({ default: 20, description: 'How much the hero glows' }) } }),
)
const k = Knobs.ref(AppKnobs) // k.brand.glow is 'var(--fk-knob-brand-glow)'
const glow = Theme.define({ glow: { soft: `color-mix(in oklab, ${t.accent.default} ${k.brand.glow}, transparent)` } })

const launch = Theme.make(AppKnobs, { brand: { glow: 40 } })
```

An added knob's variable is named by its path (`--fk-knob-brand-glow`). The
standard knobs name theirs explicitly, so their CSS stays what it is.

### Scoping to a subtree

A token resolves where it is declared, so a knob overridden on an element
below `:root` changes nothing derived from it there. `Theme.scope(theme,
'.marketing')` therefore writes the theme's knobs and the standard
derivations again under the selector. `Theme.scoped`'s documentation today
offers a subtree (`.marketing`) that this would not re-derive; the new
function fixes that rather than repeating it.

## The knob kinds

Every kind is a Schema with annotations: `title`, `description`, and for a
number its `min`, `max`, `step` and `unit`. `/create` draws its controls from
them: a slider from a number, a row or a list from a choice, the tooltip from
the description.

| Kind | Value | Writes |
| --- | --- | --- |
| `Knob.number({ default, min, max, step })` | a number | `String(value)` |
| `Knob.angle({ default })` | degrees | the number |
| `Knob.percent({ default, min?, max? })` | 0 to 100 | `'55%'` |
| `Knob.length({ default, unit, min, max, step })` | a number | `'1px'`, `'-0.025em'` |
| `Knob.choice({ default, options })` | an option's name | each variable the option names |
| `Knob.font({ default })` | a font stack | the stack |
| `Knob.schemed(kind)` | `{ light, dark? }` or a bare value for both | two variables |
| `Knob.follows(ref)` | a default that is another knob's expression | `var(...)` until set |

`follows` keeps what `Theme.oklch` computes in JavaScript today in CSS: the
neutrals follow the accent's hue, the dark accent's chroma is
`min(0.4, c + 0.03)`, the dark surfaces' saturation is 4/3 of the light
ones'. A theme that sets one of them sets a number; one that does not keeps
the expression, so moving the accent's hue still moves the neutrals.

## The standard knobs

Ranges are the ones `/create` uses. A default written as an expression
follows another knob until a theme sets it.

| Knob | Kind | Default | Range | Variables |
| --- | --- | --- | --- | --- |
| `accent.hue` | angle | 264 | 0 to 360 | `accent-h` |
| `accent.chroma` | schemed number | 0.17, dark `min(0.4, c + 0.03)` | 0 to 0.4 | `accent-c`, `accent-c-dark` |
| `accent.lightness` | schemed percent | 52, dark 70 | 15 to 90 | `accent-l`, `accent-l-dark` |
| `accent.secondaryShift` | angle | 60 | | `secondary-shift` |
| `accent.tertiaryShift` | angle | -90 | | `tertiary-shift` |
| `surface.hue` | angle | follows `accent.hue` | 0 to 360 | `neutral-h` |
| `surface.saturation` | schemed number | 0.015, dark 4/3 of it | 0 to 0.04 | `surface-c`, `surface-c-dark` |
| `surface.lightness` | schemed percent | 97.5, dark 22 | 75 to 100, dark 6 to 36 | `base-l`, `base-l-dark` |
| `surface.contrast` | percent | 26 | 0 to 100 | `surface-contrast` |
| `surface.textContrast` | number | 1 | | `contrast-factor` |
| `surface.hover` | choice | `surface` | `surface`, `neutral`, `accent` | `surface-ink`, `state-ink` |
| `shape.radius` | number | 1 | 0 to 2.5 | `radius-factor` |
| `shape.density` | number | 1 | 0.75 to 1.3 | `density` |
| `shape.size` | choice | `default` | `default`, `compact` | `step` |
| `shape.controls` | choice | `rounded` | `rounded`, `pill` | `control-round` |
| `shape.border` | length px | 1 | 1 to 3 | `border-width`; `border.thick` and `heavy` step up from it |
| `shape.outlines` | choice | `soft` | `soft`, `strong`, `ink` | the outline inks |
| `type.body` | font | `system-ui, sans-serif` | | `font-body` |
| `type.heading` | font | follows `type.body` | | `font-heading` |
| `type.scale` | number | 1 | 0.8 to 1.3 | `text-scale` |
| `type.headingScale` | number | 1 | 0.4 to 1.8 | `heading-scale` |
| `type.leading` | number | 1 | 0.85 to 1.3 | `leading` |
| `type.headingWeight` | number | 600 | 300 to 900, by 100 | `heading-weight` |
| `type.headingTracking` | length em | -0.01 | -0.05 to 0.05 | `heading-tracking` |
| `icon.size` | number | 1 | 0.75 to 1.5 | `icon-scale`; the `icon` rung of `ladder` multiplies by it |
| `icon.stroke` | length px | 2 | 1 to 3 | `glyph-width`; `border.glyph`, what recipes draw in CSS, not a pack's masks |
| `motion.scale` | number | 1 | 0 to 2 | `motion` |
| `motion.easing` | choice | `ease` (`ease-out`) | `ease`, `spring` | `ease` |
| `shadow.strength` | percent | 100 | 0 to 100 | `shadow-strength` |
| `shadow.style` | choice | `soft` | `soft`, `hard` | the elevation shadows |
| `shadow.relief` | choice | `flat` | `flat`, `soft`, `hard`, `bevel` | the control shadows |
| `shadow.hue` | angle | follows `surface.hue` | | `shadow-h` |
| `shadow.chroma` | number | follows `surface.saturation` × 2 | | `shadow-c` |
| `menu.highlight` | choice | `subtle` | `subtle`, `bold` | `popup-bold` |
| `menu.panel` | choice | `default` | `default`, `inverted`, `translucent`, `inverted-translucent` | `popup-invert`, `popup-alpha`, `popup-blur` |
| `feedback.success` ... `info` | angle | 145, 75, 25, 245 | | `success-h` ... |
| `code.chroma` | number | 0.14 | 0 to 0.4 | `syntax-c` |
| `chart.hue` | angle | 255 | | `chart-h` |
| `scales.chroma` | number | 1 | 0 to 1.5 | `scale-c` |
| `scales.red` ... `purple` | angle | 25, 55, 90, 145, 185, 255, 300 | | `red-h` ... |

Variables written without a prefix above are `--fk-knob-...`. The defaults of
`accent` and `type.headingWeight` / `headingTracking` are Iris's and the
shipped heading's; the rest are today's.

Not knobs, deliberately:

- `travel`, which the reset sets under reduced motion: the reader's
  preference, not the theme's.
- The tuning of the state films (`state-hover`, `state-tint`,
  `state-tint-dark`), `image-edge` and `raise-dark`: internal constants of the
  derivations, reachable through `Theme.define` for the rare theme that must.

New variables (`border-width`, `font-body`, `font-heading`, `heading-weight`,
`heading-tracking`, `ease`, and the shadow and outline lists the choices
write) replace token overrides the site makes today, so `border.thin`,
`font.body`, `weight.heading`, `tracking.heading` and `motion.ease` read them.

## Steps

Steps 1 to 5 are done: the knobs, the choices as knobs, `Themes.make`, `/create` drawn
from the schema, and the old surface removed. `Knobs.add` and `Knobs.ref`, for an
application's own knobs over the standard ones, are not built yet.

1. **Kinds and the standard schema.** `Knob` kinds, `Knobs.standard`,
   `Theme.make`, `Theme.set`, `Theme.describe`, and a function from a theme to
   its knob declarations. A golden test: for every `/create` preset,
   `Theme.make` of its knobs plus `Theme.standard` emits the same computed
   CSS values as today's `Theme.oklch` + `Theme.tokens` + composed token sets,
   compared value by value in a browser, so nothing a page draws changes.
2. **The missing knobs.** Border width, fonts, heading weight and tracking,
   easing, relief, shadow style and outlines become knobs whose variables the
   derivations read; `Theme.relief` and `Theme.hardShadows` become choice
   options.
3. **`Themes.make`** with `Name`, root and scoped declarations, `AppStyle`
   taking `themes`, and `Theme.scope` for a subtree, with a browser test that
   a subtree theme re-derives (the case `Theme.scoped` misses).
4. **`/create` from the schema.** Its controls, ranges, tooltips, Shuffle
   bounds, URL decoding and equivalence come from `Knobs.standard`; its code
   panel is `Theme.print`; the site's own `Knobs`, ranges and `codeOf` go.
   The presets become `Theme.make` values.
5. **The old surface goes.** `Theme.oklch`'s config object, the token sets
   composed for a theme, and every example that wrote knob strings; the
   README, the agent skill and the changelog rewritten; `Knobs.add` and
   `Knobs.ref` for an application's own knobs, with an example.

## Risks

- **A derivation that read a JavaScript value.** `Theme.oklch` computes some
  values when it is called (the dark accent chroma, the shadow chroma). In
  CSS they become `follows` expressions; the golden test of step 1 is what
  proves they did not move.
- **Box-shadow transitions between choices** of different lengths do not
  interpolate; they did not before either (a relief was a different token
  set), so switching a relief still snaps.
- **Type errors on a deep partial.** `Theme.make` and `Theme.set` take a
  deep partial; its negative cases (an unknown group, an unknown knob, a
  choice outside its options, a string for a number) go in a
  `types.test-d.ts`, each alone.
