/**
 * "What the palette derives" from this package's README, run as written so
 * the documented page sheet cannot drift from the API.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Layers, Slot, Slots, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'

const L = Layers.standard
const theme = Theme.standard(Theme.make({ accent: { hue: 280, chroma: 0.15, lightness: 60 } }))
const t = Theme.ref(theme) // t.surface.base is 'var(--fk-surface-base)'; a missing name is a type error

const PageSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
// Layered where it is defined: the view attaches this same value, so its classes are the sheet's.
const PageStyle = Style.forSlots(PageSlots)(
  { root: Style.self({ background: t.surface.base, color: t.text.default }) },
  { layer: L.layer('app') },
)

const sheet = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme)), PageStyle)

describe('README: What the palette derives', () => {
  it('declares the order, and every token once at the theme’s knobs', () => {
    expect(sheet.startsWith('@layer reset, tokens, theme,')).toBe(true)
    expect(sheet.match(/--fk-space-md:/g)).toHaveLength(1)
    expect(sheet.match(/--fk-knob-accent-h:[^;]*/g)).toEqual(['--fk-knob-accent-h:280'])
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
