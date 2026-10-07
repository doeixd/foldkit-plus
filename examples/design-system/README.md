# Design system demo

An interactive showcase of the `foldkit-mixins` + `foldkit-mixins-ui` design
system, styled to read like [shadcn](https://ui.shadcn.com/): near-zinc
surfaces, hairline borders, `0.625rem` cards, black primary buttons, and a red
destructive tone.

```bash
pnpm --filter foldkit-example-design-system dev
```

What it shows:

- **Colors** — every `Theme.oklch` token family as swatches, with a hue picker
  that re-derives the accent live by overriding `--fk-knob-accent-h`, plus a
  light/dark switch via `color-scheme`.
- **Buttons** — the shadcn mapping (`primary` = Default, `neutral` solid =
  Secondary, `neutral` outline/ghost, `danger` = Destructive), sizes, icon,
  and disabled, all live `@foldkit/ui` buttons through `Button.view`.
- **Form** — `Input`, `Textarea`, and `InputGroup` recipes, plus live
  `Checkbox` and `Switch`, wired to the Model.
- **Choice** — a native `Select`, a `Disclosure`, a `Fieldset` of radio pills,
  and a live `Slider` (drag, arrow keys, Escape restores), each through its
  slot contract.
- **Feedback** — `Badge` tones and a `Dialog` panel drawn in place.
- **Overlays** — `Popover` (real open state), `Tooltip`, and `HoverIntent`
  panels drawn in place.
- **Navigation** — `Tabs` (`line` and `pill`) and `Segmented`, driven by the
  application's own tab state rather than a Submodel.
- **Calendar** — a month grid preview with a selected day.
- **Utilities** — the `InputGroup` recipe, `Icons` + `Touch` mechanisms, and
  the `Patterns` accessibility catalog every adapter is gated against.
- **Card** — a shadcn-style card composed from page slots and the Button
  recipe.

The mapping the demo teaches: shadcn's look lives in the theme knobs (low
`surfaceSaturation`, a larger `radius-factor`) and in which recipe selection
each intent takes — no forked CSS.
