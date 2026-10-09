# UI inventory

One list of the UI platform. `PLAN.md`, `docs/design/TODO.md`, and
`docs/design/capability-matrix-DESIGN.md` point here. Update the row in the
same change as the widget.

The design's waves and the changelog's waves are different lists. A name in
the design's Wave A can ship in the changelog's Wave B, and the other way
around. The columns below keep both.

`examples/widgets` islands are thin compositions on one page. A slot and a
recipe in `packages/mixins-ui` is the package. An adapter is `resolve` /
`toView` over an upstream widget.

## Design Wave A

| Design name | Lives in | Changelog wave | Status |
| --- | --- | --- | --- |
| Accordion | `examples/widgets` accordion | Wave A | Landed. Section slot; shut panels stay mounted and hidden. |
| AlertDialog | `examples/widgets` alert-dialog | Wave B | Landed. |
| CheckboxGroup | `examples/widgets` checkbox-group | Wave A | Landed. |
| Toggle | `examples/widgets` toggle | Wave A | Landed. |
| ToggleGroup | `examples/widgets` toggle-group | Wave A | Landed. |
| Toolbar | `examples/widgets` toolbar | Wave A | Landed. |
| Progress | `examples/widgets` progress | — | Landed as an island. Not in the changelog's Wave A list. |
| Meter | `examples/widgets` meter | Wave A | Landed. |
| Separator | `packages/mixins-ui` | — | Landed. Slot and recipe, not an island. |
| HoverCard | `examples/widgets` hover-card | Wave B | Landed. Click after hover stays open. |

## Design Wave B

| Design name | Lives in | Changelog wave | Status |
| --- | --- | --- | --- |
| Autocomplete | `examples/widgets` autocomplete | Wave B | Landed. Enter commits from the field. Listbox id matches `aria-controls`. |
| ContextMenu | `examples/widgets` context-menu | Wave B | Landed. A right-click opens at the pointer (`OnPointerDown` records it; `OnContextMenu` carries none). A keyboard menu sits under the row. |
| Menubar | `examples/widgets` menubar | Wave B | Landed. Popup sits under the open trigger. Reopen keeps `aria-selected`. |
| NavigationMenu | `examples/widgets` navigation-menu | Wave B | Landed. Same placement and selection id as the menubar. Click after hover stays open. |
| NumberField | `examples/widgets` number-field | Wave A | Landed. |
| OtpField | `examples/widgets` otp-field | Wave B | Landed. A filled cell advances with an `AdvanceFocus` Command. |
| Command | `examples/widgets` command | Wave A | Landed. Enter on the field activates the current item. |
| ScrollArea | `packages/mixins-ui` | — | Landed. Slot and recipe. |

## Design Wave C

Open. None of these is a package.

| Design name | Lives in | Changelog wave | Status |
| --- | --- | --- | --- |
| ColorPicker | — | — | Open. |
| Editable | `foldkit-primitives` `EditableText` | — | The primitive exists. No widget. |
| Rating | — | — | Open. |
| TagsInput | — | — | Open. |
| TreeView | `foldkit-primitives` `TreeNavigation` | — | The primitive exists. No adapter. |
| Carousel | — | — | Open. |
| Splitter | `examples/widgets` resizable | — | Example only. Not a package. |
| Tour | — | — | Open. |
| FileUpload | `packages/mixins-ui` `FileDrop` | — | The upload zone is the FileDrop adapter. |
| SignaturePad | — | — | Open. |

## Phase 8 vocabulary

Slot and recipe in `packages/mixins-ui`, unless the status says otherwise.
The changelog records the adapter recipes (Menu, Listbox, Combobox, Select,
RadioGroup, Slider, Toast, FileDrop, DatePicker, Popover, Tooltip) as one
entry, and AspectRatio and Icon as their own.

| Design name | Lives in | Status |
| --- | --- | --- |
| Alert | `packages/mixins-ui` | Landed. |
| AspectRatio | `packages/mixins-ui` | Landed. The ratio is the axis; the frame's corner reads `radius`. |
| Avatar | `packages/mixins-ui` | Landed. |
| Badge | `packages/mixins-ui` | Landed. |
| Breadcrumb | `packages/mixins-ui` | Landed. |
| Card | `packages/mixins-ui` | Landed. |
| Empty | `packages/mixins-ui` | Landed. |
| Icon | `packages/mixins-ui` | Landed. A label names it; without one it is hidden. `Icons.glyph` stays the mask. |
| Item | `packages/mixins-ui` | Landed. |
| Kbd | `packages/mixins-ui` | Landed. |
| Label | `packages/mixins-ui` | Landed. |
| Separator | `packages/mixins-ui` | Landed. Also design Wave A. |
| Skeleton | `packages/mixins-ui` | Landed. |
| Spinner | `packages/mixins-ui` | Landed. |
| Table | `packages/mixins-ui` | Landed. |
| Typography | `packages/mixins-ui` | Landed. |
| VisuallyHidden | — | Unbuilt on purpose. `U.srOnly` is the piece. |
| Field | — | Unbuilt on purpose. Derivation stays per control. |
| InputGroup | `packages/mixins-ui` | Landed. |
| ButtonGroup | `packages/mixins-ui` | Landed. |

## Phase 6 and the adapters

| Design name | Lives in | Status |
| --- | --- | --- |
| Combobox | `packages/mixins-ui` | Landed. Adapter and recipe. |
| Menu | `packages/mixins-ui` | Landed. Adapter and recipe. |
| Tree | — | Open. `TreeNavigation` is the primitive. |
| Field | — | Unbuilt on purpose. |
| Drawer | `examples/drawer` | Landed as the Overlay policy proof. Not a `mixins-ui` widget. |
| Listbox, DatePicker, Toast, FileDrop, Calendar | `packages/mixins-ui` | Adapters landed. Calendar has no recipe. |
| Select, Popover, Tooltip, Slider, RadioGroup | `packages/mixins-ui` | Recipes landed. |
| Nav, DragAndDrop, Animation, VirtualList | — | Open. No adapter. |

## Phase 9 assemblies and Phase 10 blocks

These stay examples, or unbuilt. Phase 10 blocks are not started.

| Design name | Lives in | Status |
| --- | --- | --- |
| CommandPalette | `examples/widgets` palette | Example. Enter runs the highlighted command. |
| DataTable | `foldkit-data-grid` | Its own design. Not a Phase 9 package. |
| Sidebar | `examples/widgets` sidebar | Example. Section slot; shut sections stay mounted while the rail is open. |
| Resizable | `examples/widgets` resizable | Example. The split handle is not a package behavior. |
| NativeSelect | `examples/widgets` native-select | Example. Not in the design waves. |
| SettingsForm, SearchField, DateRangePicker, FileBrowser, TreeEditor, PropertyPanel | — | Open. |
| Phase 10 blocks | — | Open. |

## Showcase sheet

`examples/widgets` installs `AppStyle.make` of the design-system palette
(`examples/widgets/src/style.ts`, `pageStylesheet` in `entry.ts`). Island
styles read tokens. They do not reuse `Recipes.Button`: those slot contracts
are the widget's own anatomy.
