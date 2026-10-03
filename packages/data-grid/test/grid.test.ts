import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DataGrid } from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'
import { at, columns } from './fixture.js'

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
  },
}).model
const step = (model: typeof start, message: typeof Grid.Message.Type) =>
  Option.getOrThrow(placed.update(model, Placement.wrapper.make(message)))

describe('DataGrid', () => {
  test('starts with nothing focused and nothing measured', () => {
    expect(start.grid).toEqual({
      focus: { current: Option.none() },
      viewport: { top: 0, left: 0, width: 0, height: 0 },
    })
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

  test('stores its state as plain data', () => {
    const model = step(start, Grid.Message.Focused({ address: at('p:1', 'price') })).model.grid
    const encoded = Schema.encodeSync(Grid.Model)(model)
    expect(encoded).toEqual({
      focus: { current: { row: 'p:1', column: 'price' } },
      viewport: { top: 0, left: 0, width: 0, height: 0 },
    })
    expect(Schema.decodeUnknownSync(Grid.Model)(encoded)).toEqual(model)
  })
})
