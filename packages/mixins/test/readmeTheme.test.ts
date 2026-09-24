/**
 * "Theme from a few knobs" from this package's README, run as written so
 * the documented page sheet cannot drift from the API.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Layers, Slot, Slots, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'

const L = Layers.standard
const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } }))
const t = Theme.ref(theme) // t.surface.base is 'var(--fk-surface-base)'; a missing name is a type error

const PageSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
// Layered where it is defined: the view attaches this same value, so its classes are the sheet's.
const PageStyle = L.in(
  'app',
  Style.forSlots(PageSlots)({
    root: Style.self({
      background: t.surface.base,
      color: t.text.default,
    }),
  }),
)

const sheet = Style.stylesheet(
  L.declare,
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('theme', Theme.scoped(theme, ':root[data-theme="ocean"]', { knob: { 'accent-h': '215' } })),
  PageStyle,
)

describe('README: Theme from a few knobs', () => {
  it('declares the order, the scales once, the palette, and the override', () => {
    expect(sheet.startsWith('@layer reset, tokens, theme,')).toBe(true)
    expect(sheet.match(/--fk-space-md:/g)).toHaveLength(1)
    expect(sheet).toContain('@layer theme{:root{--fk-knob-accent-h:280;')
    expect(sheet).toContain('@layer theme{:root[data-theme="ocean"]{--fk-knob-accent-h:215}}')
  })

  it('ships the class the page view renders, in the app layer', () => {
    const className = PageStyle.rules[0]?.className ?? ''
    expect(className).not.toBe('')
    expect(sheet).toContain(`@layer app{.${className}{`)
  })

  it('the page style reads tokens the sheet declares', () => {
    expect(sheet).toContain('--fk-surface-base:')
    expect(sheet).toContain('--fk-text-default:')
  })
})
