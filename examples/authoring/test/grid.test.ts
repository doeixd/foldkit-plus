/**
 * What the grid's `update` decides: the file manager's three gestures (replace,
 * toggle, range) over rows, and the Model it hands back when nothing changes.
 * Page keys are the grid's, tested where focus is, in `grid.browser.test.ts`.
 */
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { FILES, Message, cellId, initial, rowOf, update, type Model } from '../src/grid/app.js'
import { FileGrid } from '../src/grid/view.js'

const chose = (model: Model, number: number, how: { shift?: boolean; toggle?: boolean } = {}) =>
  update(
    model,
    Message.Chose({
      id: `file-${String(number).padStart(2, '0')}`,
      shift: how.shift ?? false,
      toggle: how.toggle ?? false,
    }),
  ).model

const ids = (...numbers: ReadonlyArray<number>) =>
  numbers.map(number => `file-${String(number).padStart(2, '0')}`)

const sorted = (model: Model) => [...model.picks.selected].sort()

describe('choosing rows', () => {
  it('a plain choice replaces what was chosen, and the next range starts from it', () => {
    let model = chose(initial().model, 3)
    expect(model.picks.selected).toEqual(ids(3))
    model = chose(model, 7)
    expect(model.picks.selected).toEqual(ids(7))
    expect(sorted(chose(model, 4, { shift: true }))).toEqual(ids(4, 5, 6, 7))
  })

  it('a range takes back what the last range added when the other end moves', () => {
    let model = chose(initial().model, 3)
    model = chose(model, 6, { shift: true })
    expect(sorted(model)).toEqual(ids(3, 4, 5, 6))
    model = chose(model, 4, { shift: true })
    expect(sorted(model)).toEqual(ids(3, 4))
    // And across the anchor, the other way.
    expect(sorted(chose(model, 1, { shift: true }))).toEqual(ids(1, 2, 3))
  })

  it('a toggle adds a row and takes it away, and leaves the rest alone', () => {
    let model = chose(initial().model, 3)
    model = chose(model, 5, { toggle: true })
    expect(sorted(model)).toEqual(ids(3, 5))
    model = chose(model, 5, { toggle: true })
    expect(model.picks.selected).toEqual(ids(3))
  })

  it('a range after a toggle starts from the toggled row and keeps the rows chosen before it', () => {
    let model = chose(initial().model, 2)
    model = chose(model, 10, { toggle: true })
    model = chose(model, 12, { shift: true })
    expect(sorted(model)).toEqual(ids(2, 10, 11, 12))
    expect(sorted(chose(model, 8, { shift: true }))).toEqual(ids(2, 8, 9, 10))
  })

  it('a plain choice among several chosen rows leaves only that row', () => {
    let model = chose(initial().model, 2)
    model = chose(model, 6, { shift: true })
    expect(chose(model, 4).picks.selected).toEqual(ids(4))
  })

  it('chooses all rows', () => {
    expect(update(initial().model, Message.ChoseAll()).model.picks.selected).toEqual(
      FILES.map(file => file.id),
    )
  })

  it('returns the Model it was given when nothing changes', () => {
    const model = chose(initial().model, 3)
    expect(chose(model, 3)).toBe(model)
    // The same range chosen twice.
    const ranged = chose(model, 6, { shift: true })
    expect(chose(ranged, 6, { shift: true })).toBe(ranged)
  })

  it('names the row of a cell, whatever the row id holds', () => {
    expect(rowOf(cellId(FILES[0]!, 2))).toBe(FILES[0]!.id)
    expect(rowOf(cellId({ ...FILES[0]!, id: 'a:b' }, 1))).toBe('a:b')
  })
})

describe('the grid drawn', () => {
  it('draws a row of cells for each file and says how many are chosen', () => {
    const tree = Inert.draw(FileGrid, chose(initial().model, 2))
    expect(Inert.byRole(tree, 'row')).toHaveLength(FILES.length)
    expect(Inert.byRole(tree, 'gridcell')).toHaveLength(FILES.length * 3)
    expect(Inert.text(tree)).toContain('1 of 24 selected')
  })

  it('marks the chosen rows aria-selected and no other', () => {
    const model = chose(chose(initial().model, 2), 4, { shift: true })
    const selected = Inert.byRole(Inert.draw(FileGrid, model), 'row').filter(
      row => Inert.value(row, 'aria-selected') === 'true',
    )
    expect(selected).toHaveLength(3)
  })
})
