/**
 * Icon: one Container slot, a view that hides a decorative glyph and names
 * a meaningful one, and a recipe whose size sets the box.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { IconSlots, view } from '../src/icon.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const mark = h.span([], ['*'])

describe('IconSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(IconSlots)).toEqual(['glyph'])
    expect(IconSlots.glyph?.capability).toBe(Capability.Container)
  })
})

describe('Icon view', () => {
  it('hides a decorative glyph and names a meaningful one', () => {
    const decorative = view({ content: mark }, h)
    expect(Inert.value(decorative, 'aria-hidden')).toBe('true')
    expect(Inert.value(decorative, 'role')).toBeUndefined()
    const named = view({ content: mark, label: 'Saved' }, h)
    expect(Inert.value(named, 'role')).toBe('img')
    expect(Inert.value(named, 'aria-label')).toBe('Saved')
    expect(Inert.value(named, 'aria-hidden')).toBeUndefined()
  })
})

describe('Icon recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Icon>[0]): string =>
    Style.forSlots(IconSlots)(Recipes.Icon(selection)).css

  it('draws at the body size by default and shrinks when asked', () => {
    expect(css({})).toContain('width:var(--fk-size-md)')
    expect(css({ size: 'sm' })).toContain('width:var(--fk-size-sm)')
  })
})
