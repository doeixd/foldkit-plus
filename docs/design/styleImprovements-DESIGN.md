# Style improvements: a design system in `foldkit-mixins`

**Status:** design, 2026-09-24. Nothing here is built. Follows
[mixins-DESIGN.md](./mixins-DESIGN.md) (Style is data, deterministic CSS,
no render-time collector) and borrows from the author's `css-tags` library
(token-first OKLCH theming, a fixed cascade-layer order, attribute-driven
layout primitives, and a prose contract). Where this document says "css-tags"
it means that library; where it says "today" it means `packages/mixins/src`
at commit `9b40e9c`.

## The gap

`foldkit-mixins` ships a style *mechanism*: slots, pieces, recipes, a
deterministic compiler, five cascade layers, and a `Theme` that is a flat
record of strings. It ships no design system. An application that uses it
writes every token literal itself (`examples/todo-app/src/style.ts` declares
eleven colors by hex), writes its dark mode as a hand-maintained CSS override
of `--fk-*` variables (`styles.css`), and lays out every stack and cluster with
raw `display: flex` declarations. `Style.grid` is the only layout helper, and
nothing in `examples/` uses `Style.layers`, `inLayer`, `foundation`, or
`responsive` yet.

css-tags solved the same three problems in plain CSS:

1. **One theme from a few knobs.** Accent hue, chroma, and lightness, plus
   surface saturation, surface contrast, a contrast factor, radius and density
   factors, and two hue shifts, derive every surface, text, outline, and
   feedback color in OKLCH. Dark mode and named theme packs are overrides of
   the knobs, not forks of the palette.
2. **A fixed layer order** (`base, reset, tokens, engine, theme, palette,
   defaults, components, utilities, layouts, website-theme`) so a design
   system's rules always sit under an application's.
3. **Layout primitives** (`layout-stack`, `cluster`, `split`, `sidebar`,
   `switcher`, `reel`, `center`, `frame`, `pad`) driven by a handful of
   properties, with container-query adaptation, and a `.prose` contract for
   longform content.

The mechanism here can carry all three. This document says how, and what is
deliberately left in css-tags.

## Decisions in one screen

| Question | Decision | Why |
| --- | --- | --- |
| New package or `foldkit-mixins`? | `foldkit-mixins`, new modules `theme.ts` (grown), `layout.ts`, `prose.ts` | mixins-DESIGN says extract `foldkit-style` only when the compiler grows an AST. These are data builders over the existing compiler. |
| Are themes layers? | **No.** A theme is a token *set*; a layer is a cascade *position*. Theme tokens are emitted in the `theme` layer. A named theme is a scoped override in the same layer. | Layers order rules; they do not hold values. Conflating them makes "which theme wins" a question of layer order instead of a Model field, which breaks the one-owner rule. |
| Layer order | `reset, tokens, theme, defaults, components, layouts, variants, utilities, app` (was `defaults, components, variants, utilities, app`) | css-tags' order, minus what Foldkit does not need (`engine`, `palette`, `website-theme`). `layouts` sits between components and variants so a layout wrapper never beats a component's own inner rule but an app variant still beats the layout. Breaking change to a 0.x tuple; allowed. |
| Where does dark mode live? | Two mechanisms, both existing: `Theme.lightDark` for scheme-following tokens (browser owns it), a `data-theme` or `data-color-scheme` attribute on the root written from the Model for a user choice. `Theme.scoped` emits the override rules for the second. | Matches css-tags (`:root[data-color-scheme="dark"]`) and the state-model rule: a choice is a Model fact. |
| Derived colors: computed in TypeScript or in CSS? | **In CSS**, as `oklch(from var(--fk-…) …)` and `color-mix()` references. TypeScript only writes the references. | Overriding one knob at runtime (a class, a `data-theme`, an inline style on a subtree) must re-derive everything, which only the browser can do. css-tags proves the browser math is enough. |
| Layout: attribute-driven like css-tags? | **No.** A layout is a Style piece whose inputs are TypeScript arguments; per-instance variation is `Style.vars`. | The view already passes typed input; `attr()` parsing exists to give plain HTML a way in, which a Foldkit view does not need. |
| Three host forms (tag, data, class)? | **No.** Slots are the contract. | The host-form rule exists because CSS has no other extension point; a slot is a better one. |
| `@function` / `@mixin` draft CSS | **No.** | `Style` already is the mixin layer, with type-checked keys. |

## 1. Layers

### Today

```ts
Style.layers = ['defaults', 'components', 'variants', 'utilities', 'app']
Style.inLayer(name, piece)
Style.foundation(theme) // "@layer defaults, components, variants, utilities, app;:root{…}"
```

### Proposed

```ts
export const layers = Object.freeze([
  'reset',      // normalize: box-sizing, margins, media defaults
  'tokens',     // scales that never change per theme: spacing, type, radius, motion
  'theme',      // the knobs and everything derived from them; scoped overrides
  'defaults',   // element defaults: body, headings, links, code, form controls
  'components', // a design system's component rules
  'layouts',    // stack, cluster, sidebar, … (new)
  'variants',   // a recipe's per-variant rules
  'utilities',  // single-purpose rules
  'app',        // the application, always last
] as const)
```

Rules that hold:

- `app` is last and `reset` is first. Nothing may be emitted outside the
  tuple; a misspelled name is still a type error.
- `Style.foundation` declares this order. It grows to also emit the `reset`
  layer when asked (`{ reset: true }`), the `tokens` and `theme` layers from
  the theme handed to it, and the `defaults` layer when a `Defaults` piece
  is passed. Its output is still one string a page ships first, with no
  JavaScript.
- Nothing in mixins emits into `app`; it exists so an application's own
  `inLayer('app', …)` is guaranteed to win.

Why `layouts` after `components` and before `variants`: a card inside a stack
should keep its own padding rules against the stack's child selector, and an
application's `size: 'compact'` variant should still shrink the stack gap.
css-tags puts layouts last for the same reason, but it has no variants layer.

## 2. Theme

### 2.1 What a Theme is

Unchanged: `Theme.define(tokens)` is a frozen two-level record of strings and
`Theme.variable(theme, group, name)` is `var(--fk-group-name)`. A token's
*value* may be a literal, a `light-dark()`, or a CSS expression that
references other tokens. That last case is what makes derivation possible.

Three new things:

1. `Theme.oklch(knobs)` returns a Theme whose values are derivation
   expressions.
2. `Theme.scoped(selector, overrides)` returns CSS text for a named theme or
   scheme override.
3. `Theme.tokens` is the shipped set of non-color scales.

### 2.2 `Theme.oklch`: the css-tags engine as a token generator

```ts
export interface OklchKnobs {
  /** The brand color. Hue in degrees, chroma 0–0.4, lightness as a percentage. */
  readonly accent: { readonly h: number; readonly c: number; readonly l: string }
  /** Degrees added to the accent hue for the secondary and tertiary families. */
  readonly secondaryHueShift?: number   // default 60
  readonly tertiaryHueShift?: number    // default -90
  /** Chroma of neutral surfaces; 0 is gray. */
  readonly surfaceSaturation?: number   // default 0.015
  /** How far apart the surface steps are, 0–100%. */
  readonly surfaceContrast?: string     // default '65%'
  /** Multiplies text chroma and outline strength. */
  readonly contrastFactor?: number      // default 1
  readonly feedback?: {
    readonly success?: number; readonly warning?: number
    readonly error?: number;   readonly info?: number   // hues; css-tags defaults 145, 75, 25, 245
  }
}

export const oklch: (knobs: OklchKnobs) => Theme<OklchTheme>
```

The returned Theme has these groups. Every value except the knobs is a
reference, so overriding a knob anywhere re-derives the rest in the browser.

| Group | Names | Value shape |
| --- | --- | --- |
| `knob` | `accent-h`, `accent-c`, `accent-l`, `secondary-shift`, `tertiary-shift`, `surface-c`, `surface-contrast`, `contrast-factor`, `success-h`, `warning-h`, `error-h`, `info-h`, `base-l` | literals from the knobs; `base-l` is `light-dark(97.5%, 12%)` |
| `hue` | `accent`, `secondary`, `tertiary`, `neutral` | `var(--fk-knob-accent-h)`, `calc(var(--fk-knob-accent-h) + var(--fk-knob-secondary-shift))`, … |
| `surface` | `base`, `muted`, `subtle`, `default`, `overt`, `bedrock` | `oklch(var(--fk-knob-base-l) calc(var(--fk-knob-surface-c) * 0.9) var(--fk-hue-neutral))`; steps are `color-mix(in oklch, base, target var(--fk-knob-surface-contrast))` as css-tags does |
| `text` | `default`, `muted`, `subtle`, `overt`, `on-accent`, `link`, `link-hover` | `oklch(light-dark(20%, 90%) calc(var(--fk-knob-surface-c) * 2 * var(--fk-knob-contrast-factor)) var(--fk-hue-neutral))` |
| `outline` | `subtle`, `default`, `overt`, `focus` | derived from text with alpha |
| `accent` | `default`, `hover`, `active`, `subtle`, `text` | `oklch(var(--fk-knob-accent-l) var(--fk-knob-accent-c) var(--fk-hue-accent))`, hover `oklch(from … calc(l - 0.06) c h)` |
| `secondary`, `tertiary` | same five names | same shapes over their hues |
| `success`, `warning`, `error`, `info` | `default`, `subtle`, `text`, `outline` | over the feedback hues; `text` is the contrast pair css-tags guarantees for every feedback surface |

Things it does *not* generate: the fourteen-step lightness and chroma scales
and the named-family palettes (brown, gold, olive, magenta). Those exist in
css-tags for utilities like `.bg-accent-7`; a Foldkit view names a semantic
token, not a scale step. Leave them in css-tags.

Determinism: the same knobs give byte-identical values. `Theme.oklch` is
called at module load, like every other Style value.

The types: `OklchTheme` is a concrete `ThemeTokens` type so
`Theme.variable(theme, 'surface', 'overt')` autocompletes and a wrong name is
a type error. `Theme.compose(Theme.oklch(...), { color: {...} })` still
merges group-wise.

### 2.3 `Theme.scoped`: named themes and a user's color scheme

```ts
/** Rules that override tokens under `selector`, emitted in the theme layer. */
export const scoped: (selector: string, overrides: Partial<ThemeTokens>) => StyleValue
```

`Theme.scoped(':root[data-theme="ocean"]', { knob: { 'accent-h': '215' } })`
returns a `StyleValue` whose `globalCss` is
`@layer theme{:root[data-theme="ocean"]{--fk-knob-accent-h:215}}`. Because
every derived token is a reference, that one line recolors the whole page.

Ownership, stated once: *which* theme is active is a Model field; the view
writes `h.DataAttribute('theme', model.theme)` on the root. `Theme.scoped`
only says what the theme means. A scheme the user chooses works the same way
with `data-color-scheme` and a `color-scheme` declaration in the override,
exactly css-tags' `:root[data-color-scheme="dark"]`. A scheme the user does
not choose needs nothing: `light-dark()` values follow the browser.

`Theme.scoped` also covers a subtree: `Theme.scoped('.marketing', …)` on a
section. The selector is passed through, so the compiler stays ignorant of
what a theme is.

### 2.4 `Theme.tokens`: the non-color scales

Shipped once, in the `tokens` layer, so a `Theme.oklch` theme and a
hand-written theme share spacing and type:

```ts
export const tokens = Theme.define({
  space:  { '3xs': '0.125rem', '2xs': '0.25rem', xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
  radius: { xs: '2px', sm: '3px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
  font:   { body: 'system-ui, sans-serif', heading: 'inherit', mono: 'ui-monospace, monospace' },
  size:   { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
  leading:{ tight: '1.2', snug: '1.375', normal: '1.5', relaxed: '1.6' },
  weight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
  motion: { fast: '150ms', normal: '250ms', ease: 'ease-out' },
  border: { thin: '1px', thick: '2px', heavy: '3px' },
  breakpoint: { sm: '(min-width: 40rem)', md: '(min-width: 48rem)', lg: '(min-width: 64rem)', xl: '(min-width: 80rem)' },
})
```

css-tags multiplies space and radius by `--density-factor` and
`--radius-factor`. Keep that: `space.md` is `calc(1rem * var(--fk-knob-density))`
with `knob.density` and `knob.radius-factor` defaulting to `1`, so a compact
theme is one override.

`breakpoint` is the record `Style.responsive` takes. The same names, as
numbers, feed `foldkit-primitives/media` `Breakpoints` so CSS and Model agree
on what `md` means; a helper `Theme.breakpointWidths(tokens)` parses the
`min-width` out of each query for that purpose, and refuses a query it cannot
parse.

### 2.5 `Style.foundation` grows

```ts
Style.foundation({
  theme: Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })),
  reset: true,
  defaults: Defaults.all,           // section 4
  scoped: [Theme.scoped(':root[data-theme="ocean"]', …)],
})
```

emits, in order: the `@layer` list; `@layer reset{…}`; `@layer tokens{:root{…}}`
for groups that come from `Theme.tokens`; `@layer theme{:root{…}}` for the
rest plus `color-scheme`; each scoped override; `@layer defaults{…}`. Which
group goes to `tokens` versus `theme` is decided by name: a group is a token
if it is one of `Theme.tokens`' groups. Simpler than tagging, and it keeps
`Theme.define` unchanged for users who never touch `Theme.tokens`.

The current one-argument form stays as an overload.

## 3. Layouts

### 3.1 Shape

A new module `layout.ts`, exported as `Layout`. Each entry is a function from
typed options to a `StyleValue` made of `inline` declarations and rule
pieces, wrapped in `inLayer('layouts', …)`. No new compiler features; the
only new primitive needed is a per-child rule, which `Style.nest('> *', …)`
already gives.

```ts
export const stack = (options?: {
  readonly gap?: string          // default var(--fk-space-md)
  readonly align?: string        // default stretch; css-tags: children full-width by default
  readonly split?: number        // index after which margin-block-start: auto pushes the rest down
}) => StyleValue

export const cluster = (options?: { gap?: string; justify?: string; align?: string }) => StyleValue

export const split = (options?: {
  fraction?: string              // '1fr 2fr'
  breakpoint?: string            // a container width; stacks below it
  gap?: string
}) => StyleValue

export const sidebar = (options?: {
  side?: 'start' | 'end'
  width?: string                 // sidebar's preferred width
  contentMin?: string            // '50%': below this the sidebar wraps under
  gap?: string
}) => StyleValue

export const switcher = (options?: { threshold?: string; gap?: string; limit?: number }) => StyleValue
export const reel     = (options?: { itemSize?: string; gap?: string; snap?: boolean; scrollbar?: 'auto' | 'thin' | 'hidden' }) => StyleValue
export const center   = (options?: { max?: string; gutters?: string; intrinsic?: boolean }) => StyleValue
export const frame    = (options?: { ratio?: string }) => StyleValue
export const pad      = (options?: { inline?: string; block?: string }) => StyleValue
export const autoGrid = (options?: { minItemSize?: string; gap?: string }) => StyleValue   // css-tags layout-grid
```

`Style.grid` stays as it is; `autoGrid` is the auto-fit case that needs no
areas.

### 3.2 Per-instance values are variables, not new classes

`Layout.stack()` compiles to *one* class for every caller, because its rules
read `var(--fk-l-gap, var(--fk-space-md))`. Passing `gap` writes
`Style.vars({ '--fk-l-gap': gap })` inline on the same element. This is
css-tags' `--l-gap` contract and it keeps the stylesheet small: ten stacks
with ten gaps are one rule and ten inline variables.

The alternative, baking `gap` into the rule text so each gap hashes to its
own class, is rejected: it works, but the stylesheet grows with the number of
distinct values, and a value only known at render time (`whenInput`) could
not change it at all. Variables can.

### 3.3 Container queries

`split`, `sidebar`, and `switcher` adapt to their container's width, not the
viewport, so a layout inside a card behaves the same as one on the page.
Each sets `container-type: inline-size` on itself and writes its breakpoint
rule as `Style.container('(min-width: …)', …)`. css-tags makes containment
opt-in because size containment changes intrinsic sizing when the layout is a
flex item; the same caveat applies and the option is `{ contain: false }` to
turn it off, with the layout then adapting on the viewport through
`Style.media` instead.

### 3.4 Children

A layout styles its children through `Style.nest('> *', …)` for `min-inline-size: 0`
and the like. An opt-out for one child (css-tags' `.stack-intrinsic`) is a
piece the child composes: `Layout.intrinsic`, which sets `align-self: start`
with a class the parent's rule excludes via `:not(.…)`. The class name is
the piece's own hashed class, so the pair stays consistent without a shared
string.

### 3.5 What a layout is not

It is not a slot and not a view. It attaches to a slot the view already has,
usually `root`. A view that wants its children laid out by the caller
publishes a container slot; that is the existing extension model.

## 4. Defaults and prose

### 4.1 `Defaults`

css-tags' value for plain HTML is that `<main class="prose">` reads well with
no component markup. Here that is a set of `globalCss` pieces in the
`defaults` layer:

```ts
export const Defaults = {
  reset:   StyleValue   // box-sizing, margin:0 on body and headings, img max-width, etc.  (emitted in `reset`)
  body:    StyleValue   // font, color, background from theme tokens; color-scheme
  headings: StyleValue  // h1–h6 sizes from size.*, weight.heading, leading.tight
  links:   StyleValue   // text.link, text.link-hover, visited, focus outline
  code:    StyleValue   // pre and code on surface.subtle with outline.subtle
  controls: StyleValue  // input, select, textarea, button: font inherit, radius.md, outline.focus
  all:     StyleValue   // every one of the above, composed
}
```

Each is plain CSS text over `--fk-*` references, so it re-themes with the
tokens. `Style.foundation({ defaults: Defaults.all })` emits it; an
application that wants only `body` and `links` composes those.

Element defaults are the one place this design writes element selectors
rather than classes. They are unavoidable for content the application does
not render (CMS output, `foldkit-richtext` HTML) and they live in the lowest
authored layer, where any class rule beats them.

### 4.2 `Prose`

`Prose.style(options?)` is a piece for a container of longform content: the
measure (`max-inline-size: 65ch`), the rhythm tokens (`--fk-prose-*` for
paragraph, heading, list, and figure spacing, following css-tags'
"relationships between unlike elements" rule), and nested rules for `p`,
`h2 + p`, `ul`, `blockquote`, `figure`, `figcaption`, `hr`, `table`, `mark`,
`abbr`. It compiles to one class like any rule piece, in the `components`
layer. `foldkit-richtext`'s HTML renderer is its first consumer.

## 5. `Style.responsive` and breakpoints

Unchanged in shape. The improvement is only that `Theme.tokens.breakpoint`
is the record everyone passes, so `Style.responsive(Theme.tokens.breakpoint,
{ md: … })` and `Bundle.at(Breakpoints, { args: { breakpoints:
Theme.breakpointWidths(Theme.tokens) } })` agree on names. Nothing new
compiles.

## 6. Recipes over the design system

`Style.recipeFor` already lets a design system ship a recipe and an
application extend it. What is missing is a shipped recipe. Provide, for the
`foldkit-mixins-ui` slot contracts that have the most obvious appearance
(`ButtonSlots`, `InputSlots`, `CheckboxSlots`, `SwitchSlots`, `DialogSlots`,
`TabsSlots`), a `Recipes` namespace in `foldkit-mixins-ui`:

```ts
Recipes.Button({ tone: 'accent' | 'neutral' | 'danger', size: 'sm' | 'md' | 'lg', variant: 'solid' | 'outline' | 'ghost' })
```

Each is `Style.recipeFor(XSlots)({ base, variants, defaults, compound })`
whose pieces reference `--fk-*` tokens and put per-variant rules in the
`variants` layer. This is the component layer css-tags has and mixins
lacks. It lives in `mixins-ui` because that is where the slot contracts are;
core `foldkit-mixins` stays free of `@foldkit/ui`.

Not for this design: recipes for the form and crud views. They come after
the button set proves the token names.

## 7. Where each thing lives

| Thing | Module | Layer it emits into |
| --- | --- | --- |
| `Style.layers`, `inLayer`, `foundation` | `mixins/src/style.ts` | — |
| `Theme.define`, `variable`, `variables`, `lightDark`, `compose` | `mixins/src/theme.ts` | — |
| `Theme.oklch`, `Theme.tokens`, `Theme.scoped`, `Theme.breakpointWidths` | `mixins/src/theme.ts` (+ `themeOklch.ts` for the derivation table) | `tokens`, `theme` |
| `Layout.*` | `mixins/src/layout.ts` | `layouts` |
| `Defaults.*` | `mixins/src/defaults.ts` | `reset`, `defaults` |
| `Prose.style` | `mixins/src/prose.ts` | `components` |
| `Recipes.*` | `mixins-ui/src/recipes/*.ts` | `components`, `variants` |

No new package. Every export is data built at module load; nothing reads the
DOM, the clock, or the Model.

## 8. What changes for existing users

- `Style.layers` gains four names and reorders; any `inLayer('components', …)`
  still works. Anyone who pasted the old `@layer` line by hand must replace it
  with `Style.foundation`.
- `Style.foundation(theme)` keeps working. The options form is additive.
- `Theme` gains members; nothing is removed.
- `examples/todo-app/src/style.ts` moves its eleven hex colors to
  `Theme.oklch({ accent: { h: 243, c: 0.18, l: '58%' } })` and deletes the
  dark-mode block from `styles.css`, which becomes the proof that the
  derivation is right. `PageStyle.root` becomes `Layout.stack({ gap: … })`
  plus a `Layout.center`.

## 9. Rejected alternatives

- **A theme as a layer** (`@layer theme-ocean`). Two themes would then be two
  layers, and which one applies would be fixed by declaration order rather
  than by the Model. A user switching themes would need the stylesheet
  rewritten. Overrides under a selector, driven by a Model-owned attribute,
  need no such thing.
- **Computing OKLCH in TypeScript** (a color library that outputs hex). Fast
  and portable, but a runtime override of one knob would need a re-render of
  every token, and a subtree theme would need a second computation. The
  browser already does this math; css-tags ships it. The cost is the
  baseline: relative color syntax and `light-dark()` need Chrome 123, Firefox
  128, Safari 17.5 (css-tags' table says 119/128/16.5 because it does not use
  `light-dark()`). Accept it; document it.
- **A `foldkit-design` package.** It would pull `mixins-ui` in for recipes
  and `primitives` in for breakpoints, inverting the dependency direction.
  Keep core data in mixins, recipes where the slots are.
- **Attribute-driven layouts** (`attr(gap type(*))`). A Foldkit view has typed
  input; parsing attributes would be a second, untyped input channel.
- **Scales and named palettes** (`--scale-l-7`, `--palette-gold-chroma-3`).
  Utility-class material. A view names a semantic token.
- **Generating a class per distinct layout value.** See 3.2.

## 10. Phase plan

1. **Layers.** Extend the tuple, grow `foundation` to the options form, keep
   the overload. Tests: order, each section's emission, the overload
   unchanged. Update the mixins README table and the skill reference.
2. **`Theme.tokens` and density.** Ship the scales, `breakpointWidths`, and
   the `tokens`-versus-`theme` split in `foundation`.
3. **`Theme.oklch` and `Theme.scoped`.** The derivation table, its types, a
   test that asserts every non-knob value is a reference and that no token
   references an undefined one (a static check over the emitted text). A
   browser demo page under `examples/mixins` that flips `data-theme` and
   `data-color-scheme` from the Model.
4. **`Layout`.** `stack`, `cluster`, `center`, `autoGrid` first (no
   container queries), then `split`, `sidebar`, `switcher`, `reel`, `frame`,
   `pad`. Tests pin the compiled CSS of each and the one-class-many-vars
   property.
5. **`Defaults` and `Prose`.** With `foldkit-richtext`'s HTML output as the
   fixture.
6. **`Recipes.Button` in `mixins-ui`**, then the rest of the six.
7. **todo-app migration** as the end-to-end proof, and the skill's
   `references/mixins.md` updated in the same change as each public API.

Each phase is its own commit series with a review pass, per AGENTS.md.
