/**
 * Each default emits its selectors, references only tokens the design
 * declares, and `all` leaves the reset to its own layer.
 */
import { describe, expect, it } from 'vitest'
import { Defaults } from '../src/defaults.js'
import { Layers } from '../src/layers.js'
import { Style } from '../src/style.js'
import { declaredTokens, tokenReferences } from './tokens.js'

const cssOf = (piece: { readonly globalCss?: ReadonlyArray<string> }): string =>
  (piece.globalCss ?? []).join('')

describe('Defaults', () => {
  it.each([
    ['body', Defaults.body, [':where(body)']],
    ['headings', Defaults.headings, [':where(h1)', ':where(h6)']],
    ['links', Defaults.links, [':where(a)', ':focus-visible']],
    ['code', Defaults.code, [':where(pre)', ':where(:not(pre)>code)']],
    ['controls', Defaults.controls, ['select,textarea', ':where(button']],
  ])('%s emits its selectors over declared tokens with fallbacks', (_name, piece, selectors) => {
    const css = cssOf(piece)
    for (const selector of selectors) expect(css).toContain(selector)
    const references = tokenReferences(css)
    expect(references.length).toBeGreaterThan(0)
    for (const reference of references) expect(declaredTokens).toContain(reference)
    expect(css).not.toMatch(/var\(--fk-[a-z0-9-]+\)/)
  })

  it('reset normalizes the box model and references no theme token', () => {
    const css = cssOf(Defaults.reset)
    for (const selector of ['*,*::before,*::after', ':where(html)', ':where(textarea)']) {
      expect(css).toContain(selector)
    }
    expect(tokenReferences(css)).toEqual([])
  })

  it('all composes every default except reset', () => {
    expect(Defaults.all.globalCss).toEqual([
      ...cssOf(Defaults.body).split('\u0000'),
      ...cssOf(Defaults.headings).split('\u0000'),
      ...cssOf(Defaults.links).split('\u0000'),
      ...cssOf(Defaults.code).split('\u0000'),
      ...cssOf(Defaults.controls).split('\u0000'),
    ])
    expect(cssOf(Defaults.all)).not.toContain('box-sizing:border-box')
  })

  it('in the defaults layer, every chunk is wrapped', () => {
    const layered = Layers.standard.in('defaults', Defaults.all)
    expect(layered.globalCss?.length).toBe(Defaults.all.globalCss?.length)
    for (const chunk of layered.globalCss ?? []) {
      expect(chunk.startsWith('@layer defaults{')).toBe(true)
      expect(chunk.endsWith('}')).toBe(true)
    }
    const sheet = Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      layered,
    )
    expect(sheet.startsWith('@layer reset, tokens, theme, defaults, components')).toBe(true)
    expect(sheet.indexOf('@layer reset{')).toBeLessThan(sheet.indexOf('@layer defaults{'))
  })
})
