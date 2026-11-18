/**
 * Kbd: Container slots, a view naming the key, and a combination drawn as a
 * `kbd` of keys. The keycap's look is `kbd.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { KbdSlots, combo, view } from '../src/kbd.js'

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

describe('a key that is a drawing', () => {
  it('holds the drawing in its kbd, in place of text', () => {
    const arrow = h.span([], ['→'])
    const key = view({ key: arrow }, h)
    const [kbd] = Inert.byTag(key, 'kbd')
    expect(Inert.children(kbd)).toEqual([arrow])
  })

  it('holds a drawing among the keys of a combination, in order', () => {
    const arrow = h.span([], ['→'])
    const keys = combo({ keys: ['Shift', arrow], joiner: '+' }, h)
    const [, shift, drawn] = Inert.byTag(keys, 'kbd')
    expect(Inert.text(shift)).toBe('Shift')
    expect(Inert.children(drawn)).toEqual([arrow])
  })
})
