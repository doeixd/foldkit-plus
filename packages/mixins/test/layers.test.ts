/**
 * Layers as a value: the standard order, `in` wrapping rules and global
 * CSS, `declare` hoisted by the stylesheet, and the two diagnostics.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Diagnostics, Layers, Slot, Slots, Style, Theme } from '../src/index.js'

const RootSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const L = Layers.standard

describe('Layers', () => {
  it('standard is the shipped order with app last', () => {
    expect(L.names).toEqual([
      'reset',
      'tokens',
      'theme',
      'defaults',
      'components',
      'layouts',
      'variants',
      'utilities',
      'app',
    ])
    expect(L.declare.globalCss).toEqual([
      '@layer reset, tokens, theme, defaults, components, layouts, variants, utilities, app;',
    ])
  })

  it('define refuses a duplicate name', () => {
    expect(() => Layers.define(['a', 'b', 'a'])).toThrow(Diagnostics.DiagnosticError)
    try {
      Layers.define(['a', 'a'])
    } catch (error) {
      expect(error).toBeInstanceOf(Diagnostics.DiagnosticError)
      if (error instanceof Diagnostics.DiagnosticError) {
        expect(error.diagnostic.code).toBe('style:duplicate-layer')
      }
    }
  })

  it('in emits the rule inside the layer and keeps declarations as they are', () => {
    const piece = L.in(
      'components',
      Style.compose(Style.inline({ color: 'red' }), Style.pseudo(':hover', { color: 'blue' })),
    )
    expect(piece.style).toEqual({ color: 'red' })
    const Named = Style.forSlots(RootSlots)({ root: piece })
    expect(Named.css).toMatch(/^@layer components\{\.style-[a-z0-9]+:hover\{color:blue\}\}$/)
  })

  it('in wraps global CSS and rules under a condition', () => {
    const piece = L.in(
      'reset',
      Style.compose(
        Style.global('*{box-sizing:border-box}'),
        Style.whenInput(() => true, Style.pseudo(':focus', { outline: '0' })),
      ),
    )
    expect(piece.globalCss).toEqual(['@layer reset{*{box-sizing:border-box}}'])
    expect(piece.conditions?.[0]?.piece.rules?.[0]?.layer).toBe('reset')
  })

  it('the same rule in two layers is two classes', () => {
    const hover = Style.pseudo(':hover', { color: 'blue' })
    const a = Style.forSlots(RootSlots)({ root: L.in('components', hover) })
    const b = Style.forSlots(RootSlots)({ root: L.in('app', hover) })
    expect(a.rules[0]?.className).not.toBe(b.rules[0]?.className)
  })
})

describe('Style.stylesheet with layers', () => {
  it('hoists the layer order first, once, whatever its position', () => {
    const hover = Style.forSlots(RootSlots)({
      root: L.in('components', Style.pseudo(':hover', { color: 'blue' })),
    })
    const reset = L.in('reset', Style.global('*{margin:0}'))
    const sheet = Style.stylesheet(hover, reset, L.declare, L.declare)
    expect(sheet).toBe(`${L.declare.globalCss?.[0]}@layer reset{*{margin:0}}${hover.css}`)
  })

  it('accepts a bare StyleValue with rules and dedupes it against a NamedStyle', () => {
    const hover = Style.pseudo(':hover', { color: 'blue' })
    const Named = Style.forSlots(RootSlots)({ root: hover })
    expect(Style.stylesheet(hover, Named)).toBe(Named.css)
    expect(Style.stylesheet(Named, hover)).toBe(Named.css)
  })

  it('refuses two different layer orders', () => {
    const other = Layers.define(['x', 'y'])
    expect(() => Style.stylesheet(L.declare, other.declare)).toThrow(Diagnostics.DiagnosticError)
  })

  it('puts a theme root in a layer', () => {
    const theme = Theme.define({ color: { text: Theme.lightDark('#111', '#eee') } })
    const root = L.in('theme', Style.global(`:root{--fk-color-text:${theme.color.text}}`))
    expect(Style.stylesheet(L.declare, root)).toBe(
      '@layer reset, tokens, theme, defaults, components, layouts, variants, utilities, app;@layer theme{:root{--fk-color-text:light-dark(#111, #eee)}}',
    )
  })
})
