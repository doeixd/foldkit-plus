# UI findings

Append-only. Add a dated entry at the bottom. Do not rewrite or remove an
earlier entry; if a later pass resolves one, append a note that names it.

Reviewed from source and tests. The widgets page was not driven in a browser
for this pass.

## 2026-10-09 — UI platform plan against the October 7–8 implementation

Scope: `docs/design/ui-DESIGN.md` Phases 0–10, `PLAN.md` "UI platform",
`docs/design/TODO.md` "UI platform", and the work that landed after 2026-10-06
in `packages/mixins-ui`, `examples/widgets`, and `examples/design-system`.
The uncommitted date editor in `packages/data-grid` is included because it
was in the tree during the review.

### Plan tracking is behind the code

1. **`PLAN.md` stops mid-sentence and still says the overlay widgets are
   waiting.** The UI section ends at the Wave A note, then a fragment about a
   tree ("over one shared Collection description… Scene cannot cover it")
   with no subject. Alert dialog, context menu, menubar, navigation menu,
   autocomplete, and hover card are described there as a future wave. They
   shipped the same week (`CHANGELOG.md` "Wave B"), along with OTP, sidebar,
   resizable, native select, command palette, and the Phase 8 vocabulary
   (alert, avatar, breadcrumb, card, empty, item, kbd, label, pagination,
   scroll area, separator, skeleton, spinner, table, typography, button
   group).

2. **`docs/design/TODO.md` contradicts its own checkboxes.** The UI platform
   intro still says "None of the pieces below exists yet" above Phases 0–6
   marked done. Phases 7–10 are unchecked, which now hides the widgets and
   the stateless vocabulary that did land. The later item "Mixins-UI: missing
   adapters and recipes" still lists Menu, Listbox, Combobox, DatePicker,
   Toast, and FileDrop, and asks for Select, Popover, Tooltip, Slider,
   RadioGroup, and Calendar recipes. Those adapters and recipes are in
   `packages/mixins-ui`.

3. **The design's waves and the changelog's waves are different lists.**
   `ui-DESIGN.md` Wave A is Accordion, AlertDialog, CheckboxGroup, Toggle,
   ToggleGroup, Toolbar, Progress, Meter, Separator, HoverCard. The
   changelog's "Wave A" dropped the overlay widgets and Separator, added
   NumberField and Command (both Wave B or Phase 9 in the design), and called
   Progress the completion of Wave A before Progress was even in that first
   commit's set. A reader of the design will restart work the changelog
   already records, or look for Separator inside `examples/widgets` when it
   lives in `packages/mixins-ui`.

4. **`ui-DESIGN.md` still contains `chatgpt-content-reference` markers**
   through the phase list. The implementation treated that file as the
   contract. The markers are leftover generator text, so a quote from the
   design is not always a sentence.

### Widget behaviour the tests do not reach

5. **A click on the navigation menu or the hover card ends closed.**
   `examples/widgets/src/navigation-menu/view.ts` puts `OnMouseEnter`
   (`EnteredSection`, which opens) and `OnClick` (`ToggledSection`, which
   inverts) on the same trigger. `examples/widgets/src/hover-card/view.ts`
   does the same with `Entered` and `Toggled`. A click delivers enter, then
   click. Update opens on the first and inverts on the second, so the gesture
   finishes shut. Keyboard activation of the button fires click without
   mouseenter, so the keyboard path still toggles. The navigation test
   "hovers open, leaves shut, clicks toggle" dispatches those messages on
   their own, and the hover-card demo traces enter and leave only.

6. **Menubar and navigation popups always sit at the left of the bar.**
   In both views the popup is a sibling of the triggers, inside the bar.
   `examples/widgets/src/style.ts` positions that popup `absolute` with
   `left: 0` against the bar (`position: relative`). Opening Edit, View,
   Resources, or Company draws the panel under the first trigger. Navigation
   attaches `Placing.keepWithin`, which only shifts a panel that already
   overflows the viewport (`packages/primitives/src/interaction/placing.ts`);
   it does not move the panel under the active trigger. Menubar does not
   attach it. Context menu is the same shape on purpose (the changelog says
   pointer-exact positioning stays open). The menubar and navigation commits
   describe the popup as overlaying the bar, and the tests only check that
   the menu role exists.

7. **The highlight after a menubar or navigation choice never matches an
   item.** Collection ids are `${menu}/${item}` and `${section}/${link}`
   (`menubar/view.ts` `describeItems`, `navigation-menu/view.ts`
   `describeLinks`). On choose, both apps call
   `Selection.Message.Activated` with the bare item or link
   (`menubar/app.ts`, `navigation-menu/app.ts`). `Selection.behavior` sets
   `aria-selected` by that id (`packages/primitives/src/interaction/selection.ts`).
   `"Copy"` is never `"Edit/Copy"`. Context menu, command, and autocomplete
   use the same string for both, so they highlight.

8. **Command, command palette, and autocomplete cannot be completed from
   the keyboard.** `ListNavigation.behavior` handles arrows and typeahead on
   the list container (`packages/primitives/src/interaction/list-navigation.ts`).
   The search input in `command/view.ts`, `palette/view.ts`, and
   `autocomplete/view.ts` only has `OnInput` (and focus-to-open, on
   autocomplete). Focus stays in the input, so arrows do not move the
   active option. Items in the command and palette lists are `div`s; Enter
   does not activate them. Selection runs on click. The command view comment
   says "keys and clicks choose." The command test checks arrows by sending
   `ListNavigation.Message.Focused` directly, and picking by sending
   `Activated` directly.

9. **Autocomplete `aria-controls` names an id nothing sets.** The input sets
   `aria-controls="fruit-popup"` (`autocomplete/view.ts`). The overlay id
   `'fruit-popup'` is written as `data-foldkit-plus-layer`, not as the
   element's `id` (`dismiss-layer.ts`, `LAYER_ATTRIBUTE`). Collection writes
   ids on the options (the fruit names), not on the listbox.

10. **Accordion and sidebar point `aria-controls` at elements that are not
    in the page while shut, and they reuse the root slot for every section.**
    Both views drop the content node when the section is closed
    (`accordion/view.ts`, `sidebar/view.ts`) while the trigger still names
    `${id}-content`. `Disclosure` keeps its content and sets `hidden`
    (`packages/mixins/src/behaviors/disclosure.ts`). The same views call
    `slots.root.attrs()` on the outer box and again on each section wrapper
    (sidebar also on the `nav`). `accordionStyle` / `sidebarStyle` therefore
    apply the root grid, gap, and max-width to every section, and a stylist
    cannot target a section without restyling the whole widget.

11. **The widgets showcase is a second visual system.**
    `examples/widgets/src/style.ts` is hex and rgb literals (`#18181b`,
    `#4f46e5`, `rgb(0 0 0 / 0.4)`, …) and `entry.ts` installs only those
    island sheets. There is no `Theme.root`, so the page never reads the
    tokens Phase 4 made the styling contract. `examples/design-system` is
    the sheet that does. The two demos can drift, and a recipe change does
    not show up on the widgets page. The same file is where issues 6 and 10
    are styled.

12. **Absent values in the widget Models are `null`.** Open section, followed
    link, hover open is a boolean but picked labels, OTP code, resize drag
    origin, and the rest use `Schema.NullOr` and `null` checks (`navigation-menu`,
    `menubar`, `hover-card`, `otp-field`, `resizable`, `autocomplete`,
    `palette`, `context-menu`, `accordion`, `sidebar`, `alert-dialog`).
    These Models are not stored. The working agreement is an `Option` for a
    value that may be absent, with `null` only at a boundary that speaks it.

### Working tree (not committed)

13. **The date cell draft is the UTC day.** Uncommitted `draftOf` in
    `packages/data-grid/src/grid.ts` prefills a date editor with
    `value.toISOString().slice(0, 10)`. That is the UTC calendar day. A
    `Date` whose local day differs (local midnight in a positive offset, or
    any instant on the previous UTC day) opens the date input on the wrong
    day. `packages/data-grid/test/projection.test.ts` only uses
    `2026-10-08T00:00:00.000Z`, so the case stays green. The popover and
    slider diffs beside it are formatting. The card test change passes `Html`
    for `content`, `footer`, and `action`, which is what `CardView` already
    requires (`packages/mixins-ui/src/card.ts`); Vitest does not typecheck,
    so the old string fixtures were not a runtime failure.

## 2026-10-09 — Improvements and suggestions

Proposed, not done. Numbers in parentheses point at the entry above.

### Put one inventory back in charge (1, 2, 3, 4)

Write one table and make `PLAN.md`, `TODO.md`, and
`capability-matrix-DESIGN.md` point at it. Columns: design name, where it
lives (`packages/mixins-ui` or `examples/widgets/<id>`), changelog wave,
status. Update that row in the same commit as the widget. The matrix still
says the overlay rows are waiting on Wave B, and that OTP auto-advance is
not expressible. OTP already advances with an `AdvanceFocus` Command
(`examples/widgets/src/otp-field/app.ts`).

Finish the UI section of `PLAN.md`. Delete the orphaned tree fragment at
the end. Record Wave B and the Phase 8 vocabulary as landed, and name what
is still open: popup anchoring, keyboard commit, Tree, the Phase 9
assemblies as package patterns, blocks.

Rewrite the TODO intro so it describes the current gate. Close the
"missing adapters and recipes" item for Menu, Listbox, Combobox,
DatePicker, Toast, FileDrop, Select, Popover, Tooltip, Slider, RadioGroup,
and Calendar. Leave Nav, DragAndDrop, Animation, and VirtualList open if
they are still unadapted.

Strip the `chatgpt-content-reference` markers out of `ui-DESIGN.md`, or
stop citing it as the contract and cite `docs/ui-architecture.md` plus the
inventory. A design quote should be a sentence.

### Fix the showcase gestures, then lock them in a test (5, 6, 7, 8, 9)

**Click after hover.** On the navigation trigger and the hover card, pointer
enter opens and click inverts, so the gesture ends shut. Open on pointer
enter. Toggle on click only when that click is the keyboard activation, or
when the card was already open before this enter. Touch can be a toggle
because it has no hover. Add a test that sends enter and then toggle, in
that order, and expects the section or card to stay open. The existing
tests dispatch each message alone, so they stay green either way.

**Popup under the trigger that opened it.** Render the menubar and
navigation popup inside the open trigger (`position: relative` on that
trigger, `h.Key` already on the button), or add a place-once mount that
reads the trigger's rect and writes `translate` on the popup. Keep
`Placing.keepWithin` as the viewport clamp it already is. Leave
`Anchor.behavior` out until it can run with `portal: false` and without
the jsdom geometry burn. A unit test of roles will not catch this. Assert
in a browser that the popup's left edge is within the open trigger's box.

**One id string.** The collection `id` function and `Selection.Activated`
should call the same helper. For the menubar that string is
`` `${menu}/${item}` ``; for navigation, `` `${section}/${link}` ``. After
`ChoseItem` / `FollowedLink`, reopen and assert `aria-selected="true"` on
that item. Context menu, command, and autocomplete already match and can
be the pattern.

**Keyboard commit on the input.** Arrows and Enter belong on the text
field, with the list as `aria-activedescendant` (`ListNavigation`'s
`virtual: true` path). Enter sends `Activated` or `PickedOption` for the
active id. Items can stay buttons so click still works. The command and
palette comments can then say "keys and clicks choose" and be true. Test
the input's key handler, not a hand-built `Focused` message. The shipped
combobox fork already gives the input `keydown`
(`packages/mixins-ui/src/combobox.ts`). Prefer that adapter for
autocomplete when the page is only demonstrating a filtered list.

**`aria-controls` is an element id.** Set `id` on the listbox to the same
string the input's `aria-controls` uses. The overlay id stays
`data-foldkit-plus-layer` (`LAYER_ATTRIBUTE`); that token is the dismiss
stack's name, and it is a different job. Say so next to `Overlay.behaviors`.

**Commit is a message, not a selection diff.** `palette/app.ts` runs a
command whenever the selected id changes while open. That is safe only
while nothing but a click writes selection. When arrows start moving a
highlight, browsing would run the command. Run on an explicit choose
message.

### Slots, disclosure, and the sheet (10, 11, 12)

Give accordion and sidebar a `section` slot. `root` is the outer box only.
Keep the panel in the tree and mark it hidden while shut, which is what
`Disclosure` does, so `aria-controls` names a node that exists.

Install the design-system sheet on the widgets page: `Theme.root`, the
token layer, and `Recipes.*` for controls the recipe already covers. Keep
island style for layout a recipe does not own (the split in resizable, the
popup offset). Delete the hex and rgb palette in `style.ts`. A recipe
change then shows up on both demos.

Teach absence with `Option` in these Models. They are the examples new
widgets get copied from, and they are not stored, so `Schema.NullOr` is
the wrong boundary. Do the widgets in one pass. New islands should not
reintroduce `null` for "nothing open".

Prefix element ids with the island id. `entry.ts` mounts every island in
one document, and `digit-1`, `fruit`, `palette`, `docs-nav`, and
`delete-confirm-title` are document-global. The page happens to have one
of each today.

### What to build next, and what to leave

Compose the adapters that already own the interaction before adding
another state machine in `examples/widgets`:

- Autocomplete is the combobox fork plus a filter function of the Model.
  The fork's input already owns input, keydown, and focus.
- A menubar is one `Menu` per trigger. `Menu` already owns the button's
  click and keydown (`packages/mixins-ui/src/menu.ts`). Shared popup
  placement and the selection id are the example's job.
- Hover card can stay immediate-open. `HoverIntent` earns its place when
  the panel is portaled out of the trigger and the pointer has to cross a
  gap without the card closing (`hoverIntent.ts` keeps the panel open on
  its own pointer). Moving the popup for finding 6 creates that gap.

Phase 8 still missing as slots-plus-recipes: AspectRatio and Icon.
`U.srOnly` in `packages/mixins/src/utilities.ts` is the visually-hidden
piece. A `VisuallyHidden` slot is worth adding only when a component needs
to name that node. The universal `Field` stays unbuilt on purpose. The
`InputGroup` recipe already exists.

Phase 9 assemblies stay examples until the gesture, id, and keyboard bugs
above are gone. Command palette is the palette island after keyboard
commit, built on the command list, not a third filter. Sidebar and
resizable stay examples until `section` is a real slot and the split
handle is a package behavior. Data table stays on the data-grid plan.
Settings, search, date-range, file browser, tree editor, and property
panel wait until they are a composition of packages that already exist.

Phase 10 blocks wait until one of them is Form + Surface + Tabs + Remote,
drawn through slots. A block copied from the hex showcase would freeze the
current page.

The positioning gap is the one package worth adding. Menubar, navigation,
and context menu are three consumers of "place this panel at that trigger
once, without a portal". `capability-matrix-DESIGN.md` already records why
`Anchor` is the wrong tool here. A place-once mount beside `keepWithin`
is the missing half. Build it in `foldkit-primitives/interaction`, with a
browser test for alignment and a jsdom test that only checks the mount is
registered.

### Date draft (13)

Format the prefilled date from the local calendar fields (`getFullYear`,
`getMonth`, `getDate`), zero-padded. Add a fixture whose UTC day and local
day differ, and run it with `TZ` set east of UTC, so
`2026-10-08T00:00:00.000Z` is not the only case.

### How to know the next pass worked

Drive the widgets page. For each overlay island: hover a trigger that is
not the first, click it, and check the panel is open and lined up with
that trigger. Type in the command palette and press ArrowDown then Enter,
and check a command ran. Reopen a menubar after a choice and check the
chosen item is `aria-selected`. This review did not do that pass. A
screenshot of the resting page will not show these.

## 2026-10-09 — Resolution

The findings above stay as they were written. This note says what the code
does now.

1. **Plan tracking.** `docs/design/ui-INVENTORY.md` is the list. `PLAN.md`,
   `docs/design/TODO.md`, and `docs/design/capability-matrix-DESIGN.md` point
   at it. The UI section of `PLAN.md` records both changelog waves and the
   Phase 8 vocabulary, and the orphaned tree fragment is gone. The TODO
   intro no longer says none of the pieces exist. Phases 7 and 8 that
   landed are checked. The missing-adapters item names only what is still
   missing: Nav, DragAndDrop, Animation, VirtualList, and recipes for
   Fieldset, Disclosure, HoverIntent, and Calendar.
2. **Design waves versus changelog waves.** The inventory has a column for
   each. They are different lists, and the table says so.
3. **Capability matrix.** Both changelog waves are recorded as landed. OTP
   advances with the `AdvanceFocus` Command in
   `examples/widgets/src/otp-field/app.ts`. Pointer-exact coordinates stay
   open. Menus place under the open trigger with `Placing.placeAt`.
4. **Citation markers.** The `chatgpt-content-reference` tokens are gone
   from `docs/design/ui-DESIGN.md`.
5. **Click after hover.** Navigation and the hover card set `openedByPointer`
   when the pointer opens them. A click on that same open target stays open.
   A second click, a keyboard click, and touch still toggle.
6. **Popup under the trigger.** `Placing.placeAt` / `placeAtTrigger` write
   `left` and `--fk-placed-top`. Menubar, navigation, and context menu use
   it. The popup key is `popup:` plus the trigger name, so it does not
   share the trigger's key. A browser test
   (`examples/widgets/test/gestures.browser.test.ts`) hovers Resources,
   clicks it, and checks the menu stays open under that trigger.
7. **Selection ids.** Menubar, navigation, and context menu use one id for
   the element and the selection. Reopening Edit leaves Copy
   `aria-selected`. The same browser test checks that.
8. **Keyboard commit.** `ListNavigation` takes `typeahead: false` and an
   optional `commit`. Enter on the command field, the palette, and
   autocomplete activates the current item from that handler. The browser
   test opens the palette and runs New file with ArrowDown then Enter.
9. **`aria-controls`.** The autocomplete listbox element id is
   `autocomplete/list`, the same string the field's `aria-controls` uses.
10. **Accordion and sidebar.** Each has a `section` slot. Shut panels stay
    mounted and hidden. The sidebar's `root` is no longer the nav.
11. **Widgets sheet.** `examples/widgets` installs `AppStyle.make` of the
    design-system palette. Island styles read tokens. They do not use
    `Recipes.Button`: those slot contracts are not the islands' anatomy.
12. **Absence.** Widget Models that are not stored use `Option`. `null`
    remains where a DOM lookup or the primitive bundle boundary speaks it.
13. **Date draft.** A `DateFromString` column edits in a date field. The
    draft is the local calendar day. The fixture is Tokyo midnight on
    8 October (`2026-10-07T15:00:00.000Z`), and the test fails if `TZ` did
    not apply.

Still open, and named in the inventory: design Wave C, a Tree adapter,
Phase 9 assemblies as packages, Phase 10 blocks, Nav, DragAndDrop,
Animation, and VirtualList, and pointer-exact context-menu coordinates.
`VisuallyHidden` and a universal `Field` stay unbuilt on purpose.
