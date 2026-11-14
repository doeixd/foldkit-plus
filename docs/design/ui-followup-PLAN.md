# UI follow-up plan

What is left after the UI SDK work on `ui-sdk-work` (2026-11-14). The sources
are the ledger (`ui-sdk-audit-LEDGER.md`), the review of that work
(`ui-sdk-review-FINDINGS.md`) and the catalog review
(`ui-catalog-review-FINDINGS.md`). Each item says what to build and where; none
waits on a consumer. Items marked *lead* came from reading source and need a
failing test before any change.

## 1. Conformance, run rather than declared

- **One rendered suite per APG pattern.** A table-driven browser suite (keys,
  names, relationships, disabled items, both directions) run over listbox,
  tree, dialog and tabs, then the rest of the catalog. The catalog gate proves
  who is named as a provider; this proves the provider works.
- **Keyboard browser tests still missing** for popover, date picker, select,
  hover card, the combobox key map, checkbox, input, file drop, calendar grid
  keys, radio group, segmented and the non-drag switch.
- **Server markup round trips** (render to a string, parse back) for table,
  tree, nav, pagination, breadcrumb, accordion, tabs, picker, menu, listbox,
  combobox, dialog and toast.
- **A recipe state matrix.** For each recipe, computed style over variant ×
  (hover, focus-visible, disabled, `aria-disabled`, invalid, read-only,
  checked, open, leaving). The `filled` field's lost invalid border was this
  class of defect.
- **Forced colors.** No recipe handles `forced-colors`. One shared piece for
  indicator-style elements (switch, slider fill, tabs and nav indicators,
  steps markers, progress, carousel dots, the resizable line).

## 2. Widgets: verified gaps not yet built

- **Table**: a cell is a string only, there is no row header
  (`th scope="row"`), and the expansion header cell has no name.
- **Checkbox, Switch, RadioGroup**: no invalid state or recipe rule.
- **Slider**: no commit callback apart from `onChange`, no description.
- **Segmented**: `role=group` of pressed buttons for a one-of-many choice, no
  arrow keys, no group-level `disabled` or `name`.
- **RadioGroup**: keys follow one axis; the APG treats both as equivalent.
- **TagsInput**: two key handlers on one input, no add-on-blur, no `name`, no
  arrow movement between chips, hard-coded "Remove" words, a hand-written
  focus Command where `FocusRecovery` fits.
- **Rating**: its Home/End handling is a hand-written keydown Mount.
- **Sheet**: partial snap points cannot be reached by keyboard or assistive
  technology (the handle is hidden from it).
- **Menu and Menubar**: rows are identified by their label, so two rows with
  one label cannot be told apart; a row has no icon or value. A Menu cannot
  be portaled at all.
- **Sidebar**: tooltips are keyed by the rows given to `init`; a row missing
  there silently draws none.
- **Marquee**: copies after the first repeat an item's id.
- **Recipes**: the Resizable handle's focus ring is its hover look; Badge and
  Carousel dots use literal sizes that skip the density tokens.
- **Tree**: an independent (non-cascading) check mode, and branches whose rows
  are not loaded yet.
- **HoverCard**: Escape while only the pointer rests on it (WCAG 1.4.13); no
  leave animation (upstream's HoverIntent has no leave state).
- **CascadeSelect**: no exit animation.
- **InlineEdit**: "nothing typed yet" is judged by `draft === initial`; keys
  typed before the field is drawn that spell the original value are then
  replaced by the next key.

## 3. One shape across siblings

- **A field options spine.** `id` (the control's id), `name`, `form`,
  `required`, `readOnly`, `invalid`, `disabled`, `autocomplete`, `attributes`,
  applied to every form control, wired to `Behaviors.FieldAssociation`, which
  no widget uses. Today `id` is the control id in some and a prefix in
  others, and the change callback is `onInput`, `onChange`, `onPress`,
  `onToggle` or `onMessage`.
- **View options.** `Sheet.view` takes `mixins` only; Toast keeps `direction`
  in its Model where others take it as an option; `Menubar.menuMixins` is
  required; `page` is 1-based in Pagination and 0-based in Carousel and Steps.
- **Direction.** Three mechanisms read right to left: a `direction` option, a
  `readingKey()` call, and the `ReadingKeys` Mount. One, on by default where
  the widget already reads `direction`.
- **`null` for absence.** `RovingTabindex`, `GridNavigation` and
  `ListNavigation` keep `current` as `Schema.NullOr`; the newer primitives use
  `Option`.
- **Named key routes.** Hand-written keydown switches remain in menubar,
  cascade select, tour, floating panel, picker, toast, nav and tabs (Delete),
  so an application cannot add a key there without a conflict. Command,
  SearchField and the splitter already use `Behaviors.Keyboard`.
- **Focus return.** Tour, floating panel, picker and menubar each focus their
  opener by id and silently leave focus on the body when it is gone. One
  shared helper with the Dialog's fallback rule.
- **`Attr` tokens** for `name`, `required`, `readonly` and `id`, so a Mixin
  can be refused from writing them.
- **A layer scale in the theme tokens**, read by the popup, popover, hover
  card, drawer, floating panel and toast recipes in place of literals.
- **`BundleBehavior.fromBundle`** cannot declare `supplies`, so a
  bundle-backed Behavior cannot name the obligations it provides.

## 4. Widgets the catalog lacks

SearchField shipped. Still missing beside upstream: a date input and a time
input with editable segments, typed entry for the date picker, a trigger menu
(mention and slash commands) on Command and ListNavigation, a file-picker
button apart from the drop zone, a token input, Toolbar as a catalog member
(it exists as an example), and a timeline and gauge.

## 5. Families not yet compared with upstream

Move, resize and gestures; announcements and shortcuts; undo and change
observation. Each needs the comparison the other families had: source and
tests side by side, then browser scenarios, then the gaps built.

## 6. Waiting on upstream

- `@foldkit/ui` VirtualList needs a way to draw a row outside its slice
  before it can keep the focused row; `virtualListFocus.browser.test.ts` has
  the `test.fails` that goes red when it can.
- Foldkit's `closeDialog` refocuses the opener only if it is still connected;
  our `focusFallback` covers it from outside.

## 7. Smaller leads

- Escape pressed in a popup inside a FloatingPanel or Tour may also reach the
  panel's own Escape handler.
- Tour's blocker stops presses but Tab reaches the page behind it.
- Toast has no shortcut to reach the stack.
- Command's `aria-expanded` is constant.
- A pointer-kind fact from `Sec-CH-UA-Mobile`; one shared `visualViewport`
  listener; a drag preview and edge scrolling for `PointerDrag` used without
  upstream's DragAndDrop; accent folding and filter modes in `Typeahead`.
