/**
 * The knob table a panel maps over: one entry per range knob of
 * `Knobs.standard`, read from the knob's own control.
 */
import { describe, expect, it } from 'vitest'
import { knobData } from '../src/theme/knobData.js'

describe('knobData', () => {
  it('reads a plain range from its knob', () => {
    expect(knobData['shape.density']).toEqual({
      name: 'shape.density',
      title: 'Density',
      variable: 'density',
      unit: '',
      min: 0.75,
      max: 1.3,
      step: 0.05,
      default: 1.1,
    })
    expect(knobData['shadow.strength']).toMatchObject({ unit: '%', variable: 'shadow-strength' })
  })

  it('has each half of a knob with a light and a dark value', () => {
    expect(knobData['accent.lightness.light']).toMatchObject({
      variable: 'accent-l',
      title: 'Lightness',
      unit: '%',
    })
    expect(knobData['accent.lightness.dark']).toMatchObject({
      variable: 'accent-l-dark',
      title: 'Lightness, dark',
    })
    expect(Object.keys(knobData)).not.toContain('accent.lightness')
  })

  it('has no choice or font knob', () => {
    expect(Object.keys(knobData)).not.toContain('state.hover')
    expect(Object.keys(knobData)).not.toContain('type.body')
  })

  it('holds every default inside its own range, and names its variable once', () => {
    const entries = Object.values(knobData)
    for (const data of entries) {
      expect(data.min).toBeLessThan(data.max)
      expect(data.default).toBeGreaterThanOrEqual(data.min)
      expect(data.default).toBeLessThanOrEqual(data.max)
    }
    expect(new Set(entries.map(data => data.variable)).size).toBe(entries.length)
  })
})
