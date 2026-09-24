/**
 * Layers as a value: the standard order, `in` wrapping rules and global
 * CSS, `declare` hoisted by the stylesheet, and the two diagnostics.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Attributes,
  Capability,
  Diagnostics,
  Layers,
  Slot,
  Slots,
  SlotView,
  Style,
  Theme,
  type NamedStyle,
} from '../src/index.js'
import { h } from './resolverFixture.js'

const RootSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const L = Layers.standard

/** The diagnostic `run` throws; fails the test when it throws nothing or something else. */
const diagnosticOf = (run: () => unknown): Diagnostics.Diagnostic => {
  try {
    run()
  } catch (error) {
    if (error instanceof Diagnostics.DiagnosticError) return error.diagnostic
    throw error
  }
  throw new Error('expected a DiagnosticError, and nothing was thrown')
}

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
    expect(diagnosticOf(() => Layers.define(['a', 'b', 'a'])).code).toBe('style:duplicate-layer')
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
    expect(diagnosticOf(() => Style.stylesheet(L.declare, other.declare)).code).toBe(
      'style:conflicting-layer-order',
    )
  })

  it('puts a theme root in a layer', () => {
    const theme = Theme.define({ color: { text: Theme.lightDark('#111', '#eee') } })
    const root = L.in('theme', Style.global(`:root{--fk-color-text:${theme.color.text}}`))
    expect(Style.stylesheet(L.declare, root)).toBe(
      '@layer reset, tokens, theme, defaults, components, layouts, variants, utilities, app;@layer theme{:root{--fk-color-text:light-dark(#111, #eee)}}',
    )
  })
})

describe('Style.stylesheet refuses a rule outside the declared order', () => {
  const hover = Style.pseudo(':hover', { color: 'blue' })

  it('refuses an unlayered rule, naming its class', () => {
    const Named = Style.forSlots(RootSlots)({ root: hover })
    const diagnostic = diagnosticOf(() => Style.stylesheet(L.declare, Named))
    expect(diagnostic.code).toBe('style:unlayered-rule')
    expect(diagnostic.details).toEqual({ className: Named.rules[0]?.className })
    expect(diagnostic.message).toContain('L.in(')
  })

  it('refuses one unlayered rule among layered ones in the same class', () => {
    const mixed = Style.compose(L.in('components', hover), Style.pseudo(':focus', { outline: '0' }))
    expect(diagnosticOf(() => Style.stylesheet(L.declare, mixed)).code).toBe('style:unlayered-rule')
  })

  it('refuses unlayered global CSS, quoting its start', () => {
    const diagnostic = diagnosticOf(() =>
      Style.stylesheet(L.declare, Style.global('body{margin:0}')),
    )
    expect(diagnostic.code).toBe('style:unlayered-rule')
    expect(diagnostic.message).toContain('global CSS "body{margin:0}"')
  })

  it('refuses a layer the order does not name', () => {
    const other = Layers.define(['vendor'])
    const diagnostic = diagnosticOf(() => Style.stylesheet(L.declare, other.in('vendor', hover)))
    expect(diagnostic.code).toBe('style:unlayered-rule')
    expect(diagnostic.details).toMatchObject({ layer: 'vendor' })
  })

  it('passes keyframes, font faces, and registered properties unlayered', () => {
    const spin = Style.keyframes({ to: { transform: 'rotate(1turn)' } })
    const sheet = Style.stylesheet(
      L.declare,
      spin.style,
      Style.global('@font-face{font-family:x;src:url("a;b{c}.woff2")}'),
      Style.global('@property --x{syntax:"<length>";inherits:false;initial-value:0px}'),
      L.in('app', hover),
    )
    expect(sheet).toContain(`@keyframes ${spin.name}`)
  })

  it('allows unlayered rules when the sheet declares no order', () => {
    expect(Style.stylesheet(hover, Style.global('body{margin:0}'))).toContain('body{margin:0}')
  })
})

describe('Layers.in', () => {
  const hover = Style.pseudo(':hover', { color: 'blue' })

  it('forSlots with a layer compiles the placed pieces, so the view renders the sheet class', () => {
    const layered = Style.forSlots(RootSlots)(
      { root: Style.compose(Style.class('card'), hover) },
      { layer: L.layer('app') },
    )
    expectTypeOf(layered).toEqualTypeOf<NamedStyle<typeof RootSlots>>()
    expect(layered.css).toMatch(/^@layer app\{\.style-[a-z0-9]+:hover\{color:blue\}\}$/)
    const className = layered.rules[0]?.className
    const root = SlotView.buildersFor(RootSlots, [layered.mixin], { input: undefined, h }).root
    expect(Attributes.find(root.attrs(), 'Class')?.value).toBe(`card ${className}`)
    expect(Style.stylesheet(L.declare, layered)).toBe(`${L.declare.globalCss?.[0]}${layered.css}`)
    // Its pieces are the placed ones, so recomposing them keeps the layer.
    expect(Style.forSlots(RootSlots)(layered.pieces).rules).toEqual(layered.rules)
  })

  it('forCapability takes the same layer', () => {
    const Named = Style.forCapability(RootSlots)(Capability.Container, hover, {
      layer: L.layer('components'),
    })
    expect(Named.css).toMatch(/^@layer components\{/)
  })

  it('leaves a rule that is already layered in its layer', () => {
    const piece = L.in(
      'app',
      Style.compose(L.in('layouts', hover), Style.pseudo(':focus', { outline: '0' })),
    )
    expect(piece.rules?.map(rule => rule.layer)).toEqual(['layouts', 'app'])
  })

  it('wraps only the unlayered blocks of a global chunk', () => {
    const piece = L.in(
      'defaults',
      Style.global('@layer reset{*{margin:0}}body{color:red}a{color:blue}'),
    )
    expect(piece.globalCss).toEqual([
      '@layer reset{*{margin:0}}@layer defaults{body{color:red}a{color:blue}}',
    ])
  })

  it('a layer option never refuses a piece already in another layer', () => {
    const piece = Style.compose(L.in('layouts', hover), Style.inline({ color: 'red' }))
    const bare = Style.forSlots(RootSlots)({ root: piece })
    const placed = Style.forSlots(RootSlots)({ root: piece }, { layer: L.layer('app') })
    expect(placed.rules.map(rule => rule.css)).toEqual(bare.rules.map(rule => rule.css))
  })

  it('is idempotent in the same layer', () => {
    const once = L.in('app', hover)
    expect(L.in('app', once)).toEqual(once)
  })

  it('refuses a piece that is wholly in another layer', () => {
    const diagnostic = diagnosticOf(() => L.in('app', L.in('layouts', hover)))
    expect(diagnostic.code).toBe('style:relayered')
    expect(diagnostic.details).toEqual({ layer: 'app', kept: ['layouts'] })
    expect(diagnosticOf(() => L.in('app', L.in('reset', Style.global('*{margin:0}')))).code).toBe(
      'style:relayered',
    )
  })

  it('places the rules of a per-item piece when it renders', () => {
    const piece = L.in(
      'app',
      Style.perItem(item => Style.pseudo(`:nth-child(${item.index + 1})`, { color: 'red' })),
    )
    const rendered = piece.items?.[0]?.({ index: 2 })
    expect(rendered?.rules?.[0]).toMatchObject({ selector: '&:nth-child(3)', layer: 'app' })
  })
})
