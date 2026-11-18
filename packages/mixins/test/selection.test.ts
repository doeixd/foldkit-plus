/**
 * Selected text is a theme token pair (`selection.background`, `selection.ink`)
 * that `Defaults.body` paints with, and the rule that reads them is a valid one.
 */
import { describe, expect, it } from 'vitest'
import { Defaults } from '../src/defaults.js'
import { Theme } from '../src/theme.js'

const body = (Defaults.body.globalCss ?? []).join('')
const theme = Theme.standard(Theme.make({}))

describe('selection tokens', () => {
  it('the palette declares both, the background derived from the accent', () => {
    expect(Object.keys(theme.selection)).toEqual(['background', 'ink', 'fill-background'])
    expect(theme.selection.background).toContain('var(--fk-accent-default)')
    expect(theme.selection.ink).toBe('currentColor')
  })

  it('is read by name, which the theme types', () => {
    const refs = Theme.ref(theme)
    expect(refs.selection.background).toBe('var(--fk-selection-background)')
    expect(refs.selection.ink).toBe('var(--fk-selection-ink)')
  })

  it('never takes the accent through a relative color', () => {
    expect(theme.selection.background).not.toContain('from')
  })
})

describe('Defaults.body selection rule', () => {
  it('is written on a selector a pseudo-element can sit in', () => {
    expect(body).toContain(':where(*)::selection{')
    expect(body).not.toContain(':where(::selection)')
  })

  it('reads both tokens, each with a fallback for a page with no theme', () => {
    const rule = body.slice(
      body.indexOf(':where(*)::selection{'),
      body.indexOf('}', body.indexOf('::selection')) + 1,
    )
    expect(rule).toMatch(/background:var\(--fk-selection-background, color-mix\(/)
    expect(rule).toContain('color:var(--fk-selection-ink, currentColor)')
    expect(rule).not.toMatch(/var\(--fk-[a-z0-9-]+\)/)
  })
})
