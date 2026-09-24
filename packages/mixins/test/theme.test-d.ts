/**
 * `Theme.scoped` is typed by the theme it overrides: a group or a token
 * the theme lacks is a compile error, not a variable nothing reads.
 */
import { describe, it } from 'vitest'
import { Theme } from '../src/theme.js'

const palette = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })

describe('Theme.scoped', () => {
  it('accepts the theme’s own groups and names', () => {
    Theme.scoped(palette, '.ocean', { knob: { 'accent-h': '215' }, accent: { hover: 'red' } })
  })

  it('refuses a misspelled token', () => {
    // @ts-expect-error `acent-h` is not a knob of the palette
    Theme.scoped(palette, '.ocean', { knob: { 'acent-h': '215' } })
  })

  it('refuses a group the theme lacks', () => {
    // @ts-expect-error `colour` is not a group of the palette
    Theme.scoped(palette, '.ocean', { colour: { accent: 'red' } })
  })
})
