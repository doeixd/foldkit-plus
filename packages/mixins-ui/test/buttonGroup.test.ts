/**
 * ButtonGroup: one Container slot, a view naming the group and drawing the
 * caller's buttons as its children, and a variant-free recipe joining them
 * (one joined look; the buttons keep their own styles and Messages).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ButtonGroupSlots, view } from '../src/buttonGroup.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

const buttons = [h.button([], ['Save']), h.button([], ['Cancel']), h.button([], ['Delete'])]

describe('ButtonGroupSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(ButtonGroupSlots)).toEqual(['root'])
    expect(ButtonGroupSlots.root?.capability).toBe(Capability.Container)
  })
})

describe('ButtonGroup view', () => {
  it('names the group and draws every button', () => {
    const group = view(
      {
        label: 'Row actions',
        items: buttons,
        style: Style.forSlots(ButtonGroupSlots)(Recipes.ButtonGroup({})),
      },
      h,
    )
    expect(Inert.byTag(group, 'div')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(group, 'div')[0], 'role')).toBe('group')
    expect(Inert.value(Inert.byTag(group, 'div')[0], 'aria-label')).toBe('Row actions')
    expect(Inert.byTag(group, 'button')).toHaveLength(3)
  })
})

describe('ButtonGroup recipe', () => {
  it('overlaps borders and squares only the joining sides', () => {
    const sheet = Style.forSlots(ButtonGroupSlots)(Recipes.ButtonGroup({})).css
    expect(sheet).toContain('display:inline-flex')
    expect(sheet).toContain('margin-inline-start:calc(-1 * var(--fk-border-thin))')
    expect(sheet).toContain('border-start-end-radius:0')
    expect(sheet).toContain('border-start-start-radius:0')
  })
})
