/**
 * The file grid as one SlotView. `GridNavigation` owns the grid's `keydown` and
 * every cell's tab stop; `Selection` writes `aria-selected` on each row and
 * leaves the click to the view (`click: false`), because a file manager reads
 * Shift and Ctrl on it. Space and Ctrl+A are `routes` on the grid's own keydown
 * owner; Shift+arrow, which the grid owns, is the one `Keys` owner on the root,
 * which a key from a cell reaches by bubbling.
 */
import { Effect, Option, Queue, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { GridNavigation, Selection } from 'foldkit-primitives/interaction'
import { active, focus, muted, panel, t } from '../style.js'
import {
  COLUMNS,
  FILES,
  Message,
  Nav,
  Picks,
  cellId,
  cells,
  currentRow,
  navArgs,
  pickArgs,
  rows,
  type File,
  type Model,
} from './app.js'

const { Keys } = Behaviors

export const GridSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  grid: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  row: Slot.make({ capability: Capability.Interactive }),
  cell: Slot.make({ capability: Capability.Focusable, events: [Event.Focus] }),
  status: Slot.make({ capability: Capability.Container }),
})

const Grid = SlotView.over(GridSlots)<Model, Message>()

export const Navigates = GridNavigation.behavior(Nav, navArgs)(Grid)({
  container: 'grid',
  item: 'cell',
  items: () => cells,
  routes: [
    Keys.route<Model, Message>('Choose', {
      on: [Keys.chord(' '), Keys.chord(' ', { shift: true }), Keys.chord(' ', { ctrl: true })],
      handle: ({ input, modifiers }) =>
        Option.map(currentRow(input), id =>
          Message.Chose({ id, shift: modifiers.shiftKey, toggle: modifiers.ctrlKey }),
        ),
    }),
    Keys.route<Model, Message>('ChooseAll', {
      on: [Keys.chord('a', { ctrl: true })],
      handle: () => Option.some(Message.ChoseAll()),
    }),
  ],
})

export const Chooses = Selection.behavior(Picks, pickArgs)(Grid)({
  item: 'row',
  items: () => rows,
  // The click is `Clicks`: it carries the modifiers a file manager reads, which `Selection`'s own does not.
  click: false,
})

/**
 * A click on a row, with the Shift and Ctrl (or Command) it was made with:
 * Foldkit's `OnClick` reports neither, and its custom-event attribute is not
 * public. The row is the element the click's target sits in, named by its id.
 */
// `Press`'s `Pressed` carries the modifiers but not which row was pressed, and one placement is one
// pressed state for one element, so a click on any of many rows is read here.
const RowClicks = Mount.defineStream('GridRowClicks', {
  messages: [Message.Chose],
  execute: ({ element }) =>
    Stream.callback<ReturnType<typeof Message.Chose>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const clicked = (event: globalThis.Event) => {
            if (!(event instanceof MouseEvent) || !(event.target instanceof Element)) return
            const row = event.target.closest('[role="row"]')
            if (row === null || !element.contains(row)) return
            Queue.offerUnsafe(
              queue,
              Message.Chose({
                id: row.id,
                shift: event.shiftKey,
                toggle: event.ctrlKey || event.metaKey,
              }),
            )
          }
          element.addEventListener('click', clicked)
          return clicked
        }),
        clicked => Effect.sync(() => element.removeEventListener('click', clicked)),
      ),
    ),
})

export const Clicks = Behavior.forSlots(GridSlots)<Model, Message>(
  { grid: Behavior.slot({ mount: () => RowClicks() }) },
  { name: 'Clicks' },
)

const rowAt = (model: Model, step: number): Option.Option<string> =>
  Option.flatMap(currentRow(model), id => {
    const next = rows.ids[rows.indexOf(id) + step]
    return Option.fromNullishOr(next)
  })

/**
 * Shift+arrow extends the range to the row the grid's focus lands on. It stays a root route, not a
 * grid `route`: the grid owns Shift+arrow, and a route on it would throw `mixins:key-conflict`.
 */
export const GridKeys = Keys.behavior(Grid)({
  slot: 'root',
  name: 'GridKeys',
  routes: [
    Keys.route<Model, Message>('Extend', {
      on: [Keys.chord('ArrowDown', { shift: true }), Keys.chord('ArrowUp', { shift: true })],
      handle: ({ key, input }) =>
        Option.map(rowAt(input, key === 'ArrowDown' ? 1 : -1), id =>
          Message.Chose({ id, shift: true, toggle: false }),
        ),
    }),
  ],
})

export const GridStyle = Style.forSlots(GridSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.xs, inlineSize: '28rem' }),
    grid: Style.compose(panel, Style.self({ maxBlockSize: '14rem', overflowY: 'auto' })),
    row: Style.compose(
      active,
      Style.self({ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }),
    ),
    cell: Style.compose(focus, Style.self({ padding: `${t.space.xs} ${t.space.sm}` })),
    status: Style.self({ color: muted }),
  },
  { name: 'GridStyle' },
)

const columnsOf = (file: File): ReadonlyArray<string> => [file.name, file.kind, file.size]

export const FileGrid = Grid.define((model, slots, h) =>
  h.div(slots.root.attrs([]), [
    h.div(
      slots.grid.attrs([h.Role('grid'), h.AriaLabel('Files'), h.AriaMultiSelectable(true)]),
      FILES.map((file, index) =>
        h.div(
          slots.row.attrs([h.Key(file.id), h.Role('row')], rows.slotItem(index)),
          columnsOf(file).map((text, column) =>
            h.div(
              slots.cell.attrs(
                [h.Key(cellId(file, column)), h.Role('gridcell')],
                cells.slotItem(index * COLUMNS + column),
              ),
              [text],
            ),
          ),
        ),
      ),
    ),
    h.div(slots.status.attrs([h.Role('status')]), [
      `${model.picks.selected.length} of ${FILES.length} selected`,
    ]),
  ]),
).pipe(
  Behavior.attach(Navigates),
  Behavior.attach(Chooses),
  Behavior.attach(Behaviors.Collection.behavior(Grid)({ item: 'row', items: () => rows })),
  Behavior.attach(Behaviors.Collection.behavior(Grid)({ item: 'cell', items: () => cells })),
  Behavior.attach(Clicks),
  Behavior.attach(GridKeys),
  Style.attach(GridStyle),
)
