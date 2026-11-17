/**
 * The roster Table: the Model owns the sort and each member's standing, a
 * press on a heading or a row's button reaches `update`, and the name draws as
 * the row's heading.
 */
import { Option } from 'effect'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Message, initial, sorted, update } from '../src/table/app.js'
import { TableIsland, runDemo } from '../src/table/view.js'

const order = (model: typeof initial) => sorted(model).map(member => member.name)

describe('update flows', () => {
  it('keeps the members as added until a heading sorts them', () => {
    expect(order(initial)).toEqual([
      'Grace Hopper',
      'Ada Lovelace',
      'Katherine Johnson',
      'Annie Easley',
    ])
  })

  it('cycles a heading through ascending, descending and none', () => {
    const ascending = update(initial, Message.Sorted({ column: 'name' })).model
    expect(order(ascending)).toEqual([
      'Ada Lovelace',
      'Annie Easley',
      'Grace Hopper',
      'Katherine Johnson',
    ])
    const descending = update(ascending, Message.Sorted({ column: 'name' })).model
    expect(order(descending)[0]).toBe('Katherine Johnson')
    expect(update(descending, Message.Sorted({ column: 'name' })).model.sort).toEqual(Option.none())
  })

  it('sorts by the column pressed, and a name that is no column does not type-check', () => {
    const byRole = update(initial, Message.Sorted({ column: 'role' })).model
    expect(sorted(byRole).map(member => member.role)).toEqual([
      'Analyst',
      'Analyst',
      'Engineer',
      'Engineer',
    ])
    // @ts-expect-error `active` is not a column a heading sorts by.
    Message.Sorted({ column: 'active' })
  })

  it('toggles one member and leaves the others, and ignores an unknown id', () => {
    const after = update(initial, Message.Toggled({ id: 'm2' })).model
    expect(after.members.map(member => member.active)).toEqual([true, false, false, true])
    expect(update(initial, Message.Toggled({ id: 'nobody' })).model).toBe(initial)
  })
})

describe('the view', () => {
  it('draws each name as the row heading and each action as a button named for its row', () => {
    const table = TableIsland(initial, SlotView.inertBuilder<Message>())
    const rowHeadings = Inert.byTag(table, 'th')
      .filter(cell => Inert.value(cell, 'scope') === 'row')
      .map(Inert.text)
    expect(rowHeadings).toContain('Ada Lovelace')
    expect(Inert.byLabel(table, 'Archive Ada Lovelace')).toHaveLength(1)
    expect(Inert.byLabel(table, 'Restore Katherine Johnson')).toHaveLength(1)
  })
})
// A press on a heading or a row button reaches `update` in `table.browser.test.ts`: a Scene test
// of this view cannot resolve the `FocusRecovery` Mount, which has no Message to answer with.
