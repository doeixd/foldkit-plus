import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Selection } from 'foldkit-primitives/interaction'
import { TOPPINGS, Sel, initial, selectedOf, update } from '../src/checkbox-group/app.js'
import { CheckboxGroup, runDemo } from '../src/checkbox-group/view.js'

const activate = (id: string) => Sel.wrapper.make(Selection.Message.Activated({ id }))

describe('update flows', () => {
  it('starts empty', () => {
    expect(selectedOf(initial.model)).toEqual([])
  })

  it('accumulates and drops toppings', () => {
    const one = update(initial.model, activate('cheese')).model
    expect(selectedOf(one)).toEqual(['cheese'])
    const two = update(one, activate('mushrooms')).model
    expect(selectedOf(two)).toEqual(['cheese', 'mushrooms'])
    expect(selectedOf(update(two, activate('cheese')).model)).toEqual(['mushrooms'])
  })
})

describe('view structure', () => {
  it('checks the native boxes from the selection', () => {
    const group = Inert.draw(CheckboxGroup, update(initial.model, activate('pepperoni')).model)
    const boxes = Inert.byTag(group, 'input')
    expect(boxes).toHaveLength(TOPPINGS.length)
    expect(Inert.value(boxes[1], 'checked')).toBe(true)
    expect(Inert.value(boxes[0], 'checked')).toBe(false)
    expect(Inert.value(Inert.byRole(group, 'group')[0], 'aria-multiselectable')).toBe('true')
  })
})

describe('demo', () => {
  it('traces two picks', () => {
    expect(runDemo()).toEqual([
      'start: selected=',
      'picked cheese: selected=cheese',
      'picked mushrooms: selected=cheese,mushrooms',
    ])
  })
})
