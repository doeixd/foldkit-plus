/**
 * "Theme from a few knobs" from this package's README, run as written so
 * the documented page sheet cannot drift from the API.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Layers, Slot, Slots, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'

const L = Layers.standard
const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } }))

const PageSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const PageStyle = Style.forSlots(PageSlots)({
  root: Style.inline({
    background: Theme.variable(theme, 'surface', 'base'),
    color: Theme.variable(theme, 'text', 'default'),
  }),
})

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

  it('the page style reads tokens the sheet declares', () => {
    expect(sheet).toContain('--fk-surface-base:')
    expect(sheet).toContain('--fk-text-default:')
  })
})
