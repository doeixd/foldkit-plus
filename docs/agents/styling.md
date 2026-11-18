Read when: styling anything: a Style, a Theme, a token, a layer, a recipe or a stylesheet.

## Styling, themes, and tokens

The styling system is one pipeline; learn it in order before styling anything:

```text
tokens -> ref -> pieces -> slots -> sheet
```

**Tokens are the only values.** `Theme.tokens` (`packages/mixins/src/theme/tokens.ts`)
is the shipped scales (space, radius, size, leading, weight, motion, width,
`icon` (the masks of the components' own icons), border, shadow, breakpoint, and `safe`, the screen's safe-area insets); the palette derives
every color from knobs; `Theme.standard(Theme.make({ … }))` is both, with a theme's knob values.
Read every value through `Theme.ref` — a group or
name the theme lacks is a type error, and it reads names, never values, so a
test or probe sees `var(--fk-…)` rather than a color. Never copy a literal out
of a theme into a style; add or override a token instead.

**Knobs are typed values.** A theme is `Theme.make({ shape: { density: 1.1 } })`, checked
against `Knobs.standard`; each knob writes variables of the `knob` group (`density`,
`radius-factor`, `motion`, `shadow-strength`, `accent-h`, …), and the scales derive from them: space multiplies by
density, radius by radius-factor, durations by motion (`motion: '0'` stills
every recipe transition). A duration of something that moves or resizes also
multiplies by `travel`, which the reset zeroes under reduced motion so fades
stay: write it so, or a transform keeps sliding for a user who asked it not
to. A still/compact/rounder theme is one `Theme.make`, installed by name with
`Themes.make` (the Model selects it) — never a second set of sizes, and never a
knob string in `Theme.define({ knob })`.

**Install order is the cascade.** `Layers.standard` is
`reset, tokens, theme, defaults, components, layouts, variants, utilities, app`
(`packages/mixins/src/layers.ts`). The canonical sheet (`examples/todo-app/src/sheet.ts`):

```ts
Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('theme', Theme.root(theme)),
  L.in('defaults', Defaults.body),
  ...slotStyles,
)
```

`theme` is `Theme.standard` of the app's theme, composed with its own tokens. `Theme.root` is
unlayered, so place it with `L.in`. Do not split it with `omit: Theme.tokens`: `omit` matches by
name, and `Theme.tokens` names knobs too, so a theme's own `density` would be dropped. `Style.stylesheet` refuses an unlayered rule — it would beat `app`. A
page without `Theme.root` has no tokens: pieces that must stand alone (see
`prose.ts`) read `var(--fk-x, <fallback>)`. The `missingTokens` gate
(`packages/mixins/src/testing.ts`) lists the `var(--fk-…)` reads with no
fallback that nothing defines: such a read makes its declaration invalid,
while one with a fallback stands without the sheet.

**Pieces: `self` is normal, `inline` is the escape hatch.**
`Style.self` emits a rule on a generated class, so `Layers.in` can place it and
a later layer can override it. `Style.inline` sits outside every layer and
beats everything including `app` — use it only for values no theme may touch
(a measured pixel offset, a `display` the behavior requires). `Style.compose`
concatenates classes; later inline declarations win per property, while rules
cascade by layer. `component(...)`/`variant(...)` (`packages/mixins-ui/src/recipes/design.ts`)
are just `compose` placed in `components`/`variants`: bases in components,
selections in variants, so a selection beats its base and the application's
`app` layer beats both. `Style.class('name')` is a named class for targeted
overrides; `Style.global` is raw CSS (keyframes, `@layer` declarations).

**Recipes select, applications extend.** `Style.recipeFor(Slots)` rejects an
unknown slot at definition time, like `forSlots` does. A selection picks per
axis with `defaults` filling the rest; `null` unsets a defaulted axis. Adjust a
shipped recipe with `.extend`, never by forking it. `Style.forCapability` is
one piece for every slot a capability fits. State the DOM already knows is
`Style.states(map, attribute)` (`&[aria-pressed="true"]`); state only the view
knows is `Style.whenInput(predicate, piece)`. Do not use one for the other's job.

**Subpaths are unlayered on purpose.** `utilities`, `layout`, `prose`, `touch`,
and `icons` pieces (`U.gap('sm')`, `Layout.frame()`, `Prose.style()`) take the
layer of whatever they are composed into, and a plain declaration beside them
wins per property. That is what makes them composable — do not wrap them in
`component`/`variant` at their definition.

**A Style's global rules travel with its compiled classes** (#271).
`Style.usedIn` once wrote only `style-` classes, so `raise`'s `.fk-raised`
depth rules were missing and a server-rendered Card was unstyled until
scripts ran. Each compiled class now registers its Style's globals, and
`usedIn` writes them once each; a Style with globals but no rule of its own
compiles no class, so a server cannot find it in markup. A test that every
class a page draws has a rule in its sheet caught it.

**A state rule in a base loses to a variant that sets the same property.**
The Card's selected fill sat in the `components` layer, and every `surface`
variant sets `background` in `variants`, so a chosen card showed no fill;
the unit tests read the CSS text, which held the rule. Put a state's
declaration beside each variant that sets its property, and check it with
computed style in a browser test.

**`Defaults.reset` zeroes margins.** Any dialog/panel relying on the user
agent's `margin: auto` centering must restore it (`margin: 'auto'`), or it
lands in the top corner.

**A rule's declarations are sorted, so a shorthand beside a longhand can
win.** The stylesheet writes each rule's declarations alphabetically
(`styleRules.ts`), not as authored: the Sheet's `borderWidth: '0'` beside
`borderLeftWidth` landed after it and took the border away. In one rule,
write either the shorthand or the longhands, never both.

**A shorthand in a state rule resets the longhands a base rule set.** The
solid Button clipped its fill to the padding box at rest, but its hover and
held rules wrote `background`, which reset `background-clip` to `border-box`,
so the press never stood 1px in; its test read the clip only at rest, and
went red on CI only when a stray pointer hovered the button. Where a base
sets a longhand, its states write longhands too (`backgroundColor`), and a
test reads the longhand in every state.

