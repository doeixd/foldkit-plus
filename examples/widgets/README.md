# Widget showcase (`foldkit-example-widgets`)

Thin composed widgets over the shared primitives — each one a Bundle
placement plus Behaviors on a shared Collection description, no bespoke
state machines. Proves the Phase 7 claim: once the capabilities exist, a
family of widgets gets cheap.

**Try it:** published at
[foldkit-widgets-demo.pages.dev](https://foldkit-widgets-demo.pages.dev/),
as static files; every island boots in the page.

## Run it

```bash
pnpm --filter foldkit-example-widgets demo   # headless trace of every widget
pnpm --filter foldkit-example-widgets dev     # interactive page (Vite)
pnpm --filter foldkit-example-widgets build   # static files, to dist/
pnpm --filter foldkit-example-widgets typecheck
npx vitest run examples/widgets
```

## Widgets

- `src/toolbar/` — formatting toolbar: `RovingTabindex` + Collection +
  pressed state (`PressedTool`).
- `src/toggle/` — a single pressable with `aria-pressed` (`ToggleState`).
- `src/toggle-group/` — exclusive pressables over `Selection` single mode.
  The selected value is an `Option`.
- `src/accordion/` — stacked `Disclosure` sections over a Collection. A shut
  panel stays mounted and `hidden`.
- `src/alert-dialog/` — explicit-response dialog over an Overlay policy
  (modal focus, scroll lock, inertness; no outside/Escape dismiss).
- `src/autocomplete/` — input + filtered popup: Collection + ListNavigation
  (`typeahead: false`, `commit`) + single Selection + FieldAssociation under
  `Overlay.nonModal`. Enter commits the current item from the field. The
  listbox id is the string the field's `aria-controls` names.
- `src/number-field/` — stepped value via `SpinValue` + `FieldAssociation`.
- `src/otp-field/` — six cells over `RovingTabindex` + Collection. A filled
  cell advances with an `AdvanceFocus` Command. Backspace in an empty cell
  clears the previous one. Cell ids come from one helper.
- `src/checkbox-group/` — multi-select options with label association.
- `src/meter/` — stateless value/max attributes (the trivial end).
- `src/progress/` — native determinate bar plus the valueless indeterminate.
- `src/command/` — filterable list: Collection + a filter of the Model +
  `ListNavigation` + `Selection`. Enter on the field activates the current item.
- `src/context-menu/` — file menu: Collection + `ListNavigation` + single
  Selection under `Overlay.nonModal`. A right-click records the point with
  `OnPointerDown` (button 2), because `OnContextMenu` carries no coordinates,
  and `placeAtTrigger`'s `at` opens the menu there. The keyboard has no point,
  so that menu opens under the row. The popup is keyed by the open file,
  because a Mount reads its args once.
- `src/hover-card/` — informational popup on hover or focus. A click after
  the pointer opened it stays open; a second click closes it. Pointer leave
  listens on the wrap. The card's border box overlaps the trigger, so the
  pointer can cross the gap. Intent delays stay upstream's `HoverIntent`.
- `src/menubar/` — File/Edit/View over roving triggers with one popup:
  Collection + `RovingTabindex` + `ListNavigation` + single Selection. Click
  toggles a menu. The popup sits under the open trigger. Reopening keeps the chosen
  item `aria-selected`.
- `src/navigation-menu/` — hover opens a section; a click after that hover
  stays open, and a second click closes it. Collection + `ListNavigation` +
  single Selection under `Overlay.nonModal`. The popup sits under the trigger
  and overlaps it the same way the hover card does.
- `src/native-select/` — native dropdown: value + change, unlisted values
  refused with the Model untouched.
- `src/sidebar/` — collapsible docs rail: a root Disclosure around section
  Disclosures over a Collection. A shut section stays mounted while the rail
  is open. Collapsing the rail unmounts the nav.
- `src/resizable/` — file split: `Resize`-measured container with a `Move`
  separator, arrows, and a clamped share. The handle stays an example; it is
  not a package behavior.
- `src/palette/` — command palette: the command island's query, list, and
  pick under `Overlay.modal`. Enter runs the highlighted command through
  `update`.

Each folder holds `app.ts` (Model, Message, update) and `view.ts` (the
SlotView and its `runDemo`). The toolbar's trace lives in `demo.ts`. `test/`
pins each widget with a mutation spec beside it. Absent values in these
models are `Option`. `src/style.ts` is `AppStyle.make` of the design-system
palette: one `Style.forSlots` per widget, state visuals read from the ARIA
the behaviors already write (`Style.states(..., 'aria-pressed')`). Island
slots are each widget's own anatomy, so they do not reuse `Recipes.Button`.
`src/entry.ts` installs `pageStylesheet`. `test/style.test.ts` pins the sheet.

Adding a widget means adding one entry to `src/widgets.ts` (plus its folder
and tests): the entry's demo trace, the page sections, the style sheet, and
the interactive boot all derive from that registry. Each `mount` closure
keeps its own Model and Message types; the list only reads `id`, `title`,
`runDemo`, `style`, and `mount`.
