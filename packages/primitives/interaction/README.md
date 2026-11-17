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
| `SpatialNavigation` | `{ current }` | freely placed items: a board, a canvas, a dashboard of cards |
| `TreeNavigation` | `{ current, toggled }` | a tree: a file explorer, a layers panel |
| `FocusScope` | nothing (a Mount) | keep focus inside an overlay |
| `FocusRecovery` | nothing (a Mount) | keep focus when its part is removed or hidden |
| `InlineEdit` | `{ editing }`; out `Committed` | edit a plain value where it is shown, in an `<input>` |
| `Presence` | nothing (draws the Model's phase) | a leaving row that takes no click, Tab or focus |
| `Press` | `{ pressed, … }`; out `Pressed` | pointer, touch, Enter, Space, and AT clicks as one fact |
| `LongPress` | `{ … }`; out `LongPressed` | holding for a threshold |
| `SwipeActions` | `{ open }`; out `FullSwiped` | which side of a row is open, what a swipe's release means, and its keys |
| `Repeat` | `{ holding, count, … }`; out `Stepped`, `Ended` | a held stepper button |
| `Move` | nothing (a Mount) | pointer drag deltas |
| `Targets` | nothing (a Mount) | which marked descendant is hovered or pressed |
| `PointerDrag` | nothing (a Mount) | dragging one marked descendant onto another |
| `Marquee` | nothing (a Mount) | a lasso over the marked descendants, from a press on empty space |
| `Reorder` | `{ held, over }`; out `Moved`, `PickedUp`, `PassedOver`, `PutBack` | moving an item in a list or tree, by keys and by pointer |
| `EditableText` | nothing (a Mount) | text typed into a `contenteditable` field |
| `FocusVisible` | `InputModality`'s `{ modality }` | a focus ring for keyboard users only |
| `DismissLayer` | `{ layers }`; out `Dismiss { ids }` | close overlays on Escape or an outside press |
| `Layers` | nothing (Mounts) | scroll lock and inert-outside for an overlay |
| `Selection` | `{ selected, anchor, ranged }` | selected items with `aria-selected` and Shift ranges |
| `LiveAnnounce` | the live regions' text | speak to assistive technology |
| `Overlay`, `Placing` | nothing (Behaviors) | one policy for an overlay's dismissal, focus and locks; keep a panel in the viewport |
| `BundleBehavior` | nothing | write the Behavior half of a Bundle you author |

The pure rule behind each (`move`, `match`, `nearest`, `between`, `toDismiss`,
`targetOf`, `zoneOf`) is exported beside it, for a view that wires its own.

## Choosing between near neighbours

Four pairs look alike. Each answer is the one fact that differs.

**Arrow keys over items.** Pick by how the items are laid out.

| The items are | Take | Because |
| --- | --- | --- |
| one row or column, no typing to find | `RovingTabindex` | the smallest: one tab stop, arrows, Home and End |
| one row or column, and typing finds one | `ListNavigation` | `RovingTabindex` plus `Typeahead` in one placement: a container has one `keydown` owner, so the two cannot be placed side by side |
| cells in rows of a fixed `columns` | `GridNavigation` | up and down mean the same column |
| nested, some of them open | `TreeNavigation` | Left and Right open, close and step out; openness is in the Model |
| placed anywhere, with no rows or columns | `SpatialNavigation` | the nearest item drawn that way, measured when the key is pressed |

`Typeahead` alone is for a host whose focus is managed elsewhere.

**Keeping focus.** The four differ by what makes focus move.

| Take | It acts when | And moves focus to |
| --- | --- | --- |
| `FocusScope` | an overlay mounts and unmounts | in: its first tabbable; contained while open; out: back to the opener |
| `FocusReturn` | an overlay whose own restoring is not ours unmounts with focus lost (a native `<dialog>`) | the opener, else by `FocusRecovery`'s steps, else the layer below |
| `FocusRecovery` | the focused part is removed, hidden, made `inert` or moved | the part's declared steps (`next`, `previous`, `parent`, `{ part }`, `owner`) |
| `FollowTabStop` | a transition moves or removes the roving stop's row | the container's stop (the roving primitives and `TreeNavigation` attach it themselves) |

`FocusScope` and `FocusReturn` are about an overlay; `FocusRecovery` and
`FollowTabStop` are about a list that changes under the focus. A custom overlay
takes `FocusScope`; add `FocusReturn` when something else restores focus.

**Editing text.** `InlineEdit` edits a plain value in an `<input>` and keeps the
draft in the Model; the parent saves or refuses the `Committed` value.
`EditableText` reads the text typed into a `contenteditable` field the view
already draws (a label on a canvas, a node's title), one or several lines, and
reports it as it changes.

**Moving things.** `Move` reports a pointer drag's deltas for one element (a
window, a handle). `PointerDrag` drags one marked descendant onto another
(a place in a list). `Marquee` moves nothing: it reports the marked items a lasso
from empty space covers. `Reorder` is the keyboard's path
and the pointer's, as one draft (`Moved { id, to }`) for a list or tree, and
uses `PointerDrag` itself. For a window or card, a key and a drag share
`Move.nudge` and `Box` (in [`state`](../state/README.md)).

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

## The pair, in one helper

`BundleBehavior.fromBundle(declared)(slots)<Input, ParentMessage>(spec, { name })`
writes the Behavior half from the placement. `Input` must hold the Bundle's
Model at `declared.field`, so an attribute reads the placed slice; each slot
takes `{ requires?, attributes?, events? }`:

- `attributes` gets `{ input, h, item?, send }`. `send` wraps one of the
  Bundle's Messages for the parent, for a handler the Behavior writes itself
  (`h.OnClick(send(Selection.Message.Activated({ id })))`).
- `events` is the Bundle's own Mount (`Press.events()`); the helper supplies
  `Mount.mapMessage`, so each fact reaches the parent wrapped in the placement's
  variant.

`Press.behavior` and `Selection.behavior` are thin wrappers over it: the Press
section below builds the `Button` declaration, then passes one slot with the
`Interactive` capability, the pressed `data-*` attribute, and `Press.events()`.

The slots named are checked at definition time by `Behavior.forSlots`
(`mixins:unknown-slot`, `mixins:hidden-slot`), not by the spec's type: a
caller's target is often a computed key (`options.target`), so the key set
stays a runtime contract while the Model and Messages stay typed. The Bundle
still owns the state and `update`; the helper only removes the repeated
wrapper/mount wiring, and a Behavior still owns none.

## What a parent decides: helpers

A Behavior reports what a person did, and the Bundle applies it. A parent
never builds those Messages: when the parent itself decides something, it calls
the Bundle's helper, which runs the same `update` with the placement's args.

| Bundle | Helpers on the placement |
| --- | --- |
| `Selection` | `activate(id)` (as a plain click), `select(id)` (replace with one item and anchor), `range(id, order)` (as a Shift click), `replace(ids)`, `clear()` |
| `TreeNavigation` | `focus(id)`, `open(id)`, `close(id)`, `toggle(id)` (open or shut by the tree's own state) |
| `RovingTabindex`, `ListNavigation`, `GridNavigation` | `focus(id)` |
| `Typeahead` | `clear()` |
| `LiveAnnounce` | `announce(text, politeness?)` |

Each is an `Update.Step` of the parent: `Picks.helpers.activate(id)(model)` in
`update`, after the placement `Picks = Parent.at(Bundle.declare(Selection.bundle,
'picks'), { args })`. A control the parent draws for a child, such as a tree
row's expander, sends a Message of the parent's own (`ToggledRow({ id })`), and
`update` calls `Nav.helpers.toggle(id)`. That keeps every fact the child applies
inside the child, which `@foldkit/oxlint-plugin`'s
`no-child-message-construction-in-root` checks. `Press`, `LongPress` and
`DismissLayer` have no helpers: everything they apply is an input event.

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
text, direction?, typeahead?, commit? }`. `typeahead: false` leaves printable keys to
the container (a search field); arrows still move the pointer. `commit(input, id)`
runs on unmodified Enter when `current` is an enabled item and returns that
parent Message from the same handler, so the field does not grow a second key
listener. `Typed { char, match }` carries the item the query now picks, so
`update` sets `current` and `query` together.

<!-- docs-check
const Fruit = Schema.Struct({ id: Schema.String, label: Schema.String })
type Fruit = typeof Fruit.Type
const describeFruits = (fruits: ReadonlyArray<Fruit>) =>
  Behaviors.Collection.of(fruits, { id: fruit => fruit.id })
const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Focusable }),
})
const ListModel = Schema.Struct({
  ...Bundle.declare(ListNavigation.bundle, 'nav').fields,
  fruits: Schema.Array(Fruit),
})
type ListModel = typeof ListModel.Type
const ListMessage = defineMessageUnion({ ...Bundle.declare(ListNavigation.bundle, 'nav').cases })
type ListMessage = typeof ListMessage.Type
-->

```ts
import { ListNavigation } from 'foldkit-primitives/interaction'

const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const navArgs = { orientation: 'vertical', loop: false, virtual: false, timeoutMs: 500, page: 10 } as const
const Keys = ListNavigation.behavior(Nav, navArgs)(ListSlots)<ListModel, ListMessage>({
  container: 'list',
  item: 'option',
  items: model => describeFruits(model.fruits),
  text: (model, index) => model.fruits[index]?.label ?? '',
})
```

**Routes.** `RovingTabindex`, `ListNavigation`, `GridNavigation`,
`TreeNavigation` and `Typeahead` each export `keys`, the route their Behavior
installs as the container's one `keydown` handler (and `SpinValue.keys` in
`foldkit-mixins`). `keys` takes the same placed Bundle and args as `behavior`,
then the options without the slot names, and returns a `Keys.route`, so a
field that also wants Escape to clear lists it beside its own route in one
`Keys.behavior` instead of failing `mixins:event-conflict`. A route declares
the chords it takes, each with Shift up and down (the moves ignore Shift), so
`Keys.chord('ArrowDown')` beside `ListNavigation.keys` throws
`mixins:key-conflict` at definition, and `ListNavigation.keys` declares every
printable key unless `typeahead` is `false`. Under `virtual` the route
answers the Message alone; otherwise it also moves focus to the item. A
`Keys.behavior` writes only `keydown`: the router's slot gets none of the
primitive's other attributes. `ListNavigation.item(Nav, args)(Slots)({ item,
items })` is its item half, each item's tab stop and the `OnFocus` reporting
it current; for the other primitives draw `RovingTabindex.itemAttributes` on
the items. Draw `aria-activedescendant` on the container yourself under
`virtual`, or attach the primitive's own `behavior` when no other route
shares its slot.

**`GridNavigation`** is the two-dimensional counterpart for cells laid out in
rows of `columns` (a calendar grid, a swatch picker, an emoji palette). Its
Model slice and item attributes are `RovingTabindex`'s, so the two are
interchangeable on a view; only the pure `move` differs. Left and right step
within the row and up and down within the column, skipping disabled cells;
under `wrap` a horizontal key continues into the next row and a vertical key
into the next column, otherwise the key is consumed at the edge. Home and End
are the row's first and last enabled cell, Ctrl+Home and Ctrl+End the grid's.
RTL swaps left and right, and `virtual` works as it does for `RovingTabindex`.
Given a `page` in its args, PageUp and PageDown move that many rows (at the
same column, stopping at the first and last row); without one they are left to
the page. `routes`, an option of `GridNavigation.behavior` as of `InlineEdit.behavior`
and `Tabs`, are the application's keys (Space, Ctrl+A) on the grid's one
`keydown` owner: the grid answers its own keys, then yours, and a route on a key
the grid takes, Shift+arrow included, throws `mixins:key-conflict` at definition,
naming both.

**`SpatialNavigation`** is arrow keys over freely placed items (a board, a
canvas, a dashboard of cards), where there are no rows or columns: each arrow
moves the one tab stop to the nearest item drawn in that direction, measured
when the key is handled and never kept, so an item that moved between two
presses is found where it is now. The rule is the pure `nearest(items, current,
direction)`, and directions are physical (left is left in a right-to-left
page). Its Model slice and item attributes are `RovingTabindex`'s. Like
`RovingTabindex` it provides `A11y.Navigation` on the container and
`A11y.FocusStrategy` on each item. Its one arg, `id`, names the board on the
page, so two boards each find their own items.

The `item` slot must have `Capability.Focusable`, since each item takes the tab stop and
focus; a slot of another capability (a `Container`) throws `mixins:capability-mismatch`
(`Behavior requires capability "Focusable" on slot "card", which has "Container"`) when the
Behavior is defined. A `Container` or an `Interactive` slot is fine for the `container`. A card that
`Selection` also drives takes `Focusable` too, which satisfies Selection's `Interactive` item.

<!-- docs-check
const Card = Schema.Struct({ id: Schema.String, disabled: Schema.Boolean })
type Card = typeof Card.Type
const describeCards = (cards: ReadonlyArray<Card>) =>
  Behaviors.Collection.of(cards, { id: card => card.id, disabled: card => card.disabled })
const BoardSlots = Slots.define({
  board: Slot.make({ capability: Capability.Interactive }),
  card: Slot.make({ capability: Capability.Focusable }),
})
const BoardModel = Schema.Struct({
  ...Bundle.declare(SpatialNavigation.bundle, 'board').fields,
  cards: Schema.Array(Card),
})
type BoardModel = typeof BoardModel.Type
const BoardMessage = defineMessageUnion({
  ...Bundle.declare(SpatialNavigation.bundle, 'board').cases,
})
type BoardMessage = typeof BoardMessage.Type
-->

```ts
import { SpatialNavigation } from 'foldkit-primitives/interaction'

const Board = Bundle.declare(SpatialNavigation.bundle, 'board')
const BoardKeys = SpatialNavigation.behavior(Board, { id: 'cards' })(BoardSlots)<
  BoardModel,
  BoardMessage
>({
  container: 'board',
  item: 'card',
  items: model => describeCards(model.cards),
})
```

**`InlineEdit`** edits a plain value where it is shown, in an `<input>`: Enter,
F2, a double click or a typed key starts, Enter saves, Escape puts it back and
closes no dialog around it. The Model slice holds the item being edited, its
draft and the parent's refusal; nothing is read back from the field. A changed
value commits as the `Committed` OutMessage, which the placement's `onOut`
saves or hands back to `refuse` with a reason, keeping the editor open on the
same draft; an unchanged value commits nothing. Enter and Escape on the field
are `Behaviors.Keys` routes; its `routes` option adds more (Tab moving to the
next cell), and a route on a key it already owns is a `mixins:key-conflict`
naming both. The placement's helpers are `start(id, text)` (a Rename menu item
begins an edit) and `refuse(committed, error)`, which `onOut` calls to reopen
the editor on the same draft with a reason; `blur` says whether leaving the
field commits or cancels, and the field needs an `aria-label` of its own.

<!-- docs-check
const Note = Schema.Struct({ id: Schema.String, title: Schema.String })
type Note = typeof Note.Type
import { Event } from 'foldkit-mixins'
const NoteSlots = Slots.define({
  title: Slot.make({ capability: Capability.Focusable }),
  field: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  error: Slot.make({ capability: Capability.Base }),
})
const NoteModel = Schema.Struct({
  ...Bundle.declare(InlineEdit.bundle, 'rename').fields,
  notes: Schema.Array(Note),
})
type NoteModel = typeof NoteModel.Type
const NoteMessage = defineMessageUnion({ ...Bundle.declare(InlineEdit.bundle, 'rename').cases })
type NoteMessage = typeof NoteMessage.Type
const NotePage = Bundle.parent({ Model: NoteModel, Message: NoteMessage })
-->

```ts
import { modifyFields } from 'foldkit/struct'
import { InlineEdit } from 'foldkit-primitives/interaction'

const Rename = Bundle.declare(InlineEdit.bundle, 'rename')
const renameArgs = { id: 'notes', blur: 'commit' } as const
const Renamed = NotePage.at(Rename, {
  args: renameArgs,
  onOut: committed => model => ({
    model: modifyFields(model, {
      notes: notes =>
        notes.map(note => (note.id === committed.id ? { ...note, title: committed.value } : note)),
    }),
  }),
})
const Renames = InlineEdit.behavior(Rename, renameArgs)(NoteSlots)<NoteModel, NoteMessage>({
  display: 'title',
  input: 'field',
  error: 'error',
  value: (model, id) => model.notes.find(note => note.id === id)?.title ?? '',
})
```

<!-- docs-check
const Day = Schema.Struct({ id: Schema.String })
type Day = typeof Day.Type
const describeDays = (days: ReadonlyArray<Day>) =>
  Behaviors.Collection.of(days, { id: day => day.id })
const CalendarSlots = Slots.define({
  grid: Slot.make({ capability: Capability.Container }),
  day: Slot.make({ capability: Capability.Focusable }),
})
const CalendarModel = Schema.Struct({
  ...Bundle.declare(GridNavigation.bundle, 'cells').fields,
  days: Schema.Array(Day),
})
type CalendarModel = typeof CalendarModel.Type
const CalendarMessage = defineMessageUnion({
  ...Bundle.declare(GridNavigation.bundle, 'cells').cases,
})
type CalendarMessage = typeof CalendarMessage.Type
-->

```ts
import { GridNavigation } from 'foldkit-primitives/interaction'

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
`foldkit-primitives/dom`, which never takes focus from outside the container,
and reads only the tree's own stops: each roving primitive marks its container
`data-fk-roving`, so a row holding a `RovingTabindex` toolbar keeps the toolbar's).
A tree that also wants a fallback when the last row goes has `FocusRecovery` on its container or
around it, with the rows as parts: while a row is left, `FollowTabStop` takes the tree's stop, and
`FocusRecovery`'s steps run once none is.
The level is also the custom property `--fk-tree-level`, 1 at the top, so one
rule indents any depth: `padding-inline-start: calc(var(--fk-tree-level) * 1rem)`.

<!-- docs-check
const Folder = Schema.Struct({
  id: Schema.String,
  parent: Schema.NullOr(Schema.String),
  hasChildren: Schema.Boolean,
})
const TreeSlots = Slots.define({
  tree: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const TreeModel = Schema.Struct({
  ...Bundle.declare(TreeNavigation.bundle, 'layers').fields,
  folders: Schema.Array(Folder),
})
type TreeModel = typeof TreeModel.Type
const TreeMessage = defineMessageUnion({
  ...Bundle.declare(TreeNavigation.bundle, 'layers').cases,
})
type TreeMessage = typeof TreeMessage.Type
-->

```ts
import { TreeNavigation } from 'foldkit-primitives/interaction'

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
returns to the element that had it; when that is gone (removed by the action
the overlay was opened for, or drawn again) and focus went with the scope, it
goes by the rules of [`FocusReturn`](../dom/README.md): an element with the
same `id`, the opener's `FocusRecovery` steps, the layer below, the page's
first tabbable element. Focus the user moved elsewhere stays. A native
`<dialog>` does all of this itself; this is for a custom overlay, a menu, or a
command palette.

**`FocusRecovery`** keeps focus when the element that has it goes away: a
removed row, a clear button that leaves with the text, a part made `inert`,
`hidden` or `disabled`. The browser drops focus to `body`; the Mount runs in the same task as the change, before that,
and moves focus along a fallback the application declares. Like `FocusScope` it
is DOM, not state: nothing crosses to the Model except what the target's own
`OnFocus` already reports. Where `FocusScope` acts when a scope appears or goes
and `FollowTabStop` follows a roving stop, `FocusRecovery` acts only on focus
that was lost with a part.

```text
focus on a marked part, remembered with its slot, key and neighbours
  -> the part is removed, hidden, made inert/disabled, or moved in the tree
  -> focus is lost (not moved: a dialog the action opened keeps it)
  -> the part's steps in order, until one can take focus
  -> none: the next owner out decides; with none, focus stays where it is
```

<!-- docs-check
const RecoverySlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  clear: Slot.make({ capability: Capability.Interactive }),
  row: Slot.make({ capability: Capability.Focusable }),
})
interface RecoveryInput {
  readonly rows: ReadonlyArray<{ readonly id: string }>
}
const RecoveryView = SlotView.over(RecoverySlots)<RecoveryInput, never>()
-->

```ts
import { FocusRecovery } from 'foldkit-primitives/interaction'

const Recovers = FocusRecovery.behavior(RecoveryView)({
  owner: 'root',
  parts: {
    input: [],
    clear: [{ part: 'input' }],
    row: ['next', 'previous', { part: 'input' }],
  },
})
```

`owner` is a slot of the contract, and a `{ part }` step names a key of `parts`, so a step
to a part `parts` does not declare is a type error. A key of `parts` that is a slot is marked on
it. A key that is no slot names a part a widget draws itself: an Alert's or a Card's
`recoveryPart: 'dismiss'` marks its dismiss button as that part, so `parts: { dismiss: ['next',
'previous', { part: 'add' }], add: [] }` recovers to it without declaring a `dismiss` slot that is
never drawn. Such a name is not checked against the widget, so a misspelling on either side finds
nothing. The `{ part }` check needs the inferred form, `behavior(Bound)({ … })` over a
`SlotView.over(Slots)<Input, Message>()` binder: TypeScript cannot infer part of a call's type
arguments, so `behavior(Slots)<Input, Message>({ … })` checks a `{ part }` against any string. The Behavior draws marks, which a
server render has: `data-fk-focus-owner` on the owner, `data-fk-focus-part`
on each part, and `data-fk-focus-key` from `item.id` on a slot drawn per item.
Attach it beside the Behaviors already on the owner: the resolver composes
their Mounts. It is opt-in, since a Mount that sends no Message cannot be
resolved by a Scene test of every page that draws the component.

The steps of a part, in order, until one finds an element that is connected,
showing, and focusable (and this owner's own):

| Step | Finds |
| --- | --- |
| `same` | the part with the held slot and key, drawn again (a keyed reorder moves a focused row, and the browser drops focus) |
| `next`, `previous` | the nearest part of the same slot after or before the held one, in the order last seen while it was focused |
| `parent` | the part named by `parent: (input, item) => Option<id>` (a tree drawn flat), else the closest part around it |
| `stop` | this owner's part with `tabindex="0"` |
| `{ part }` | the first part of that slot |
| `owner` | the owner element, when it is focusable |

Focus moves with `preventScroll`, then `scrollIntoView({ block: 'nearest' })`,
which moves nothing when the target is showing. It never moves when focus is
somewhere else (the user, or an action that opened a dialog, got there first),
and a claim ends once decided, so a part drawn later takes nothing. Owners
nest: the innermost one decides; one with no step left sends a bubbling
`foldkit-plus:focus-unrecovered`, and the next owner out with a part of its
own around the inner one acts for that part (an owner between with none lets
it pass); with none left focus stays on `body`, and it
never goes outside the owners it was in. A whole owner removed decides
nothing; its outer owner does.

A row that is not drawn yet is not found: `next` sees what is drawn. For a
windowed list, let `update`, which knows the row it wants, scroll and focus by
Command after the scroll settles (`ListNavigation`'s `helpers.focus`, then
`Dom.focus`); a Mount that held "focus row 41 when it appears" would take
focus from a user who has moved on. Ids are read as attributes and compared as
strings, never put in a selector, so `a:b` and `x"y` work.

## `Presence`: a leaving row is out of reach

`Presence` (from `foldkit-primitives/motion`) owns *when* a row leaves: its
Model holds `shown`, `hiding` or `hidden`, and `Hide` yields a timed `Hidden`
fact. The Behavior here owns what the row is *while* it leaves: it reads the
phase the Model already holds and draws `data-presence="shown|hiding"` and, for
every phase but `shown`, `inert`. It sends no Message and mounts nothing, so a
Scene test resolves it.

```text
Hide -> the frame draws inert  -> FocusRecovery moves focus  -> Hidden -> the row is removed
        (no click, Tab, focus)     (one move, in that frame)      (finds focus elsewhere: moves nothing)
```

Five facts, kept apart: the application's Model says whether the user wants
the row; `isVisible(presence)` says to keep drawing it; `phase === 'shown'` says
it may be pressed and read; removal is the view ceasing to draw it. The row's
data and its presence are two facts with two owners, joined in one `update`:
the parent sends `Hide` to the row's placement on dismiss and removes the row
from its own data on that placement's `Hidden`.

<!-- docs-check
const LeaveSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
interface LeaveInput {
  readonly rows: ReadonlyMap<string, { readonly phase: 'shown' | 'hiding' | 'hidden' }>
}
const LeaveView = SlotView.over(LeaveSlots)<LeaveInput, never>()
-->

```ts
import type { SlotItem } from 'foldkit-mixins'
import { FocusRecovery, Presence } from 'foldkit-primitives/interaction'

// Every row drawn has a placement, so a row without one is a bug to report, not a phase to guess.
const phaseOf = (input: LeaveInput, item: SlotItem | undefined): Presence.Phase => {
  const placed = item?.id === undefined ? undefined : input.rows.get(item.id)
  if (placed === undefined) throw new Error(`row ${item?.id} is drawn with no Presence placed`)
  return placed.phase
}

const Leaves = Presence.behavior(LeaveView)({ content: 'row', phase: phaseOf })
const RecoversLeaving = FocusRecovery.behavior(LeaveView)({
  owner: 'list',
  parts: { row: ['next', 'previous', 'owner'] },
})
```

Place one `Presence` per row with `Presence.bundle.each(link, { args: { durationMs } })`
(the bundle is `foldkit-primitives/motion`'s `Presence`, re-exported as `bundle`).
`content` is a slot of the contract, so a misspelling is a type error; `phase`
is given the slot's item, or `undefined` for a slot drawn once, such as a popup.
Read the rows by id from a `Map` (an object indexed by an id reads `constructor`
from its prototype), and refuse a row with no placement rather than guess a
phase: `'hidden'` would draw a live row `inert`.
A recipe styles the exit on `[data-presence="hiding"]`, its duration the theme's
motion token times `travel`, the same number `durationMs` is given. Under
`Motion.reduced` the `Hidden` fact arrives at once, through the same two
Messages.

`inert`, not `aria-hidden` (which leaves focus inside the row) and not `hidden`
(which would end the animation). Focus leaves a part in the frame it turns
`inert`, before the browser would drop it to `body`, so attach `FocusRecovery`
beside it; at removal focus is already elsewhere and nothing moves a second
time. A `Show` before `Hidden` wins (the late fact carries an older generation
and is refused): `inert` goes with the next frame and nothing refocuses the row,
since `FocusRecovery` acts only on lost focus. A surface that took focus during
the exit, such as a dialog the press opened, keeps it. The completion owner is
the timeout Command; a `transitionend` listener would be a second one. A popup
that restores focus to its trigger keeps `FocusScope`'s `restore` as the one
owner of the return, and `FocusRecovery` there uses `{ part: 'trigger' }` with
`restore` off.

## Pressing and dragging

**`Press`** turns pointer and keyboard activation of one element into one
fact. Foldkit's declarative pointer attributes carry no button, pointer id, or
click detail, so `Press.events` is a Mount that reports what the element saw
(`PointerDown`, `PointerUp`, `PointerCancelled`, `KeyDown`, `KeyUp`,
`KeyCancelled`, `Clicked`),
and the Bundle's `update` decides: primary button only, one pointer at a time,
`pointerleave` and `pointercancel` cancel, Enter and Space with a repeat
ignored, a click with `detail` 0 (keyboard on a native control, or assistive
technology) counts, and the ghost click that follows a touch is ignored inside
a window of `clickSuppressionMs` that a Command on Effect's clock closes. Enter
and Space are default-prevented on the element, so a native control does not
also click and Space does not scroll. Activation is the OutMessage
`Pressed { pointerType, modifiers }`, and the placement must handle it:

<!-- docs-check
import { Effect } from 'effect'
const CardSlots = Slots.define({ save: Slot.make({ capability: Capability.Interactive }) })
const CardModel = Schema.Struct({
  ...Bundle.declare(Press.bundle, 'saveButton').fields,
  saving: Schema.Boolean,
})
type CardModel = typeof CardModel.Type
const CardMessage = defineMessageUnion({
  ...Bundle.declare(Press.bundle, 'saveButton').cases,
  Saved: {},
})
type CardMessage = typeof CardMessage.Type
const CardPage = Bundle.parent({ Model: CardModel, Message: CardMessage })
const save = (_model: CardModel) => ({ name: 'save', effect: Effect.succeed(CardMessage.Saved()) })
-->

```ts
import { Press } from 'foldkit-primitives/interaction'

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
`aria-disabled`, which the Mount reads at event time, so no remount is needed.
A disabled element refuses new presses (a click, a pointer down, a key down)
but still hears a press that began while it was enabled end: its release or key
up arrives as a cancel (`PointerCancelled`, `KeyCancelled`), so the press ends
without activating. That matters for a control that disables itself mid-press,
such as a stepper at its bound. The Model slice is `{ pressed, pointerId, key,
suppressing, generation }`; only `pressed` is meant for a view.
`modifiers` is `{ shiftKey, ctrlKey, metaKey, altKey }` as the pointer release,
the key release or the click that completed the press reported them, so a range
or a toggle needs no `Mount` of its own. A placement is one pressed state for
one element: `Pressed` says how it was pressed, not which of several rows
under a shared container was.

**`LongPress`** is holding for `thresholdMs`. It reads the same facts
`Press.events` reports, so it needs no Mount of its own; the threshold is a
Command on Effect's clock carrying a generation, and a release before it fires
makes its `Elapsed` a no-op. `LongPressed { pointerType }` is the OutMessage,
required at placement. The Behavior writes `data-holding` while down. `Press`
and `LongPress` on one slot are refused by the resolver, since both would
mount `PressEvents`; a slot takes one of them.

**`SwipeActions`** is actions behind a row, with a way in that needs no
pointer. Its Model holds which side is open (`start` is revealed by moving the
row toward the end, right in English); `fullSwipe`, `flick` and `full` are its
args. `SwipeActions.decide(model, release, args)` is the rule for a `SwipeEnded`
(from `foldkit-primitives/dom`'s `Swipe`, which is not part of this Bundle):
past `fullSwipe` of the row it runs the first action when `full` is set,
reported as `FullSwiped { side }` after the row closes; otherwise a flick opens
the side it points to or closes the row when it points back, and a slower
release opens a side once it is past half of that side's actions. A side with no actions never opens,
and right to left swaps the sides. The row's offset while a finger moves it is
the parent's draft from `Swiped`. `SwipeActions.keys({ open, rtl, toMessage })`
is a `Behaviors.Keys` route for the row's keydown owner: the arrow toward the
end of the row opens `start` (the other arrow, `end`), the opposite arrow closes
an open side, Escape closes, and a press that would change nothing is declined,
so Escape on a closed row still reaches the dialog around it. Draw the actions
behind a closed row `inert` from `open`, so Tab skips them, and say the result
through `LiveAnnounce`.

**`Repeat`** is a held stepper: the `+` and `-` of a number field. A mouse or
Enter or Space steps as it goes down, and holding on steps again every
`intervalMs` once `delayMs` has passed. A finger or a pen steps on a tap, or
once held, so a scroll that starts on the button never steps; a click no pointer
made (a screen reader's) steps once, and the click that follows a press does
not step again. `Stepped { count, input }` is an OutMessage per step and
`Ended { count }` one when a hold's steps stop (a single step has no end of
its own), so a parent can fold a hold's steps into one `History` group and
announce once. When `update` reaches a bound it sends `Repeat.Message.Stopped()`
and the rest of that press steps no more. The delay and interval run on
Effect's clock, so `TestClock` drives them, and a release makes a late timer a
no-op.

<!-- docs-check
const StepperSlots = Slots.define({
  more: Slot.make({ capability: Capability.Interactive }),
})
const StepperModel = Schema.Struct({
  ...Bundle.declare(Repeat.bundle, 'more').fields,
  value: Schema.Number,
})
type StepperModel = typeof StepperModel.Type
const StepperMessage = defineMessageUnion({ ...Bundle.declare(Repeat.bundle, 'more').cases })
type StepperMessage = typeof StepperMessage.Type
-->

```ts
import { Repeat } from 'foldkit-primitives/interaction'

const More = Bundle.declare(Repeat.bundle, 'more')
const Stepper = SlotView.over(StepperSlots)<StepperModel, StepperMessage>()
const Holds = Repeat.behavior(More)(Stepper)({
  target: 'more',
  disabled: model => model.value >= 100,
})
```

`Repeat.behavior(Declared)(binder)({ target, disabled? })` takes the same
`SlotView.over` binder as `Press.behavior`, so the options are typed from it
with nothing annotated, and the target supplies the `activation` obligation
(bare slots with the generics named, `(Slots)<Input, Message>({ target })`, also
still work). It attaches `Press.events` and writes `data-holding`; `disabled`
marks the target `aria-disabled`, which refuses new presses and leaves a hold
already under way to end on release. It shares `Press`'s Mount, so a slot
takes one of `Press`, `LongPress` and `Repeat`. The pointer leaving the button
cancels the press, as it does for `Press`, so a hold ends there (`Ended`) and
coming back with the button still down does not resume it: the next hold is a
new press. A Repeat button may disable itself at its bound while held; its
release still ends the hold.

**`Move`** is pointer movement as facts, a Mount in `foldkit-primitives/dom`:
a primary-button pointer down captures the pointer and reports `MoveStarted`,
each move reports `Moved { deltaX, deltaY }` from where it went down, and up
reports `MoveEnded { completed: true }`. Cancel, lost capture, or Escape reports
`completed: false`: the Escape is the drag's alone (it closes no dialog around
it), is heard on the document only while a pointer is down, and the Model, which
kept the box where it began, drops the draft. A second pointer
and a secondary button are ignored; capture is released with the Mount.
`Move.behavior(Slots)<Input, Message>({ handle, toMessage })` attaches it to a
`Draggable` slot and maps each fact into the view's Messages; a drag's meaning
(a threshold, a snap, a reorder) is the parent's `update`.

The keyboard's way to do the same is two `Behaviors.Keys` routes for the
handle's keydown owner. `Move.nudge({ step?, largeStep?, toMessage })` takes Alt
with an arrow (Shift for the larger step), and `Move.resizeKeys(handle, {
toMessage })` takes a resize handle's arrows, Home and End; each hands
`toMessage` a `{ dx, dy }`. `update` applies it with `Box.moveBy`, `Box.moveEach`
or `Box.resize` from [`state`](../state/README.md), so a key and a drag obey
the same bounds, grid, size limits and aspect ratio, and says the result through
`LiveAnnounce`. Plain arrows are not taken, and a second route on one chord is
a `mixins:key-conflict`.

```ts
import { Move } from 'foldkit-primitives/interaction'
import { Box } from 'foldkit-primitives/state'

type Nudged = { readonly dx: number; readonly dy: number }

// Attach with Behaviors.Keys.behavior(...)({ slot: 'handle', routes: [nudge] }).
const nudge = Move.nudge<undefined, Nudged>({ step: 2, toMessage: delta => delta })

const card = { x: 10, y: 10, width: 20, height: 10 }
const area = { left: 0, top: 0, right: 100, bottom: 50 }
const applyNudge = ({ dx, dy }: Nudged) => Box.moveBy(card, dx, dy, { bounds: area })
```

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
`DRAG_THRESHOLD` (4px) starts a drag (`DragStarted { id }`; a finger's press
starts one once held still `HOLD_TO_DRAG_MS`, 400ms, while one that moves
`HOLD_SLOP`, 8px, first is a scroll, so a list of marked rows still scrolls
under a finger and the page is kept still only once the drag is on); then, once per
change, `DraggedOver { over }` says which other marked descendant the pointer
is over and in which third of its box, `{ id, zone: 'before' | 'inside' |
'after' }`, or `null`. Releasing is `DragDropped { id, over }`, and Escape, a
cancelled pointer, or a button found released mid-drag is
`DragCancelled { id }`. An Escape that cancels is heard on the way down and
goes no further, so the focused element's own Escape (a canvas's deselect)
does not also run; one pressed before the press became a drag ends the press
and goes on to the page (a dialog closing on it), as it does for `Marquee`
before the lasso starts. It follows the pointer that pressed and ignores a second
one; the element under it is found by position, so a touch or a pen, which the
browser captures to where it went down, drags too, once the marked elements
have `touch-action: none` so a finger drags rather than scrolls. The click a
drop ends with is swallowed, so a `Targets` on the same container does not
also press. A press in `contenteditable` text selects text and starts no drag.
It writes no roles, `tabindex`, or keys, so it sits beside a tree's or a
listbox's own; for the keyboard's way to move an item, see `Reorder` below.
Boxes are measured as the pointer moves and never kept; an element drawn as
`display: contents` is measured by its first child (`boxOf`). The Mount is
`PointerDrag({ attribute })` in `foldkit-primitives/dom`;
`PointerDrag.behavior(Slots)<Input, Message>({ container, attribute, toMessage })`
attaches it, and `zoneOf(box, y)` is the pure split.

A drag may also land somewhere other than among its own: with
`targets: [{ attribute: 'data-composition-node', within: '#page' }]`, what is
dragged is still one of the container's marked descendants (a palette's
tiles), and `over` is an element marked by that attribute inside the one
`within` selects (the page's nodes). Several entries are several regions
(a page and its layers), each with its own attribute. Its own tiles, and a
matching element outside its region, are then over nothing. `within` is looked for nearest first,
under the container's closest ancestor that holds a match, so two editors on
one page each drop onto their own page. Such a drag's `DraggedOver` and
`DragDropped` also carry `region`: whether the pointer is inside that element,
so `over: null` with `region: true` is the empty space of one of the regions (an empty
page, the space below its last node), and with `false`, elsewhere.

With `gaps: true`, a pointer over a container's own space (its padding, the gap
between two children) is not over the container: the place is between its
children, `before` the first whose middle along their flow (a column, a row, a
right-to-left row) is past the pointer, else `after` the last, found by halving
so that only a few of the children of that one container are measured. The
children are the elements marked by `attribute` whose nearest marked ancestor
is the container; one marked by `part` is a place inside a node, not a child.
Past the last child of the whole region, `over` is `null`. The release is
hit-tested again, so the place is where the pointer let go. Without it a
container is one place, by thirds.

A place can be a named part of what it is over: with `part: 'data-composition-region'`,
an element marked by both `attribute` (or `targets.attribute`) and `part` is
reported as `{ id, zone: 'inside', part }`, whatever third of it the pointer
is in. An editor draws a node's empty Region that way, so a drop can name the
Region it goes into.

**Edge scrolling.** A list longer than its box cannot be dragged past the
visible rows unless something scrolls it. `edgeScroll: {}` (or `{ edge, speed }`)
on `PointerDrag`, and on `Marquee`, scrolls the nearest ancestor that can scroll
the way the pointer pulls, on a frame clock, while the press is held in its
last `edge` pixels (default 40, at most a third of the box) at up to `speed`
pixels a second (default 600), less the nearer the strip's inner side. A box
at its end hands over to the next ancestor and then the page; held at the
window's edge over a box that can still scroll that way, the box goes before the
window does. Only a box the
pointer is over is pulled (not one it is beside, above or below, over another panel), and
only once it has stayed in the strip for 150ms, so a pointer passing through scrolls
nothing. Nothing above a
`position: fixed` box is, and the page is not while it or its body has
`overflow: hidden` or `clip` (a scroll lock's, under a modal). After every step
the place under the still pointer is reported again (`DraggedOver`), so the
list moving is a place changing. Each step is `scrollTo` with `behavior:
'instant'`, so a page's own `scroll-behavior: smooth` does not glide it; under
`prefers-reduced-motion: reduce` the scroll moves in jumps every 150ms by what
the same time would have moved it, not in a glide. The frame loop runs only
while something scrolls, and ends with the drag, a cancel, or the Mount. The
scrolling code is loaded when a Mount that asks for it starts, so a page whose
drags never scroll does not carry it.
`PointerDrag` scrolls nothing unless asked; `Reorder` asks for it itself
(`edgeScroll: false` turns it off).

**Following the pointer.** A drag under way writes where the pointer is on the
document root, so something that follows it needs no Message and no draw per
move: `--fk-drag-x` and `--fk-drag-y` (viewport pixels, from the press and
then each move) and `data-fk-drag="mouse"`, `"touch"` or `"pen"` (`DRAGGING`
names the three). All are removed on a drop, a cancel and when the Mount ends.
`DragPreview()` in `foldkit-primitives/dom` is the Mount for what a drag
carries: on an element the view draws with `popover="manual"` while the drag
lasts, it shows it in the top layer, above every panel and clear of an
ancestor's `contain` or `transform`, and leaves the rest to a rule such as
`position: fixed; top: 0; left: 0; transform: translate(var(--fk-drag-x),
var(--fk-drag-y))` (physical `top` and `left`, since the pointer's coordinates
are), `pointer-events: none`, and a lift above a finger under
`:root[data-fk-drag="touch"]`. A browser without popovers leaves the element
in the page flow. It settles with no animation, so reduced motion has nothing
to turn off.

## `Marquee`: a lasso over marked items

`PointerDrag` starts only from a marked element, so a press on a canvas's empty
space is nobody's. `Marquee` is that press: it is a Mount beside `PointerDrag`
on the same container (`Behavior.attach` both; a press on a marked descendant
is the drag's, a press on anything else is the lasso's). It owns no state and
draws nothing. A primary press on empty space that moves `DRAG_THRESHOLD`
starts `MarqueeStarted { additive }` (`additive` when Shift, Ctrl or Meta was
held), then `MarqueeChanged { rect, ids, additive }` as the pointer moves or
`edgeScroll` scrolls the container under it, then `MarqueeEnded` with the same fields, or
`MarqueeCancelled` on Escape or a cancelled pointer. `rect` is `{ x, y, width,
height }` in the container's content coordinates (its padding box's top left,
scrolled with it, and clipped to what the container holds), so a view draws the
band in a Slot of its own at `left: x; top: y`, and `ids` are the marked
descendants the rectangle overlaps, in document order. A press is not empty
space when it is on a marked descendant, a link, button, field, label,
`summary` or editable text, or on the container's own scrollbar, and a finger
never starts one (it scrolls). The click a lasso ends with is swallowed, as a
drop's is. The container must be a box (not `display: contents`). Each change
measures every marked descendant (a `querySelectorAll` and a box each), so a
container of thousands draws only the rows that show, or marks fewer.

It selects nothing. The ids are for `update` to hand to `Selection`, whose
`replace(ids)` helper sets the selection, so there is one way to select;
`Marquee.selected(before, fact)` is the pure combination, the ids alone, or
after `before` when the press was additive:

```ts standalone
import { Match, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { Marquee, PointerDrag, Selection } from 'foldkit-primitives/interaction'

const Picks = Bundle.declare(Selection.bundle, 'picks')
const Model = Schema.Struct({
  ...Picks.fields,
  ids: Schema.Array(Schema.String),
  // What was selected when the press began, for an additive lasso and for Escape.
  before: Schema.Array(Schema.String),
  band: Schema.OptionFromNullOr(Marquee.MarqueeRect),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Picks.cases,
  LassoStarted: {},
  LassoChanged: {
    rect: Marquee.MarqueeRect,
    ids: Schema.Array(Schema.String),
    additive: Schema.Boolean,
  },
  LassoEnded: {},
  LassoCancelled: {},
})
type Message = typeof Message.Type

const pickArgs = { mode: 'multiple', allowEmpty: true } as const
const Parent = Bundle.parent({ Model, Message })
const Picked = Parent.at(Picks, { args: pickArgs })
const assembly = Parent.assemble(Picked)

const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    LassoStarted: () => ({
      model: modifyFields(model, { before: () => model.picks.selected }),
    }),
    LassoChanged: ({ rect, ids, additive }) =>
      Picked.helpers.replace(Marquee.selected(model.before, { ids, additive }))(
        modifyFields(model, { band: () => Option.some(rect) }),
      ),
    LassoEnded: () => ({ model: modifyFields(model, { band: () => Option.none() }) }),
    LassoCancelled: () =>
      Picked.helpers.replace(model.before)(
        modifyFields(model, { band: () => Option.none() }),
      ),
  }),
)

const CanvasSlots = Slots.define({
  canvas: Slot.make({ capability: Capability.Container }),
  node: Slot.make({ capability: Capability.Interactive }),
  band: Slot.make({ capability: Capability.Base }),
})
const Canvas = SlotView.over(CanvasSlots)<Model, Message>()
const items = (model: Model) => Behaviors.Collection.of(model.ids, { id: id => id })

const view = Canvas.define((model, slots, h: HtmlBuilder<Message>) =>
  h.div(
    slots.canvas.attrs([h.Style({ position: 'relative', height: '240px' })]),
    [
      ...model.ids.map((id, index) =>
        h.div(slots.node.attrs([h.Key(id), h.DataAttribute('node', id)], { index, id }), [id]),
      ),
      ...Option.match(model.band, {
        onNone: () => [],
        onSome: rect => [
          h.div(
            slots.band.attrs([
              h.Style({
                position: 'absolute',
                left: `${rect.x}px`,
                top: `${rect.y}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                'pointer-events': 'none',
              }),
            ]),
            [],
          ),
        ],
      }),
    ],
  ),
).pipe(
  Behavior.attach(
    Marquee.behavior(Canvas)({
      container: 'canvas',
      attribute: 'data-node',
      edgeScroll: {},
      toMessage: fact =>
        Match.valueTags(fact, {
          MarqueeStarted: () => Message.LassoStarted(),
          MarqueeChanged: ({ rect, ids, additive }) =>
            Message.LassoChanged({ rect, ids, additive }),
          MarqueeEnded: () => Message.LassoEnded(),
          MarqueeCancelled: () => Message.LassoCancelled(),
        }),
    }),
  ),
  Behavior.attach(
    Selection.behavior(Picks, pickArgs)(Canvas)({ container: 'canvas', item: 'node', items }),
  ),
)
void update
void view
```

Nodes are dragged by `PointerDrag` on the same container and keep their own
click through `Selection`. The keyboard's way to select more than one is not a
lasso: it is Shift-extending from the roving item (`Selection`'s `Ranged`,
fed by `Press`'s `Pressed { modifiers }`) or `replace(ids)` from a "select all"
chord the parent routes. A lasso is a pointer gesture only, as a drag is
without `Reorder`.

## `Reorder`: moving an item by keys and by pointer

`Reorder` is the keyboard path a drag lacks, and the pointer's drag mapped
onto the same draft. One Bundle holds what is held and where it would land;
the parent owns the list and decides whether the move happens.

```text
Space/Enter on an item  →  Grabbed   (held, over its own place)   out PickedUp
arrows, Home, End       →  Stepped   (over the next place)         out PassedOver
Space/Enter             →  Dropped                                 out Moved { id, to } | PutBack
Escape, focus leaving   →  Cancelled                               out PutBack
pointer press and move  →  the same Messages, from PointerDrag's facts
```

Nothing moves while an item is held: the view draws a drop line from the
marks the Behavior writes (`data-reorder="held"` on the held item,
`data-reorder-over="before|inside|after"` on the place), so focus stays on the
held item. On the drop the parent applies `Moved` to its own data, or refuses
it, and the facts are what it reads out through `LiveAnnounce`:

```ts standalone
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { FocusRecovery, LiveAnnounce, Reorder } from 'foldkit-primitives/interaction'

const Rows = Bundle.declare(Reorder.bundle, 'rows')
const Live = Bundle.declare(LiveAnnounce.bundle, 'live')
const Model = Schema.Struct({ ...Rows.fields, ...Live.fields, ids: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Rows.cases, ...Live.cases })
type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
const Announcer = Parent.at(Live, { args: { debounceMs: 150, clearAfterMs: 5000 } })
const assembly = Parent.assemble(
  Announcer,
  Parent.at(Rows, {
    onOut: (fact: Reorder.OutMessage) => (model: Model) => {
      const moved = Reorder.OutMessage.match(fact, {
        Moved: move => modifyFields(model, { ids: ids => Reorder.apply(ids, move) }),
        PickedUp: () => model,
        PassedOver: () => model,
        PutBack: () => model,
      })
      return Announcer.helpers.announce(Reorder.announcement(fact, { label: id => id }))(moved)
    },
  }),
)

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Base }),
  grip: Slot.make({ capability: Capability.Focusable, events: [Event.KeyDown, Event.Blur] }),
})
const List = SlotView.over(ListSlots)<Model, Message>()

const SortableList = List.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([]),
    model.ids.map((id, index) =>
      h.li(slots.row.attrs([h.Key(id)], { index, id }), [
        h.button(slots.grip.attrs([h.Type('button')], { index, id }), [id]),
      ]),
    ),
  ),
).pipe(
  Behavior.attach(
    Reorder.behavior(Rows)(List)({
      container: 'list',
      item: 'row',
      handle: 'grip',
      items: model => model.ids,
    }),
  ),
  // A keyed move takes the element out and back, and the browser drops its focus.
  Behavior.attach(FocusRecovery.behavior(List)({ owner: 'list', parts: { grip: ['same'] } })),
)

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main([], [SortableList(model, h), LiveAnnounce.view(model.live, h)])
void assembly
void view
```

`Reorder.behavior` puts the pointer path (`PointerDrag`) on the container, the
marks on each item, and the key route on the handle, which may be the row
itself. Nothing here fetches or writes your list: `Moved` is a fact, and
`Reorder.apply(ids, moved)` is the pure move for a flat list (it returns the
list it was given when nothing changes). The pointer's middle third over a row
that takes nothing is that row's own slot, before or after it as the keys walk
it, so a flat list never shows, announces or drops `inside`.

**Beside a roving tab stop.** A list with `ListNavigation` already owns its
container's `keydown`, and both take the arrows. Give the placement
`handle: Reorder.routed` and `current`, the item the keyboard is on: it hands
back `{ behavior, keys }`, where `keys` is the route built from the same
options (`items`, `parent`, `accepts`, `orientation`, `grab`), to list first in
the container's router. Before a grab the route answers only its grab chords,
so the arrows navigate; while an item is held it takes them, and focus stays on
the held row. Focus leaving the row, or the list (whose rows never take focus
under `aria-activedescendant`), puts the grab back.

**Space and Enter are the list's too.** A grab is Space or Enter by default,
and a listbox that selects with Space, activates with Enter or types a space
into its typeahead wants them as well: the route, listed first, would take
every one. Give such a list a grab chord of its own. Here Space selects and
Alt+Enter picks the row up (while it is held, Space, Enter and Alt+Enter drop
it):

```ts standalone
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { ListNavigation, Reorder, Selection } from 'foldkit-primitives/interaction'

const { Keys } = Behaviors
const Rows = Bundle.declare(Reorder.bundle, 'rows')
const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const Picks = Bundle.declare(Selection.bundle, 'picks')
const Model = Schema.Struct({
  ...Rows.fields,
  ...Nav.fields,
  ...Picks.fields,
  ids: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Rows.cases,
  ...Nav.cases,
  ...Picks.cases,
  Selected: { id: Schema.String },
})
type Message = typeof Message.Type

const navArgs = { orientation: 'vertical', loop: false, virtual: false, timeoutMs: 500, page: 5 } as const
const pickArgs = { mode: 'single', allowEmpty: false } as const
const Parent = Bundle.parent({ Model, Message })
const Picked = Parent.at(Picks, { args: pickArgs })
const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Picked,
  Parent.at(Rows, {
    onOut: (fact: Reorder.OutMessage) => (model: Model) => ({
      model: Reorder.OutMessage.match(fact, {
        Moved: move => modifyFields(model, { ids: ids => Reorder.apply(ids, move) }),
        PickedUp: () => model,
        PassedOver: () => model,
        PutBack: () => model,
      }),
    }),
  }),
)

const ListboxSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  option: Slot.make({ capability: Capability.Focusable, events: [Event.Focus, Event.Blur] }),
})
const Listbox = SlotView.over(ListboxSlots)<Model, Message>()
const items = (model: Model) => Behaviors.Collection.of(model.ids, { id: id => id })

const Sorting = Reorder.behavior(Rows)(Listbox)({
  container: 'list',
  item: 'option',
  handle: Reorder.routed,
  items: model => model.ids,
  current: model => Option.fromNullishOr(model.nav.current),
  grab: [Keys.chord('Enter', { alt: true })],
})
// Space selects the row the keyboard is on, unless typeahead is mid-word: the parent's own
// Message, which `update` applies through Selection's helper.
const select = Keys.route<Model, Message>('Select', {
  on: [Keys.chord(' ')],
  handle: ({ input }) =>
    input.nav.query === ''
      ? Option.map(Option.fromNullishOr(input.nav.current), id => Message.Selected({ id }))
      : Option.none(),
})
const update = assembly.update((model, message) =>
  Match.valueTags(message, { Selected: ({ id }) => Picked.helpers.activate(id)(model) }),
)
const navigation = ListNavigation.keys(Nav, navArgs)<Model, Message>({
  items,
  text: (model, index) => model.ids[index] ?? '',
})

const SortableListbox = Listbox.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([h.Role('listbox'), h.AriaLabel('Priorities')]),
    model.ids.map((id, index) =>
      h.li(slots.option.attrs([h.Key(id), h.Id(id), h.Role('option')], { index, id }), [id]),
    ),
  ),
).pipe(
  Behavior.attach(
    Keys.behavior(Listbox)({
      slot: 'list',
      routes: [Keys.first(Sorting.keys, Keys.first(select, navigation))],
    }),
  ),
  Behavior.attach(Sorting.behavior),
  Behavior.attach(
    Selection.behavior(Picks, pickArgs)(Listbox)({ container: 'list', item: 'option', items }),
  ),
  // The roving tab stop: ListNavigation's item half, since its key half is in the router above.
  Behavior.attach(ListNavigation.item(Nav, navArgs)(Listbox)({ item: 'option', items })),
)
void update
void SortableListbox
```

**A tree.** Give `items` the rows that show, flat, with `parent` and
`accepts`. The places then walk the tree: before each row, `inside` a row that
accepts items and shows none of its own (as its last child), and `after` each
level that ends. The held row's own rows are never offered, and the Behavior
takes its mark off them while it is held, so the pointer finds no place there.
A drag that reached one in the frame before that drawing can still drop on it,
and only the parent knows the tree, so the guard is the parent's: its `update`
refuses such a `Moved` with `Reorder.movesIntoItself`, and `announcement`
reads the same test as `words.refused`:

```ts
const parents = new Map([
  ['intro', 'docs'],
  ['guide', 'docs'],
])
const parent = (id: string) => Option.fromNullishOr(parents.get(id))
// The one test: `onOut` leaves the list alone on a `Moved` it holds for, and the words say so.
const refuses = (move: Reorder.Move) => Reorder.movesIntoItself({ ...move, parent })

const intoItself = Reorder.OutMessage.Moved({
  id: 'docs',
  by: 'pointer',
  to: { id: 'intro', zone: 'after' },
})
Reorder.announcement(intoItself, { label: id => id, refuses }) // 'docs cannot go there; put back where it was.'
```

`Reorder.places` is the walk itself, for a view that shows "position 2 of 5".

**Words, direction, keys faster than a frame.** `announcement` reads each
fact with `words` (English templates with `{item}` and `{target}`; pass your
own). `orientation: 'horizontal'` walks with Left and Right, and
`direction: () => 'rtl'` swaps them. Each arrow carries the places as drawn
and steps from the Model's `over`, and the route remembers its own grab on a
drawing, so keys pressed faster than a frame each count.

Limits: one draft per placement (a second grab while an item is held is
refused, and the pointer never steers a key grab, nor the keys a pointer one);
a pointer drag onto `targets` elsewhere is `PointerDrag`'s, not this one's; an
empty list offers no place, since a place names an item.

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
elements: Escape closes the topmost open layer, unless a handler below it already
took the key (`defaultPrevented`: a search field clearing itself on Escape
keeps its layer open, and the next Escape, with nothing to clear, dismisses),
and a pointer press closes the layers it is outside of. One Bundle, **placed once**, owns the document
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

<!-- docs-check
const MenuSlots = Slots.define({
  panel: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Capability.Interactive }),
})
const MenuModel = Schema.Struct({
  ...Bundle.declare(DismissLayer.bundle, 'layers').fields,
  menuOpen: Schema.Boolean,
})
type MenuModel = typeof MenuModel.Type
const MenuMessage = defineMessageUnion({ ...Bundle.declare(DismissLayer.bundle, 'layers').cases })
type MenuMessage = typeof MenuMessage.Type
const MenuPage = Bundle.parent({ Model: MenuModel, Message: MenuMessage })
-->

```ts
import { DismissLayer } from 'foldkit-primitives/interaction'

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
inert while it is mounted, except a layer opened over it. A native `<dialog>` shown modally needs neither.

**`Overlay`** is one policy value instead of nine overlay implementations:
`Overlay.modal` (dismissed by Escape and outside press, focused, locked,
inert) and `Overlay.nonModal` (dismissed, focus restored, page usable), or
an explicit `Policy`. `Overlay.behaviors(Slots)<Model, Message,
StackField>({ stack, layer, trigger?, id, policy })` turns the value into
the existing pieces — `DismissLayer` marking, `FocusScope`, and the scroll
and inert mounts the policy keeps — attached as one step of the view's pipe
with `Behavior.attachAll`. Nothing
is reimplemented: the mounts are the shared implementation. Positioning
stays per-widget (`Anchor.behavior` binds a floating element to an external
id, a different shape), and presence stays CSS. The stack bundle is placed
once per app; its `Dismiss` outmessage closes what it names. See
[`examples/drawer`](../../../examples/drawer) for the whole shape:

<!-- docs-check
const DrawerSlots = Slots.define({
  trigger: Slot.make({ capability: Capability.Interactive }),
  panel: Slot.make({ capability: Capability.Container }),
})
const DrawerModel = Schema.Struct({ ...Stack.fields, open: Schema.Boolean })
const DrawerMessage = defineMessageUnion({ ...Stack.cases })
type DrawerMessage = typeof DrawerMessage.Type
-->

```ts
import { Overlay } from 'foldkit-primitives/interaction'

const DrawerOverlay = Overlay.behaviors(DrawerSlots)<typeof DrawerModel.Type, DrawerMessage, 'layers'>({
  stack: Stack,
  layer: 'panel',
  trigger: 'trigger',
  id: () => 'drawer',
  policy: Overlay.modal,
})
const Drawer = SlotView.forMessages<DrawerMessage>()
  .define(DrawerSlots, (model: typeof DrawerModel.Type, slots, h) => h.div([], [/* … */]))
  .pipe(Behavior.attachAll(DrawerOverlay))
```

**`Placing`** keeps a floating panel inside the viewport, and can put it
under the trigger that opened it. On insert, `keepWithin` shifts left past
the right edge and flips above its trigger when the bottom overflows and
the room overhead fits; on release every inline prop goes.
`Placing.placeFor(rect, viewport)` is that pure rule. `Placing.placeAt(trigger,
origin, gap?)` is the other: the popup's `left` and top under the trigger,
relative to the offset parent. `Placing.placeAtPoint(point, origin)` is that
offset for a viewport point. `Placing.placeAtTrigger(Slots)({ panel, triggerId, gap?, at? })`
mounts one of them: `at` returning a point wins, and none places under the trigger.
The behavior stays named `PlaceAt`. The mount is `PlaceAtPoint` when `at` is
some and `PlaceAt` when it is none. `OnContextMenu` carries no coordinates, so
a right-click records `clientX` and `clientY` on pointerdown (button 2) and
passes that point through `at` only while it belongs to the open target. A
keyboard open has no point, so it places under the trigger. The Mount writes
`left` and the `--fk-placed-top` custom property (`Placing.placedTop`); the
panel's stylesheet reads that property as `top`, so a flip, which sets the
`top` property, still wins. Key the popup by what the args depend on, because
a Mount reads them once. A gap sits outside the trigger's border box, so
`pointerleave` on the trigger fires before the pointer reaches the popup:
listen on a wrap that contains both, or overlap the border boxes.
The two mounts start together, so the fit may run before the write; the
write measures again. A point that would hang past the bottom shifts up
(`Placing.shiftIntoViewport`) instead of flipping above its offset parent.
A trigger still flips. `keepWithin` sets `data-fk-placed="above"`
(`Placing.placedSide`, `Placing.placedAbove`) when it does, so a hover
bridge can overlap that side instead of the one below the trigger. No
timers, observers, or reposition loops.
`Anchor.behavior` relocates nodes and tracks a moving anchor; this places
once and stays inert without layout. `KeepInView` in `foldkit-primitives/dom`
scrolls newly marked content into view: that one moves the page to the panel.

```ts sketch
Behavior.attach(Placing.keepWithin(WidgetSlots)({ panel: 'popup' })),
```

**`Selection`** is which items are selected, with `mode` `'single'` (a click
replaces; `allowEmpty` says whether clicking the selected item deselects it),
`'multiple'` (a click toggles), or `'none'`, and the `anchor` a range extends
from. The Model slice is `{ selected, anchor, ranged }`, where `ranged` is the ids the last range added: the next `Ranged` from the same anchor takes them back first, so a shorter Shift range shrinks as in a file manager, while ids picked by a plain click stay. In `'single'` mode `Replaced` with more than one id is refused and returns the Model it was given. A range needs the items'
order, which the view knows and the Bundle does not, so `Ranged { id, order }`
carries it; `Selection.between(order, from, to)` is the pure span. The
Behavior, `Selection.behavior(Declared, args)(Slots)<Model, Message>({ container?, item, items, click? })`,
writes `aria-selected` on each item and `aria-multiselectable` on the
container, and wires a plain click on each enabled item to `Activated`; pass
`click: false` when `Press` or the view owns the click. For a Shift range,
`Press`'s `Pressed { pointerType, modifiers }` says whether Shift (or Ctrl, Meta, Alt) was held, and
the placement's `onOut` folds `Picks.helpers.range(id, order)(model)` (or
`select(id)(model)` for a plain click, which replaces the selection with that
item and anchors there; `Activated`, in `'multiple'` mode, would toggle it, so a
file manager that reads Ctrl itself uses `activate` for Ctrl and `select` for the
rest). For a selection no slot has to
reflect, `SelectionSet` in [`state`](../state/README.md) is lighter.

**`LiveAnnounce`** speaks to assistive technology: one Bundle, placed once,
holds the text of a polite and an assertive live region.
A parent says something through the placement's `announce(text, politeness?)`
helper, folded in `update` or an `onOut`; an announcement waits `debounceMs` so a burst reads once, then
clears after `clearAfterMs`, both on Effect's clock with a generation so a
superseded timer changes nothing; the same text twice gets a trailing no-break
space toggled, which is what makes a screen reader read it again.
`LiveAnnounce.view(slice, h)` renders the two regions: put it once in the page
and hide them visually with a rule on `[data-foldkit-plus-live]`, never
`display: none`.

## In the examples

Each of these composes the primitives above into a working widget. Read
`app.ts` for the placements and `update`, and `view.ts` for the Behaviors on
the slots.

| Widget | Primitives |
| --- | --- |
| [Toolbar](../../../examples/widgets/src/toolbar) | `RovingTabindex` |
| [One-time code field](../../../examples/widgets/src/otp-field) | `RovingTabindex`, a filled cell moving focus with a Command |
| [Toggle group](../../../examples/widgets/src/toggle-group), [checkbox group](../../../examples/widgets/src/checkbox-group) | `Selection` |
| [Command menu](../../../examples/widgets/src/command) | `ListNavigation`, `Selection`, `Placing` |
| [Autocomplete](../../../examples/widgets/src/autocomplete) | `ListNavigation`, `Selection`, `DismissLayer`, `Overlay.nonModal`, `Placing` |
| [Context menu](../../../examples/widgets/src/context-menu) | `ListNavigation`, `Selection`, `DismissLayer`, `Overlay.nonModal`, `Placing` |
| [Menubar](../../../examples/widgets/src/menubar) | `RovingTabindex` across the bar, `ListNavigation` in each menu |
| [Alert dialog](../../../examples/widgets/src/alert-dialog) | `DismissLayer`, `Overlay.modal` with outside press and Escape turned off |
| [Drawer](../../../examples/drawer) | `DismissLayer`, `Overlay.modal` |
| [File tree](../../../examples/tree) | `TreeNavigation`, `Selection` |

The widgets run together at
[foldkit-widgets-demo.pages.dev](https://foldkit-widgets-demo.pages.dev/).

## Failure

A Behavior writes data, so a view that stops attaching it leaves nothing
behind. The resolver refuses two owners of one event on a slot (`Press` with
`LongPress`, `RovingTabindex` with `Typeahead`): take `ListNavigation` or pick
one. Without a DOM a Mount here emits nothing.
