# `foldkit-primitives/interaction`

Keyboard, pointer, and focus patterns whose state a view's slots must
reflect: which item holds the tab stop, what the user has typed to find, whether
a button is pressed, which overlays are open, what is selected. Each is a
Bundle that keeps that state in the Model and a matching
[`foldkit-mixins`](../../mixins) Behavior that writes the attributes and
handlers onto the view's slots. Importing this subpath needs `foldkit-mixins`;
the other subpaths do not.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/interaction))

```text
place the Bundle          →  the Model holds the fact (current id, query, pressed, …)
attach its Behavior       →  the slots get tabindex, aria-*, data-*, and key handlers
the handler dispatches    →  update moves the fact; the view redraws from it
```

| Name | Keeps in the Model | For |
| --- | --- | --- |
| `RovingTabindex` | `{ current }` | one tab stop for a set of items, arrows between them |
| `Typeahead` | `{ query, generation }` | type-to-find, for a host whose focus is managed elsewhere |
| `ListNavigation` | `{ current, query, generation }` | a list host that wants both, in one placement |
| `GridNavigation` | `{ current }` | cells in rows: a calendar, a swatch picker |
| `TreeNavigation` | `{ current, toggled }` | a tree: a file explorer, a layers panel |
| `FocusScope` | nothing (a Mount) | keep focus inside an overlay |
| `Press` | `{ pressed, … }`; out `Pressed` | pointer, touch, Enter, Space, and AT clicks as one fact |
| `LongPress` | `{ … }`; out `LongPressed` | holding for a threshold |
| `Move` | nothing (a Mount) | pointer drag deltas |
| `Targets` | nothing (a Mount) | which marked descendant is hovered or pressed |
| `PointerDrag` | nothing (a Mount) | dragging one marked descendant onto another |
| `EditableText` | nothing (a Mount) | text typed into a `contenteditable` field |
| `FocusVisible` | `InputModality`'s `{ modality }` | a focus ring for keyboard users only |
| `DismissLayer` | `{ layers }`; out `Dismiss { ids }` | close overlays on Escape or an outside press |
| `Layers` | nothing (Mounts) | scroll lock and inert-outside for an overlay |
| `Selection` | `{ selected, anchor }` | selected items with `aria-selected` and Shift ranges |
| `LiveAnnounce` | the live regions' text | speak to assistive technology |

The pure rule behind each (`move`, `match`, `between`, `toDismiss`,
`targetOf`, `zoneOf`) is exported beside it, for a view that wires its own.

## Start with one: a toolbar with a roving tab stop

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'

const Tool = Schema.Struct({ id: Schema.String, label: Schema.String, disabled: Schema.Boolean })
type Tool = typeof Tool.Type

const Roving = Bundle.declare(RovingTabindex.bundle, 'toolbarFocus')
const Model = Schema.Struct({ ...Roving.fields, tools: Schema.Array(Tool) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Roving.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { orientation: 'horizontal', loop: true, virtual: false } as const
const placements = Page.assemble(Page.at(Roving, { args }))

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})
const describeTools = (tools: ReadonlyArray<Tool>) =>
  Behaviors.Collection.of(tools, { id: tool => tool.id, disabled: tool => tool.disabled })

// Collection writes the ids on each item; RovingTabindex focuses by them.
const Ids = Behaviors.Collection.behavior(ToolbarSlots)<Model, Message>({
  item: 'tool',
  items: model => describeTools(model.tools),
})
const Focus = RovingTabindex.behavior(Roving, args)(ToolbarSlots)<Model, Message>({
  container: 'root',
  item: 'tool',
  items: model => describeTools(model.tools),
})

const Toolbar = SlotView.forMessages<Message>()
  .define(ToolbarSlots, (model: Model, slots, h) => {
    const items = describeTools(model.tools)
    return h.div(
      slots.root.attrs([h.Role('toolbar')]),
      model.tools.map((tool, index) =>
        h.button(slots.tool.attrs([h.Key(tool.id)], items.slotItem(index)), [tool.label]),
      ),
    )
  })
  .pipe(Behavior.attach(Ids), Behavior.attach(Focus))
```

The Bundle's Model slice is `{ current }`, the current item's **id**, so a
reorder keeps the same item current and a resumed page knows where focus was.
The placement is written in `foldkit-bundle`'s explicit form here because the
Behavior takes the declaration (`Roving`) and the same `args`.

What each half of the Behavior does: the container gets `OnKeyDownFocus`,
which on an arrow, Home, or End focuses the next **enabled** item
synchronously by its id, prevents the default, and dispatches `Focused { id }`.
Each item gets `tabindex` `0` when it is the tab stop and `-1` otherwise, and
`OnFocus` reporting `Focused`, so a click makes an item current too. Before
anything is current, or when the current item is gone or disabled, the first
enabled item is the tab stop. Keys with ctrl, alt, or meta held are left
alone; `direction: model => 'rtl'` swaps left and right. Nothing is written on
dispose: the attributes are data, so a view that no longer attaches the
Behavior leaves no `tabindex` behind.

Args: `orientation` (`'vertical' | 'horizontal' | 'both'`), `loop`, and
`virtual`. Under `virtual` the items get no `tabindex`, the container gets
`aria-activedescendant`, and a key keeps DOM focus where it is and only moves
the pointer. The pure `move(enabled, current, key, modifiers, options)` and
`tabStop(items, current)` are exported. PageUp and PageDown are handled when
`move` is given a `page`, which `ListNavigation` does.

## Finding and moving

**`Typeahead`** is type-to-find for a host that has no roving tab stop, or
whose focus is managed elsewhere. The Model slice is `{ query, generation }`:
printable keys extend the query, a timer of `timeoutMs` on Effect's clock
clears it (`generation` lets a superseded timer change nothing), and `Cleared`
drops it on purpose. Which item a query picks is the pure
`Typeahead.match(texts, enabled, query, current)`: one character, or one
character repeated, starts *after* the current item so repeated presses cycle;
a longer query starts *at* it, since the user is refining. Case and leading
whitespace are ignored and disabled items are skipped. The Behavior,
`Typeahead.behavior(Declared)(Slots)<Model, Message>({ host, items, text, current })`,
gives the host `OnKeyDownFocus`: a printable key with no ctrl, alt, or meta
extends the query, focuses the match by id, and dispatches `Typed`; with no
match the key is still recorded and focus stays put; a space with an empty
query is left to the host.

**`ListNavigation`** is what a list host takes when it wants both: arrows,
Home, End, PageUp and PageDown by `page`, and typeahead, in **one placement**.
It exists for two reasons. The resolver allows one owner per event on a slot,
so `RovingTabindex` and `Typeahead` cannot both own the host's
`OnKeyDownFocus`; and under `virtual` a typed key must move the pointer and
extend the query in one transition, which two placements cannot do. Its Model
slice is `{ current, query, generation }`, its args are `RovingTabindex`'s
plus `timeoutMs` and `page`, and its Behavior takes `{ container, item, items,
text, direction? }`. `Typed { char, match }` carries the item the query now
picks, so `update` sets `current` and `query` together.

```ts
const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const navArgs = { orientation: 'vertical', loop: false, virtual: false, timeoutMs: 500, page: 10 } as const
const Keys = ListNavigation.behavior(Nav, navArgs)(ListSlots)<ListModel, ListMessage>({
  container: 'list',
  item: 'option',
  items: model => describeFruits(model.fruits),
  text: (model, index) => model.fruits[index]?.label ?? '',
})
```

**`GridNavigation`** is the two-dimensional counterpart for cells laid out in
rows of `columns` (a calendar grid, a swatch picker, an emoji palette). Its
Model slice and item attributes are `RovingTabindex`'s, so the two are
interchangeable on a view; only the pure `move` differs. Left and right step
within the row and up and down within the column, skipping disabled cells;
under `wrap` a horizontal key continues into the next row and a vertical key
into the next column, otherwise the key is consumed at the edge. Home and End
are the row's first and last enabled cell, Ctrl+Home and Ctrl+End the grid's.
RTL swaps left and right, and `virtual` works as it does for `RovingTabindex`.

```ts
const Cells = Bundle.declare(GridNavigation.bundle, 'cells')
const gridArgs = { columns: 7, wrap: false, virtual: false } as const
const DayKeys = GridNavigation.behavior(Cells, gridArgs)(CalendarSlots)<CalendarModel, CalendarMessage>({
  container: 'grid',
  item: 'day',
  items: model => describeDays(model.days),
})
```

**`TreeNavigation`** is the tree counterpart, after the WAI-ARIA tree pattern,
for a file explorer, a page's layers, or a nested menu: Up and Down through the
rows that are showing, Right opens a row or steps into it, Left closes it or
steps out to its parent, Home and End go to the first and last row. The view
gives every row, open or not, in tree order, each with its `parent` and
whether it is a `branch`; `TreeNavigation.shown(rows, model, args)` is the
rows that are showing, with their level and place among their siblings. The
Model slice is `{ current, toggled }`: openness is stored as the rows toggled
away from `openByDefault`, so a layers panel that starts open and a file tree
that starts closed are one bundle with a different arg. The Behavior writes
each showing row's `id` (through `domId`, by default the row's own),
`role="treeitem"`, `aria-level`, `aria-posinset`, `aria-setsize`,
`aria-expanded` on a branch, `aria-disabled`, a roving `tabindex`, and
`OnFocus`; the container's keys move focus by id, or open and close the
current row in place. Focus in the tree follows its stop when a transition it
did not see moves it or removes the focused row (the `FollowTabStop` Mount in
`foldkit-primitives/dom`, which never takes focus from outside the container).
The level is also the custom property `--fk-tree-level`, 1 at the top, so one
rule indents any depth: `padding-inline-start: calc(var(--fk-tree-level) * 1rem)`.

```ts
const Layers = Bundle.declare(TreeNavigation.bundle, 'layers')
const TreeKeys = TreeNavigation.behavior(Layers, { openByDefault: true })(TreeSlots)<TreeModel, TreeMessage>({
  container: 'tree',
  item: 'row',
  rows: model =>
    model.folders.map(folder => ({ id: folder.id, parent: folder.parent, branch: folder.hasChildren })),
})
```

The pure `move(shown, current, key, modifiers, model, args, direction?)`
answers with `Focus`, `Open`, or `Close`.

**`FocusScope`** is the one entry here that is a Mount, not a Bundle: which
element has focus is a DOM fact, so nothing crosses to the Model. The Mount
lives in `foldkit-primitives/dom`;
`FocusScope.behavior(Slots)<Input, Message>({ container, contain?, restore?, initialFocus? })`
attaches it to a container slot. On insert the container focuses
`initialFocus`, else its first tabbable descendant, else itself. With `contain`
(default), Tab from the last tabbable wraps to the first, Shift+Tab from the
first wraps to the last, and focus that lands outside comes straight back; Tab
in the middle is the browser's. On unmount, with `restore` (default), focus
returns to the element that had it, if it is still in the document. A native
`<dialog>` does all of this itself; this is for a custom overlay, a menu, or a
command palette.

## Pressing and dragging

**`Press`** turns pointer and keyboard activation of one element into one
fact. Foldkit's declarative pointer attributes carry no button, pointer id, or
click detail, so `Press.events` is a Mount that reports what the element saw
(`PointerDown`, `PointerUp`, `PointerCancelled`, `KeyDown`, `KeyUp`, `Clicked`),
and the Bundle's `update` decides: primary button only, one pointer at a time,
`pointerleave` and `pointercancel` cancel, Enter and Space with a repeat
ignored, a click with `detail` 0 (keyboard on a native control, or assistive
technology) counts, and the ghost click that follows a touch is ignored inside
a window of `clickSuppressionMs` that a Command on Effect's clock closes. Enter
and Space are default-prevented on the element, so a native control does not
also click and Space does not scroll. Activation is the OutMessage
`Pressed { pointerType, shiftKey }`, and the placement must handle it:

```ts
const Button = Bundle.declare(Press.bundle, 'saveButton')
const pressed = CardPage.assemble(
  CardPage.at(Button, {
    args: { clickSuppressionMs: 50 },
    onOut: () => model => ({ model, commands: [save(model)] }),
  }),
)
const Activate = Press.behavior(Button)(CardSlots)<CardModel, CardMessage>({
  target: 'save',
  disabled: model => model.saving,
})
```

The Behavior attaches the Mount to the target slot, writes `data-pressed`
while the element is down for styling, and marks a disabled target
`aria-disabled`, which the Mount reads at event time so nothing is reported and
no remount is needed. The Model slice is `{ pressed, pointerId, key,
suppressing, generation }`; only `pressed` is meant for a view.

**`LongPress`** is holding for `thresholdMs`. It reads the same facts
`Press.events` reports, so it needs no Mount of its own; the threshold is a
Command on Effect's clock carrying a generation, and a release before it fires
makes its `Elapsed` a no-op. `LongPressed { pointerType }` is the OutMessage,
required at placement. The Behavior writes `data-holding` while down. `Press`
and `LongPress` on one slot are refused by the resolver, since both would
mount `PressEvents`; a slot takes one of them.

**`Move`** is pointer movement as facts, a Mount in `foldkit-primitives/dom`:
a primary-button pointer down captures the pointer and reports `MoveStarted`,
each move reports `Moved { deltaX, deltaY }` from where it went down, and up,
cancel, or lost capture reports `MoveEnded { completed }`. A second pointer
and a secondary button are ignored; capture is released with the Mount.
`Move.behavior(Slots)<Input, Message>({ handle, toMessage })` attaches it to a
`Draggable` slot and maps each fact into the view's Messages; a drag's meaning
(a threshold, a snap, a reorder) is the parent's `update`.

**`Targets`** is which marked descendant of a container the pointer is over,
and which one was pressed, as one Mount on the container rather than one per
item. A descendant is marked by an attribute holding its id (a canvas's
`data-composition-node`, a table's `data-row`), and the nearest marked
ancestor of the event's target, inside the container, is the one reported:
`TargetHovered { id }` once per change, `null` when there is none or the
pointer leaves, and `TargetPressed { id, shiftKey, altKey, ctrlKey, metaKey }`
on a click. `preventDefault: true` stops a press's default, such as a link
navigating inside an editor's canvas. The Mount is
`Targets({ attribute, preventDefault })` in `foldkit-primitives/dom`;
`Targets.behavior(Slots)<Input, Message>({ container, attribute, preventDefault?, toMessage })`
attaches it. `targetOf(container, from, attribute)` is the pure lookup.

**`PointerDrag`** is dragging one marked descendant onto another, marked the
way `Targets` marks them. A primary press on one that moves more than
`DRAG_THRESHOLD` (4px) starts a drag (`DragStarted { id }`); then, once per
change, `DraggedOver { over }` says which other marked descendant the pointer
is over and in which third of its box, `{ id, zone: 'before' | 'inside' |
'after' }`, or `null`. Releasing is `DragDropped { id, over }`, and Escape, a
cancelled pointer, or a button found released mid-drag is
`DragCancelled { id }`. An Escape that cancels is heard on the way down and
goes no further, so the focused element's own Escape (a canvas's deselect)
does not also run. It follows the pointer that pressed and ignores a second
one; the element under it is found by position, so a touch or a pen, which the
browser captures to where it went down, drags too, once the marked elements
have `touch-action: none` so a finger drags rather than scrolls. The click a
drop ends with is swallowed, so a `Targets` on the same container does not
also press. A press in `contenteditable` text selects text and starts no drag.
It writes no roles, `tabindex`, or keys, so it sits beside a tree's or a
listbox's own; the keyboard's way to do what a drag does is yours to give.
Boxes are measured as the pointer moves and never kept; an element drawn as
`display: contents` is measured by its first child (`boxOf`). The Mount is
`PointerDrag({ attribute })` in `foldkit-primitives/dom`;
`PointerDrag.behavior(Slots)<Input, Message>({ container, attribute, toMessage })`
attaches it, and `zoneOf(box, y)` is the pure split.

A drag may also land somewhere other than among its own: with
`targets: { attribute: 'data-composition-node', within: '#page' }`, what is
dragged is still one of the container's marked descendants (a palette's
tiles), and `over` is an element marked by that attribute inside the one
`within` selects (the page's nodes). Its own tiles, and a matching element
outside that one, are then over nothing. `within` is looked for nearest first,
under the container's closest ancestor that holds a match, so two editors on
one page each drop onto their own page. Such a drag's `DraggedOver` and
`DragDropped` also carry `region`: whether the pointer is inside that element,
so `over: null` with `region: true` is its empty space (an empty page, the
space below its last node), and with `false`, elsewhere.

## Editing in place

**`EditableText`** is text typed into a marked descendant of a container while
it is `contenteditable`, as one Mount on the container. The view decides which
field is editable; the Mount focuses it as it becomes so (made editable, or
drawn editable), with the caret at its end, and at no other time: a field
editable all along, or another going away, moves no focus. It reads what is
typed:

- **Text, never markup.** It reads `innerText`. A field is one line unless it
  carries `aria-multiline="true"`, and in one line a line break becomes a
  space. Where the browser lacks `contenteditable="plaintext-only"`, a paste is
  inserted as its text.
- **`TextEdited { field, text }`** on each change, `field` being the marking
  attribute's value. Nothing is reported while an input method composes; the
  composed text arrives once.
- **`TextCommitted { field, text }`** on Enter (Shift+Enter breaks a line in a
  multiline field) or on leaving the field; **`TextCancelled { field, initial }`**
  on Escape, which also puts the text the field had when the edit began (on
  focus, or on the first keystroke after an edit ended) back in the DOM, the
  caret at its end. A view that stopped redrawing the field while it was edited
  would not. An edit ends once: the blur after Enter commits nothing more.
- **Focus comes back to the container** when Enter or Escape ended an edit and
  the view then removes the field or makes it no longer editable, which leaves
  focus on nothing; give the container a `tabindex`, and the next key (an
  undo) reaches it. A field left by the author keeps no such claim.
- **`EditAsked { field }`** on a double-click over a marked field that is not
  editable yet: the view's cue to make it so.

The Mount is `EditableText({ attribute })` in `foldkit-primitives/dom`;
`EditableText.behavior(Slots)<Input, Message>({ container, attribute, toMessage })`
attaches it. What a change means (a prop set, an undo group) is the parent's
`update`.

## Focus rings, overlays, selection, announcements

**`FocusVisible`** is the one entry whose Bundle lives elsewhere:
`InputModality` in `foldkit-primitives/events` keeps `{ modality }`.
`FocusVisible.behavior(Declared)(Slots)<Model, Message>({ target })` writes
`data-focus-visible` on the target while the page is driven by keyboard, so a
stylesheet shows a ring with `[data-focus-visible]:focus`. CSS `:focus-visible`
does this with no Model at all; this is for a design system that must decide
in the Model, or show the same answer somewhere other than the focused
element.

**`DismissLayer`** closes overlays that are not native `<dialog>` or `popover`
elements: Escape closes the topmost open layer, and a pointer press closes the
layers it is outside of. One Bundle, **placed once**, owns the document
listeners; each layer's Behavior marks its container with
`data-foldkit-plus-layer="<id>"` and its trigger with the matching trigger
attribute. The stack is the DOM order of the marked elements at the moment of
the event, so a layer takes part exactly while it is rendered and an `open`
flag in the parent Model is its whole lifecycle; nothing registers. The rules,
each a test: a press inside a parent layer is outside its children, so the
parent stays and the children go; a press on a layer's trigger counts as
inside it, so a click on the trigger never dismisses and reopens; a layer
placed with `outsidePress: false` or `escape: false` opts out of that path.
`Dismiss { ids }` is the OutMessage, and the placement's `onOut` closes them:

```ts
const Stack = Bundle.declare(DismissLayer.bundle, 'layers')
const dismissable = MenuPage.assemble(
  MenuPage.at(Stack, {
    onOut:
      ({ ids }) =>
      model => ({ model: { ...model, menuOpen: ids.includes('menu') ? false : model.menuOpen } }),
  }),
)
const Dismissable = DismissLayer.behavior(Stack)(MenuSlots)<MenuModel, MenuMessage>({
  layer: 'panel',
  trigger: 'button',
  id: () => 'menu',
})
```

The Model slice is `{ layers }`, the open layers as the last event saw them,
for DevTools and agents. `toDismiss(layers, inside)` is the pure rule.

**`Layers.scrollLock(Slots)({ container })`** and
**`Layers.hideOutside(Slots)({ container })`** attach the `ScrollLock` and
`HideOutside` Mounts from `foldkit-primitives/dom`: the first locks the
document's scroll while the container is mounted, refcounted so nested
overlays release together; the second marks everything outside the container
inert while it is mounted. A native `<dialog>` shown modally needs neither.

**`Selection`** is which items are selected, with `mode` `'single'` (a click
replaces; `allowEmpty` says whether clicking the selected item deselects it),
`'multiple'` (a click toggles), or `'none'`, and the `anchor` a range extends
from. The Model slice is `{ selected, anchor }`. A range needs the items'
order, which the view knows and the Bundle does not, so `Ranged { id, order }`
carries it; `Selection.between(order, from, to)` is the pure span. The
Behavior, `Selection.behavior(Declared, args)(Slots)<Model, Message>({ container?, item, items, click? })`,
writes `aria-selected` on each item and `aria-multiselectable` on the
container, and wires a plain click on each enabled item to `Activated`; pass
`click: false` when `Press` or the view owns the click. For a Shift range,
`Press`'s `Pressed { pointerType, shiftKey }` says whether Shift was held, and
the placement's `onOut` dispatches `Ranged`. For a selection no slot has to
reflect, `SelectionSet` in [`state`](../state/README.md) is lighter.

**`LiveAnnounce`** speaks to assistive technology: one Bundle, placed once,
holds the text of a polite and an assertive live region.
`say(Declared)(text, politeness?)` builds the Message to return from `update`
or an `onOut`; an announcement waits `debounceMs` so a burst reads once, then
clears after `clearAfterMs`, both on Effect's clock with a generation so a
superseded timer changes nothing; the same text twice gets a trailing no-break
space toggled, which is what makes a screen reader read it again.
`LiveAnnounce.view(slice, h)` renders the two regions: put it once in the page
and hide them visually with a rule on `[data-foldkit-plus-live]`, never
`display: none`.

## Failure

A Behavior writes data, so a view that stops attaching it leaves nothing
behind. The resolver refuses two owners of one event on a slot (`Press` with
`LongPress`, `RovingTabindex` with `Typeahead`): take `ListNavigation` or pick
one. Without a DOM a Mount here emits nothing.
