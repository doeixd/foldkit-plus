# Design system demo

One theme of a few knobs restyles every control on the page. The demo is a
showcase of the `foldkit-mixins` styling system (tokens, pieces, slots, sheet)
and the `foldkit-mixins-ui` recipes over it, styled to read like
[shadcn](https://ui.shadcn.com/): near-zinc surfaces, hairline borders, black
primary buttons and a red destructive tone.

```bash
pnpm --filter foldkit-example-design-system dev
```

## What to try

Open the **Theme** section at the top.

- Pick **Compact**, **Soft** or **Hard**. Each is a handful of knob values
  (`Theme.make`) installed by name (`Themes.make`); the specimen beside the
  panel, and every section below it, follows. The choice is kept, and another
  open tab of the page takes it up.
- Move a slider (hue, density, radius, text size, motion, shadow). It writes one
  knob over the theme; picking a theme again clears it. Motion at 0 stills every
  transition.
- Switch the colour scheme (System, Light, Dark), also followed by other tabs,
  and the direction (Ltr, Rtl): the arrow keys of a radio group swap with it.
- Tab through the panel: every control is a real radio group or slider, and what
  was applied is announced in a live region.

Further down, **Tokens** lists the space and radius scales read from the theme
(each bar is sized by its own token, so the knobs move it) and **Cascade** shows
four boxes setting one property from the components, variants and app layers and
from `Style.inline`.

## Where the pieces are

| Idea | File |
| --- | --- |
| The themes, as knob values | `src/appStyle.ts` |
| Every recipe selection and Slot style | `src/style.ts` |
| The panel (radio groups, one slider per knob) | `src/studio.ts` |
| Knob tweaks over the theme, as a `:root` rule | `src/tweaks.ts` |
| The Model, Messages and `update` | `src/main.ts` |

The knob ranges, the themes' values and the token names are read from the real
knobs and themes by `scripts/themeData.mjs` into `src/themeData.ts`
(`pnpm --filter foldkit-example-design-system theme-data`), because the browser
build loads no style compiler. `test/themeData.test.ts` fails when the file is
stale. `src/themeRuntime.ts` shows, keeps and hears the theme in the browser for
the same reason, and is to be replaced by the shipped `Themes` runtime once it
can be imported without the compiler.

## What else it shows

Recent catalog widgets are in it too: the plan is a `Segmented` radio group
(arrow keys choose), the notification list in Collections has a `SearchField`
that announces its count and returns focus on clear, Form has a `TagsInput`, and
the Table's first column is a row header.

The rest of the page is the component catalog, each one a live `@foldkit/ui`
component drawn through a shipped recipe: Colors, Buttons, Form, Choice, Menu,
Feedback, Overlays, Navigation, Date, Card, Display, Collections and Utilities.

The mapping the demo teaches: shadcn's look lives in the theme knobs and in
which recipe selection each intent takes, with no forked CSS.

## Tests

- `pnpm exec vitest run examples/design-system --project unit` for `update`, the
  generated data, the icons and the size budget.
- `npx vitest run --project browser --fsModuleCache=false examples/design-system/test/components.browser.test.ts`
  for the pickers, menu, toast and date.
- `pnpm e2e` includes `e2e/theme.e2e.ts`, which drives the real page: a theme,
  a knob, the scheme, the direction, another tab, and a 390px phone.
- `pnpm mutate examples/design-system/test/theme.mutations.ts`.
