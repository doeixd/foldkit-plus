import { Effect, Option, Schema, SchemaGetter } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import {
  type CellAddress,
  Columns,
  DataGrid,
  GridFocus,
  GridSelection,
  RowModel,
  RowSelection,
} from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'
import { type Id, type Product, at, columns, productKey, products } from './fixture.js'

const Grid = DataGrid.make({ id: 'products', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
const Message = defineMessageUnion({ ...Placement.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement, { onOut: Bundle.ignore })

const start = placed.init({
  grid: {
    focus: { current: Option.some(at('p:1', 'sku')), header: Option.none() },
    viewport: { top: 5, left: 5, width: 5, height: 5 },
    columns: { start: ['sku'], center: [], end: [], hidden: [], widths: [] },
    resizing: Option.some({ column: 'sku', from: 1 }),
    dragging: Option.some({ column: 'sku', delta: 1 }),
    menu: Option.some({ column: 'sku', active: 1 }),
    filling: Option.none(),
    selection: {
      rows: RowSelection.Keys({ keys: ['p:1'] }),
      anchor: Option.some('p:1'),
      cells: Option.none(),
    },
    editing: Option.none(),
  },
}).model
const step = (model: typeof start, message: typeof Grid.Message.Type) =>
  Option.getOrThrow(placed.update(model, Placement.wrapper.make(message)))

describe('DataGrid', () => {
  test('starts with nothing focused, nothing measured, and the columns as declared', () => {
    expect(start.grid).toEqual({
      focus: { current: Option.none(), header: Option.none() },
      viewport: { top: 0, left: 0, width: 0, height: 0 },
      columns: {
        start: [],
        center: ['name', 'sku', 'price', 'notes'],
        end: [],
        hidden: [],
        widths: [],
      },
      resizing: Option.none(),
      dragging: Option.none(),
      menu: Option.none(),
      filling: Option.none(),
      selection: {
        rows: RowSelection.Keys({ keys: [] }),
        anchor: Option.none(),
        cells: Option.none(),
      },

      editing: Option.none(),
    })
  })

  test('runs the column Messages on its column state', () => {
    const resized = step(start, Grid.Message.ColumnResized({ column: 'price', width: 90 })).model
    expect(resized.grid.columns.widths).toEqual([{ column: 'price', width: 90 }])
    const hidden = step(resized, Grid.Message.ColumnHidden({ column: 'notes' })).model
    expect(hidden.grid.columns.hidden).toEqual(['notes'])
    const shown = step(hidden, Grid.Message.ColumnShown({ column: 'notes' })).model
    expect(shown.grid.columns.hidden).toEqual([])
    const pinned = step(
      shown,
      Grid.Message.ColumnMoved({ column: 'sku', region: 'start', index: 0 }),
    ).model
    expect(pinned.grid.columns).toMatchObject({
      start: ['sku'],
      center: ['name', 'price', 'notes'],
    })
  })

  test('a column Message that changes nothing returns the Model it was given', () => {
    expect(step(start, Grid.Message.ColumnShown({ column: 'notes' })).model).toBe(start)
  })

  test('projects rows through its column state, once per state', () => {
    const rows = RowModel.fromArray(products, productKey)
    const hidden = step(start, Grid.Message.ColumnHidden({ column: 'name' })).model
    const projection = Grid.project(rows, hidden.grid.columns)
    expect(projection.columns).toEqual(['sku', 'price', 'notes'])
    expect(Grid.project(rows, hidden.grid.columns)).toBe(projection)
    expect(Grid.project(rows, start.grid.columns)).not.toBe(projection)
  })

  test('a focused cell becomes current and scrolls nothing', () => {
    const next = step(start, Grid.Message.Focused({ address: at('p:1', 'price') }))
    expect(next.model.grid.focus.current).toEqual(Option.some(at('p:1', 'price')))
    expect(next.commands ?? []).toEqual([])
  })

  test('a move onto a shown cell scrolls nothing', () => {
    const next = step(
      start,
      Grid.Message.Moved({ address: at('p:10', 'name'), reveal: Option.none() }),
    )
    expect(next.model.grid.focus.current).toEqual(Option.some(at('p:10', 'name')))
    expect(next.commands ?? []).toEqual([])
  })

  test('a move off screen scrolls the grid’s container, and the reveal reaches the viewport', async () => {
    const next = step(
      start,
      Grid.Message.Moved({
        address: at('p:100', 'price'),
        reveal: Option.some({ top: 64, left: 0 }),
      }),
    )
    expect(next.model.grid.focus.current).toEqual(Option.some(at('p:100', 'price')))
    const [command] = next.commands ?? []
    expect(command?.args).toEqual({ viewportId: 'products', top: 64, left: 0 })
    // The command reports back through the parent's wrapper, as the runtime would deliver it.
    const reported = await Effect.runPromise(command!.effect)
    const after = Option.getOrThrow(placed.update(next.model, reported)).model
    expect(after.grid.viewport).toEqual({ top: 64, left: 0, width: 0, height: 0 })
  })

  test('goes up to a header, scrolling it in when it is away, and back down', () => {
    const cell = step(start, Grid.Message.Focused({ address: at('p:1', 'price') })).model
    const up = step(cell, Grid.Message.HeaderFocused({ column: 'price', reveal: Option.none() }))
    expect(up.model.grid.focus.header).toEqual(Option.some('price'))
    expect(up.commands ?? []).toEqual([])
    const away = step(
      up.model,
      Grid.Message.HeaderFocused({ column: 'notes', reveal: Option.some({ top: 0, left: 300 }) }),
    )
    expect(away.commands?.[0]?.args).toEqual({ viewportId: 'products', top: 0, left: 300 })
    const again = step(
      away.model,
      Grid.Message.HeaderFocused({ column: 'notes', reveal: Option.none() }),
    )
    expect(again.model).toBe(away.model)
    const down = step(
      away.model,
      Grid.Message.Moved({ address: at('p:1', 'notes'), reveal: Option.none() }),
    )
    expect(down.model.grid.focus).toEqual({
      current: Option.some(at('p:1', 'notes')),
      header: Option.none(),
    })
  })

  test('measures the viewport', () => {
    const next = step(start, Grid.Message.Measured({ top: 10, left: 20, width: 300, height: 100 }))
    expect(next.model.grid.viewport).toEqual({ top: 10, left: 20, width: 300, height: 100 })
  })

  test('a repeat changes nothing', () => {
    const focused = step(start, Grid.Message.Focused({ address: at('p:1', 'price') })).model
    expect(step(focused, Grid.Message.Focused({ address: at('p:1', 'price') })).model).toBe(focused)
    const measured = step(
      focused,
      Grid.Message.Measured({ top: 1, left: 2, width: 3, height: 4 }),
    ).model
    expect(
      step(measured, Grid.Message.Measured({ top: 1, left: 2, width: 3, height: 4 })).model,
    ).toBe(measured)
  })

  test('resizes from where the drag began, not by summing its steps', () => {
    const resizing = step(start, Grid.Message.ResizeStarted({ column: 'price' })).model
    expect(resizing.grid.resizing).toEqual(Option.some({ column: 'price', from: 120 }))
    const wider = step(resizing, Grid.Message.ResizeMoved({ delta: 30 })).model
    const widest = step(wider, Grid.Message.ResizeMoved({ delta: 50 })).model
    expect(widest.grid.columns.widths).toEqual([{ column: 'price', width: 170 }])
    const done = step(widest, Grid.Message.ResizeEnded({ completed: true })).model
    expect(done.grid.resizing).toEqual(Option.none())
    expect(done.grid.columns.widths).toEqual([{ column: 'price', width: 170 }])
    // After the drag, a stray move changes nothing.
    expect(step(done, Grid.Message.ResizeMoved({ delta: 99 })).model).toBe(done)
  })

  test('a cancelled drag puts the width back', () => {
    const resized = step(start, Grid.Message.ColumnResized({ column: 'price', width: 90 })).model
    const resizing = step(resized, Grid.Message.ResizeStarted({ column: 'price' })).model
    const dragged = step(resizing, Grid.Message.ResizeMoved({ delta: 200 })).model
    const cancelled = step(dragged, Grid.Message.ResizeEnded({ completed: false })).model
    expect(cancelled.grid.columns.widths).toEqual([{ column: 'price', width: 90 }])
    expect(cancelled.grid.resizing).toEqual(Option.none())
  })

  test('a resize that never began ends as nothing', () => {
    expect(step(start, Grid.Message.ResizeEnded({ completed: false })).model).toBe(start)
  })

  // Every column is 120 wide: Name's middle is 60, SKU's 180, Price's 300.
  test('a dragged header lands past the middles it crossed when let go', () => {
    const dragging = step(
      start,
      Grid.Message.ColumnDragStarted({ header: GridFocus.headerId('products', 'name') }),
    ).model
    expect(dragging.grid.dragging).toEqual(Option.some({ column: 'name', delta: 0 }))
    const moved = step(dragging, Grid.Message.ColumnDragged({ delta: 130 })).model
    expect(step(moved, Grid.Message.ColumnDragged({ delta: 130 })).model).toBe(moved)
    // Nothing moves until it is let go.
    expect(moved.grid.columns).toBe(start.grid.columns)
    const dropped = step(moved, Grid.Message.ColumnDragEnded({ completed: true })).model
    expect(dropped.grid.columns.center).toEqual(['sku', 'name', 'price', 'notes'])
    expect(dropped.grid.dragging).toEqual(Option.none())
    expect(step(dropped, Grid.Message.ColumnDragged({ delta: 400 })).model).toBe(dropped)
  })

  test('a dragged header lands by the columns as they are when it is let go', () => {
    const dragging = step(
      start,
      Grid.Message.ColumnDragStarted({ header: GridFocus.headerId('products', 'name') }),
    ).model
    const moved = step(dragging, Grid.Message.ColumnDragged({ delta: 130 })).model
    // SKU widened mid-drag: its middle is now 270, which 190 has not passed.
    const widened = step(moved, Grid.Message.ColumnResized({ column: 'sku', width: 300 })).model
    const dropped = step(widened, Grid.Message.ColumnDragEnded({ completed: true })).model
    expect(dropped.grid.columns.center).toEqual(['name', 'sku', 'price', 'notes'])
  })

  test('a cancelled header drag moves nothing', () => {
    const dragging = step(
      start,
      Grid.Message.ColumnDragStarted({ header: GridFocus.headerId('products', 'name') }),
    ).model
    const moved = step(dragging, Grid.Message.ColumnDragged({ delta: 500 })).model
    const cancelled = step(moved, Grid.Message.ColumnDragEnded({ completed: false })).model
    expect(cancelled.grid.columns).toBe(start.grid.columns)
    expect(cancelled.grid.dragging).toEqual(Option.none())
    expect(step(start, Grid.Message.ColumnDragEnded({ completed: true })).model).toBe(start)
  })

  test.each([
    ['another grid’s header', GridFocus.headerId('orders', 'name')],
    ['a column the grid does not define', GridFocus.headerId('products', 'missing')],
    ['a cell’s id', GridFocus.cellId('products', at('p:1', 'name'))],
    ['a hidden column', GridFocus.headerId('products', 'notes')],
  ])('a drag on %s starts nothing', (_, header) => {
    const hidden = step(start, Grid.Message.ColumnHidden({ column: 'notes' })).model
    expect(step(hidden, Grid.Message.ColumnDragStarted({ header })).model).toBe(hidden)
  })

  test('a column’s menu offers pinning, hiding and showing, and only what changes something', () => {
    const notesHidden = step(start, Grid.Message.ColumnHidden({ column: 'notes' })).model.grid
    expect(Grid.menuItems(notesHidden.columns, 'sku')).toEqual([
      Grid.MenuItem.Pin({ region: 'start' }),
      Grid.MenuItem.Pin({ region: 'end' }),
      Grid.MenuItem.Hide(),
      Grid.MenuItem.Show({ column: 'notes' }),
    ])
    const pinned = step(
      start,
      Grid.Message.ColumnMoved({ column: 'sku', region: 'start', index: 0 }),
    ).model.grid
    expect(Grid.menuItems(pinned.columns, 'sku')).toEqual([
      Grid.MenuItem.Pin({ region: 'end' }),
      Grid.MenuItem.Pin({ region: 'center' }),
      Grid.MenuItem.Hide(),
    ])
    // The last column shown cannot be hidden, so its menu does not offer it.
    const one = (['name', 'sku', 'price'] as const).reduce(
      (model, column) => step(model, Grid.Message.ColumnHidden({ column })).model,
      start,
    ).grid
    expect(Grid.menuItems(one.columns, 'notes')).not.toContainEqual(Grid.MenuItem.Hide())
  })

  test('a menu opens on its column’s header, moves within its items, and closes', () => {
    const opened = step(start, Grid.Message.MenuOpened({ column: 'sku' })).model
    expect(opened.grid.menu).toEqual(Option.some({ column: 'sku', active: 0 }))
    expect(opened.grid.focus.header).toEqual(Option.some('sku'))
    // Three items (pin to start, pin to end, hide): a move past either end stops there.
    const last = step(opened, Grid.Message.MenuMoved({ active: 9 })).model
    expect(last.grid.menu).toEqual(Option.some({ column: 'sku', active: 2 }))
    expect(step(last, Grid.Message.MenuMoved({ active: 2 })).model).toBe(last)
    const first = step(last, Grid.Message.MenuMoved({ active: -4 })).model
    expect(first.grid.menu).toEqual(Option.some({ column: 'sku', active: 0 }))
    const closed = step(first, Grid.Message.MenuClosed()).model
    expect(closed.grid.menu).toEqual(Option.none())
    expect(step(closed, Grid.Message.MenuClosed()).model).toBe(closed)
    expect(step(closed, Grid.Message.MenuMoved({ active: 1 })).model).toBe(closed)
  })

  test.each<{
    readonly name: string
    readonly column: Id
    readonly index: number
    readonly expected: { readonly start: ReadonlyArray<Id>; readonly center: ReadonlyArray<Id> }
  }>([
    {
      name: 'pins to the start, next to the center',
      column: 'price',
      index: 0,
      expected: { start: ['price'], center: ['name', 'sku', 'notes'] },
    },
    {
      name: 'hides the column',
      column: 'sku',
      index: 2,
      expected: { start: [], center: ['name', 'sku', 'price', 'notes'] },
    },
  ])('a chosen item $name and closes the menu', ({ column, index, expected }) => {
    const opened = step(start, Grid.Message.MenuOpened({ column })).model
    const chosen = step(opened, Grid.Message.MenuChosen({ index })).model.grid
    expect(chosen.columns).toMatchObject(expected)
    expect(chosen.menu).toEqual(Option.none())
  })

  test('hiding from the menu takes the header’s focus off the hidden column', () => {
    const opened = step(start, Grid.Message.MenuOpened({ column: 'sku' })).model
    const hidden = step(opened, Grid.Message.MenuChosen({ index: 2 })).model.grid
    expect(hidden.columns.hidden).toEqual(['sku'])
    expect(hidden.focus.header).toEqual(Option.none())
  })

  test('a pinned column unpinned from the start goes back to the center’s start', () => {
    const pinned = step(
      start,
      Grid.Message.ColumnMoved({ column: 'sku', region: 'start', index: 0 }),
    ).model
    const opened = step(pinned, Grid.Message.MenuOpened({ column: 'sku' })).model
    const unpinned = step(opened, Grid.Message.MenuChosen({ index: 1 })).model.grid
    expect(unpinned.columns.center).toEqual(['sku', 'name', 'price', 'notes'])
  })

  test('a second column pinned to the start goes after the first, next to the center', () => {
    const pinned = step(
      start,
      Grid.Message.ColumnMoved({ column: 'sku', region: 'start', index: 0 }),
    ).model
    const opened = step(pinned, Grid.Message.MenuOpened({ column: 'price' })).model
    expect(step(opened, Grid.Message.MenuChosen({ index: 0 })).model.grid.columns.start).toEqual([
      'sku',
      'price',
    ])
  })

  test('showing a hidden column from another column’s menu', () => {
    const hidden = step(start, Grid.Message.ColumnHidden({ column: 'notes' })).model
    const opened = step(hidden, Grid.Message.MenuOpened({ column: 'name' })).model
    const shown = step(opened, Grid.Message.MenuChosen({ index: 3 })).model.grid
    expect(shown.columns.hidden).toEqual([])
  })

  test('a menu does not open on a hidden column, and an item it does not have only closes it', () => {
    const hidden = step(start, Grid.Message.ColumnHidden({ column: 'notes' })).model
    expect(step(hidden, Grid.Message.MenuOpened({ column: 'notes' })).model).toBe(hidden)
    const opened = step(start, Grid.Message.MenuOpened({ column: 'sku' })).model
    const closed = step(opened, Grid.Message.MenuChosen({ index: 7 })).model
    expect(closed.grid.menu).toEqual(Option.none())
    expect(closed.grid.columns).toBe(opened.grid.columns)
  })

  test('hiding a column with its menu open, by other means, closes the menu', () => {
    const opened = step(start, Grid.Message.MenuOpened({ column: 'sku' })).model
    const hidden = step(opened, Grid.Message.ColumnHidden({ column: 'sku' })).model.grid
    expect(hidden.menu).toEqual(Option.none())
    const other = step(opened, Grid.Message.ColumnHidden({ column: 'name' })).model.grid
    expect(other.menu).toEqual(Option.some({ column: 'sku', active: 0 }))
    expect(other.focus.header).toEqual(Option.some('sku'))
  })

  test('a column that does not resize starts no drag', () => {
    const Fixed = DataGrid.make({
      id: 'fixed',
      columns: Columns.define<{ readonly id: string }>()({
        id: { header: 'Id', value: row => row.id, resizable: false },
      }),
    })
    const model = Fixed.bundle.init(undefined).model
    expect(
      Fixed.bundle.update(model, Fixed.Message.ResizeStarted({ column: 'id' }), undefined).model,
    ).toBe(model)
  })

  test('refuses a stored Model whose columns name one the grid does not define', () => {
    const stored = Schema.encodeSync(Grid.Model)(start.grid)
    const renamed = { ...stored, columns: { ...stored.columns, center: ['name', 'removed'] } }
    expect(() => Schema.decodeUnknownSync(Grid.Model)(renamed)).toThrow(
      /at \["columns"\]\["center"\]\[1\]/,
    )
  })

  test('stores its state as plain data', () => {
    const model = step(start, Grid.Message.Focused({ address: at('p:1', 'price') })).model.grid
    const encoded = Schema.encodeSync(Grid.Model)(model)
    expect(encoded).toEqual({
      focus: { current: { row: 'p:1', column: 'price' }, header: null },
      viewport: { top: 0, left: 0, width: 0, height: 0 },
      columns: {
        start: [],
        center: ['name', 'sku', 'price', 'notes'],
        end: [],
        hidden: [],
        widths: [],
      },
      resizing: null,
      dragging: null,
      menu: null,
      filling: null,
      selection: { rows: { _tag: 'Keys', keys: [] }, anchor: null, cells: null },
      editing: null,
    })
    expect(Schema.decodeUnknownSync(Grid.Model)(encoded)).toEqual(model)
  })
})

const cellOf = (address: CellAddress<Id>) => GridFocus.cellId('selecting', address)
const Selecting = DataGrid.make({
  id: 'selecting',
  columns,
  rowSelection: 'multiple',
  cellSelection: true,
})
const Single = DataGrid.make({ id: 'single', columns, rowSelection: 'single' })
const fresh = Selecting.bundle.init(undefined).model
const send = (model: typeof fresh, message: typeof Selecting.Message.Type) =>
  Selecting.bundle.update(model, message, undefined).model
const selected = (model: typeof fresh) => {
  const isSelected = GridSelection.isSelected(model.selection.rows)
  return ['p:10', 'p:1', 'p:100'].filter(isSelected)
}

describe('DataGrid selection', () => {
  test('in multiple mode a row toggles and becomes the anchor', () => {
    const one = send(fresh, Selecting.Message.RowSelected({ row: 'p:1' }))
    expect(selected(one)).toEqual(['p:1'])
    expect(one.selection.anchor).toEqual(Option.some('p:1'))
    const two = send(one, Selecting.Message.RowSelected({ row: 'p:100' }))
    expect(selected(two)).toEqual(['p:1', 'p:100'])
    expect(selected(send(two, Selecting.Message.RowSelected({ row: 'p:1' })))).toEqual(['p:100'])
  })

  test('in single mode a row replaces the selection', () => {
    const start = Single.bundle.init(undefined).model
    const one = Single.bundle.update(
      start,
      Single.Message.RowSelected({ row: 'p:1' }),
      undefined,
    ).model
    const other = Single.bundle.update(
      one,
      Single.Message.RowSelected({ row: 'p:10' }),
      undefined,
    ).model
    expect(GridSelection.isSelected(other.selection.rows)('p:1')).toBe(false)
    expect(GridSelection.isSelected(other.selection.rows)('p:10')).toBe(true)
    // Choosing the chosen row keeps it, as a radio button does.
    expect(
      GridSelection.isSelected(
        Single.bundle.update(other, Single.Message.RowSelected({ row: 'p:10' }), undefined).model
          .selection.rows,
      )('p:10'),
    ).toBe(true)
    // A single grid takes no ranges and no select-all.
    expect(
      Single.bundle.update(
        other,
        Single.Message.RowsExtended({ rows: ['p:1', 'p:100'], to: 'p:100' }),
        undefined,
      ).model,
    ).toBe(other)
    expect(Single.bundle.update(other, Single.Message.AllRowsSelected(), undefined).model).toBe(
      other,
    )
  })

  test('a Shift range adds its rows and keeps the anchor', () => {
    const anchored = send(fresh, Selecting.Message.RowSelected({ row: 'p:10' }))
    const ranged = send(
      anchored,
      Selecting.Message.RowsExtended({ rows: ['p:10', 'p:1'], to: 'p:1' }),
    )
    expect(selected(ranged)).toEqual(['p:10', 'p:1'])
    expect(ranged.selection.anchor).toEqual(Option.some('p:10'))
    expect(send(ranged, Selecting.Message.RowsExtended({ rows: ['p:1'], to: 'p:1' }))).toBe(ranged)
  })

  test('select-all holds every row, and a toggle takes one out', () => {
    const all = send(fresh, Selecting.Message.AllRowsSelected())
    expect(selected(all)).toEqual(['p:10', 'p:1', 'p:100'])
    // Rows not loaded yet are selected too.
    expect(GridSelection.isSelected(all.selection.rows)('p:9999')).toBe(true)
    expect(selected(send(all, Selecting.Message.RowSelected({ row: 'p:1' })))).toEqual([
      'p:10',
      'p:100',
    ])
  })

  test('clearing empties the selection, and clearing it again changes nothing', () => {
    const one = send(fresh, Selecting.Message.RowSelected({ row: 'p:1' }))
    const cleared = send(one, Selecting.Message.RowsCleared())
    expect(selected(cleared)).toEqual([])
    expect(cleared.selection.anchor).toEqual(Option.none())
    expect(send(cleared, Selecting.Message.RowsCleared())).toBe(cleared)
  })

  test('a cell range holds its corners, and a plain click or key lets it go', () => {
    const range = send(
      fresh,
      Selecting.Message.CellsSelected({
        anchor: at('p:10', 'sku'),
        focus: at('p:1', 'price'),
        reveal: Option.none(),
      }),
    )
    expect(range.selection.cells).toEqual(
      Option.some({ anchor: at('p:10', 'sku'), focus: at('p:1', 'price') }),
    )
    expect(
      send(range, Selecting.Message.Focused({ address: at('p:1', 'sku') })).selection.cells,
    ).toEqual(Option.none())
    expect(
      send(range, Selecting.Message.Moved({ address: at('p:1', 'sku'), reveal: Option.none() }))
        .selection.cells,
    ).toEqual(Option.none())
  })

  test('a Shift press spans a range from the focused cell, which stays focused', () => {
    const focused = send(fresh, Selecting.Message.Focused({ address: at('p:10', 'sku') }))
    const pressed = Selecting.Message.CellPressed({
      cell: cellOf(at('p:1', 'price')),
      shiftKey: true,
      toggleKey: false,
    })
    const ranged = send(focused, pressed)
    expect(ranged.selection.cells).toEqual(
      Option.some({ anchor: at('p:10', 'sku'), focus: at('p:1', 'price') }),
    )
    expect(ranged.focus.current).toEqual(Option.some(at('p:10', 'sku')))
    // A second Shift press moves the far corner and keeps the near one.
    const again = send(
      ranged,
      Selecting.Message.CellPressed({
        cell: cellOf(at('p:100', 'name')),
        shiftKey: true,
        toggleKey: false,
      }),
    )
    expect(again.selection.cells).toEqual(
      Option.some({ anchor: at('p:10', 'sku'), focus: at('p:100', 'name') }),
    )
  })

  test('a Ctrl or Meta press toggles the row and focuses the cell', () => {
    const toggle = (model: typeof fresh, row: string) =>
      send(
        model,
        Selecting.Message.CellPressed({
          cell: cellOf(at(row, 'sku')),
          shiftKey: false,
          toggleKey: true,
        }),
      )
    const one = toggle(fresh, 'p:1')
    expect(selected(one)).toEqual(['p:1'])
    expect(one.focus.current).toEqual(Option.some(at('p:1', 'sku')))
    expect(selected(toggle(toggle(one, 'p:100'), 'p:1'))).toEqual(['p:100'])
  })

  test('a plain press focuses the cell and lets a range go', () => {
    const ranged = send(
      fresh,
      Selecting.Message.CellsSelected({
        anchor: at('p:10', 'sku'),
        focus: at('p:1', 'price'),
        reveal: Option.none(),
      }),
    )
    const pressed = send(
      ranged,
      Selecting.Message.CellPressed({
        cell: cellOf(at('p:100', 'sku')),
        shiftKey: false,
        toggleKey: false,
      }),
    )
    expect(pressed.focus.current).toEqual(Option.some(at('p:100', 'sku')))
    expect(pressed.selection.cells).toEqual(Option.none())
    expect(selected(pressed)).toEqual([])
  })

  test('a range whose far corner is off screen scrolls it in', () => {
    const next = Selecting.bundle.update(
      fresh,
      Selecting.Message.CellsSelected({
        anchor: at('p:10', 'sku'),
        focus: at('p:100', 'sku'),
        reveal: Option.some({ top: 80, left: 0 }),
      }),
      undefined,
    )
    expect(next.commands?.[0]?.args).toEqual({ viewportId: 'selecting', top: 80, left: 0 })
  })

  test('a press on an element that is not one of this grid’s cells changes nothing', () => {
    const press = (cell: string) =>
      send(fresh, Selecting.Message.CellPressed({ cell, shiftKey: false, toggleKey: false }))
    expect(press(GridFocus.cellId('other', at('p:1', 'sku')))).toBe(fresh)
    expect(press(GridFocus.cellId('selecting', { row: 'p:1', column: 'constructor' }))).toBe(fresh)
    expect(press('selecting')).toBe(fresh)
  })

  test('without the option, selection Messages change nothing', () => {
    const plain = Grid.bundle.init(undefined).model
    const update = (message: typeof Grid.Message.Type) =>
      Grid.bundle.update(plain, message, undefined).model
    expect(update(Grid.Message.RowSelected({ row: 'p:1' }))).toBe(plain)
    expect(update(Grid.Message.AllRowsSelected())).toBe(plain)
    expect(
      update(
        Grid.Message.CellsSelected({
          anchor: at('p:1', 'sku'),
          focus: at('p:1', 'sku'),
          reveal: Option.none(),
        }),
      ),
    ).toBe(plain)
  })
})

const editable = Columns.define<Product>()({
  sku: { header: 'SKU', value: product => product.sku },
  name: { header: 'Name', value: product => product.name, edit: {} },
  price: {
    header: 'Price',
    value: product => product.price,
    edit: {
      draft: product => product.price.toFixed(2),
      // The text checked, then read as the number it means.
      schema: Schema.String.check(
        Schema.isPattern(/^-?\d+(\.\d+)?$/, { message: 'Not a number' }),
      ).pipe(
        Schema.decodeTo(Schema.Number, {
          decode: SchemaGetter.transform(text => Number(text)),
          encode: SchemaGetter.transform(price => String(price)),
        }),
      ),
    },
  },
})
const Editing = DataGrid.make({ id: 'editing', columns: editable })
type EditCell = Parameters<typeof Editing.matchEdit>[0]
type EditingModel = typeof Editing.Model.Type
const blank = Editing.bundle.init(undefined).model
const edit = (model: EditingModel, message: typeof Editing.Message.Type) =>
  Editing.bundle.update(model, message, undefined)
const begun = edit(
  blank,
  Editing.Message.EditStarted({ address: { row: 'p:1', column: 'price' }, draft: '9.00' }),
).model
const typed = (draft: string) => edit(begun, Editing.Message.EditChanged({ draft })).model

describe('DataGrid editing', () => {
  test('matchEdit hands each editable column its value, as its schema decodes it', () => {
    const read = (cell: EditCell) =>
      Editing.matchEdit(cell, {
        name: ({ row, value }) => `${row}:${value}`,
        price: ({ value }) => value * 2,
      })
    expect(read({ row: 'p:1', column: 'price', text: '4.5' })).toBe(9)
    // With no schema a column takes any text, as itself.
    expect(read({ row: 'p:1', column: 'name', text: ' Bolt ' })).toBe('p:1: Bolt ')
    // The grid reports only text its column took: anything else was not the grid's.
    expect(() => read({ row: 'p:1', column: 'sku', text: 'x' })).toThrow(/sku column does not edit/)
    expect(() => read({ row: 'p:1', column: 'price', text: 'cheap' })).toThrow(
      /refuses "cheap" \(Not a number\)/,
    )
    // @ts-expect-error a column the grid does not define
    const forged: EditCell = { row: 'p:1', column: 'constructor', text: 'x' }
    expect(() => read(forged)).toThrow(/constructor column does not edit/)
  })

  test('a key typed on the grid starts an edit, or adds to the one open on that cell', () => {
    const price = { row: 'p:1', column: 'price' } as const
    const started = edit(
      blank,
      Editing.Message.EditTyped({ address: price, text: '4', from: '4.20' }),
    ).model
    expect(Option.map(started.editing, editing => editing.draft)).toEqual(Option.some('4'))
    const more = edit(
      started,
      Editing.Message.EditTyped({ address: price, text: '2', from: 'ignored' }),
    ).model
    expect(Option.map(more.editing, editing => editing.draft)).toEqual(Option.some('42'))
    // On another cell it starts over there.
    const name = { row: 'p:10', column: 'name' } as const
    const elsewhere = edit(
      more,
      Editing.Message.EditTyped({ address: name, text: 'x', from: 'Bolt' }),
    ).model
    expect(elsewhere.editing).toEqual(
      Option.some({ address: name, from: 'Bolt', draft: 'x', error: Option.none() }),
    )
    // A column that does not edit takes nothing.
    const sku = Editing.Message.EditTyped({
      address: { row: 'p:1', column: 'sku' },
      text: 'x',
      from: '',
    })
    expect(edit(blank, sku).model).toBe(blank)
  })

  test('an edit begins on an editable cell, focused, from its draft', () => {
    expect(begun.editing).toEqual(
      Option.some({
        address: { row: 'p:1', column: 'price' },
        from: '9.00',
        draft: '9.00',
        error: Option.none(),
      }),
    )
    expect(begun.focus.current).toEqual(Option.some({ row: 'p:1', column: 'price' }))
  })

  test('a cell whose column does not edit begins nothing', () => {
    const start = Editing.Message.EditStarted({
      address: { row: 'p:1', column: 'sku' },
      draft: 'x',
    })
    expect(edit(blank, start).model).toBe(blank)
  })

  test('a commit the column accepts ends the edit, moves focus and reports the text', () => {
    const committed = edit(
      typed('12.5'),
      Editing.Message.EditCommitted({
        next: Option.some({ row: 'p:100', column: 'price' }),
        reveal: Option.some({ top: 40, left: 0 }),
      }),
    )
    expect(committed.model.editing).toEqual(Option.none())
    expect(committed.model.focus.current).toEqual(Option.some({ row: 'p:100', column: 'price' }))
    expect(committed.outMessage).toEqual(
      Editing.Out.Edited({ row: 'p:1', column: 'price', text: '12.5' }),
    )
    expect(committed.commands?.[0]?.args).toEqual({ viewportId: 'editing', top: 40, left: 0 })
  })

  test('a draft the column refuses keeps the edit with the error, and reports nothing', () => {
    const refused = edit(
      typed('twelve'),
      Editing.Message.EditCommitted({
        next: Option.some({ row: 'p:100', column: 'price' }),
        reveal: Option.none(),
      }),
    )
    expect(refused.outMessage).toBeUndefined()
    expect(refused.model.editing).toEqual(
      Option.some({
        address: { row: 'p:1', column: 'price' },
        from: '9.00',
        draft: 'twelve',
        error: Option.some('Not a number'),
      }),
    )
    expect(refused.model.focus.current).toEqual(Option.some({ row: 'p:1', column: 'price' }))
    // Typing again clears the error.
    const retyped = edit(refused.model, Editing.Message.EditChanged({ draft: 'twelv' })).model
    expect(Option.map(retyped.editing, editing => editing.error)).toEqual(
      Option.some(Option.none()),
    )
  })

  test.each([
    ['the text it began from', '9.00'],
    ['text that decodes to the same value', '09.0'],
  ])('a commit of %s closes the edit, moves focus, and reports nothing', (_, draft) => {
    const committed = edit(
      typed(draft),
      Editing.Message.EditCommitted({
        next: Option.some({ row: 'p:100', column: 'price' }),
        reveal: Option.none(),
      }),
    )
    expect(committed.outMessage).toBeUndefined()
    expect(committed.model.editing).toEqual(Option.none())
    expect(committed.model.focus.current).toEqual(Option.some({ row: 'p:100', column: 'price' }))
  })

  test('a cell holding text its column refuses can be opened and left as it was', () => {
    const start = Editing.Message.EditStarted({
      address: { row: 'p:1', column: 'price' },
      draft: 'n/a',
    })
    const left = edit(
      edit(blank, start).model,
      Editing.Message.EditCommitted({ next: Option.none(), reveal: Option.none() }),
    )
    expect(left.outMessage).toBeUndefined()
    expect(left.model.editing).toEqual(Option.none())
  })

  test('an edit begun by a key is judged against the text the cell showed', () => {
    const price = { row: 'p:1', column: 'price' } as const
    const commit = Editing.Message.EditCommitted({ next: Option.none(), reveal: Option.none() })
    const typedKey = (model: EditingModel, text: string, from: string) =>
      edit(model, Editing.Message.EditTyped({ address: price, text, from })).model
    expect(edit(typedKey(blank, '4', '4'), commit).outMessage).toBeUndefined()
    // A second key, sent before the editor drew, keeps the first's `from`:
    // '42' is a change from '4', though the cell it saw then read '42'.
    expect(edit(typedKey(typedKey(blank, '4', '4'), '2', '42'), commit).outMessage).toEqual(
      Editing.Out.Edited({ row: 'p:1', column: 'price', text: '42' }),
    )
  })

  test('the same draft again changes nothing', () => {
    expect(edit(begun, Editing.Message.EditChanged({ draft: '9.00' })).model).toBe(begun)
  })

  test('a cancel ends the edit and reports nothing; with no edit it changes nothing', () => {
    const cancelled = edit(typed('1'), Editing.Message.EditCancelled())
    expect(cancelled.model.editing).toEqual(Option.none())
    expect(cancelled.outMessage).toBeUndefined()
    expect(edit(blank, Editing.Message.EditCancelled()).model).toBe(blank)
  })

  test('focusing another cell commits the edit first', () => {
    const left = edit(
      typed('3'),
      Editing.Message.Focused({ address: { row: 'p:10', column: 'sku' } }),
    )
    expect(left.outMessage).toEqual(Editing.Out.Edited({ row: 'p:1', column: 'price', text: '3' }))
    expect(left.model.editing).toEqual(Option.none())
    expect(left.model.focus.current).toEqual(Option.some({ row: 'p:10', column: 'sku' }))
  })

  test('focusing another cell with a refused draft keeps the edit where it is', () => {
    const kept = edit(
      typed('x'),
      Editing.Message.Focused({ address: { row: 'p:10', column: 'sku' } }),
    )
    expect(kept.outMessage).toBeUndefined()
    expect(kept.model.focus.current).toEqual(Option.some({ row: 'p:1', column: 'price' }))
    expect(Option.isSome(kept.model.editing)).toBe(true)
  })

  test('a press on the cell being edited leaves the edit alone', () => {
    const own = GridFocus.cellId('editing', { row: 'p:1', column: 'price' })
    const model = typed('4')
    expect(
      edit(model, Editing.Message.CellPressed({ cell: own, shiftKey: false, toggleKey: false }))
        .model,
    ).toBe(model)
    const other = GridFocus.cellId('editing', { row: 'p:10', column: 'name' })
    const pressed = edit(
      model,
      Editing.Message.CellPressed({ cell: other, shiftKey: false, toggleKey: false }),
    )
    expect(pressed.outMessage).toEqual(
      Editing.Out.Edited({ row: 'p:1', column: 'price', text: '4' }),
    )
  })

  test('hiding the edited column ends the edit; hiding another keeps it', () => {
    expect(edit(begun, Editing.Message.ColumnHidden({ column: 'price' })).model.editing).toEqual(
      Option.none(),
    )
    expect(
      Option.isSome(edit(begun, Editing.Message.ColumnHidden({ column: 'name' })).model.editing),
    ).toBe(true)
  })
})

describe('DataGrid undo and redo', () => {
  test.each([
    ['undo', Editing.Message.UndoRequested(), Editing.Out.UndoRequested()],
    ['redo', Editing.Message.RedoRequested(), Editing.Out.RedoRequested()],
  ])('%s is the application’s to do, and an open edit keeps the key', (_, message, out) => {
    const asked = edit(blank, message)
    expect(asked.model).toBe(blank)
    expect(asked.outMessage).toEqual(out)
    const editing = edit(begun, message)
    expect(editing.model).toBe(begun)
    expect(editing.outMessage).toBeUndefined()
  })
})

describe('DataGrid fill', () => {
  type Address = CellAddress<keyof typeof editable.byId>
  const cell = (row: string, column: keyof typeof editable.byId): Address => ({ row, column })
  const one = (address: Address) => ({ anchor: address, focus: address })
  const focused = edit(blank, Editing.Message.Focused({ address: cell('p:10', 'price') })).model
  const over = (address: Address) =>
    Editing.Message.FillDragged({ cell: GridFocus.cellId('editing', address) })

  test('a fill by key is the application’s to write, and an open edit keeps the key', () => {
    const request = { source: one(cell('p:10', 'price')), to: cell('p:100', 'price') }
    const asked = edit(blank, Editing.Message.FillRequested(request))
    expect(asked.model).toBe(blank)
    expect(asked.outMessage).toEqual(Editing.Out.Filled(request))
    expect(edit(begun, Editing.Message.FillRequested(request)).outMessage).toBeUndefined()
  })

  test('a drag fills from the range, over the cell it is let go on', () => {
    const started = edit(focused, Editing.Message.FillStarted()).model
    expect(started.filling).toEqual(
      Option.some({ source: one(cell('p:10', 'price')), to: cell('p:10', 'price') }),
    )
    const dragged = edit(started, over(cell('p:100', 'price'))).model
    // The same cell again, or another grid's, changes nothing.
    expect(edit(dragged, over(cell('p:100', 'price'))).model).toBe(dragged)
    expect(edit(dragged, Editing.Message.FillDragged({ cell: 'elsewhere:p:1:price' })).model).toBe(
      dragged,
    )
    const ended = edit(dragged, Editing.Message.FillEnded({ completed: true }))
    expect(ended.model.filling).toEqual(Option.none())
    expect(ended.outMessage).toEqual(
      Editing.Out.Filled({ source: one(cell('p:10', 'price')), to: cell('p:100', 'price') }),
    )
    const cancelled = edit(dragged, Editing.Message.FillEnded({ completed: false }))
    expect(cancelled.model.filling).toEqual(Option.none())
    expect(cancelled.outMessage).toBeUndefined()
  })

  test('a drag fills from the selected range when there is one, and not while editing', () => {
    const Ranged = DataGrid.make({ id: 'editing', columns: editable, cellSelection: true })
    const send = (model: typeof Ranged.Model.Type, message: typeof Ranged.Message.Type) =>
      Ranged.bundle.update(model, message, undefined).model
    const range = { anchor: cell('p:10', 'name'), focus: cell('p:1', 'price') }
    const selected = send(
      Ranged.bundle.init(undefined).model,
      Ranged.Message.CellsSelected({ ...range, reveal: Option.none() }),
    )
    expect(send(selected, Ranged.Message.FillStarted()).filling).toEqual(
      Option.some({ source: range, to: range.focus }),
    )
    expect(edit(begun, Editing.Message.FillStarted()).model).toBe(begun)
    // Nothing is filling: a drag over a cell, or a release, changes nothing.
    expect(edit(focused, over(cell('p:1', 'price'))).model).toBe(focused)
    expect(edit(focused, Editing.Message.FillEnded({ completed: true })).outMessage).toBeUndefined()
  })

  test('fill is what a fill writes over the rows, judged as a paste is', () => {
    const rows = RowModel.fromArray(products, productKey)
    // 2.00 then 9.00, a step of 7: Cable's price follows at 16.00.
    expect(
      Editing.fill(rows, blank, {
        source: { anchor: cell('p:10', 'price'), focus: cell('p:1', 'price') },
        to: cell('p:100', 'price'),
      }),
    ).toEqual({ accepted: [{ row: 'p:100', column: 'price', text: '16.00' }], refused: [] })
    // A name carried right into a price is no number; the SKU does not edit.
    expect(
      Editing.fill(rows, blank, { source: one(cell('p:10', 'sku')), to: cell('p:10', 'price') }),
    ).toEqual({
      accepted: [{ row: 'p:10', column: 'name', text: 'B-2' }],
      refused: [{ row: 'p:10', column: 'price', text: 'B-2', error: 'Not a number' }],
    })
    // A cell inside the source fills nothing.
    expect(
      Editing.fill(rows, blank, { source: one(cell('p:10', 'price')), to: cell('p:10', 'price') }),
    ).toEqual({ accepted: [], refused: [] })
  })
})

describe('DataGrid paste', () => {
  test('checks each pasted cell against its column, and reports them as one', () => {
    const pasted = edit(
      blank,
      Editing.Message.Pasted({
        cells: [
          { row: 'p:1', column: 'price', text: '3.5', from: '9.00' },
          { row: 'p:10', column: 'price', text: 'lots', from: '1.00' },
          { row: 'p:1', column: 'name', text: 'Anchor', from: 'Bolt' },
          { row: 'p:1', column: 'sku', text: 'not editable', from: 'A-1' },
          // Unchanged: the text it showed, and text that means the same price.
          { row: 'p:10', column: 'name', text: 'Nut', from: 'Nut' },
          { row: 'p:100', column: 'price', text: '02.5', from: '2.50' },
        ],
      }),
    )
    expect(pasted.model).toBe(blank)
    expect(pasted.outMessage).toEqual(
      Editing.Out.Pasted({
        accepted: [
          { row: 'p:1', column: 'price', text: '3.5' },
          { row: 'p:1', column: 'name', text: 'Anchor' },
        ],
        refused: [{ row: 'p:10', column: 'price', text: 'lots', error: 'Not a number' }],
      }),
    )
  })

  test('a paste or cut that changes no cell reports nothing', () => {
    const same = Editing.Message.Pasted({
      cells: [
        { row: 'p:1', column: 'name', text: 'Bolt', from: 'Bolt' },
        { row: 'p:1', column: 'price', text: '9', from: '9.00' },
        // A cut over a cell already empty.
        { row: 'p:10', column: 'name', text: '', from: '' },
      ],
    })
    expect(edit(blank, same).outMessage).toBeUndefined()
  })

  test('a paste while a cell is edited is the field’s, and an empty one is nothing', () => {
    const cell = { row: 'p:1', column: 'name' as const, text: 'x', from: 'y' }
    expect(edit(begun, Editing.Message.Pasted({ cells: [cell] })).outMessage).toBeUndefined()
    expect(edit(blank, Editing.Message.Pasted({ cells: [] })).outMessage).toBeUndefined()
  })
})

describe('DataGrid choices', () => {
  interface Task {
    readonly id: string
    readonly status: string
  }
  const Status = Schema.Literals(['Active', 'Pending', 'Paused', 'Discontinued'])
  const Tasks = DataGrid.make({
    id: 'tasks',
    columns: Columns.define<Task>()({
      status: { header: 'Status', value: task => task.status, edit: { schema: Status } },
      note: { header: 'Note', value: () => '', edit: {} },
    }),
  })
  const status = { row: 't:1', column: 'status' } as const
  const note = { row: 't:1', column: 'note' } as const
  const run = (model: typeof Tasks.Model.Type, message: typeof Tasks.Message.Type) =>
    Tasks.bundle.update(model, message, undefined)
  const empty = Tasks.bundle.init(undefined).model
  const open = (draft: string) =>
    run(empty, Tasks.Message.EditStarted({ address: status, draft })).model
  const draftOf = (model: typeof Tasks.Model.Type) => Option.map(model.editing, edit => edit.draft)

  test.each([
    ['next', 'Pending', 'Paused'],
    ['previous', 'Pending', 'Active'],
    ['first', 'Paused', 'Active'],
    ['last', 'Active', 'Discontinued'],
    ['pageNext', 'Active', 'Discontinued'],
    ['pagePrevious', 'Discontinued', 'Active'],
  ] as const)('a step %s from %s goes to %s', (by, from, to) => {
    expect(draftOf(run(open(from), Tasks.Message.EditStepped({ by })).model)).toEqual(
      Option.some(to),
    )
  })

  test('a step past an end, or on a column that is no choice, changes nothing', () => {
    const last = open('Discontinued')
    expect(run(last, Tasks.Message.EditStepped({ by: 'next' })).model).toBe(last)
    const typing = run(empty, Tasks.Message.EditStarted({ address: note, draft: 'x' })).model
    expect(run(typing, Tasks.Message.EditStepped({ by: 'next' })).model).toBe(typing)
    expect(run(empty, Tasks.Message.EditStepped({ by: 'next' })).model).toBe(empty)
  })

  test('a key on a choice finds the next option it starts, wrapping round', () => {
    const typed = (model: typeof Tasks.Model.Type, text: string) =>
      run(model, Tasks.Message.EditTyped({ address: status, text, from: 'Active' })).model
    const first = typed(empty, 'p')
    expect(draftOf(first)).toEqual(Option.some('Pending'))
    expect(draftOf(typed(first, 'P'))).toEqual(Option.some('Paused'))
    expect(draftOf(typed(typed(first, 'p'), 'p'))).toEqual(Option.some('Pending'))
    // No option starts with it: the draft stays.
    expect(draftOf(typed(first, 'z'))).toEqual(Option.some('Pending'))
    // On a column that is no choice, the key is typed.
    const text = run(empty, Tasks.Message.EditTyped({ address: note, text: 'p', from: '' })).model
    expect(draftOf(text)).toEqual(Option.some('p'))
  })

  test('a chosen option is committed in place, and reported unless it is the value it began from', () => {
    const chosen = run(open('Active'), Tasks.Message.EditChosen({ draft: 'Paused' }))
    expect(chosen.model.editing).toEqual(Option.none())
    expect(chosen.outMessage).toEqual(
      Tasks.Out.Edited({ row: 't:1', column: 'status', text: 'Paused' }),
    )
    const same = run(open('Active'), Tasks.Message.EditChosen({ draft: 'Active' }))
    expect(same.model.editing).toEqual(Option.none())
    expect(same.outMessage).toBeUndefined()
    expect(run(empty, Tasks.Message.EditChosen({ draft: 'Paused' })).model).toBe(empty)
  })
})
