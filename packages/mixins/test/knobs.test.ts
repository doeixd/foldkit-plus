/**
 * A theme as typed knob values: what `Theme.make` refuses, what `Theme.set`
 * and `Theme.describe` keep, and the variables a theme writes, every knob it
 * leaves unset at its default or the expression it follows.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { AppStyle } from '../src/app.js'
import { Knob, Theme, Themes } from '../src/theme.js'

describe('Theme.make', () => {
  it('writes the values it sets, and every other knob unset', () => {
    const variables = Theme.variables(
      Theme.make({ shape: { radius: 1.8, size: 'compact' }, type: { scale: 1.025 } }),
    )
    expect(variables['radius-factor']).toBe('1.8')
    expect(variables['step']).toBe('1')
    expect(variables['text-scale']).toBe('1.025')
    // Unset: a default, or the expression it follows.
    expect(variables['density']).toBe('1')
    expect(variables['neutral-h']).toBe('var(--fk-hue-accent)')
  })

  it('writes a schemed value for one scheme or both', () => {
    const light = Theme.variables(Theme.make({ accent: { lightness: 55 } }))
    expect([light['accent-l'], light['accent-l-dark']]).toEqual(['55%', '70%'])
    const both = Theme.variables(Theme.make({ accent: { lightness: { light: 40, dark: 80 } } }))
    expect([both['accent-l'], both['accent-l-dark']]).toEqual(['40%', '80%'])
    // The dark chroma follows the light until it is set.
    const chroma = Theme.variables(Theme.make({ accent: { chroma: 0.2 } }))
    expect(chroma['accent-c-dark']).toBe('min(0.4, calc(var(--fk-knob-accent-c) + 0.03))')
  })

  it('writes every variable a choice names', () => {
    const variables = Theme.variables(Theme.make({ menu: { panel: 'inverted-translucent' } }))
    expect([variables['popup-invert'], variables['popup-alpha'], variables['popup-blur']]).toEqual([
      '1',
      '0.8',
      '12px',
    ])
  })

  it('refuses a value outside its range, and a group or knob it does not know', () => {
    expect(() => Theme.make({ shape: { radius: 9 } })).toThrow()
    // @ts-expect-error A group the standard knobs lack.
    expect(() => Theme.make({ nope: {} })).toThrow('no knob group "nope"')
    // @ts-expect-error A knob the group lacks.
    expect(() => Theme.make({ shape: { radiu: 1 } })).toThrow('no knob "shape.radiu"')
  })

  it('takes a set of knobs of its own', () => {
    const knobs = {
      brand: {
        glow: Knob.percent({
          variable: 'brand-glow',
          default: 20,
          min: 0,
          max: 100,
          step: 1,
          description: 'Glow',
        }),
      },
    }
    expect(Theme.variables(Theme.make(knobs, { brand: { glow: 40 } }))).toEqual({
      'brand-glow': '40%',
    })
    expect(Theme.variables(Theme.make(knobs, {}))).toEqual({ 'brand-glow': '20%' })
  })
})

describe('Theme.set and Theme.describe', () => {
  it('sets values over a theme’s own, group by group, and keeps its words', () => {
    const base = Theme.make({ shape: { radius: 1.8, density: 1.1 } }).pipe(
      Theme.describe({ title: 'Cobalt', description: 'A vivid blue' }),
    )
    const dense = base.pipe(Theme.set({ shape: { density: 0.9 } }))
    expect(dense.values).toEqual({ shape: { radius: 1.8, density: 0.9 } })
    expect([dense.title, dense.description]).toEqual([
      Option.some('Cobalt'),
      Option.some('A vivid blue'),
    ])
    // The theme it was built on is unchanged.
    expect(base.values).toEqual({ shape: { radius: 1.8, density: 1.1 } })
  })

  it('refuses a value out of range as make does', () => {
    expect(() => Theme.make({}).pipe(Theme.set({ motion: { scale: -1 } }))).toThrow()
  })
})

describe('AppStyle with themes', () => {
  it('declares the initial theme at the root, and each other under its name', () => {
    const round = Theme.make({ shape: { radius: 2 } })
    const square = Theme.make({ shape: { radius: 0 } })
    const { stylesheet } = AppStyle.make({
      // The initial one listed second, so the root's is the one named, not the first.
      themes: Themes.make({ square, round }, { initial: 'round' }),
    })
    expect(stylesheet).toContain('--fk-knob-radius-factor:2')
    expect(stylesheet).toContain(':root[data-theme="square"]{')
    expect(stylesheet).not.toContain(':root[data-theme="round"]')
  })
})
