import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Selection } from 'foldkit-primitives/interaction'
import { Nav, Sel, initial, matching, selectedOf, update } from '../src/command/app.js'
import { Command, runDemo } from '../src/command/view.js'
import { ListNavigation } from 'foldkit-primitives/interaction'

const activate = (id: string) => Sel.wrapper.make(Selection.Message.Activated({ id }))

describe('update flows', () => {
  it('starts unfiltered with nothing chosen', () => {
    expect(matching(initial.model.query)).toHaveLength(6)
    expect(selectedOf(initial.model)).toBe(null)
  })

  it('typing narrows the list', () => {
    const model = update(initial.model, { _tag: 'Queried', text: 'new' }).model
    expect(matching(model.query).map(command => command.id)).toEqual(['new-file', 'new-folder'])
  })

  it('picking chooses one command', () => {
    const model = update(initial.model, activate('delete')).model
    expect(selectedOf(model)).toBe('delete')
  })

  it('arrows move through the placement', () => {
    const moved = update(
      initial.model,
      Nav.wrapper.make(ListNavigation.Message.Focused({ id: 'rename' })),
    ).model
    expect(moved.paletteNav.current).toBe('rename')
  })
})

describe('view structure', () => {
  it('draws only the matching options, selected when picked', () => {
    const narrowed = update(initial.model, { _tag: 'Queried', text: 'new' }).model
    const palette = Inert.draw(Command, narrowed)
    expect(Inert.byRole(palette, 'option')).toHaveLength(2)
    const picked = update(narrowed, activate('new-file')).model
    const redrawn = Inert.draw(Command, picked)
    expect(Inert.value(Inert.byLabel(redrawn, 'New file')[0], 'aria-selected')).toBe('true')
    expect(Inert.value(Inert.byLabel(redrawn, 'New folder')[0], 'aria-selected')).toBe('false')
  })
})

describe('demo', () => {
  it('traces filter and pick', () => {
    expect(runDemo()).toEqual([
      'start: shown=6 selected=null',
      'typed new: shown=2',
      'picked new-folder: selected=new-folder',
    ])
  })
})
