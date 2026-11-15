/**
 * The roster Table: the Model owns the sort and each member's standing, a
 * press on a heading or a row's button reaches `update`, and the name draws as
 * the row's heading.
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
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

  it('sorts by the column pressed, and ignores a name that is no column', () => {
    const byRole = update(initial, Message.Sorted({ column: 'role' })).model
    expect(sorted(byRole).map(member => member.role)).toEqual([
      'Analyst',
      'Analyst',
      'Engineer',
      'Engineer',
    ])
    expect(update(initial, Message.Sorted({ column: 'active' })).model).toBe(initial)
  })

  it('toggles one member and leaves the others, and ignores an unknown id', () => {
    const after = update(initial, Message.Toggled({ id: 'm2' })).model
    expect(after.members.map(member => member.active)).toEqual([true, false, false, true])
    expect(update(initial, Message.Toggled({ id: 'nobody' })).model).toBe(initial)
  })
})

const press = (name: string) => Scene.click(Scene.role('button', { name }))

describe('the view', () => {
  it('draws each name as the row heading and each action as a button named for its row', () => {
    Scene.scene(
      { update, view: TableIsland },
      Scene.given(initial),
      Scene.expect(Scene.role('rowheader', { name: 'Ada Lovelace' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Archive Ada Lovelace' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Restore Katherine Johnson' })).toExist(),
    )
  })

  it('sends a press on a row button to update, which turns Archive into Restore', () => {
    Scene.scene(
      { update, view: TableIsland },
      Scene.given(initial),
      press('Archive Ada Lovelace'),
      Scene.expect(Scene.role('button', { name: 'Restore Ada Lovelace' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Archive Ada Lovelace' })).toBeAbsent(),
    )
  })

  it('marks the sorted heading with aria-sort after a press on it', () => {
    Scene.scene(
      { update, view: TableIsland },
      Scene.given(initial),
      press('Name'),
      Scene.expect(Scene.role('columnheader', { name: 'Name' })).toHaveAttr(
        'aria-sort',
        'ascending',
      ),
    )
  })
})

describe('demo', () => {
  it('traces a sort, its reversal and an archive', () => {
    expect(runDemo()).toEqual([
      'start: Grace Hopper, Ada Lovelace, Katherine Johnson, Annie Easley',
      'sorted by name: Ada Lovelace, Annie Easley, Grace Hopper, Katherine Johnson',
      'pressed again: Katherine Johnson, Grace Hopper, Annie Easley, Ada Lovelace',
      'archived Ada Lovelace: active=false',
    ])
  })
})
