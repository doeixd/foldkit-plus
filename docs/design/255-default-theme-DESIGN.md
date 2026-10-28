# The default theme ([#255](https://github.com/doeixd/foldkit-plus/issues/255))

Status: built 2026-10-27.

`Theme.make({})` used to be a violet accent on a lightly tinted page with soft
shadows, and the components drew Lucide's icons. #255 asks for one particular
theme from `/create` to be the starting point instead, along with Heroicons, so
that a new application starts from it rather than discovering it later.

## What "default" means

A theme is only knob values (`docs/theme-knobs.md`). A knob it leaves unset
writes the knob's `unset` variables. So making a theme the default means
changing the knobs' defaults. No new value is written into any style, and the
derivations stay the same.

| Knob | Was | Now |
| --- | --- | --- |
| `accent.hue` | 264 | 235 |
| `accent.chroma` | 0.17 (dark follows `c + 0.03`) | 0.225 (dark still follows, so 0.255) |
| `accent.lightness` | 52, dark 70 | 55, dark 70 |
| `surface.saturation` | 0.015 (dark follows 4/3 of it) | 0 |
| `surface.lightness` | 97.5, dark 22 | 100, dark 24.5 |
| `surface.contrast` | 26 | 80 |
| `shape.radius` | 1 | 0.45 |
| `shape.density` | 1 | 1.1 |
| `type.headingWeight` | 600 | 700 |
| `type.headingTracking` | -0.01em | -0.025em |
| `type.scale` | 1 | 1.025 |
| `type.headingScale` | 1 | 1.2 |
| `type.leading` | 1 | 1.05 |
| `type.fluid` | 0 | 1 |
| `reading.measure` | 65ch | 68ch |
| `motion.scale` | 1 | 0.5 |
| `motion.easing` | `ease` | `spring` |
| `shadow.strength` | 100 | 0 |
| `menu.panel` | `default` | `inverted` |
| `scales.chroma` | 1 | 1.1 |

The issue's block also sets `surface.hue: 0`. That knob still follows the
accent's hue. The neutrals' hue only multiplies the surfaces' chroma, which is
now 0, so the page draws the same either way. A theme that later adds a tint
then gets the accent's hue, which is what the knob was built to do. The shadow
hue and chroma follow the neutrals, so shadows are grey too.

**Icons.** The masks the components draw for themselves (`search`, `close`,
`success` and the rest, `Theme.tokens.icon`) become Heroicons' outline set,
restroked to 2px to match the `icon.stroke` knob. `packages/mixins/icons.json`
names them, and `pnpm icons` writes them, as it wrote Lucide's before. Heroicons
is MIT (Refactoring UI Inc), and the generated file credits it with the
license's URL, as it credited Lucide. The script gains a `stroke` option for
this, so a pack's own width is redrawn when it is generated, not at runtime.

The names were already typed. `IconName` is the union the generated file
writes, `Icons.tokens` refuses a pack that is missing one, and `Theme.ref`
refuses an unknown name. A typed `Icons.token.eyeOff` would add nothing.

## Where it is installed

Nowhere new. Each knob's `unset` variables are part of `Theme.standard`, and
`Theme.root` declares them on every page that has a theme. The masks are
tokens of `Theme.tokens`, in `foldkit-mixins/theme`. So the default icons cost
no import of `foldkit-mixins-ui`, and the bundle question #241 raises does not
come up: an application gets them without importing `Icons.tokens`.

`AppStyle.make`'s `theme` becomes optional and defaults to `Theme.make({})`.
An application on the default writes `AppStyle.make({})`. It does not copy a
block of knobs.

## How an application keeps or overrides it

- A knob a theme sets keeps its value. Only the unset knobs move.
- `Theme.make({ accent: { hue: 150 } })` changes the accent and keeps the rest
  of the default.
- To keep the previous look, set the old values. The changelog prints them as
  one `Theme.make` block. `/create` offers the same look as its Iris preset.
- To draw another icon pack, pass `tokens: Icons.tokens(pack, { width })`, as
  before. To keep Lucide, pass the Lucide pack this way.

## What changes visually

- The accent is a vivid blue (235°) instead of violet.
- The page is pure white, and pure greys at 24.5% in the dark. Its surface
  steps sit further apart, so cards, fields and hovers read clearly against
  the page.
- Corners are tighter, at 0.45 of the scale, and spacing is roomier (1.1).
- Headings are bolder (700), tighter and larger (1.2). Body text is a little
  larger (1.025), with a little more leading. Type grows with the viewport.
- Nothing casts a shadow at rest. Menus and popovers are inverted (dark on a
  light page), and transitions run in half the time, on a spring.
- The seven color scales are slightly more vivid.
- The components' own icons are Heroicons.

## Website and demos

- **Component pages and `/create`.** The theme the previews declare is the new
  default, `Theme.make({})`. `/create` starts there, and its first preset is
  "Default". Iris, the old starting point, stays as a preset. It now pins every
  knob it used to inherit, so it and every preset built on it look as they did.
  Cobalt, the preset this theme began as, is now the default made rounder,
  on a quieter page, in Geist. The shipped icon pack on `/create` is
  Heroicons at 2px, so it prints no `Icons.tokens` line for that pack, and
  the code it hands out for the default theme is `AppStyle.make({})`.
- **`/create`'s address** keeps a light half bare when the theme leaves its
  knob unset, so a dark half that follows the light one (the accent's chroma)
  keeps following. A dark half after a bare light one is no longer dropped.
- **The site's own chrome** keeps its monochrome colors: a black accent, and a
  white and near-black page. Those colors are the site's brand, not the
  components' theme. Every other knob of the chrome (type, spacing, motion)
  now comes from the default.
- **Every demo and example** removes the knob values it set for color or
  taste, so it shows the default. It keeps its `colorScheme`, where it draws
  only one scheme, and its own tokens (Snake's board, Pixel Art's forge,
  Chirp's like, todo-app's card radius). The demos that already took
  `demoStyle` (`Theme.make({})`) follow without any change.

## Contrast

`packages/mixins/test/defaultTheme.browser.test.ts` resolves the default
palette in both schemes and measures it through a canvas, in sRGB. It checks
WCAG AA (4.5:1) for these pairs:

- body text and muted text, on the page and on the muted surface;
- link text on the page;
- the accent's ink on both surfaces.

CI runs the browser tests, so a change to a default that breaks AA fails
there.

Two derivations failed it, and were changed:

- `text.link` was the accent made lighter (2.9:1 on white). It is now the
  accent's ink.
- The ink's light-scheme lightness moves from 0.5 to 0.45. At 0.5 it read
  4.1:1 on the muted surface, which the higher contrast darkens.

A label on the accent's fill read 3.9:1 while the browser clipped the
accent. Fitted into sRGB (below), the light accent is darker as painted, and
the label reads 4.5:1. The test still holds it at 3:1, AA for large text and
for a control's edge, since 4.5 has no margin.

## Gamut

The default accent, `oklch(0.55 0.225 235)`, and its ink,
`oklch(0.45 0.225 235)`, lie outside sRGB: at hue 235 a screen shows at most
0.12 and 0.095 of chroma at those lightnesses. A browser clips such a color
channel by channel, and the ink painted at `rgb(0 91 189)`, hue 257, not the
235 the knob names. The contrast test measured that clipped color, not the
one the theme describes.

The palette now maps every color it derives into sRGB the way CSS Color 4
does: lightness and hue stay, and chroma is reduced until the color fits. The
knob values stay as they are. A theme still says `chroma: 0.225`, and the
palette shows as much of it as sRGB holds at each color's lightness and hue.

**Where it happens.** Every palette color is a CSS expression over knob
variables, and the browser derives it, so the reduction is CSS too: `fit`
(`packages/mixins/src/theme/gamut.ts`) wraps a color as
`oklch(from <color> l min(c, <bound at l>) h / alpha)`. The bound for a hue is
three numbers: `min(l * s, (1 - l) / (ua + ub * l))`. Below the hue's cusp,
its most vivid color, it is the line from black, which is exact. Above the
cusp it is a curve from the cusp to white with the boundary's own slope at
white. The cusp is Björn Ottosson's, a polynomial refined by one step of
Halley's method. Over the whole wheel the bound keeps within 4% of the most
chroma sRGB holds, except near yellow's cusp, close to white. It never
exceeds sRGB by more than 0.004 of a linear channel, which is less than a
255th once encoded.

**Why the numbers come from JavaScript.** Working the cusp out from a hue in
CSS is possible, with `cos()`, `pow()` and registered properties, and was
built first. For the palette's 21 hues it took the default root sheet from
37 KB to 205 KB, most of it the Ottosson step written again for every hue,
since CSS has no functions. Instead, wherever knob variables are written
(`Theme.variables`, so `Theme.standard`, `Themes.make`, `Theme.scope` and
`chooseKnobs`), `boundaryVariables` works out each hue the palette derives
from them and writes its bound beside the knobs (`--fk-knob-gamut-accent-s`,
and so on). It evaluates the palette's own hue expressions rather than
repeating them. The sheet is then 89 KB (9 KB compressed), most of the growth
being the `min()` each fitted color carries.

**Why that is still sound.** A knob can be changed where no JavaScript sees
it: `Theme.scoped` with a raw value, or a rule of the application's own. So
each hue's bound also records the hue it was worked out for, and the
palette's `gamut` tokens compare that hue with the one the browser derives.
Where they differ, the color takes a bound that holds at every hue (`anyHue`,
chroma 0.169 per unit of lightness below the cusp). Such a color is duller
than it needs to be, but it is never outside sRGB. The three values a color
reads are registered with `@property` as numbers (`Theme.root` writes the
rules). Each is then a number worked out once at the root, rather than an
expression substituted into every color that reads it.

**Mixes.** A mix of two colors inside sRGB is not always inside it. The
boundary above the cusp sags inward, so a vivid color mixed toward white in
OKLab bent out by 0.06. The tints (`subtle`) and washes are fitted too, on
the hue of the color they tint.

**What moved.** At the default (235), light scheme:

| Token | Was (clipped as painted) | Now |
| --- | --- | --- |
| `accent-default` | `oklch(0.55 0.225 235)`, `rgb(0 124 223)` | `oklch(0.55 0.117 235)`, `rgb(0 123 171)` |
| `accent-ink`, `text-link` | `oklch(0.45 0.225 235)`, `rgb(0 91 189)` | `oklch(0.45 0.095 235)`, `rgb(0 93 130)` |
| `accent-on-fill` | `oklch(0.98 0.08 235)` | `oklch(0.98 0.011 235)` |
| `surface-base` | `oklch(1 0 235)` | unchanged |

In the dark scheme the accent moves from `oklch(0.7 0.255 235)` to
`oklch(0.7 0.148 235)`, and the ink from `oklch(0.8 0.255 235)` to
`oklch(0.8 0.118 235)`. So the default accent is a deeper, less saturated
cyan-blue rather than the vivid azure that clipping showed. That azure was
hue 257, not 235. The secondary and tertiary families turn the accent's
knobs, not the fitted accent, so each keeps what its own hue can show.

Contrast, before and after: the ink on the page went from 6.50 to 7.27 (light)
and from 8.82 to 8.92 (dark), and on the muted surface from 5.11 to 5.72 and
from 10.06 to 10.17. A label on the accent went from 3.86 to 4.50 (light) and
from 8.23 to 7.88 (dark). Every pair the test checks stays at AA.

## Deferred

- **Scaffold templates** (`create-foldkit-app`). Another session owns the
  scaffolder now. A template that writes `Theme.make({})` or
  `AppStyle.make({})` follows without any change. One that sets knobs should
  drop them in a follow-up.
- **#228's reference app** does not exist yet. Built on `AppStyle.make({})`,
  it starts on the default.
- **The skill's "pick the look for me"** now points at the default. A preset
  catalog shipped from the package, rather than from the site, is not part of
  this issue.
