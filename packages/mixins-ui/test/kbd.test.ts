/**
 * Kbd: Container slots, a view naming the key, a combination drawn as a
 * `kbd` of keys, and a variant-free recipe (a keycap looks one way; the look
 * is chosen once).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { KbdSlots, combo, view } from '../src/kbd.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('KbdSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(KbdSlots)).toEqual(['key', 'combo', 'joiner'])
    for (const slot of Object.values(KbdSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Kbd view', () => {
  it('names the key in a kbd element', () => {
    const key = view({ key: 'Esc' }, h)
    expect(Inert.byTag(key, 'kbd')).toHaveLength(1)
    expect(Inert.text(key)).toBe('Esc')
  })
})

describe('Kbd.combo', () => {
  it('draws one kbd holding a kbd per key, in order', () => {
    const keys = combo({ keys: ['⌘', 'Shift', 'K'] }, h)
    const kbds = Inert.byTag(keys, 'kbd')
    // The combination itself, then each key.
    expect(kbds).toHaveLength(4)
    expect(kbds.slice(1).map(kbd => Inert.text(kbd))).toEqual(['⌘', 'Shift', 'K'])
    expect(Inert.text(keys)).toBe('⌘ShiftK')
  })

  it('writes the joiner between the keys only', () => {
    const keys = combo({ keys: ['Ctrl', 'Alt', 'Del'], joiner: '+' }, h)
    expect(Inert.byTag(keys, 'span')).toHaveLength(2)
    expect(Inert.text(keys)).toBe('Ctrl+Alt+Del')
  })

  it('refuses a combination of no keys', () => {
    expect(() => combo({ keys: [] }, h)).toThrow(/at least one key/)
  })
})

describe('Kbd recipe', () => {
  const sheet = Style.forSlots(KbdSlots)(Recipes.Kbd({})).css

  it('sets a mono keycap with a pressed lower edge', () => {
    expect(sheet).toContain('font-family:var(--fk-font-mono)')
    expect(sheet).toContain('border-block-end-width:var(--fk-border-thick)')
    expect(sheet).toContain('white-space:nowrap')
  })

  it('lights the keycap’s top inside its edge', () => {
    expect(sheet).toContain('box-shadow:inset 0 var(--fk-border-thin) 0 var(--fk-surface-base)')
  })

  it('sets a combination’s keys in a row, the joiner muted', () => {
    expect(sheet).toContain('display:inline-flex')
    expect(sheet).toContain('gap:var(--fk-space-3xs)')
    expect(sheet).toContain('color:var(--fk-text-muted)')
  })
})
