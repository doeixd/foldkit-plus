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
  that re-derives the accent live, plus a light/dark switch.
- **Buttons** — the shadcn mapping (`primary` = Default, `neutral` solid =
  Secondary, `neutral` outline/ghost, `danger` = Destructive), sizes and
  disabled, all live `@foldkit/ui` buttons through `Button.view`.
- **Form** — `Input`, `Textarea`, and `InputGroup` recipes, live `Checkbox`
  and `Switch`, a `Fieldset` with a live `RadioGroup`, and a `FileDrop` zone
  that lists what it catches.
- **Choice** — a native `Select`, a `Disclosure`, a live `Slider`, a `Listbox`,
  and a filtering `ComboBox`, each through its slot contract.
- **Menu** — grouped row actions with a disabled item; the choice reports back.
- **Feedback** — `Badge` tones, a live modal `Dialog` (focus trap, Escape,
  backdrop), and `Toast` entries that dismiss themselves.
- **Overlays** — an anchored `Popover`, a `Tooltip`, and an `HoverIntent` card
  positioned by the `Anchor` behavior; all show on hover/focus and dismiss on
  leave, blur, or Escape.
- **Navigation** — live `Tabs` (`line` and `pill`) with arrow-key movement and
  per-tab panels, plus a `Segmented` plan picker, all driven by the Model.
- **Date** — a `Calendar` month-grid preview plus a live `DatePicker` that
  writes the due date.
- **Utilities** — `Icons` + `Touch` mechanisms and the `Patterns`
  accessibility catalog every adapter is gated against.
- **Card** — a shadcn-style card composed from page slots and the Button
  recipe.

The mapping the demo teaches: shadcn's look lives in the theme knobs (low
`surfaceSaturation`, a larger `radius-factor`) and in which recipe selection
each intent takes — no forked CSS.
