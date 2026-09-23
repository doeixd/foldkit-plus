/**
 * Theme.lightDark and compose; the closed layer order, inLayer wrapping a
 * rule's CSS and its canonical text, and the foundation stylesheet.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Slot, Slots, Style, Theme } from '../src/index.js'

describe('Theme', () => {
  it('lightDark is a CSS light-dark() value', () => {
    expect(Theme.lightDark('#fff', '#000')).toBe('light-dark(#fff, #000)')
  })

  it('compose merges groups, later tokens winning', () => {
    const base = Theme.define({ color: { text: '#111', bg: '#fff' }, space: { sm: '4px' } })
    const brand = Theme.define({ color: { text: '#222' }, radius: { md: '8px' } })
    const merged = Theme.compose(base, brand)
    expect(merged).toEqual({
      color: { text: '#222', bg: '#fff' },
      space: { sm: '4px' },
      radius: { md: '8px' },
    })
    expect(Theme.variable(merged, 'radius', 'md')).toBe('var(--fk-radius-md)')
  })
})

describe('layers', () => {
  const RootSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

  it('is the closed order with app last', () => {
    expect(Style.layers).toEqual(['defaults', 'components', 'variants', 'utilities', 'app'])
  })

  it('inLayer emits the rule inside the layer and keeps declarations as they are', () => {
    const piece = Style.inLayer(
      'components',
      Style.compose(Style.inline({ color: 'red' }), Style.pseudo(':hover', { color: 'blue' })),
    )
    expect(piece.style).toEqual({ color: 'red' })
    const Named = Style.forSlots(RootSlots)({ root: piece })
    expect(Named.css).toMatch(/^@layer components\{\.style-[a-z0-9]+:hover\{color:blue\}\}$/)
  })

  it('the same rule in two layers is two classes', () => {
    const hover = Style.pseudo(':hover', { color: 'blue' })
    const a = Style.forSlots(RootSlots)({ root: Style.inLayer('components', hover) })
    const b = Style.forSlots(RootSlots)({ root: Style.inLayer('app', hover) })
    expect(a.rules[0]?.className).not.toBe(b.rules[0]?.className)
  })

  it('foundation declares the order, the tokens, and the color scheme', () => {
    const theme = Theme.define({ color: { text: Theme.lightDark('#111', '#eee') } })
    expect(Style.foundation(theme)).toBe(
      '@layer defaults, components, variants, utilities, app;:root{--fk-color-text:light-dark(#111, #eee);color-scheme:light dark}',
    )
    expect(Style.foundation({}, { colorScheme: 'dark' })).toBe(
      '@layer defaults, components, variants, utilities, app;:root{color-scheme:dark}',
    )
  })
})
