/**
 * The knob table a panel maps over: one entry per range knob of
 * `Knobs.standard`, read from the knob's own control.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { render } from '../scripts/knobData.js'
import { knobData } from '../src/theme/knobData.js'
import * as Table from '../src/theme/knobData.js'

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

  it('is what the generator writes from Knobs.standard', async () => {
    const committed = readFileSync(new URL('../src/theme/knobData.ts', import.meta.url), 'utf8')
    expect(committed).toBe(await render())
  })

  it('has each entry as an export of its own', () => {
    expect(Table.shapeDensity).toBe(knobData['shape.density'])
    expect(Table.accentChromaDark).toBe(knobData['accent.chroma.dark'])
  })
})
