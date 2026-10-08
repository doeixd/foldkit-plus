/**
 * Separator: one Container slot, a view whose orientation writes
 * `aria-orientation`, and a recipe whose axis draws along it.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SeparatorSlots, view } from '../src/separator.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('SeparatorSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(SeparatorSlots)).toEqual(['rule'])
    expect(SeparatorSlots.rule?.capability).toBe(Capability.Container)
  })
})

describe('Separator view', () => {
  it('breaks horizontally by default, vertically when asked', () => {
    const flat = view({}, h)
    expect(Inert.byRole(flat, 'separator')).toHaveLength(1)
    expect(Inert.value(Inert.byRole(flat, 'separator')[0], 'aria-orientation')).toBe('horizontal')
    const stood = view({ orientation: 'vertical' }, h)
    expect(Inert.value(Inert.byRole(stood, 'separator')[0], 'aria-orientation')).toBe('vertical')
  })
})

describe('Separator recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Separator>[0]): string =>
    Style.forSlots(SeparatorSlots)(Recipes.Separator(selection)).css

  it('lays the hairline along the orientation axis', () => {
    expect(css({})).toContain('inline-size:100%')
    expect(css({ orientation: 'vertical' })).toContain('inline-size:var(--fk-border-thin)')
  })
})
