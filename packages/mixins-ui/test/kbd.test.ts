/**
 * Kbd: one Container slot, a view naming the key, and a variant-free recipe
 * (a keycap looks one way; the look is chosen once).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { KbdSlots, view } from '../src/kbd.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('KbdSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(KbdSlots)).toEqual(['key'])
    expect(KbdSlots.key?.capability).toBe(Capability.Container)
  })
})

describe('Kbd view', () => {
  it('names the key in a kbd element', () => {
    const key = view({ key: 'Esc' }, h)
    expect(Inert.byTag(key, 'kbd')).toHaveLength(1)
    expect(Inert.text(key)).toBe('Esc')
  })
})

describe('Kbd recipe', () => {
  it('sets a mono keycap with a pressed lower edge', () => {
    const sheet = Style.forSlots(KbdSlots)(Recipes.Kbd({})).css
    expect(sheet).toContain('font-family:var(--fk-font-mono)')
    expect(sheet).toContain('border-block-end-width:var(--fk-border-thick)')
    expect(sheet).toContain('white-space:nowrap')
  })
})
