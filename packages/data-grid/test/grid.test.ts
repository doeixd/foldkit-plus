import { Effect, Option, Schema } from 'effect'
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
import { type Id, at, columns, productKey, products } from './fixture.js'

const Grid = DataGrid.make({ id: 'products', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
const Message = defineMessageUnion({ ...Placement.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement)

const start = placed.init({
  grid: {
    focus: { current: Option.some(at('p:1', 'sku')), header: Option.none() },
    viewport: { top: 5, left: 5, width: 5, height: 5 },
    columns: { start: ['sku'], center: [], end: [], hidden: [], widths: [] },
    resizing: Option.some({ column: 'sku', from: 1 }),
    selection: {
      rows: RowSelection.Keys({ keys: ['p:1'] }),
      anchor: Option.some('p:1'),
      cells: Option.none(),
    },
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
      selection: {
        rows: RowSelection.Keys({ keys: [] }),
        anchor: Option.none(),
        cells: Option.none(),
      },
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
      selection: { rows: { _tag: 'Keys', keys: [] }, anchor: null, cells: null },
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
