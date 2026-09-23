/**
 * GridNavigation: the pure two-dimensional move (rows and columns, wrap in
 * both axes, disabled skipping, Home and End per row and per grid, RTL,
 * modifiers), and the Behavior's attributes on the container and each cell.
 */
import { Option, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { GridNavigation } from '../src/interaction/index.js'

const { behavior, move } = GridNavigation
type MoveOptions = GridNavigation.MoveOptions

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const ctrl: KeyboardModifiers = { ...plain, ctrlKey: true }

// A 3-column grid of 8 cells (the last row is short); cell 4 is disabled.
//   0 1 2
//   3 [4] 5
//   6 7
const count = 8
const enabled = [0, 1, 2, 3, 5, 6, 7]
const grid: MoveOptions = { columns: 3, wrap: false, direction: 'ltr' }
const wrapping: MoveOptions = { ...grid, wrap: true }

describe('move', () => {
  it.each<[string, string, number, KeyboardModifiers, MoveOptions, number | undefined]>([
    ['ArrowRight steps within the row', 'ArrowRight', 0, plain, grid, 1],
    ['ArrowRight skips a disabled cell', 'ArrowRight', 3, plain, grid, 5],
    ['ArrowRight stops at the row edge', 'ArrowRight', 2, plain, grid, 2],
    ['ArrowRight continues into the next row when wrapping', 'ArrowRight', 2, plain, wrapping, 3],
    ['ArrowLeft stops at the row start', 'ArrowLeft', 3, plain, grid, 3],
    ['ArrowLeft wraps back to the previous row', 'ArrowLeft', 3, plain, wrapping, 2],
    ['ArrowDown steps down the column', 'ArrowDown', 0, plain, grid, 3],
    ['ArrowDown skips a disabled cell in the column', 'ArrowDown', 1, plain, grid, 7],
    ['ArrowDown stops at the bottom', 'ArrowDown', 6, plain, grid, 6],
    ['ArrowDown stops at the bottom of a short column', 'ArrowDown', 5, plain, grid, 5],
    ['ArrowDown wraps to the top of the next column', 'ArrowDown', 6, plain, wrapping, 1],
    ['ArrowUp wraps to the bottom of the previous column', 'ArrowUp', 1, plain, wrapping, 6],
    ['ArrowUp stops at the top', 'ArrowUp', 2, plain, grid, 2],
    ['ArrowUp on the last column without wrap stays', 'ArrowUp', 2, plain, grid, 2],
    ['Home goes to the row start', 'Home', 5, plain, grid, 3],
    ['End goes to the last enabled cell of the row', 'End', 3, plain, grid, 5],
    ['Ctrl+Home goes to the first cell', 'Home', 5, ctrl, grid, 0],
    ['Ctrl+End goes to the last cell', 'End', 0, ctrl, grid, 7],
    ['rtl swaps left and right', 'ArrowLeft', 0, plain, { ...grid, direction: 'rtl' }, 1],
    ['a forward key from nothing lands on the first cell', 'ArrowDown', -1, plain, grid, 0],
    ['a backward key from nothing lands on the last cell', 'ArrowLeft', -1, plain, grid, 7],
    ['Ctrl+Arrow is not a grid key', 'ArrowRight', 0, ctrl, grid, undefined],
    ['Alt is not a grid key', 'Home', 0, { ...plain, altKey: true }, grid, undefined],
    ['other keys are left alone', 'Enter', 0, plain, grid, undefined],
  ])('%s', (_, key, current, modifiers, options, expected) => {
    expect(move(enabled, count, current, key, modifiers, options)).toBe(expected)
  })

  it('does nothing with no enabled cells', () => {
    expect(move([], count, 0, 'ArrowRight', plain, grid)).toBeUndefined()
  })
})

const Cells = Bundle.declare(GridNavigation.bundle, 'cells')
const Model = Schema.Struct({ ...Cells.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Cells.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args: GridNavigation.Args = { columns: 3, wrap: false, virtual: false }

describe('GridNavigation placement', () => {
  it('remembers the focused id', () => {
    const placed = Page.at(Cells, { args })
    const start = placed.init({ cells: { current: 'x' } }).model
    expect(start.cells.current).toBeNull()
    const next = Option.getOrThrow(
      placed.update(start, Cells.wrapper.make(GridNavigation.Message.Focused({ id: 'c5' }))),
    ).model
    expect(next.cells.current).toBe('c5')
  })
})

interface Cell {
  readonly id: string
  readonly disabled?: boolean
}
const cells: ReadonlyArray<Cell> = Array.from({ length: count }, (_, i) => ({
  id: `c${i}`,
  ...(i === 4 ? { disabled: true } : {}),
}))
const describeCells = (items: ReadonlyArray<Cell>) =>
  Behaviors.Collection.of(items, { id: c => c.id, disabled: c => c.disabled === true })

const GridSlots = Slots.define({
  grid: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Focusable }),
})
interface GridInput extends Model {
  readonly cells: Model['cells']
  readonly data: ReadonlyArray<Cell>
}
const h = SlotView.inertBuilder<Message>()

const builders = (input: GridInput, options: GridNavigation.Args = args) =>
  SlotView.buildersFor(
    GridSlots,
    [
      behavior(Cells, options)(GridSlots)<GridInput, Message>({
        container: 'grid',
        item: 'cell',
        items: input => describeCells(input.data),
      }).mixin,
    ],
    { input, h },
  )

describe('GridNavigation behavior', () => {
  const input: GridInput = { cells: { current: 'c1' }, data: cells }
  const items = describeCells(cells)

  it('moves focus down the column by id and dispatches Focused', () => {
    const handler = Attributes.find(builders(input).grid.attrs(), 'OnKeyDownFocus')
    expect(Option.getOrThrow(handler!.f('ArrowDown', plain))).toEqual({
      focusSelector: '[id="c7"]',
      message: Cells.wrapper.make(GridNavigation.Message.Focused({ id: 'c7' })),
    })
  })

  it('gives the current cell the tab stop and the rest -1', () => {
    const b = builders(input)
    expect(Attributes.find(b.cell.attrs([], items.slotItem(1)), 'Tabindex')?.value).toBe(0)
    expect(Attributes.find(b.cell.attrs([], items.slotItem(0)), 'Tabindex')?.value).toBe(-1)
  })

  it('under virtual only dispatches and points with aria-activedescendant', () => {
    const b = builders(input, { ...args, virtual: true })
    expect(Attributes.find(b.grid.attrs(), 'AriaActiveDescendant')?.value).toBe('c1')
    const handler = Attributes.find(b.grid.attrs(), 'OnKeyDownPreventDefault')
    expect(Option.getOrThrow(handler!.f('ArrowRight', plain))).toEqual(
      Cells.wrapper.make(GridNavigation.Message.Focused({ id: 'c2' })),
    )
    expect(Attributes.find(b.cell.attrs([], items.slotItem(1)), 'Tabindex')).toBeUndefined()
  })
})
