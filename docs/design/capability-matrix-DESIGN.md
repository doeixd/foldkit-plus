# Capability matrix: which widgets need which primitives

The Phase 2 gate. Rows are unbuilt widgets (the Phase 7 waves from
[ui-DESIGN.md](./ui-DESIGN.md)); columns are the interaction capabilities.
A `✓` names the module that already provides it — every one checked
against source, not memory. An `✗` is a gap with a named consumer; gaps
without consumers are not gaps (see §4). Build order follows the gaps,
not the rows: one capability unlocks a family.

## 1. Columns: what exists

| Capability | Shape | Module | Status |
| --- | --- | --- | --- |
| `Collection` | Pure descriptor (`of(items, {id, disabled})`: ids, order, disabled, slot contexts) + stateless Behavior (id, `aria-disabled`, posinset/setsize) | `foldkit-mixins` `Behaviors.Collection` | Built. Deliberately **no Bundle**: the parent's array is the collection and render order is DOM order ([behaviors-DESIGN](./behaviors-DESIGN.md) Phase A). |
| `Selection` | Bundle `{selected, anchor}` + Behavior (`aria-selected`, multiselectable, click) | `foldkit-primitives/interaction` `Selection` | Built (`single`/`multiple`/`none`, Shift ranges, `allowEmpty`). |
| `RovingTabindex` | Bundle + Behavior | `.../interaction` `RovingTabindex` | Built (orientation, loop, Home/End, disabled skip, RTL, virtual `aria-activedescendant`). |
| `Typeahead` | Bundle + Behavior | `.../interaction` `Typeahead` | Built (500ms buffer, wrap, locale-lowercased; own matcher, since upstream's is not on a public subpath). |
| `ListNavigation` | Bundle + Behavior (roving + typeahead + PageUp/Down in one placement) | `.../interaction` `ListNavigation` | Built (single key owner; ids from Collection, never `item-N`). |
| `GridNavigation` | Bundle + Behavior | `.../interaction` `GridNavigation` | Built (2-D arrows, wrap, Ctrl+Home/End, RTL). |
| `TreeNavigation` | Bundle + Behavior | `.../interaction` `TreeNavigation` | Built (hierarchy, open/close rows). |
| `Press` | Bundle + Mount + Behavior | `.../interaction` `Press` | Built (unified pointer/keyboard `Pressed`, OutMessage; facts from a Mount). |
| `LongPress`, `Move`, `PointerDrag` | Bundle/Mount + Behavior | `.../interaction` | Built. (`Move`: drag meaning stays in the parent's `update`.) |
| `FocusScope`, `FocusVisible` | Mount + Behavior | `.../interaction` (+ `dom`) | Built (contain/restore/initialFocus; modality data). |
| `DismissLayer`, `HideOutside`, `ScrollLock` | Bundle/Mount + Behavior | `.../interaction` (+ `dom`) | Built (topmost-first Escape/outside-press; trigger exclusion; refcounted locks; exact-once inert restore). |
| Anchor/position | Mount + Behavior over `@foldkit/ui/anchor` | `foldkit-mixins-ui` `Anchor` | Built (adapted, like Hover). Relocates nodes (portal by default) and repositions continuously; hostile without layout. |
| Viewport placing | Pure geometry (`placeFor`) + Mount + Behavior | `.../interaction` `Placing` | Built (shifts left past the right edge, flips above with room overhead; no timers, inert without layout). |
| Hover intent | Submodel + slots | `foldkit-mixins-ui` `HoverIntent` | Built (adapted; open/close delays). |
| Presence/motion | Service + `Presence` | `foldkit-primitives/motion` | Built (`data-state`, reduced-motion, timeout fallback). |
| Disclosure, ToggleState | Attributes over input | `foldkit-mixins` `Behaviors` | Built (`aria-expanded`+controls+ids; checked/pressed). |
| FieldAssociation, SpinValue | Attributes over input | `foldkit-mixins` `Behaviors` | Built (label/description/error links; spinbutton stepping). |
| Virtualization | Model logic | `foldkit-primitives/state` `virtual` | Partial: windowing math exists; no Behavior and no Slot story (upstream `VirtualList` owns its own). |
| Filter | Pure helper | Deliberately none (a filter is a function of the Model; `Filter.text` was never a helper) | Built deliberately stateless. |
| LiveAnnounce | Bundle (placed once) | `.../interaction` `LiveAnnounce` | Built (debounced, deduped regions). |

## 2. Rows: what each widget needs

`✓` = column above. `✗n` = gap `n` from §3. Parentheses = optional.

| Widget | Collection | Selection | Navigation | Overlay | Press/Move | Disclosure | Form | Misc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tree | ✓ describe | ✓ | ✓ TreeNavigation | — | (✗drag) | ✓ | — | virtualization (partial) |
| Drawer | — | — | — | ✗policy (pieces ✓) | — | — | — | Presence ✓, responsive policy |
| Command | ✓ describe | ✓ | ✓ ListNavigation | (✗policy) | — | — | — | Filter ✓, input |
| Toolbar | ✓ describe | — | ✓ RovingTabindex | — | — | — | — | orientation |
| ToggleGroup | — | ✓ | — | — | ✓ Press | — | — | — |
| Toggle | — | — | — | — | ✓ Press | — | — | pressed state |
| Accordion | ✓ describe | — | — | — | — | ✓ | — | — |
| AlertDialog | — | — | — | ✗policy | — | — | — | explicit-response policy |
| Autocomplete | ✓ describe | ✓ | ✓ ListNavigation | ✗policy | — | — | ✓ FieldAssociation | Filter ✓ |
| CheckboxGroup | ✓ describe | ✓ | — | — | — | — | ✓ FieldAssociation | — |
| ContextMenu | ✓ describe | ✓ | ✓ ListNavigation | ✗policy | — | — | — | pointer trigger |
| Menubar | ✓ describe | ✓ | ✓ RovingTabindex | ✗policy | — | — | — | nested overlays |
| NavigationMenu | ✓ describe | — | ✓ ListNavigation | ✗policy | — | — | — | HoverIntent ✓ |
| NumberField | — | — | — | — | — | — | ✓ SpinValue | increment/decrement |
| OtpField | ✓ describe | — | ✓ RovingTabindex | — | — | — | ✓ FieldAssociation | cell inputs |
| ScrollArea | — | — | — | — | — | — | — | scroll primitives (Exists: `dom/scroll`) |
| Meter, Progress | — | — | — | — | — | — | — | value/max attributes (trivial) |
| HoverCard | — | — | — | ✗policy | — | — | — | HoverIntent ✓ |
| Popover-likes (Select, DatePicker panel) | — | — | — | upstream-owned | — | — | — | already shipped via forks |

## 3. Gaps (the actual Phase 2 build list)

1. **Overlay policy: built.** `Overlay.modal` / `Overlay.nonModal` (or an
   explicit `Policy`) into `Overlay.behaviors(...)`, spread into the view's
   pipe — dismiss marking, focus scope, and the scroll/inert mounts the
   policy keeps, nothing reimplemented. Positioning stays per-widget,
   presence stays CSS. Proved by `examples/drawer`. (ui-DESIGN §5.)
2. **Collection drag-reorder.** `Move`/`PointerDrag` report movement; nothing
   turns a drag across described items into a reorder. Consumer: Tree
   (optional) — and only Tree so far. Deferred until a second consumer or
   the Tree slice demands it.
3. **Virtualization Behavior.** `state/virtual` computes windows; nothing
   binds a window to Slots (ids, `aria-setsize` beyond the rendered slice,
   scroll anchoring). Consumer: Tree (optional), Command (long lists).
   Deferred like (2): build it inside the first widget that needs it.

## 4. Deliberately not built

- **Collection Bundle.** Revised away in behaviors-DESIGN Phase A: the
  parent's array plus DOM order needs no store and no `Mutation()` Mount.
  A Bundle here would be a second owner of the parent's data.
- **New capabilities** (`CollectionItem`, `OverlayTrigger`, `FormControl`,
  …). Every current `requires` is satisfied by the seven existing
  capabilities; taxonomy without a requiring Behavior is dead weight
  (the rule now lives in [ui-architecture](../../ui-architecture.md)).
  The Overlay policy (gap 1) is where new slot capabilities will first
  be justified — `OverlayTrigger`/`OverlayContent` earn their place when
  `Anchor.behavior` can require them instead of bare `Container`.
- **Filter state.** Pure helper by design (see table).

## 5. Order of work

Gap 1 landed first, proved by the Drawer slice. Gaps 2–3 wait inside the
Tree slice if it demands them, not before. Then Phase 6's five-widget
proof, then the Phase 7 matrix in waves. The living list is
[ui-INVENTORY.md](./ui-INVENTORY.md): the design's waves and the changelog's
waves are different lists, and both changelog waves have landed.
Two cells corrected along the way: `Filter.text` was never a helper (the
filter is a function of the Model), and `Disclosure` names one pair (N
sections derive its attributes per item).

The changelog's Wave B is alert-dialog, autocomplete, otp-field, hover-card,
context-menu, menubar, and navigation-menu. Menubar, navigation, and context
menu place the popup under the open trigger with `Placing.placeAt`.
A context menu opens at the pointer: `OnPointerDown` records the point,
because `OnContextMenu` carries none, and `Placing.placeAtPoint` writes it.
The behavior stays named `PlaceAt`; the mount is `PlaceAtPoint` when the
point is present. Navigation and the hover card overlap the trigger, because
a gap sits outside the trigger's border box and `pointerleave` would fire
before the pointer reached the popup. `keepWithin`'s flip sets `bottom`, so
that overlap is the side below the trigger. `Anchor` still portals, so it
stays unused here. OTP advances with an `AdvanceFocus` Command after a fill
(`examples/widgets/src/otp-field/app.ts`); the cell id is the focus selector.
