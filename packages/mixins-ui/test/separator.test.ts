/**
 * Separator: a lone rule that is a `separator` (or drawing only, when
 * decorative), and a labelled one whose words are read between two rules
 * that are drawing.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SeparatorSlots, view } from '../src/separator.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('SeparatorSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(SeparatorSlots)).toEqual(['rule', 'root', 'label'])
    for (const slot of Object.values(SeparatorSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
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

  it('writes its orientation for the style on decorative and labelled ones too', () => {
    expect(
      Inert.value(view({ orientation: 'vertical', decorative: true }, h), 'data-orientation'),
    ).toBe('vertical')
    const framed = view({ orientation: 'vertical', label: 'or' }, h)
    expect(Inert.value(framed, 'data-orientation')).toBe('vertical')
    expect(Inert.value(Inert.children(framed)[0], 'data-orientation')).toBe('vertical')
    expect(Inert.value(view({}, h), 'data-orientation')).toBe('horizontal')
  })

  it('is drawing only when decorative', () => {
    const drawn = view({ decorative: true }, h)
    expect(Inert.byRole(drawn, 'separator')).toHaveLength(0)
    expect(Inert.value(drawn, 'role')).toBe('none')
  })

  it('reads its label between two rules that are drawing', () => {
    const drawn = view({ label: 'or' }, h)
    expect(Inert.text(drawn)).toBe('or')
    // A separator's children are presentational: the label would not be read inside one.
    expect(Inert.byRole(drawn, 'separator')).toHaveLength(0)
    const [before, label, after] = Inert.children(drawn)
    expect(Inert.value(before, 'aria-hidden')).toBe('true')
    expect(Inert.text(label!)).toBe('or')
    expect(Inert.value(after, 'aria-hidden')).toBe('true')
  })
})

describe('Separator recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Separator>[0]): string =>
    Style.forSlots(SeparatorSlots)(Recipes.Separator(selection)).css

  it('lays the line along the orientation the view writes', () => {
    expect(css({})).toContain('inline-size:calc(100% - 2 * var(--_fk-separator-inset, 0px))')
    expect(css({})).toContain('border-block-start:')
    expect(css({})).toMatch(/\[data-orientation="vertical"\]\{[^}]*border-inline-start:/)
  })
})
