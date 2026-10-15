/**
 * Meter: the HTML meter's judgment of a value against its thresholds, and
 * the markup that carries it beside upstream's named, clamped `meter`.
 */
import { describe, expect, it } from 'vitest'
import { A11y } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Meter, MeterSlots, Patterns } from '../src/index.js'
import { h } from './fixture.js'

// A battery: low under 20, high over 80, best when full.
const battery = { low: 20, high: 80, optimum: 100 }
// A disk: the same regions, best when nearly empty.
const disk = { low: 20, high: 80, optimum: 0 }

describe('Meter.levelOf', () => {
  it('meets the meter pattern', () => {
    expect(A11y.validate(Patterns.Meter, MeterSlots)).toEqual([])
  })

  it.each([
    [battery, 90, 'good'],
    [battery, 50, 'fair'],
    [battery, 10, 'poor'],
    [disk, 10, 'good'],
    [disk, 50, 'fair'],
    [disk, 90, 'poor'],
    // The boundaries belong to the middle region, as the HTML meter's do.
    [battery, 20, 'fair'],
    [battery, 80, 'fair'],
  ] as const)('judges %o at %i as %s', (thresholds, value, level) => {
    expect(Meter.levelOf(value, thresholds)).toBe(level)
  })

  it('with an optimum in the middle, either end is fair', () => {
    expect(Meter.levelOf(50, { low: 20, high: 80 })).toBe('good')
    expect(Meter.levelOf(5, { low: 20, high: 80 })).toBe('fair')
    expect(Meter.levelOf(95, { low: 20, high: 80 })).toBe('fair')
  })
})

describe('Meter.view', () => {
  it('names the meter by its label, clamps its value and says its level', () => {
    const drawn = Meter.view({ id: 'charge', label: 'Battery', value: 140, ...battery }, h)
    const [meter] = Inert.byRole(drawn, 'meter')
    const [label] = Inert.byTag(drawn, 'span')
    expect(Inert.value(meter, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.value(meter, 'aria-valuenow')).toBe('100')
    expect(Inert.value(meter, 'data-level')).toBe('good')
  })
})
