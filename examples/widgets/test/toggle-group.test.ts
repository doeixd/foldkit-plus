import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Selection } from 'foldkit-primitives/interaction'
import { OPTIONS, Sel, initial, selectedOf, update } from '../src/toggle-group/app.js'
import { ToggleGroup, runDemo } from '../src/toggle-group/view.js'

const picked = (id: string) =>
  update(initial.model, Sel.wrapper.make(Selection.Message.Activated({ id }))).model

describe('update flows', () => {
  it('starts with nothing chosen', () => {
    expect(selectedOf(initial.model)).toEqual(Option.none())
  })

  it('picks and unpicks one option', () => {
    expect(selectedOf(picked('center'))).toEqual(Option.some('center'))
    expect(
      selectedOf(
        update(picked('center'), Sel.wrapper.make(Selection.Message.Activated({ id: 'center' })))
          .model,
      ),
    ).toEqual(Option.none())
  })

  it('replaces the choice', () => {
    const next = update(
      picked('left'),
      Sel.wrapper.make(Selection.Message.Activated({ id: 'right' })),
    ).model
    expect(selectedOf(next)).toEqual(Option.some('right'))
  })
})

describe('view structure', () => {
  it('draws the options pressed when selected', () => {
    const group = Inert.draw(ToggleGroup, picked('right'))
    expect(Inert.byRole(group, 'group')).toHaveLength(1)
    expect(Inert.byTag(group, 'button')).toHaveLength(OPTIONS.length)
    expect(Inert.value(Inert.byLabel(group, 'right')[0], 'aria-pressed')).toBe('true')
    expect(Inert.value(Inert.byLabel(group, 'right')[0], 'aria-selected')).toBe('true')
    expect(Inert.value(Inert.byLabel(group, 'left')[0], 'aria-pressed')).toBe('false')
  })
})

describe('demo', () => {
  it('traces pick and unpick', () => {
    expect(runDemo()).toEqual([
      'start: selected=none',
      'picked center: selected=center',
      'picked center again: selected=none',
    ])
  })
})
