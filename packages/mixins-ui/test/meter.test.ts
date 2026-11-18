/**
 * Meter: the HTML meter's judgment of a value against its thresholds, and
 * the markup that carries it beside upstream's named, clamped `meter`.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Meter, MeterSlots, Patterns, Recipes } from '../src/index.js'
import { h, type TestMessage } from './fixture.js'

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

  it('judges a value past the end as the end, which is no region past high', () => {
    expect(Meter.levelOf(140, {})).toBe('good')
    expect(Meter.levelOf(-5, { min: 0, low: 0 })).toBe('good')
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

  it('judges the level by its own thresholds', () => {
    const [meter] = Inert.byRole(
      Meter.view({ id: 'charge', label: 'Battery', value: 10, ...battery }, h),
      'meter',
    )
    expect(Inert.value(meter, 'data-level')).toBe('poor')
  })

  it('passes its range and its spoken value on', () => {
    const [meter] = Inert.byRole(
      Meter.view(
        {
          id: 'disk',
          label: 'Disk',
          value: 140,
          min: 40,
          max: 200,
          valueText: (value, max) => `${value} of ${max} GB`,
        },
        h,
      ),
      'meter',
    )
    expect(Inert.value(meter, 'aria-valuemin')).toBe('40')
    expect(Inert.value(meter, 'aria-valuenow')).toBe('140')
    expect(Inert.value(meter, 'aria-valuetext')).toBe('140 of 200 GB')
  })
})

describe('Meter recipe size', () => {
  const css = (size?: 'sm' | 'md' | 'lg') =>
    Style.forSlots(MeterSlots)(Recipes.Meter(size === undefined ? {} : { size })).css

  it('thickens or thins the track, the middle being the default', () => {
    expect(css('lg')).toContain('0.75rem')
    expect(css('sm')).toContain('0.25rem')
    expect(css('lg')).not.toContain('0.25rem')
    expect(css('md')).toBe(css())
    expect(css()).toContain('0.5rem')
  })
})

describe('Meter orientation and segments', () => {
  const rootOf = (options: Partial<Meter.MeterView<TestMessage>>) => {
    const drawn = Meter.view({ id: 'tank', label: 'Tank', value: 25, ...options }, h)
    const [meter] = Inert.byRole(drawn, 'meter')
    return { meter: meter!, fill: Inert.byTag(drawn, 'div').at(-1)! }
  }

  it('stands upright by a data attribute, the share a property the fill reads', () => {
    const { meter, fill } = rootOf({ orientation: 'vertical' })
    expect(Inert.value(meter, 'data-orientation')).toBe('vertical')
    expect(Inert.style(meter)['--fk-meter-share']).toBe('25%')
    // Upstream's width stays; the recipe floors the fill's inline size.
    expect(Inert.style(fill)).toEqual({ width: '25%' })
  })

  it('draws a horizontal meter with no orientation, share or style on the root', () => {
    const { meter } = rootOf({})
    expect(Inert.value(meter, 'data-orientation')).toBeUndefined()
    expect(Inert.style(meter)).toEqual({})
  })

  it('cuts the track into steps through a segment count on the root', () => {
    const { meter } = rootOf({ segments: 5, orientation: 'vertical' })
    expect(Inert.value(meter, 'data-segmented')).toBe('')
    expect(Inert.style(meter)['--fk-meter-segments']).toBe('5')
    expect(Inert.style(meter)['--fk-meter-share']).toBe('25%')
  })

  it.each([1, 2.5, 0, -3])('refuses %s segments', segments => {
    expect(() => rootOf({ segments })).toThrow(/at least 2/)
  })
})
