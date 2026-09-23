# A catalog of ready-made Behaviors

**Progress (2026-09-23):** Phases A and B are built and committed: the per-item
context, `Behaviors.Collection` in `foldkit-mixins`, and `RovingTabindex`,
`Typeahead`, `ListNavigation`, `FocusScope` in `foldkit-primitives/interaction`.

**Revised 2026-09-23:** no new package. Entries live where their dependencies
already are: stateless ones in `foldkit-mixins`, stateful ones in
`foldkit-primitives` beside the Bundles they extend. See "Where each entry
lives" below; `foldkit-behaviors` in the inventory tables means that split.

**Status:** design, 2026-09-23. Follows
[effect-atom-jsx-LESSONS.md](./effect-atom-jsx-LESSONS.md) and
[mixins-DESIGN.md](./mixins-DESIGN.md). Contract details for each entry were
taken from effect-atom-jsx's implementations and its `docs/kit-research/`
folder, which in turn distilled Zag, Radix, Base UI, react-aria and Floating
UI. Where this document says "their", it means that project.

## The gap

`foldkit-mixins` ships a Behavior *mechanism*: attach attributes and a Mount
to a named slot, with capability checks and one owner per event. It ships no
Behaviors. `@foldkit/ui` ships finished widgets (Listbox, Menu, Combobox,
Dialog, Popover, Tooltip, and twenty more) that own their keyboard and focus
logic internally, plus three utilities: `anchor`, `hoverIntent`, `animation`.
`foldkit-primitives` ships Bundles for facts about the environment.

A custom view, a card grid with roving focus, a toolbar, a command palette,
a disclosure that is not `@foldkit/ui`'s, gets nothing: the author writes the
keyboard map, the ARIA, and the dismissal by hand, in every application. The
only Behaviors in this repository are the two in `examples/todo-app/src/style.ts`.

effect-atom-jsx ships sixteen and researched twenty more. That is the gap.

## The shape, and why it is not theirs

Their Behavior owns state in atoms and runs listeners in callbacks. Ours may
not: mixins-DESIGN says "Behavior owns no state", and it is right, because
state that a Behavior hides cannot be resumed, replayed, or seen by an agent.
So every catalog entry is one of three shapes, and the shape is decided per
entry, not left to the author.

1. **Attributes over input.** No state of its own. A function of the view's
   input to attributes: `aria-expanded` from `open`, `aria-selected` from a
   selection, `aria-posinset` from an index. Pure `Behavior.forSlots`.
2. **A Bundle plus a Behavior.** The state is a `foldkit-primitives`-style
   Bundle placed in the parent Model; the Behavior maps slot events to the
   Bundle's Messages and the Bundle's state to attributes. The pair is
   exported together, so placing the Bundle and attaching the Behavior is two
   lines and the types tie them: the Behavior's `Input` is the Bundle's Model.
3. **A Mount.** Element-owned lifecycle with nothing the Model needs to know:
   a pointer capture during a drag, a `ResizeObserver`. Already the
   `foldkit-primitives/observers` shape.

### Where each entry lives

No new package. The split follows dependencies, so nothing gains one it did
not have:

- **Stateless entries go in `foldkit-mixins`**, under a `Behaviors`
  namespace beside `Behavior`: the mechanism next to the shelf. Collection,
  Disclosure, ToggleState, FieldAssociation, and `Style.forCapability` are
  contributions over the view's input, which is what the package already is,
  and they add no dependency. `foldkit-mixins` stays the kernel every
  `mixins-*` package depends on, with peers `effect` and `foldkit` only.
- **Stateful entries go in `foldkit-primitives`**, each as a Bundle plus its
  matching Behavior from one subpath: RovingTabindex, Typeahead, Press,
  DismissLayer, FocusScope, HideOutside, ScrollLock, LiveAnnounce, SpinValue,
  FocusVisible. Primitives already ships Bundles for UI state (pagination,
  selection, history), so a roving index sits beside them, and the package
  already depends on `foldkit-bundle`. `foldkit-mixins` becomes an optional
  peer, needed only by the subpaths that export a Behavior.
- **Kit-adjacent patterns go in `foldkit-mixins-ui`**, as Phase H says.

Why not everything in `foldkit-mixins`: the stateful entries would make the
kernel depend on `foldkit-bundle`, and every `mixins-*` package would inherit
it. Why not a third package: it would be a second home for Behaviors with no
dependency reason to exist.

Two rules from their audits become package rules here:

- **Time is never read in a handler.** Their press behavior injects `now()`
  because listeners are synchronous callbacks. Here a press's suppression
  window is a Command that returns a Message after `clickSuppressionMs` on
  Effect's clock, so `TestClock` drives it.
- **Nothing global.** Their layer stack and announcer are services with one
  instance per Layer provision. Here the dismiss stack and the announcer are
  Bundles placed once per application; a second placement collides at
  `assemble`, as `Socket` does today.

## The catalog

Grouped by what `@foldkit/ui` does not already give a custom view. "Reuse"
means the entry wraps something that exists; "Fix" lists the defects their
version has that ours must not repeat, each of which becomes a test.

### Interaction

| Entry | Shape | Slots | What it does | Fix |
| --- | --- | --- | --- | --- |
| `Press` | Bundle + Mount + Behavior (built; the facts come from a Mount because Foldkit's pointer attributes carry no button, pointer id, or click detail; `update` decides; `Pressed` is an OutMessage the placement must handle) | `target: Interactive` | Pointer and keyboard activation as one `Pressed` Message. Primary button only, cancel on `pointerleave` and `pointercancel`, Enter and Space with repeat ignored, virtual clicks (`detail === 0`) accepted, ghost click suppressed by a timed Command. Exposes `pressed` for styling. | add `pointercancel`; add `onPressUp`; never raw `click` |
| `LongPress` | Bundle + Behavior | `target: Interactive` | Composes `Press`; `threshold` default 500 ms as an interruptible Command. Cancels on movement past a tolerance. | none built there |
| `Hover` | Reuse `@foldkit/ui/hoverIntent` | `trigger`, `panel` | Open and close delays with intent. The shared group timer (tooltip skip-delay) is a Bundle placed once. Ignores touch. | none |
| `Move` | Mount | `handle: Draggable` | Pointer capture, `Moved { deltaX, deltaY, pointerType }`, release on dispose. | none built there |
| `FocusVisible` | Bundle + Behavior | `target: Focusable` | Tracks input modality; writes `data-focus-visible`. Floor is `:focus-visible`; this exists for JavaScript that must know. | none |

### Focus and layers

| Entry | Shape | Slots | What it does | Fix |
| --- | --- | --- | --- | --- |
| `RovingTabindex` | Bundle + Behavior | `container: Interactive`, `items: Collection` | One tab stop; arrows by `orientation` (`vertical`, `horizontal`, `both`), `loop`, Home and End to first and last enabled, disabled items skipped, `virtual` mode writes `aria-activedescendant` instead of moving focus. | **RTL flips horizontal arrows**; **restore `tabindex` on dispose**; every handled key calls `preventDefault` |
| `Typeahead` | Bundle + Behavior | `host: Interactive`, `items: Collection` | Printable keys buffer for 500 ms on Effect's clock, match from the current index forward then wrap, locale-lowercased. Composes with `RovingTabindex`. `@foldkit/ui` has `resolveTypeaheadMatch` in `dist/typeahead.js` but on no public subpath, so the matcher is written here (it is thirty lines) rather than deep-imported. | none |
| `ListNavigation` | Bundle + Behavior | as `RovingTabindex` | `RovingTabindex` plus `Typeahead` plus PageUp and PageDown by `page`, in one placement with one key handler. Built: it is its own Bundle (`{ current, query, generation }`) rather than a composition, because the resolver allows one owner per event on a slot and because under `virtual` a typed key must move the pointer and extend the query in one transition. Their `keyboardNav` seed with its bugs removed. | **ids for `aria-activedescendant` come from the Collection, never `item-N`** |
| `GridNavigation` | Bundle + Behavior | `grid`, `cells: Collection` | Two-dimensional arrows with `columns` and `wrap`; RTL flips columns. Waits for a real grid (DatePicker uses `@foldkit/ui`'s). | none |
| `FocusScope` | Mount + Behavior (built; revised from Bundle: which element has focus is a DOM fact, so nothing crosses to the Model) | `container: Container` | `contain` (Tab cycles inside, a stray focus comes back), `restore` (focus returns on unmount), `initialFocus`. Distinct from a trap: with `contain: false` tabbing out is allowed. Tabbables are queried per key, so dynamic content needs no observer. | **restore on deactivate**, which their trap lacks |
| `DismissLayer` | Bundle (stack, placed once) + Behavior | `root: Container`, optional `trigger` | Escape and outside press dismiss the topmost layer; a press inside a parent layer is outside its children; the trigger is excluded so dismiss-then-reopen cannot happen. The document listener is the stack Bundle's Subscription, so no embedding has to report presses. Defers to native `popover="auto"` when the slot has it. | **document listener included**; **trigger exclusion**; drop their unused `disableOutsidePointerEvents` |
| `HideOutside` | Bundle (refcount) + Behavior | `content: Container` | `inert` on everything outside, refcounted for nested modals, exact-once restore. `@foldkit/ui/popover` has this internally; this is for custom overlays. | none |
| `ScrollLock` | Bundle (refcount) + Behavior | none (body) | Body overflow with scrollbar-width compensation, nested open and close, restore on dispose. Needed even with native `<dialog>`. | none |
| `AnchorPosition` | Reuse `@foldkit/ui/anchor` | `anchor`, `floating` | Placement, strategy, offset; `data-placement` written for styling; native CSS anchor positioning detected first. Positioning writes `position`, `left`, `top`, which is why the style-property ownership rule in effect-atom-jsx-LESSONS.md item 1 lands before this entry. | **declare owned style properties**; flip and shift come from `@foldkit/ui`'s implementation, not here |

### Collections and selection

| Entry | Shape | Slots | What it does | Fix |
| --- | --- | --- | --- | --- |
| `Collection` | Bundle + Behavior | `items: Collection` | Stable ids per item, DOM order via a `Mutation()` Mount, disabled tracking, `aria-posinset` and `aria-setsize` on request. The Bundle is what `RovingTabindex`, `Typeahead`, and `Selection` read. | **DOM order, not insertion order**; **ids exist** |
| `Selection` | Bundle + Behavior | `items: Collection` | `mode: 'single' \| 'multiple' \| 'none'`, Shift range with an anchor index, `aria-selected`. Reuse `foldkit-primitives/state/selection` for the set. | single mode cannot deselect to empty unless `allowEmpty` |
| `Disclosure` | Attributes over input | `trigger`, `content` | `aria-expanded`, `aria-controls` with a real id, `hidden` on content. The open flag is the parent's. The floor is `<details>`. | **`aria-controls` and ids** |
| `ToggleState` | Attributes over input | `control: Interactive` | `aria-checked` or `aria-pressed`, including `indeterminate`. | none |
| `Pagination` | Reuse `foldkit-primitives/state/pagination` | none | Add a test: **changing `perPage` re-clamps `page`**. | their known defect |

### Forms and announcements

| Entry | Shape | Slots | What it does | Fix |
| --- | --- | --- | --- | --- |
| `FieldAssociation` | Attributes over input | `label`, `control`, `description`, `error` | Stable ids generated once; `aria-labelledby`, `aria-describedby` listing description and error, `aria-invalid`. Ids are part of the Model so they survive resume. | none |
| `FormControl` | Attributes over input | `control`, `hiddenInput` | A hidden native `<input name value required disabled>` following the field's encoded draft, so a custom widget submits without JavaScript. Lives in `foldkit-mixins-form` as `Form.native` (effect-atom-jsx-LESSONS.md item 3); listed here for completeness. | **project `disabled`**; test: the form posts the value with scripts off |
| `SpinValue` | Bundle + Behavior | `input: Focusable` | Up and Down, PageUp and PageDown, wheel, press-and-hold repeat as an interruptible Command; clamps to `min`, `max`, `step`. Floor `<input type=number>`. | none built there |
| `LiveAnnounce` | Bundle (placed once) + Command | none | `announce(message, politeness)` is a Command; the region is rendered by the Bundle's view with one node per politeness; debounce and dedupe are options on the placement. | **debounce and dedupe**; timers on Effect's clock |
| `Presence` | Reuse `foldkit-primitives/motion/presence` | `root` | Add the `Motion` service (effect-atom-jsx-LESSONS.md item 2) and `data-state`. Keep the timeout fallback they lack. Add `transitionend`. | none |

### Not in the catalog

- `Combobox`, `Dialog`, `Popover`, `Select`, `Tooltip`, `Menu`, `Listbox`,
  `Tabs`, `Slider`: `@foldkit/ui` owns them, and `foldkit-mixins-ui` adapts
  their slots. Their research widget specs, especially the Combobox keyboard
  contract (two-stage Escape, Alt+Arrow open without highlight, Ctrl+Home and
  Ctrl+End, PageUp and PageDown by ten, blur closes unless the pointer is over
  the content), are a checklist to run `@foldkit/ui`'s Combobox against, not
  something to rebuild.
- `FocusTrap`: superseded by `FocusScope` with `contain: true`. Their
  combobox used a trap on its content, which their own research called the
  seed's most consequential bug.
- A Machine adapter, a Clock service: `update` and Effect's `Clock` are those.

## The pattern, concretely

`RovingTabindex` is the load-bearing example, since five entries build on it.

```ts
import { Bundle } from 'foldkit-bundle'
import { Behavior, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  tool: Slot.make({ capability: Capability.Focusable, events: [Event.Focus] }),
})

// State: one Bundle in the parent Model, like any primitive.
const Roving = Bundle.declare(RovingTabindex.bundle, 'toolbarFocus')
const Model = Schema.Struct({ ...Roving.fields, tools: Schema.Array(Tool) })
const Message = defineMessageUnion({ ...Roving.cases, /* … */ })
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(
  Page.at(Roving, { args: { orientation: 'horizontal', loop: true } }),
)

// Behavior: maps the slots to that placement. Its Input is the parent Model,
// so it can read the placed slice and dispatch the placed Messages.
const ToolbarFocus = RovingTabindex.behavior(Roving, args)(ToolbarSlots)<Model, Message>({
  container: 'root',
  items: 'tool',
  itemId: (model, index) => model.tools[index]?.id,
  isDisabled: (model, index) => model.tools[index]?.disabled ?? false,
})

export const Toolbar = SlotView.forMessages<Message>()
  .define(ToolbarSlots, (model, slots, h) =>
    h.div(slots.root.attrs([h.Role('toolbar')]),
      model.tools.map((tool, index) =>
        h.button(slots.tool.attrs([h.Key(tool.id)], { index }), [tool.label]))),
  )
  .pipe(Behavior.attach(ToolbarFocus))
```

`RovingTabindex.behavior` returns an ordinary `NamedBehavior`: on `root` it
contributes `OnKeyDown` mapping arrows, Home, and End to the placement's
`Moved` Messages with `preventDefault`, reading `dir` from the input for RTL;
on each `tool` it contributes `Tabindex(index === current ? 0 : -1)` and a
Mount that calls `focus()` when the element becomes current. Nothing here is
new machinery: `Bundle.declare`, `Page.at`, `Behavior.attach`, and per-item
`attrs` are the existing APIs. What is new is that the two halves are shipped
together and typed against each other.

The per-item `attrs(base, { index })` argument is the one addition
`foldkit-mixins` needs: today a Behavior's `attributes` sees `input` and `h`
but not which repetition of a slot it is decorating. `SlotView.buildersFor`
already evaluates per item; passing an item context through is a small,
additive change and every collection entry above needs it.

## Phases

Each ends in a test that can fail, and each entry's "Fix" column is a test
before it is code.

- **A. The item context and `Collection`.** The per-item context in
  `foldkit-mixins` (done: `slots.x.attrs(base, item)`); `Behaviors.Collection`
  in `foldkit-mixins` as the first entry. Revised from the inventory: the
  parent's array is the collection and render order is DOM order, so no
  Bundle and no `Mutation()` Mount; a pure `Collection.of(items, { id,
  disabled })` describes it and a Behavior writes ids and `aria-posinset`.
  Test: a duplicate id is refused; per-item attributes follow the item.
- **B. Focus.** Done. `RovingTabindex`, `Typeahead`, `ListNavigation`,
  `FocusScope`. Tests: RTL flips; nothing to restore on dispose because
  `tabindex` is data; focus restored on unmount; ids come from Collection, so
  no `item-N`; and the one-owner-per-event rule that makes ListNavigation one
  Bundle is pinned.
- **C. Interaction.** `Press`, `LongPress`, `Move`, `FocusVisible`, `Hover`
  over `hoverIntent`. Test: `TestClock` advances the suppression window; a
  virtual click presses; `pointercancel` cancels.
- **D. Layers.** Style-property ownership in the resolver first, then
  `DismissLayer`, `HideOutside`, `ScrollLock`, `AnchorPosition` over
  `@foldkit/ui/anchor`. Test: a press inside a parent layer leaves it open
  and closes its child; the trigger is excluded; nested modals refcount.
- **E. Collections and forms.** `Selection`, `Disclosure`, `ToggleState`,
  `FieldAssociation`, `SpinValue`, `LiveAnnounce`, `Form.native`. Test:
  Shift range respects the anchor; the hidden input posts with scripts off.
- **F. Motion.** The `Motion` service in `foldkit-primitives`, `Presence`
  reading it, `data-state`. Test: under reduced motion a presence exits at
  once and a tween jumps to its end.
- **G. The `@foldkit/ui` Combobox against their keyboard contract.** A Scene
  test per row. Any failure is a note for upstream, not a fork.

## Inventory: everything they built or researched, and what we do with it

One row per behavior, service, or research note in effect-atom-jsx. "Theirs"
is the file or research note; line numbers point at the export. "Here" is
the disposition: **Port** (build it, with the shape from above), **Reuse**
(wrap something this repository or `@foldkit/ui` already has), **Exists**
(nothing to do beyond a test), **Fold into** (its function belongs inside
another entry), or **Skip** (with the reason). "How" is the concrete porting
note, including the defects to fix.

### Built in `src/behaviors.ts` (the seeds)

| Theirs | Here | How |
| --- | --- | --- |
| `disclosure` (`:13`): trigger toggles `isOpen`; writes `aria-expanded`, `aria-hidden` | **Port** as attributes over input | The open flag is the parent's Model field, not the Behavior's. Contribute `aria-expanded` on `trigger`, `aria-controls` pointing at a real id, and `hidden` on `content` (their version has no ids and no `aria-controls`). The floor is `<details>`; the entry documents when to use that instead. |
| `selection<T>` (`:47`): press toggles; `multiple`, `equals`; `aria-selected` | **Port** as Bundle + Behavior over `foldkit-primitives/state/selection` | `mode: 'single' \| 'multiple' \| 'none'` instead of a boolean; Shift range with an anchor index; `allowEmpty` so single mode does not silently deselect to nothing. `aria-selected` per item through the per-item context. |
| `searchFilter<T>` (`:113`): `query` state, `filter(item, query)`, derived `filtered` | **Fold into** the application's `update` | A filter is a pure function of the Model; a Bundle for it would own state the Model already has. Ship `Filter.text(items, query, pick)` as a pure helper in `foldkit-primitives/state`, no Behavior. |
| `keyboardNav<T>` (`:151`): arrows, Home, End, Enter; `aria-activedescendant="item-N"` | **Port** as `ListNavigation` | Rebuilt on `RovingTabindex` plus `Typeahead`, PageUp and PageDown by ten. Defects to fix as tests: `item-N` is hardcoded and no item carries it; no `preventDefault`; no disabled skip; no RTL. |
| `pagination` (`:221`): `page`, `pageSize`, derived `totalPages`, clamping | **Exists** (`foldkit-primitives/state/pagination`) | Add the test their research asked for and their code fails: changing `perPage` re-clamps `page`. |
| `focusTrap` (`:266`): Tab and Shift+Tab cycle while active | **Fold into** `FocusScope` with `contain: true` | Their trap never restores focus, ignores dynamic focusables, and can be escaped by pointer. `FocusScope` restores on deactivate and watches focusables through a `Mutation()` Mount. |
| `combobox<T>` (`:328`): composite of the five above | **Skip**; `@foldkit/ui/combobox` owns it | Their own research calls this seed's use of `focusTrap` its most consequential bug. Their Combobox keyboard contract becomes Phase G's Scene checklist against `@foldkit/ui`. |

### Built in `src/behaviors/` (the K tier)

| Theirs | Here | How |
| --- | --- | --- |
| `press` (`press.ts:81`): pointer plus keyboard activation, `isPressed`, ghost-click window via injected `now()` | **Port** as Bundle + Behavior | `Pressed` and `PressChanged` Messages; the suppression window is a Command on Effect's clock, not a `now()` read in a handler. Keep: primary button only, `pointerleave` cancels, Enter and Space with `repeat` ignored, virtual clicks (`detail === 0`) accepted, `preventFocusOnPress`. Add: `pointercancel`, `onPressUp`. Never raw `click` for activation. |
| `rovingTabindex` (`roving-tabindex.ts:60`): one tab stop, arrows, Home, End, disabled skip, `virtual` | **Port** as Bundle + Behavior | Keep the enabled-list movement and `virtual` mode. Fix: RTL flips horizontal arrows (read `dir` from the input); restore `tabindex` on dispose; `virtual` writes `aria-activedescendant` from the Collection's ids. |
| `collection` (`collection.ts:62`): items, size, disabled WeakMap, `aria-posinset`/`aria-setsize` | **Port** as Bundle + Behavior; the first entry built | Ids are Model data, not a WeakMap. Order is DOM order via a `Mutation()` Mount, not insertion order. `setPosInSet` stays an option. This is what `RovingTabindex`, `Typeahead`, and `Selection` read. |
| `dismissableLayer` (`dismissable-layer.ts:134`) plus `DismissLayerStack` service (`:117`): Escape and outside press on the topmost layer, nested rule | **Port** as a stack Bundle placed once plus a Behavior | The document `pointerdown` listener is the stack Bundle's Subscription, so no embedding has to call `notifyPress`. Keep the nesting rule: a press inside a parent is outside its children. Add trigger exclusion. Drop the unused `disableOutsidePointerEvents`. Defer to native `popover="auto"` when the slot has it. |
| `anchorPosition` (`anchor-position.ts:106`): placement, strategy, offset, injected `measure` and `autoUpdate`; writes `position`, `left`, `top` | **Reuse** `@foldkit/ui/anchor` (`anchorSetup`) | Wrap as a Mount on `floating` with `anchor` resolved by id; write `data-placement`. Declare the owned style properties, which needs the style-ownership rule in effect-atom-jsx-LESSONS.md item 1. Flip and shift come from `@foldkit/ui`'s implementation. |
| `formControl` (`form-control.ts:65`): hidden native `<input>` following a value atom; `aria-invalid` | **Port** as `Form.native` in `foldkit-mixins-form` | Attributes over the form field's encoded draft: `type=hidden`, `name`, `value`, `required`, and `disabled` (theirs omits it). Test: the form posts the value with scripts off. Pairs with the resumable design's no-JavaScript fallback. |
| `liveAnnounce` (`live-announce.ts:106`) plus `LiveAnnouncer` service (`:74`): `announce(message, politeness)`, clear-after timer | **Port** as a Bundle placed once plus a Command | The Bundle's view renders one region per politeness; `announce` is a Command. Add debounce and dedupe as placement options (their Combobox research wants about 500 ms). Timers on Effect's clock. |
| `presence` (`presence.ts:70`): Mounted / Exiting / Unmounted on `animationend`, cancels on reopen, reads `ReducedMotion` at transition time | **Exists** (`foldkit-primitives/motion/presence`), extend | Keep our timeout fallback they lack. Add: read a `Motion` service at transition time, `transitionend`, `data-state`. Keep their cancel-on-reopen semantics: a late `animationend` in the mounted state is ignored. |
| `ReducedMotion` service (`reduced-motion.ts:35`) | **Port** as the `Motion` service in `foldkit-primitives` | Default layer over `matchMedia`, `Motion.reduced` test layer. Read by `Presence`, `Tween`, `Spring` at transition time, never cached. |
| kit `dialog.behavior()` (`kit/dialog.ts:123`): trigger `click` opens, Escape closes, `command="show-modal"` invoker | **Skip**; `@foldkit/ui/dialog` and `foldkit-mixins-ui`'s adapter own it | Their shipped dialog contradicts its own research (a machine, a `<div>` root, raw `click`). The one idea to take: the `commandfor` and `command="show-modal"` invoker so the first open needs no JavaScript. Check whether `@foldkit/ui`'s Dialog emits it; if not, a note upstream. |
| `Clock` and `Locale` services, `formatRelative`, `RelativeTime` widget (`kit/time.ts`) | **Exists** (`foldkit-primitives/time/relative`, `state/locale`, Effect's `Clock`) | Theirs computes the label once and never ticks; ours runs on an interval under `TestClock`. Nothing to take. |

### Researched, not built (`docs/kit-research/behaviors/*.md`)

| Theirs (tier) | Here | How |
| --- | --- | --- |
| `hover` (T1): open and close delays with intent, shared group timer, ignore touch | **Reuse** `@foldkit/ui/hoverIntent` | Wrap the Submodel; the tooltip group timer (skip delay across a group) is a Bundle placed once. Reject pure touch. |
| `focusVisible` (T1): last input modality, `data-focus-visible` | **Port** as Bundle + Behavior | Modality tracked once per application by a Subscription on `keydown` and `pointerdown`; the Behavior writes the data attribute. Floor is `:focus-visible`; the entry says so. |
| `longPress` (T1): threshold 500 ms, cancel on move or early release | **Port** as Bundle + Behavior composing `Press` | The threshold is an interruptible Command; movement past a tolerance interrupts it. No double fire with `Press`. |
| `move` (T1): pointer capture, deltas, `pointerType` | **Port** as a Mount | `Moved { deltaX, deltaY, pointerType }`; ignore non-primary pointers; release capture on dispose. |
| `focusScope` (T2): `contain`, `restore`, `initialFocus` | **Port** as Bundle + Behavior | Restore on deactivate; `contain: false` allows tabbing out; dynamic focusables through a `Mutation()` Mount. Supersedes `focusTrap`. |
| `interactOutside` (T3): document pointer and focus, nested portals count as inside, `preventDefault` veto | **Fold into** `DismissLayer` | It is the document listener half of the layer stack; a separate entry would give two owners of one document listener. |
| `hideOutside` (T3): `inert` outside, refcounted | **Port** as a refcount Bundle + Behavior | `inert` preferred over an `aria-hidden` tree walk; nested modals refcount; exact-once restore. `@foldkit/ui/popover` has this internally, so this is for custom overlays. |
| `scrollLock` (T3): body overflow, scrollbar compensation, iOS `touchmove` | **Port** as a refcount Bundle | Needed even with native `<dialog>`. Restore on dispose. |
| `listNavigation` (T4): rename of `keyboardNav` on `rovingTabindex`, virtual mode, RTL | **Port** (see `ListNavigation` above) | One placement composing `RovingTabindex`, `Typeahead`, PageUp and PageDown. |
| `typeahead` (T4): 500 ms buffer, match forward then wrap, locale lowercase | **Port** as Bundle + Behavior | The matcher is written here; `@foldkit/ui`'s `resolveTypeaheadMatch` is not on a public subpath. Buffer clears on a Command timer. |
| `gridNavigation` (T4): `columns`, `wrap`, RTL flips columns | **Port**, deferred | Waits for a real grid; DatePicker uses `@foldkit/ui`'s. |
| `selectionModel` (T4): `single \| multiple \| none`, Shift range, anchor | **Port** (see `Selection` above) | |
| `spinValue` (T5): Up and Down, PageUp and PageDown, wheel, press-and-hold repeat, clamp | **Port** as Bundle + Behavior | Repeat is an interruptible Command. Floor `<input type=number>`. |
| `rangeControl` (T5): multiple thumbs keep order, `minStepsBetween`, drag via `move` | **Skip**; `@foldkit/ui/slider` | Check `@foldkit/ui`'s Slider against the research's RTL and page-step rows in Phase G. |
| `toggleState` (T5): `aria-checked` or `aria-pressed`, `indeterminate` | **Port** as attributes over input | Radio groups use `Selection`, not this. Floor is a native checkbox or switch. |
| `fieldAssociation` (T6): stable ids; `aria-labelledby`, `aria-describedby` listing description and error | **Port** as attributes over input | Ids live in the Model so they survive resume. `foldkit-mixins-form` is the natural home beside `Form.native`. |
| controlled bridge (T6): `bindable(propAtom \| initial)` | **Skip** | Foldkit has no controlled-versus-uncontrolled split; the parent Model owns the value always. |
| `observeResize` / `observeRect` (T7): `acquireRelease` around the observer | **Exists** (`foldkit-primitives/observers` `Resize()`, `Bounds()`) | Consider their `anchorPosition` rule: fail with a typed Message when the API is missing instead of emitting nothing. |
| `liveAnnounce` (T7), `presence` (T7) | covered above | |

### Widgets researched (`docs/kit-research/widgets/*.md`)

| Theirs | Here | How |
| --- | --- | --- |
| Combobox (K2): Idle / Focused / Suggesting / Interacting; the full keyboard contract | **Skip** the build; **Port** the contract as tests | Phase G: one Scene test per row (two-stage Escape, Alt+Arrow open without highlight, Ctrl+Home and Ctrl+End, PageUp and PageDown by ten, Tab commits only in inline modes, blur closes unless the pointer is over the content) against `@foldkit/ui/combobox`. Failures go upstream. |
| Dialog (K3): native `<dialog>`, `returnValue`, `scrollLock`, invoker commands | **Skip** the build; take two ideas | `ScrollLock` (above) and the `command="show-modal"` invoker check. |
| Popover (K3): `popover="auto"`, `focusScope`, hover-card mode, `modal` adds lock and trap | **Skip** the build | `DismissLayer` defers to `popover="auto"` as their research decided. |
| Select (K3): native versus custom, typeahead as flagship customer, Shift range | **Skip** the build | `Typeahead` and `Selection` cover the custom-list case for authors who are not using `@foldkit/ui/select`. |
| Tooltip (K3): hover with group timer, `popover="hint"`, keyboard-focus open only | **Skip** the build | The group timer Bundle under `Hover` is the reusable piece. |

### Kit and kit-adjacent modules (`src/kit`, `A11y.ts`, `Theme.ts`, `Mixin.ts`, `packages/css`)

| Theirs | Here | How |
| --- | --- | --- |
| `A11y.catalog` (`A11y.ts:195`): seven built-in pattern contracts, each tagged `stateful` or `stateless` and listing its ARIA roles (Dialog, Tooltip, Popover, Tabs, Slider, Calendar, DragAndDrop) | **Port** into `foldkit-mixins-ui` as `Patterns` | `foldkit-mixins` has `A11y.pattern` and `validate` and ships no patterns. `foldkit-mixins-ui` already declares every adapted component's Slots, so each adapter exports its pattern beside its Slots, and `Patterns.catalog` lists them with tier and roles. Custom views built from `foldkit-behaviors` entries validate against these. Add patterns for the kit-research widget anatomies with no `@foldkit/ui` adapter (Menu, Listbox, Combobox, Toast) so a custom one can be checked. |
| Kit registry and the mechanized gate (`kit/index.ts`): a test iterates every widget, renders its example props, runs `validate` against its declared pattern; example props typed against the component's own props (DQ-069) | **Port** as a test in `foldkit-mixins-ui` | One test over every adapter: resolve with no mixins, run `A11y.validate(XSlots, Patterns.X)`. Their weakness, the gate comparing a contract with itself, is avoided because the adapter's Slots come from `@foldkit/ui`'s attribute bundles and the pattern is written separately. |
| `platformFloor` (`kit/dialog.ts:45`): a closed record of which concerns the platform covers for a widget (focus trap, escape, inert, top layer, backdrop) | **Port** as metadata on each `foldkit-mixins-ui` adapter | A `floor` field with a closed union of concerns. `SurfaceView.describe` already emits deterministic metadata; the floor joins it, so a reviewer or an agent can ask "what does this widget rely on the browser for". |
| `Theme.lightDark(light, dark)` (`Theme.ts:53`): emits CSS `light-dark()`; `Theme.compose` (`:158`) merges themes at definition time; theme as an Effect service with a layer (`:21`, `:137`) | **Port** `lightDark` and `compose`; **Skip** the service | Add `Theme.lightDark` and `Theme.compose` to `foldkit-mixins`. `theme.ts` today says dynamic light/dark state belongs in the Model, which is right for a user-chosen theme; `light-dark()` is the other case, following the OS preference with no JavaScript and no Model field. Both stay: a token is a plain value, a `lightDark` pair, or a Model-driven class on the root, and `variables` compiles all three. The service is unnecessary: a theme here is data compiled into the stylesheet. |
| `@affe/css` `foundationStylesheet()` (`packages/css/src/index.ts:56`): the `@layer` order declared first, every token as a `--af-*` custom property, `color-scheme: light dark`; `cssLayerOrder` is a closed tuple so `inLayer('compnents')` is a compile error | **Port** as `Style.foundation(theme)` and a fixed layer order | `Style.stylesheet` gains a declared `@layer defaults, components, variants, utilities, app` order, `Style.inLayer(name, piece)` typed against the closed tuple, and `Style.foundation(theme)` emitting the layer declaration, the theme's variables, and `color-scheme`. A page ships this with zero JavaScript, and it is the natural companion to `SSR.static`. |
| Property-aware token resolution (`style-runtime.ts:16-82`): a bare token resolves only in its property's category, a dotted path anywhere | **Port** into `Theme.variable` resolution | Their bug was `display: 'none'` resolving through `radius.none`. Ours resolves `Theme.variable` references explicitly, so the bug cannot happen today; the port is the convenience of bare names, and only if a real theme wants it. Low priority. |
| Static extraction (`Style.extractStatic`, DQ-064) | **Exists** | Their styles apply at runtime and needed extraction to get CSS out. Ours compile to hashed classes and a deterministic stylesheet already (`Style.stylesheet`). Nothing to take. |
| `Mixin.ts`: declaration sugar folding fragments into a Behavior definition | **Skip** | `Behavior.forSlots` is already the declaration. A second way to declare one is the "bolt on a second way to do the same thing" the review checklist forbids. |
| `Clock`, `Locale`, `formatRelative`, `RelativeTime` (`kit/time.ts`) | **Exists** | Covered in the built table above. |
| `composables.ts`, `styled-composables.ts`: `createCombobox`, `createStyledCombobox` | **Skip** | Their pre-behavior imperative path, superseded in their own repository. |
| `SafeHtml.ts`: a branded trusted-markup type that renders only through one seam | **Exists** as Foldkit's trusted `InnerHTML` | `foldkit-ssr`'s static regions already use it. Nothing to take. |

### Style system (`Style.ts`, `style-runtime.ts`, `docs/style.md`)

Ours: `class`, `inline`, `compose`, `when`, `whenInput`, `pseudo`, `media`,
`supports`, `container`, `nest`, `keyframes`, `global`, `recipe` (one slot:
base, variants, defaults, compound), `forSlots`, `attach`, `stylesheet`;
`Theme.define`, `variable`, `variables`. Styles compile to deterministic
hashed classes and a deduplicated stylesheet. One documented limit: a rule
piece (`pseudo`, `media`, ...) may not sit inside `whenInput`
(`style:conditional-rules-unsupported`).

Theirs, beyond that list: `states`, `responsive`, `whenBinding`, selector
helpers (`attr`, `not`, `is`, `child`, `descendant`, `sibling`), `vars`,
`transition`, `animate`, `enter`, `exit`, `enterStagger`, `layoutAnimation`,
`grid` with typed areas, `layers`, `inLayer`, `globalLayer`, platform
diagnostics, bare token paths in values, a multi-slot `recipe` with `null`
deselect, `mergeRecipes`, `extendRecipeSlots`, an override `Provider`,
`attachToAllWithCapability`, `extractStatic`.

| Theirs | Here | How |
| --- | --- | --- |
| Rule pieces inside a runtime condition (their styles apply inline at runtime, so any piece can be conditional) | **Port**: lift `style:conditional-rules-unsupported` | A conditional rule piece compiles to its deterministic class as today; only the class's *presence* follows the condition. The class is static, the toggle is per input, so nothing about the compiler changes except that `assertRulesSupported` goes away and `resolveStyle` carries the rule class through. This is the one real hole in the current model. |
| `states({ open: piece })` (`Style.ts:379`): `[data-state="open"]` selectors after extraction | **Port** as `Style.states` | Compiles to `&[data-state="open"]` rules. Pairs with the Behavior catalog: every stateful entry writes `data-state` (Presence, Disclosure, Press, DismissLayer), so a page styles state with no JavaScript and no `whenInput`. The two coexist: `whenInput` when the view knows, `states` when the DOM knows. |
| `responsive({ md: piece })` (`:383`) | **Port** as `Style.responsive(theme, map)` | Sugar over `media` keyed by a theme's breakpoint tokens, so the names match `foldkit-primitives/media/breakpoints`. A misspelled breakpoint is a type error. |
| `whenBinding(IsOpen, true, piece)` (`:361`): typed dependency on a behavior binding, checked at attach | **Exists** as `whenInput` | The view's input is the Surface projection, typed end to end, which is what their binding witness approximates. Nothing to take. |
| `attr`, `not`, `is`, `child`, `descendant`, `sibling` (`:490-512`) | **Port** as `Selector.*` | `nest` already takes any selector string; these give typed builders so `&:not([aria-disabled="true"])` is not hand-typed in every recipe. Thirty lines. |
| `vars({ '--x': v })` (`:516`) | **Port** as `Style.vars` | Static custom properties on the slot, through `inline`. Snabbdom's style module writes `--` keys with `setProperty`, so this is a typed wrapper, not new plumbing. A reactive var is `whenInput` over `vars`. |
| `enter`, `exit` (`:526-530`) | **Port** as `Style.enter` and `Style.exit` compiling to `@starting-style` and `transition-behavior: allow-discrete` | Pure CSS, which their own Dialog and Popover research chose over the `presence` behavior. Works on server-rendered markup with no script, so it composes with `SSR.static`. `Presence` stays for the case where the Model must know the exit finished. |
| `enterStagger({ delay })` (`:534`) | **Port** as `Style.stagger` | Writes `--fk-index` through the per-item context (Phase A) and `transition-delay: calc(var(--fk-index) * <step>)`. No JavaScript timers. |
| `layoutAnimation` (`:538`, FLIP) | **Skip**; use Foldkit's view transitions | Foldkit's runtime has a `viewTransition` config. Add `Style.viewTransitionName(name)` as a one-line helper so a slot opts in; the browser does the FLIP. |
| `transition`, `animate` (`:403`, `:520`) | **Exists** as `inline` plus `keyframes` | Sugar only; not worth a name. |
| `grid` with typed areas (`:574`) | **Port**, low priority | `Style.grid({ areas })` returning typed area names so a child's `gridArea` cannot name an area the parent lacks. Only when a real layout wants it. |
| `layers`, `inLayer`, `cssLayerOrder`, `globalLayer` (`:584-621`) | **Port** in Phase H; **Skip** the service | Covered in the kit-adjacent table. |
| Platform diagnostics: `Style.platform`, `validatePlatform`, `Property` tokens (`:108`) | **Skip** | Our target is the DOM. `foldkit-react-codegen` emits TSX for the DOM too. If a non-DOM renderer ever appears, this is the shape. |
| Bare token paths in values (`padding: 'md'`, `color: 'text.primary'`) resolved by property category (`style-runtime.ts:16-82`) | **Skip** | Stringly. `Theme.variable(theme, group, name)` is checked by the type system, and the category bug that motivated their resolver cannot occur. |
| Multi-slot `recipe` with `slots`, `null` deselect, `recipe.without` (`:1498`) | **Port** as `Style.recipeFor(Slots)` | Ours is a one-slot recipe (their `variants`). Add the multi-slot form typed by the Slots contract, returning `StylePieces` for `forSlots`; a selection of `null` unsets an axis that has a default. Keep the one-slot `recipe` under its name. |
| `mergeRecipes(base, patch)` with `style:unknown-recipe-slot`, `extendRecipeSlots` (`:1560`, `:1637`) | **Port** as `Recipe.extend` and `Recipe.widen` | A patch naming a slot the base lacks raises `mixins:unknown-slot`, the diagnostic that already exists; widening is explicit. This is how a design system ships a recipe and an application adjusts it without forking. |
| Override `Provider` and `Style.override` (`:1110-1115`): per-subtree overrides through context | **Skip** | No context in Foldkit, and none wanted: an override is `Style.attach` at the use site, which is the inside-out model already. |
| `attachToAllWithCapability(piece, capability)` (`:1282`) | **Port** as `Style.forCapability(Capability.Focusable, piece)` | One piece for every slot with a compatible capability, resolved through the same lattice `Behavior.slot({ requires })` uses. A focus ring or a disabled treatment across an application in one line. |
| `extractStatic` (`:950`) | **Exists** | Ours compiles to CSS from the start. |
| Testing: `getStyle(prop)` on in-memory handles | **Exists** | `SlotView.inertBuilder` plus `Attributes.find`. |

These add two phases to the plan:

- **I. Style.** Lift the conditional-rules limit first, since `states`,
  `enter`, `exit`, and `stagger` all produce rule pieces an author will want
  under `whenInput`. Then `states`, `responsive`, `Selector`, `vars`, `enter`,
  `exit`, `stagger`, `viewTransitionName`, `recipeFor`, `Recipe.extend` and
  `widen`, `forCapability`. Test: a `pseudo` inside `whenInput` toggles its
  class with the input and emits one rule; a `states` piece styles a
  server-rendered `data-state` with no script; a patch naming an unknown slot
  raises `mixins:unknown-slot`; `enter` and `exit` emit `@starting-style`
  and `allow-discrete` and nothing else.

- **H. Kit-adjacent.** `Patterns` and the adapter gate in `foldkit-mixins-ui`,
  the `floor` metadata, `Theme.lightDark` and `Theme.compose`, the fixed
  layer order with `Style.inLayer` and `Style.foundation`. Test: every adapter
  passes its pattern; a misspelled layer fails to type check; the foundation
  sheet round-trips a theme's variables. Independent of A through G, so it can
  run first: it is small and touches only `foldkit-mixins` and
  `foldkit-mixins-ui`.

### Count

Built by them: 16 behaviors, 3 services, 1 widget behavior. Researched: 17
behaviors, 5 widgets. Roughly two thirds of the rows are Port, the rest
split between Reuse, Exists, Fold into, and Skip. Every Skip names what owns
it instead, and every Port names the defect it must not carry over.

## Risks

- **Per-item context is a `foldkit-mixins` change.** It is additive and
  small, but it touches the resolver's hot path; measure `buildersFor` before
  and after on the kitchen-sink example.
- **Two owners of keyboard events.** A view that already sets `OnKeyDown` on
  the container cannot attach `RovingTabindex`; the resolver refuses it,
  correctly. The entry documents that the view yields the key handling to the
  Behavior, or composes through `OnKeyDown` in the Bundle's Messages.
- **Layer stack placement.** One `DismissLayer` stack per application means
  an embedded program (`Runtime.embed`) inside a host with its own overlays
  cannot share a stack with the host. Acceptable: the embed's stack defers to
  native `popover="auto"` where the platform provides one.
