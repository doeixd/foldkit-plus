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
- `src/accordion/` — stacked `Disclosure` sections over a Collection.
- `src/alert-dialog/` — explicit-response dialog over an Overlay policy
  (modal focus, scroll lock, inertness; no outside/Escape dismiss).
- `src/autocomplete/` — input + filtered popup: Collection + ListNavigation
  + single Selection + FieldAssociation under `Overlay.nonModal`.
- `src/number-field/` — stepped value via `SpinValue` + `FieldAssociation`.
- `src/otp-field/` — six cells over `RovingTabindex` + Collection; Backspace
  in an empty cell clears the previous one (no auto-advance on type: no
  input-event builder carries a focus selector).
- `src/checkbox-group/` — multi-select options with label association.
- `src/meter/` — stateless value/max attributes (the trivial end).
- `src/progress/` — native determinate bar plus the valueless indeterminate.
- `src/command/` — filterable list: Collection + `Filter.text` +
  `ListNavigation` + `Selection`.
- `src/context-menu/` — right-click file menu: `OnContextMenu` trigger +
  Collection + `ListNavigation` + single Selection under `Overlay.nonModal`.
  Statically placed: pointer-exact positioning stays open (the `Anchor`
  Mount burns ~35s under jsdom's zero geometry, portal or not).
- `src/hover-card/` — informational popup on hover/focus: immediate open,
  no intent delays (those stay upstream's `HoverIntent`).
- `src/menubar/` — File/Edit/View over roving triggers with one popup:
  Collection + `RovingTabindex` + `ListNavigation` + single Selection.
- `src/navigation-menu/` — hover-to-open sections with click toggle:
  Collection + `ListNavigation` + single Selection under `Overlay.nonModal`.
- `src/native-select/` — native dropdown: value + change, unlisted values
  refused with the Model untouched.
- `src/sidebar/` — collapsible docs rail: root Disclosure around section
  Disclosures over a Collection, links for bodies.
- `src/resizable/` — file split: `Resize`-measured container with a `Move`
  separator, arrows, and a clamped share.
- `src/palette/` — command palette: the command island's query/list/pick
  under `Overlay.modal`, running the chosen command through `update`.

Each folder holds `app.ts` (Model/Message/update), `view.ts` (SlotView),
`demo.ts` (headless trace `main.ts` prints); `test/` pins each widget with
a mutation spec beside it. `src/style.ts` holds the showcase's look — one
`Style.forSlots` per widget, state visuals read from the ARIA the behaviors
already write (`Style.states(..., 'aria-pressed')`), installed by
`src/entry.ts`; `test/style.test.ts` pins the sheet.

Adding a widget means adding one entry to `src/widgets.ts` (plus its folder
and tests): the entry's demo trace, the page sections, the style sheet, and
the interactive boot all derive from that registry. Each `mount` closure
keeps its own Model and Message types; the list only reads `id`, `title`,
`runDemo`, `style`, and `mount`.
