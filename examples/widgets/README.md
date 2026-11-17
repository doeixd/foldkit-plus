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

- `src/toolbar/` — formatting toolbar: `foldkit-mixins-ui`'s `Toolbar` over a
  placed `RovingTabindex` (the Model keeps the one tab stop) + pressed state
  (`PressedTool`).
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
  listens on the wrap. The card's border box overlaps the trigger on the side
  it opened, so the pointer can cross the gap. Intent delays stay upstream's `HoverIntent`.
- `src/menubar/` — File/Edit/View over roving triggers with one popup:
  Collection + `RovingTabindex` + `ListNavigation` + single Selection. Click
  toggles a menu. The popup sits under the open trigger. Reopening keeps the chosen
  item `aria-selected`.
- `src/navigation-menu/` — hover opens a section; a click after that hover
  stays open, and a second click closes it. Collection + `ListNavigation` +
  single Selection under `Overlay.nonModal`. The popup sits under the trigger
  and overlaps it on the side it opened, the same way the hover card does.
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
- `src/picker/` — a sort order chosen with `foldkit-mixins-ui`'s `Picker`:
  a Listbox dropping its options down on a desktop, and below the theme's
  `md` breakpoint an opener showing them in a bottom Sheet. One Model and one
  `Chose` either way; the order is the island's, an unlisted one ignored.
- `src/search-field/` — `foldkit-mixins-ui`'s `SearchField` placed twice with `Bundle.make`: a
  native search input and a clear button drawn while there is text, Escape clearing a field that
  has text and passing an empty one on, and ArrowDown, the application's own key, opening
  results through the field's `routes`. Typing in one leaves the other alone. Clearing answers
  `SearchField.Focus`, since the pressed button takes its focus with it. `demo.ts` holds the
  placements.
- `src/window-list/` — a thousand names in `foldkit-mixins-ui`'s
  `WindowList`, which scrolls with the page: only the rows in view are drawn,
  between spacers as tall as the rest, under a heading that sticks to the
  window's top. A form above it goes to a row by its number: submitting returns `WindowList.reveal`
  from `update`, which centres the row however far away it is. The names are `findable`, so the
  browser's find-in-page matches a row that is not drawn and the list brings it into view, and a name
  that holds focus stays drawn while the page scrolls away. Last on the page, which it makes long.

These sections load their code when they near the window (`src/lazy.ts`), each from its folder's
`island.ts`, and run the capabilities of the newer widgets:

- `src/file-input/` — a resume form whose attachments the application owns. `FileInput` writes the
  list back into the native input after every pick and removal (`FileInput.Sync`), so the form submits
  exactly the rows listed, even after a repeat pick or a cancelled dialog. Removing a row from the
  keyboard moves focus to the file input (`FileInput.Focus`) instead of dropping it to the page.
- `src/file-upload/` — an application form with a drop zone and a list, no transport. `FileUpload` judges each
  file (PDFs and images, five at most, 2 MB each), names a refusal by file, and writes the local files back into the
  input, so a native submit sends exactly the rows, dropped files included. Removing a row moves focus to the next
  row's button, then the previous, then the input.
- `src/tags-input/` — a topics form where the application folds `TagsInput`'s Messages into its
  Model. Enter and the comma add tags without submitting; the arrow keys, Home and End walk the chips,
  and Delete or Backspace removes one. A draft left in the input is added when focus leaves it
  (`addOnBlur`). One hidden input per tag submits the chips and never the draft.
- `src/app-keys/` — a Command and a Menubar take keys of the application's through `routes`: Escape
  empties the Command's field, End moves its highlight to the last row the query leaves, and PageDown
  on the bar moves the bar's tab stop to its last menu, while the widgets' own arrows and Enter still
  work. A route on a key the widget owns is refused when the view is drawn, with `mixins:key-conflict`
  naming both routes; the section draws two refusals as text.
- `src/menu-rows/` — a shipped `Menu` with rows that carry a `value`, an icon and a hint. Two rows read
  "Copy"; the Model stores the value the Menu reports (`copy-text`, `copy-link`), so the second Copy's
  pick is `copy-link`.
- `src/choices/` — a single-choice `Segmented` (a radio group: one tab stop, arrows move choice and focus)
  beside a `multiple` one, and a `Slider` with `description` and `onCommit` that keeps the live value
  apart from the committed one.
- `src/table/` — a roster in `Table` whose Model owns the sort and each member's standing. The name is
  the row's heading (`th scope="row"`), the Name and Role headings sort, and the last column's cell is
  markup, a `Button` that sends a Message.
- `src/sheet/` — a bottom `Sheet` that rests at 30, 60 or 100% of its panel. The handle is a focusable
  separator: the arrows, Home and End move between points, and Escape closes the sheet and returns focus
  to the opener. A drag lets go on the nearest point, a quick flick goes on to the next, and a long
  drag down closes it.
- `src/focus-kept/` — two lists the demo owns, one of Alerts and one of Cards, mark their dismiss
  buttons with `recoveryPart` and attach `FocusRecovery.behavior`: a keyboard dismissal hands focus to
  the next row's button, else the previous, else the list's Add button, and the lists recover apart. A
  Toast stack with `Toast.keepFocus` takes no focus when a toast arrives or leaves.
- `src/tour/` — a `Tour` and a `FloatingPanel` opened by buttons of the page's, each drawn with
  `focusReturn` and no `opener`: when either ends, focus goes back to the control that had it.

Only the toolbar and the window list boot with the page, so the first load stays small
(`test/bundle.test.ts`); every other section is a lazy entry in `src/lazy.ts`. Without an
`IntersectionObserver` (jsdom) the entry loads them all at once.

Each folder holds `app.ts` (Model, Message, update) and `view.ts` (the
SlotView and its `runDemo`). The toolbar's trace lives in `demo.ts`; the search field's
Model and update are in `child.ts` and its page in `demo.ts`, because the Bundle that places
its view is `app.ts`. `test/`
pins each widget with a mutation spec beside it. Absent values in these
models are `Option`. `src/style.ts` is `AppStyle.make` of the design-system
palette: one `Style.forSlots` per widget, state visuals read from the ARIA
the behaviors already write (`Style.states(..., 'aria-pressed')`). Island
slots are each widget's own anatomy, so they do not reuse `Recipes.Button`;
the picker and the window list are `foldkit-mixins-ui` components, drawn with
its recipes (`Recipes.Picker`, `Recipes.Listbox`, `Recipes.Sheet`).
`src/entry.ts` installs `pageStylesheet`. `test/style.test.ts` pins the sheet.

Adding a widget means adding one entry to `src/lazy.ts` (plus its folder, whose `island.ts`
exports the section's `runDemo`, `style` and `mount`, and its tests): the demo trace, the page
sections, the style sheet and the interactive boot all derive from that registry. Each `mount`
closure keeps its own Model and Message types; the registries only read `id`, `title`, `runDemo`,
`style`, and `mount`. A browser claim gets a `*.browser.test.ts` and, for the page, an
`e2e/<section>.e2e.ts` built on `e2e/harness.ts`, which scrolls a lazy section into view.
