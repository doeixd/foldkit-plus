/**
 * ButtonGroup: Container slots, a view naming the group and drawing the
 * caller's items as its children (words in its text box, a rule at each seam
 * when separated), and a recipe joining them; the buttons keep their own
 * styles and Messages. The join's geometry is `buttonGroup.browser.test.ts`'s.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { ButtonGroupSlots, view } from '../src/buttonGroup.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

const buttons = [h.button([], ['Save']), h.button([], ['Cancel']), h.button([], ['Delete'])]

/** The group's rules: the only `div`s among its children here. */
const rules = (group: Html) => Inert.children(group).filter(child => child?.sel === 'div')

const style = Style.forSlots(ButtonGroupSlots)(Recipes.ButtonGroup({}))

describe('ButtonGroupSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(ButtonGroupSlots)).toEqual(['root', 'separator', 'text'])
    for (const slot of Object.values(ButtonGroupSlots))
      expect(slot.capability).toBe(Capability.Container)
  })
})

describe('ButtonGroup view', () => {
  it('names the group and draws every button', () => {
    const group = view(
      {
        label: 'Row actions',
        items: buttons,
        style,
      },
      h,
    )
    expect(Inert.byTag(group, 'div')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(group, 'div')[0], 'role')).toBe('group')
    expect(Inert.value(Inert.byTag(group, 'div')[0], 'aria-label')).toBe('Row actions')
    expect(Inert.byTag(group, 'button')).toHaveLength(3)
    expect(Inert.value(group, 'data-orientation')).toBe('horizontal')
  })

  it('draws words in its text box, in their place among the items', () => {
    const group = view({ label: 'Pages', items: [buttons[0]!, '3 of 12', buttons[1]!], style }, h)
    expect(Inert.children(group).map(child => child?.sel)).toEqual(['button', 'span', 'button'])
    expect(Inert.text(Inert.children(group)[1])).toBe('3 of 12')
  })

  it('draws a hidden rule at every seam of a separated group, and none otherwise', () => {
    const separated = view({ label: 'Actions', items: buttons, separated: true, style }, h)
    expect(Inert.children(separated).map(child => child?.sel)).toEqual([
      'button',
      'div',
      'button',
      'div',
      'button',
    ])
    for (const rule of rules(separated)) expect(Inert.value(rule, 'aria-hidden')).toBe('true')
    expect(rules(view({ label: 'Actions', items: buttons, style }, h))).toEqual([])
  })

  it('says its orientation on the row and on its rules', () => {
    const group = view(
      { label: 'Zoom', items: buttons, orientation: 'vertical', separated: true, style },
      h,
    )
    expect(Inert.value(group, 'data-orientation')).toBe('vertical')
    expect(rules(group)).toHaveLength(2)
    for (const rule of rules(group)) expect(Inert.value(rule, 'data-orientation')).toBe('vertical')
  })
})

describe('ButtonGroup recipe', () => {
  it('overlaps borders and squares only the joining sides', () => {
    const sheet = style.css
    expect(sheet).toContain('display:inline-flex')
    expect(sheet).toContain('margin-inline-start:calc(-1 * var(--fk-border-thin))')
    expect(sheet).toContain('border-start-end-radius:0')
    expect(sheet).toContain('border-start-start-radius:0')
  })
})
