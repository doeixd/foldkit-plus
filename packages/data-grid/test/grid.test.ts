import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'
import { at, columns, productKey, products } from './fixture.js'

const Grid = DataGrid.make({ id: 'products', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
const Message = defineMessageUnion({ ...Placement.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement)

const start = placed.init({
  grid: {
    focus: { current: Option.some(at('p:1', 'sku')) },
    viewport: { top: 5, left: 5, width: 5, height: 5 },
    columns: { start: ['sku'], center: [], end: [], hidden: [], widths: [] },
    resizing: Option.some({ column: 'sku', from: 1 }),
  },
}).model
const step = (model: typeof start, message: typeof Grid.Message.Type) =>
  Option.getOrThrow(placed.update(model, Placement.wrapper.make(message)))

describe('DataGrid', () => {
  test('starts with nothing focused, nothing measured, and the columns as declared', () => {
    expect(start.grid).toEqual({
      focus: { current: Option.none() },
      viewport: { top: 0, left: 0, width: 0, height: 0 },
      columns: {
        start: [],
        center: ['name', 'sku', 'price', 'notes'],
        end: [],
        hidden: [],
        widths: [],
      },
      resizing: Option.none(),
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
      focus: { current: { row: 'p:1', column: 'price' } },
      viewport: { top: 0, left: 0, width: 0, height: 0 },
      columns: {
        start: [],
        center: ['name', 'sku', 'price', 'notes'],
        end: [],
        hidden: [],
        widths: [],
      },
      resizing: null,
    })
    expect(Schema.decodeUnknownSync(Grid.Model)(encoded)).toEqual(model)
  })
})
