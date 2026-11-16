# foldkit-primitives

Checked against `foldkit-primitives` 0.20.0.

Ready-made [`foldkit-bundle`](https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle)
primitives: media queries, breakpoints, visibility, presence, timers,
intervals, debounce, tweens, springs, pagination, undo history, locales,
selections, ranges, geolocation, cameras, permissions, fullscreen, sockets,
broadcasts, observers, autofocus, masks, shares, and clipboard. Each is an
ordinary bundle (or entry, Mount, Command, or pure function) under a
tree-shakeable subpath, so an application pays only for the primitives it
imports.

## Ownership

| State | Owner | Form |
| --- | --- | --- |
| A placed slice: match, count, page, value, selection, locale, scroll position, heights | the parent Model | bundle, placed like any other |
| Key presses, pointer moves, scroll positions, focus identity | the parent Model, if kept | entry mapped to the parent's Message |
| Element size, visibility, mutations, bounds, focus, scroll position, row height, masked input | the element, observed | Mount attached in the view |
| A clipboard write or read, share, script load, fullscreen switch, broadcast post | nothing (one-shot) | Command in `update` |
| A page list, window math, masonry layout, sticky answer, hotkey match, relative time, platform | nothing (derived) | pure function |
| One in-browser server for every tab and frame: which conversations are open, and when a page is gone | the host it starts | `net`'s `SharedHost.define({ name, opening })`: `serve` in a SharedWorker, `connect({ worker, inPage }).open(opening)` returns a `MessagePort`; the host gets `{ port, signal }`, the signal aborting when the page's Web Lock is released. Speak Sync over it with `Sync.transport.portSocket(port, { signal })`, Remote with `foldkit-remote/port` |
| The current item of a roving tab stop, a typeahead query, or both for a list; whether an element is pressed; the open dismissable layers; the selected items; the live-region text | the parent Model | `interaction`: a bundle plus a `foldkit-mixins` Behavior wiring it to slots (`foldkit-mixins` is an optional peer for that subpath only) |

A bundle holds no state. Placing it twice observes twice; share the field
instead. The browser, clock, or server only reports facts as Messages.

## Minimal example

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-primitives/media'

const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })

const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))
const update = placements.update(model => ({ model }))
```

`MediaQuery`'s `matches` starts as `matchMedia(query).matches` at `init` (false with no window), or as `args.initial` says, so the
first frame is right; the Subscription's first report, after that frame, corrects it.
`PrefersDark` and `PrefersReducedMotion` are presets that place with no args.
`Online`, `Visibility`, and `WindowSize` (no args), `Timer` and `Interval`
(`{ intervalMs }`), `Tween` (`{ from, to, ms }`), `Spring` (`{ from, to,
stiffness, damping }`), `Pagination` (`{ perPage }`), `Locale` (`{ default
}`), `SelectionSet` (no args), `Geolocation` (no args), `Idle` (`{
timeoutMs }`), `Presence` (`{ durationMs }`), `Virtual` (`{
estimatedHeight, overscan, gap, paddingStart, paddingEnd }`, plus optional
restore and settle options), and `history({ name, value })` (a `Push` may name a `group`, joining consecutive steps; `History.push`/`undo`/`redo` are the same steps as pure functions; `History.close` ends a group,
`History.revert(model, group)` takes a group's step back unredoably)
place the same way. `sse({
name })`, `websocket({ name })`, `mediaDevices({ name })`, `mediaStream({
name })`, and `permissions({ name })` are factories over a resource tag;
`debounce({ name, value })` is a factory whose settled value surfaces as an
OutMessage the placement handles with `onOut` — required, so it cannot be
dropped. `Throttle` pairs leading-edge against that trailing edge.
`chat.helpers.send('hi')` sends on a placed socket; `copyText`, `readText`, `share`,
`loadScript`, `decodeImage` (a picture decoded before it is shown), `enterFullscreen`/`exitFullscreen`, and `postBroadcast` are
Commands; `Resize()`, `Intersection()`, `Mutation()`, `Bounds()`, and
`Autofocus()` attach with `h.OnMount` in the view; `keyboardEvents()` and
friends lift with `Subscription.persistentEntry`, and `matchHotkey(pattern, press, { platform?, allowInInput? })` (`mod` by platform, a letter by its physical `code`, text-field presses left to the text; `ariaKeyshortcuts` and `formatHotkey` write the attribute and the label from the same pattern, as `Option`s) turns a press
into a chord answer. Slices that must survive reload persist through
`Mirror.kv`, not here — this package owns live facts only.

A clock the parent's Model drives is an entry, not a placement:
`ticks({ intervalMs: model => Option<number>, onTick: at => Message })` from
`foldkit-primitives/time` ticks while `intervalMs` is `Some`, and a new interval
applies from the next tick without a restart (Timer and Interval are built on
it; their first tick comes one interval after `Started`).
`keyboardEvents({ preventDefault: press => boolean })` cancels a press's default
inside the listener, and composes with `matchHotkey`. `websocket` takes
`{ url, connectTimeoutMs? }`; `Sent { data }` carries what was sent, and
`TimedOut` reports an attempt that ran out of time. The connection and device
bundles' `lastError` (and Geolocation's `coords`) are `Option`s, `null` in JSON. `History.goTo(model, step)`
and the bundle's `GoTo { step }` jump to any kept step, counted from the oldest.

`Box` (`/state`) holds the limits of a moved or resized box as pure functions:
`Box.moveBy`/`moveEach(boxes, ids, dx, dy, { bounds?, snap? })` keep a group in
shape inside an area and return the box they were given when nothing moves;
`Box.resize(box, handle, dx, dy, { bounds?, min?, max?, aspect?, snap? })`;
`Box.moveKey(press)` (Alt+arrows, Shift larger) and `Box.resizeKey(press, handle)`
(arrows, Home and End to the smallest and largest) are `Option` deltas for
the same two calls, so a key and a `Move` drag obey the same limits.

## Common tasks

Pick by task:

- Keep focus when a row, clear button or toast goes: `FocusRecovery` (Keep focus when its part goes away), or `FocusReturn` / `Dialog.focusReturn` when an opener is gone.
- A keyboard-reorderable list: `Reorder`; with arrows and typeahead on the same list, `Reorder.routed` beside `ListNavigation`.
- Arrows over a grid of cells, a tree, or freely placed cards: `GridNavigation`, `TreeNavigation`, `SpatialNavigation`.
- A value edited where it shows: `InlineEdit`. A key of the application's on a primitive's host: its `keys(...)` route in one `Behaviors.Keys.behavior`, or a `routes` option.
- Swipe to reveal row actions with a key way: `SwipeActions`. A held stepper button: `Repeat`. Move or resize limits for a box: `Box` with `Move.nudge` and `Move.resizeKeys`.

- **Place a preset:** `Page.place(PrefersDark, 'dark')` — no config needed.
- **Drive a timer in tests:** the tick stream runs on Effect's clock, so
  `TestClock.adjust` advances it instead of waiting.
- **Send on a socket:** `chat.helpers.send('hi')(model)` in `update`; the
  `Socket` service rides the assembly into the application's resources.
  `Received` notifies without storing — project it to keep it.
- **Observe an element:** `h.div([h.OnMount(Resize())], [...])`; without the
  observer API the Mount emits nothing.
- **Window a list that scrolls with the page:** `WindowViewport()` (`/state`)
  on the list's own box reports `ViewportPlaced { top, height }`, the
  viewport's top past the list's (negative while the list is below it) and its
  height, as it mounts, on the window's scroll and resize, and when the list's
  box or the page resizes (content above it growing); an unchanged reading is
  sent once. Map `top` into `Virtual`'s `Scrolled`. `MeasureRow({ key })`
  reports a row's border box; `MeasureRows({ attribute })` on the list reports
  every child carrying `attribute` (its value the key) as `RowsMeasured { rows }`,
  one batch per frame, starting with the rows already drawn, read at once (a
  batch that may be empty). `foldkit-mixins-ui`'s `WindowList` draws such a list.
- **Roving tab stop:** place `RovingTabindex.bundle` (`{ orientation, loop, virtual }`)
  from `foldkit-primitives/interaction`; attach
  `RovingTabindex.behavior(Declared, args)(Slots)<Model, Message>({ container, item, items: model => Behaviors.Collection.of(...), direction? })`
  beside `Behaviors.Collection.behavior` (which writes the ids it focuses by).
  The Model slice is the current item's id; the container's `OnKeyDownFocus`
  focuses the next enabled item and dispatches `Focused { id }`.
- **Type to find:** `Typeahead.bundle` (`{ timeoutMs }`) with
  `Typeahead.behavior(Declared)(Slots)<Model, Message>({ host, items, text, current })`
  for a host with no roving tab stop; `Typeahead.match(texts, enabled, query, current)` is the pure pick.
- **A list host that wants both** arrows and typeahead takes `ListNavigation.bundle`
  (`{ orientation, loop, virtual, timeoutMs, page }`) with
  `ListNavigation.behavior(Declared, args)(Slots)<Model, Message>({ container, item, items, text, direction?, typeahead?, commit? })`.
  One placement, one key handler: `RovingTabindex` and `Typeahead` on one host are
  refused by the resolver (one owner per event), and under `virtual` a typed key
  must move the pointer and extend the query in one transition. `typeahead: false`
  leaves printable keys to a search field; arrows still move. `commit(input, id)`
  runs on unmodified Enter when `current` is an enabled item, and returns that
  parent Message from the same handler.
- **A tree** (layers, a file explorer): `TreeNavigation.bundle` (`{ openByDefault }`) with
  `TreeNavigation.behavior(Declared, args)(Slots)<Model, Message>({ container, item, rows: model => [{ id, parent, branch, disabled? }], domId?, direction? })`,
  rows in tree order. Model `{ current, toggled }` (toggled away from the default);
  `TreeNavigation.shown(rows, model, args)` is what shows, with level and place.
  Right opens or steps in, Left closes or steps out; the Behavior writes the ARIA tree attributes
  and `--fk-tree-level` (1 at the top) for indenting: `calc(var(--fk-tree-level) * 1rem)`.
  Focus in the tree follows its tab stop when an edit elsewhere moves it or removes the
  focused row (`FollowTabStop` Mount, `/dom`, reading only the stops of the tree's own rows:
  every roving primitive marks its container `data-fk-roving`, which is no focus owner, so a
  `FocusRecovery` around the tree still owns its rows).
- **Which item is under the pointer, or was clicked,** among many: `Targets.behavior(Slots)<Input, Message>({ container, attribute: 'data-row', preventDefault?, toMessage })`
  (the Mount is `Targets({ attribute, preventDefault })` in `/dom`): `TargetHovered { id | null }`,
  `TargetPressed { id, shiftKey, ... }`, from one set of listeners on the container.
- **Text typed in place** (a heading edited on the page): `EditableText.behavior(Slots)<Input, Message>({ container,
  attribute: 'data-field', toMessage })` (Mount `EditableText({ attribute })` in `/dom`) over the marked
  field that is `contenteditable`: `TextEdited { field, text }` per change (not while an input method
  composes), `TextCommitted` on Enter or blur, `TextCancelled { initial }` on Escape (the DOM gets
  `initial` back), `EditAsked { field }` on a double-click of one not editable yet. Text only;
  one line unless `aria-multiline="true"`. Focus returns to the (tabbable) container when the
  field an Enter or Escape ended goes away.
- **Dragging one item onto another** (reorder a tree or a canvas):
  `PointerDrag.behavior(Slots)<Input, Message>({ container, attribute, toMessage })`
  (Mount `PointerDrag({ attribute })` in `/dom`): `DragStarted { id }` past a 4px
  threshold, `DraggedOver { over: { id, zone: 'before' | 'inside' | 'after' } | null }`,
  `DragDropped { id, over }`, `DragCancelled { id }` (Escape, `pointercancel`, a
  button found released). One pointer; touch and pen work by position. A finger's
  press is a drag once held still `HOLD_TO_DRAG_MS` (400ms); one that moves `HOLD_SLOP`
  (8px) first is a scroll, so leave the marked elements' `touch-action` alone and a list of
  them still scrolls. No roles or keys: `Reorder` is the keyboard's way. Swallows the click a drop ends with. Onto another region (a palette onto a
  page): `targets: [{ attribute, within: selector }]` (one entry per region), so `over` is one of those; `within` is
  found nearest the container first, and each fact carries `region: boolean`, so `over: null`
  with `region: true` is the region's empty space. `part: attribute` reports an element
  marked by it as `{ id, zone: 'inside', part }`: a node's empty Region, say. `gaps: true`: over a
  container's own space the place is between its children by the pointer along their flow
  (before the first child whose middle is past it, else after the last; past the region's last,
  `over: null`), measuring only that container's children.
  `edgeScroll: {}` (or `{ edge, speed }`) scrolls the nearest scrolling ancestor, then the
  page, while the drag is held near its edge (default 40px strip, 600px/s, instant steps,
  jumps every 150ms under reduced motion) and reports the place under the still pointer after
  each step; absent, a plain drag scrolls nothing. Only a box the pointer is over is pulled, and only after 150ms in its strip (at the window's edge a box under the pointer that can still scroll goes first),
  nothing above a `position: fixed` box, and not a page under a scroll lock.
  While a drag lasts it writes `--fk-drag-x`, `--fk-drag-y` (viewport px) and
  `data-fk-drag="mouse|touch|pen"` on the root (`DRAGGING`), so a preview follows the
  pointer with no draw per move: draw an element with `popover="manual"` while the drag
  is in the Model and mount `DragPreview()` (`/dom`) on it (top layer); a rule reads the vars.
- **A lasso over marked items** (select by dragging a rectangle on empty space):
  `Marquee.behavior(Slots)<Input, Message>({ container, attribute, edgeScroll?, toMessage })`
  (Mount `Marquee({ attribute })` in `/dom`), attached beside `PointerDrag` on the same
  container: a press on a marked descendant, control, link, field or scrollbar is not its,
  and a finger never starts one. `MarqueeStarted { additive }` past 4px (Shift, Ctrl or Meta
  at the press), `MarqueeChanged { rect, ids, additive }` as the pointer moves or `edgeScroll`
  scrolls the container, `MarqueeEnded` (same fields), `MarqueeCancelled` (Escape, `pointercancel`). `rect`
  is `{ x, y, width, height }` in the container's scrolled content coordinates, `ids` the
  marked descendants it overlaps in document order. It draws and selects nothing: draw the
  band in a Slot, and `update` applies `Selection`'s `replace(Marquee.selected(before, fact))`
  (keep `before` from `MarqueeStarted`; restore it on a cancel). The click a lasso ends
  with is swallowed. The keyboard's way is Selection's Shift range, not a lasso.
- **Reorder a list or tree by keys and pointer:** place `Reorder.bundle` (no args; `onOut`
  required) and attach `Reorder.behavior(Declared)(Slots)<Model, Message>({ container, item, handle, items, parent?, accepts?, orientation?, direction?, grab?, edgeScroll? })`.
  Model `{ held: Option<{ id, by }>, over: Option<Place> }`, `Place` = `PointerDrag`'s
  `{ id, zone }`. Space/Enter grabs and drops, arrows/Home/End walk `Reorder.places`, Escape or
  blur puts back; `PointerDrag` on the container feeds the same Messages. Out:
  `PickedUp`, `PassedOver`, `Moved { id, by, to }`, `PutBack`; the parent applies `Moved`
  (`Reorder.apply(ids, moved)` for a flat list) or refuses it (`Reorder.movesIntoItself` for a
  tree), and reads each out with `LiveAnnounce`'s `announce(Reorder.announcement(fact, { label }))`.
  The pointer drag scrolls a list longer than its box on its own (`edgeScroll: false` opts out).
  Items get `data-reorder="held"` and `data-reorder-over=zone`; nothing moves until the drop.
  Beside `ListNavigation`: `handle: Reorder.routed` with `current` returns `{ behavior, keys }`,
  the route built from the same options; list `Keys.first(placed.keys, ListNavigation.keys(...))`
  and attach `placed.behavior`. A list that selects with Space or activates with Enter gives
  `grab: [Keys.chord('Enter', { alt: true })]`, since the default grab is Space and Enter. Keep
  focus after the keyed move with `FocusRecovery`'s `same` on the handle.
- **One router for a field and a list:** `RovingTabindex`, `ListNavigation`, `GridNavigation`, `TreeNavigation` and
  `Typeahead` each export `keys(Declared, args)<Input, Message>(options)` (`Typeahead.keys(Declared)` takes no args), the `Keys.route` their `behavior` installs;
  list it beside your own routes in one `Behaviors.Keys.behavior` (a search input: `EscapeClears` + `ListNavigation.keys`).
  Chords come with Shift up and down; `ListNavigation.keys` declares every printable key unless `typeahead: false`.
  Only `keydown` is written: attach `ListNavigation.item(Declared, args)(Slots)({ item, items })` for its items'
  tab stop and `OnFocus` (the others: `RovingTabindex.itemAttributes`), and draw `aria-activedescendant` yourself.
- **Cells in rows:** `GridNavigation.bundle` (`{ columns, wrap, virtual }`) with
  `GridNavigation.behavior(Declared, args)(Slots)<Model, Message>({ container, item, items, direction?, routes? })` (`routes`: the application's keys on the same `keydown`; a clash is `mixins:key-conflict`).
  Same Model slice and item attributes as `RovingTabindex`; arrows move within the row or
  column, `wrap` continues into the next row or column, Home/End are per row and Ctrl+Home/End
  per grid. The pure move is `GridNavigation.move(enabled, count, current, key, modifiers, options)`.
- **Freely placed items:** `SpatialNavigation.bundle` (args `{ id }`) with
  `SpatialNavigation.behavior(Declared, args)(Slots)<Model, Message>({ container, item, items })`:
  each arrow moves the one tab stop to the nearest item drawn that way (a board, a canvas),
  measured when the key is handled and never kept. Home/End follow the view's order, directions are
  physical, and the pure rule is `SpatialNavigation.nearest(items, current, direction)`. Same
  Model slice and item attributes as `RovingTabindex`. The `item` slot must have
  `Capability.Focusable` (another capability, a `Container`, throws `mixins:capability-mismatch`
  when the Behavior is defined); a card `Selection` also drives takes `Focusable` too.
The items come from `Behaviors.Collection.of`, described once per change of the list:

```ts standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behaviors, Capability, Slot, Slots } from 'foldkit-mixins'
import { SpatialNavigation } from 'foldkit-primitives/interaction'

const Card = Schema.Struct({ id: Schema.String, disabled: Schema.Boolean })
const Board = Bundle.declare(SpatialNavigation.bundle, 'board')
const Model = Schema.Struct({ ...Board.fields, cards: Schema.Array(Card) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Board.cases })
type Message = typeof Message.Type

const BoardSlots = Slots.define({
  board: Slot.make({ capability: Capability.Interactive }),
  card: Slot.make({ capability: Capability.Focusable }),
})
const arrows = SpatialNavigation.behavior(Board, { id: 'board' })(BoardSlots)<Model, Message>({
  container: 'board',
  item: 'card',
  items: model =>
    Behaviors.Collection.of(model.cards, { id: card => card.id, disabled: card => card.disabled }),
})
```

- **Edit a value in place:** `InlineEdit.bundle` (args `{ id, blur: 'commit' | 'cancel' }`) with
  `InlineEdit.behavior(Declared, args)(Slots)<Model, Message>({ display, input, error?, value, disabled?, routes? })`.
  Enter, F2, a double click or a typed key starts; Enter saves, Escape cancels without closing a dialog
  around it. A changed value is the `Committed` OutMessage; the parent saves it or hands it back with
  `refuse(committed, error)`, which keeps the editor open. Enter and Escape are `Behaviors.Keys` routes,
  and `routes` adds more.

InlineEdit is wired through the placement's `onOut`, which saves a `Committed` or refuses it:

```ts standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Capability, Event, Slot, Slots } from 'foldkit-mixins'
import { InlineEdit } from 'foldkit-primitives/interaction'

const Item = Schema.Struct({ id: Schema.String, title: Schema.String })
const Title = Bundle.declare(InlineEdit.bundle, 'title')
const Model = Schema.Struct({ ...Title.fields, items: Schema.Array(Item) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Title.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const args = { id: 'titles', blur: 'commit' } as const
const placed = Page.at(Title, {
  args,
  onOut:
    (committed: InlineEdit.Committed) =>
    (model: Model): Update.Return<Model, Message> =>
      committed.value.trim() === ''
        ? placed.helpers.refuse(committed, 'A title is needed')(model)
        : {
            model: {
              ...model,
              items: model.items.map(item =>
                item.id === committed.id ? { ...item, title: committed.value } : item,
              ),
            },
          },
})

const ListSlots = Slots.define({
  title: Slot.make({ capability: Capability.Focusable }),
  field: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  error: Slot.make({ capability: Capability.Base }),
})
const editor = InlineEdit.behavior(Title, args)(ListSlots)<Model, Message>({
  display: 'title',
  input: 'field',
  error: 'error',
  value: (model, id) => model.items.find(item => item.id === id)?.title ?? '',
})
```

The view draws the `field` (with its own `aria-label`) in place of the `title` of the item being edited, and `InlineEdit.errorOf(model.title)` is the refusal's text.

- **Keep focus inside an overlay:** `FocusScope.behavior(Slots)<Input, Message>({ container, contain?, restore?, initialFocus? })`
  attaches the `foldkit-primitives/dom` `FocusScope` Mount (no Bundle: focus is a DOM fact).
  Initial focus on insert, Tab and Shift+Tab wrap and a stray focus comes back under
  `contain`, focus restored on unmount under `restore`. Scopes and `HideOutside` share a stack
  of layers whose topmost owns containment, so sibling (portaled) dialogs stack: the lower one
  neither pulls focus back nor hides the upper. When the opener is gone on restore (removed,
  or drawn again) and focus went with the scope, focus goes by rule (focus the user moved on
  stays, and a scope opened with focus on nothing gives nothing back): an element with the opener's `id`, the opener's `FocusRecovery` steps for its slot, the
  layer below, the page's first tabbable. A native `<dialog>` returns to its opener only:
  `FocusReturn()` (`foldkit-primitives/dom`, a Mount that focuses nothing on mount) gives it the
  same rules, and `Dialog.focusReturn` in `foldkit-mixins-ui` attaches it to the panel.
- **Keep focus when its part goes away:** `FocusRecovery.behavior(Slots)<Input, Message>({ owner, parts: { row: ['next', 'previous', { part: 'input' }], input: [] }, parent? })`
  attaches the `foldkit-primitives/dom` `FocusRecovery` Mount to the owner and marks
  the parts (`data-fk-focus-*`, key from `item.id`). A removed, hidden, `inert` or
  `disabled` focused part, or a row a keyed reorder moved, sends focus to the first step
  that can take it: `same`, `next`, `previous`, `parent`, `stop`, `{ part }`, `owner`.
  A `{ part }` step names a key of `parts` (a type error otherwise, in the bound form
  `behavior(Bound)({ … })`); a key that is no slot names a part a widget marks itself
  (`recoveryPart: 'dismiss'` on an Alert or a Card), so no never-drawn slot is needed.
  Never when focus moved elsewhere; nested owners decide innermost first, then outward;
  a row not drawn yet is the Model's (a Command), not the Mount's. Opt-in. `FOCUS_MARK` (`/dom`) names the
  marks (`data-fk-focus-owner`, `-part`, `-key`, `-parent`) for a view that draws a part by hand.

The smallest use, a row that falls back to its neighbours and then to the field above it:
```ts standalone
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { FocusRecovery } from 'foldkit-primitives/interaction'

const RowSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const RowView = SlotView.over(RowSlots)<{ readonly rows: ReadonlyArray<{ readonly id: string }> }, never>()

// Each part names where focus goes if it is removed, hidden or made inert while it holds focus.
const recovers = FocusRecovery.behavior(RowView)({
  owner: 'root',
  parts: { input: [], row: ['next', 'previous', { part: 'input' }] },
})
```

- **A row that leaves without taking input:** `Presence.behavior(Slots)<Input, Message>({ content, phase: (input, item) => 'shown' | 'hiding' | 'hidden' })`
  draws `data-presence` and `inert` (not `aria-hidden`) on the slot for every phase but `shown`;
  it sends no Message. The phase and the timed `Hidden` are `Presence.bundle`'s (`motion`), one
  per row with `Presence.bundle.each`, driven from the parent's `update` by its helpers
  (`placed.helpers.hide(id)(model)`, `show(id)`). Attach `FocusRecovery` too: focus leaves in the frame
  it turns `inert`, and removal moves nothing; a `Show` before `Hidden` refocuses nothing.
- **Activate on press:** place `Press.bundle` (`{ clickSuppressionMs }`) with a required
  `onOut` for `Pressed { pointerType }`; attach `Press.behavior(Declared)(Slots)<Model, Message>({ target, disabled? })`.
  The `Press.events` Mount reports pointer, key, and click facts; `update` decides
  (primary button, one pointer, cancel, Enter/Space without repeat, virtual clicks,
  ghost click suppressed by a timed Command; `Pressed { pointerType, modifiers }`, `modifiers` being `{ shiftKey, ctrlKey, metaKey, altKey }` of the completing event; it does not say which row). `data-pressed` while down.
  An `aria-disabled` target refuses new presses but still ends one that began enabled (its release arrives as
  a cancel, never as a `Pressed`), so a control that disables itself mid-hold is not left held.
- **Swipe-to-reveal actions with a keyboard way:** `SwipeActions.bundle` (`{ fullSwipe, flick, full }`, `onOut` for `FullSwiped { side }`); `SwipeActions.decide(model, release, args)` reads a `SwipeEnded`; `SwipeActions.keys({ open, rtl, toMessage })` is a `Behaviors.Keys` route (arrows open and close, Escape closes). Hide a closed row's actions with `inert`.
- **Held stepper:** `Repeat.bundle` (`{ delayMs, intervalMs }`, required `onOut` for `Stepped { count, input }` and `Ended { count }`) with
  `Repeat.behavior(Declared)(binder)({ target, disabled? })` (the `SlotView.over` binder, as `Press.behavior`; the target supplies `activation`); send `Repeat.Message.Stopped()` at a bound. A tap steps on release for a finger; the pointer leaving the button ends the hold (no resume on return); one slot takes one of `Press`, `LongPress`, `Repeat`.
- **Hold:** `LongPress.bundle` (`{ thresholdMs }`, required `onOut` for `LongPressed`) with
  `LongPress.behavior(Declared)(Slots)({ target })`; reads `Press.events`, so not on the same slot as `Press`.
- **Keep the selection in view:** the `KeepInView({ selector })` Mount (`foldkit-primitives/dom`) on a
  scrolling list or canvas scrolls whatever newly matches `selector` into view (`nearest`); no Message.
- **Draw over a marked element:** the `Measure({ targets: { selected: selector } })` Mount writes
  `--fk-selected-x/-y/-w/-h/-display` on its element, relative to its scroll box; place an overlay
  absolutely from them. `-moving` is `1` for the measure that finds the mark on another element and
  `0` while it stays: scale a glide's duration by it, so the overlay keeps to its element as the
  layout settles. No Message, nothing in the Model.
- **Draw over another element anywhere on the page:** the `TrackBox({ name, radius? })` Mount follows the
  element whose id is its own `data-target` (`TRACK_TARGET_ATTRIBUTE`, read again when it changes) and writes
  `--fk-<name>-x/-y/-w/-h` (viewport pixels) and, with `radius`, `-radius` (`trackedBox(name)`), through scrolls,
  resizes and the target drawn anew; sends `TrackedTarget { target, found }` on each change. The Tour's cutout uses it.
- **One highlight that follows the pointer across items:** the `FluidHover({ name, item, axis, gapClick })`
  Mount writes `--fk-<name>-x/-y/-w/-h/-shown/-moving` for the item nearest the pointer (gaps included;
  `axis` `y` list, `x` strip, `xy` grid), skipping disabled items, following `:focus-visible`, ignoring touch.
  `gapClick` presses the highlighted item's `data-fluid-press` descendant, within `gapReach` pixels if given. `follows: '[data-active]'` lights the
  item the keys marked while the pointer is away; `from` is the item a fresh highlight grows out of and returns to. `focused` finds the item to light from a focused element that is none (`':scope > :first-child'`, a tree's row from its `treeitem`).
  The container carries `data-fluid-hover="<name>"` while it runs; style the highlight under it. The lit item carries `data-fluid-lit`.
  No Message.
- **An overlay scrollbar:** the `ScrollBars({ idle?, scroller? })` Mount on a scroller drives the bars drawn
  beside it (siblings marked `data-scroll-bar="block"` or `"inline"`): each gets `data-scrollable`,
  `data-shown` (scrolling or pointer moving, until `idle` ms, default 600), `data-dragging`, and
  `--fk-scroll-thumb-offset/-size` (`scrollThumb`) for its thumb; a press on a bar jumps and drags. The
  scroller carries `data-scroll-overlaid` while it runs (hide the native bar under it). A coarse pointer
  gets nothing: native bars stay. `scroller: 'ul'` when the scroller holds another Mount. No Message.
- **Drag deltas:** the `Move` Mount (`foldkit-primitives/dom`) reports `MoveStarted`, `Moved { deltaX, deltaY }`,
  `MoveEnded { completed }` with pointer capture (Escape ends it `completed: false`); `Move.behavior(Slots)({ handle, toMessage })` maps them on a `Draggable` slot.
  Keys: `Move.nudge({ step?, largeStep?, toMessage })` (Alt+arrows) and `Move.resizeKeys(handle, { toMessage })` are
  `Behaviors.Keys` routes that give `{ dx, dy }` for `Box.moveBy`/`moveEach`/`resize`.
- **Where one pointer is in an element:** the `PointerPosition({ focus? })` Mount (`foldkit-primitives/dom`)
  reports `PointerPressed`, `PointerMoved` (with the coalesced `points` and pressure) and `PointerReleased
  { completed }`, each place in the element's padding box with its size, captured, moves listened to only
  during a press; `focus` names a descendant to focus on a press. `paddingBoxOf({ rect, border })` and
  `measurePaddingBox(element)` give the box. The color picker's area, the angle slider and the signature pad read it.
- **Focus ring for keyboard users only:** place `InputModality` (`events`; `{ modality }` from window keydown and pointerdown)
  and attach `FocusVisible.behavior(Declared)(Slots)({ target })`, which writes `data-focus-visible` under keyboard. CSS `:focus-visible` is the floor.
- **Dismiss on Escape or outside press:** place `DismissLayer.bundle` once (required `onOut` for `Dismiss { ids }`);
  `DismissLayer.behavior(Declared)(Slots)({ layer, trigger?, id, outsidePress?, escape? })` marks each layer.
  The stack is DOM order at the event; a press inside a parent is outside its children; a trigger counts as inside.
  Escape is heard in the bubble phase and skipped when `defaultPrevented`: an input inside a layer that handled Escape (cleared itself) keeps the layer open.
  Not for `popover` elements. `Layers.scrollLock(Slots)({ container })` and `Layers.hideOutside(Slots)({ container })`
  mount Foldkit's refcounted scroll lock and keyed inert set.
- **One overlay policy:** `Overlay.modal` / `Overlay.nonModal` (or an explicit `Policy`) into
  `Overlay.behaviors(Slots)<Model, Message, StackField>({ stack, layer, trigger?, id, policy })`, attached with
  `Behavior.attachAll(list)` as one step of the view's pipe: dismiss marking, focus scope, and the scroll/inert mounts the policy keeps. Positioning stays
  per-widget (`Anchor.behavior`); presence stays CSS. See `examples/drawer`.
- **Keep a floating panel inside the viewport:** `Placing.keepWithin(Slots)({ panel })` shifts left past the
  right edge and flips above when the bottom overflows with room overhead; `Placing.placeFor(rect, viewport)`
  is the pure rule. No timers or repositioning, inert without layout. Not `dom`'s `KeepInView`, which scrolls
  content into view instead.
- **Open a popup under its trigger:** `Placing.placeAt(trigger, origin, gap?)` is the offset;
  `Placing.placeAtPoint(point, origin)` is the same offset for a viewport point.
  `Placing.placeAtTrigger(Slots)({ panel, triggerId, gap?, at? })` writes `left` and `--fk-placed-top`
  (`Placing.placedTop`) once; `at` returning a point wins over the trigger. The behavior stays
  named `PlaceAt`; the mount is `PlaceAtPoint` when `at` is some and `PlaceAt` when it is none.
  `OnContextMenu` carries no coordinates: record `clientX` and `clientY` on pointerdown for button
  2, and pass that point through `at` only while it belongs to the open target. A keyboard open has
  no point, so it places under the trigger. The stylesheet reads the variable as `top`, so
  `keepWithin` can still flip. Key the popup by what the args depend on: a Mount reads them once.
  A gap sits outside the trigger's border box, so `pointerleave` on the trigger fires before the
  pointer reaches the popup. Listen on a wrap that contains both, or overlap the border boxes.
  The two mounts start together, so the fit may run before the write; the write measures again.
  A point that would hang past the bottom shifts up (`Placing.shiftIntoViewport`) instead of
  flipping above its offset parent. A trigger still flips, and `keepWithin` sets
  `data-fk-placed="above"` (`Placing.placedSide`, `Placing.placedAbove`) so a hover bridge can
  overlap that side. `Anchor.behavior` portals and tracks; this places once.
- **A parent's own decisions are helpers, never the child's Messages:** `Selection`'s
  `activate(id)`, `select(id)` (one item, anchored), `range(id, order)` (a Shift range), `replace(ids)`, `clear()`; `TreeNavigation`'s `focus`, `open`, `close`,
  `toggle(id)`; `focus(id)` on `RovingTabindex`, `ListNavigation`, `GridNavigation`;
  `Typeahead`'s `clear()`; `LiveAnnounce`'s `announce(text, politeness?)`. Call them on the
  placement (`Picks.helpers.activate(id)(model)`); a control the parent draws sends a parent
  Message and `update` calls the helper.
- **Selected items:** `Selection.bundle` (`{ mode: 'single' | 'multiple' | 'none', allowEmpty }`, slice `{ selected, anchor }`)
  with `Selection.behavior(Declared, args)(Slots)({ container?, item, items, click? })` writing `aria-selected`,
  `aria-multiselectable`, and a click to `Activated`; `Ranged { id, order }` for a Shift range and `Selected { id }` for a click that replaces (Shift comes from `Pressed.modifiers.shiftKey`).
- **Announce to assistive technology:** place `LiveAnnounce.bundle` once (`{ debounceMs, clearAfterMs }`), fold
  the placement's `helpers.announce(text, politeness?)` in `update`, render `LiveAnnounce.view(slice, h)` once and hide it visually.

## Gotchas

- **One placement observes one query.** Two `MediaQuery` placements with the
  same query open two listeners; share the field instead.
- **A non-positive or non-finite timer interval is rejected** at placement, naming it.
- **`Received` and `Sent` leave the Model unchanged.** They exist so agents,
  journals, and DevTools see the traffic.
- **One assembly holds one socket, stream, or watch.** The resource tag is per
  module; a second placement of the same socket, SSE, camera, or permissions
  bundle collides at `assemble`.
- **OutMessages are never dropped by omission.** `Debounce` and `Throttle`
  require `onOut` at placement; `Bundle.ignore` drops one on purpose.
- **Reduced motion is a service.** Provide `Motion.live` (from `foldkit-primitives/motion`) in
  the resources, or `Motion.reduced` / `Motion.full` in tests; `Presence` then exits at once and
  `Tween`/`Spring` jump to `to`. Absent, motion is full.
- **Timers, tweens, debounces, and presence run on Effect's clock.** `TestClock.adjust` advances
  them in tests; a placed Presence hides through a real `sleep` otherwise.
- **Init is a safe default, not a read.** `matches: false`, `online: true`,
  count zero: SSR renders these, and subscriptions then report live facts.

## Known traps

Met in applications on this stack: what failed, and what to do instead.

- **Settle a forked stream before advancing `TestClock`.** Its listeners attach
  on the real scheduler, so events dispatched right after the fork hit nothing
  and a debounce test watched an un-reset timer. Yield (a hundred `yieldNow`)
  after the fork, before the first `adjust`.
- **Merged event streams lose the order between them.** Four streams merged read
  a focus moving between links as `focusin`, `focusin`, `focusout`. Events that
  decide state together go through one listener (`Stream.callback`).
- **`setTimeout(0)` does not wait for a forked fiber.** A test that waited one
  tick for a background load failed on a loaded CI runner. Wait for evidence
  the step happened.
- **A sleep between synthetic pointer events stretches past what reads their
  times**: a flick's speed read from `timeStamp` over 100ms became a rest on
  CI. Space such events with a busy-wait in one synchronous run.

## See also

- Primitives package: https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives
- One reference per subpath, each with every Model, Message, arg, and failure rule:
  https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/media/README.md,
  and likewise `net`, `time`, `state`, `motion`, `interaction`, `device`, `events`,
  `observers`, `dom`
- Bundle mechanism: https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle
- Joining integrations: https://github.com/doeixd/foldkit-plus/blob/main/docs/wiring.md
