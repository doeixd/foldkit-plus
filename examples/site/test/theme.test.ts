/**
 * The knobs `/create` turns: the code it hands out is the typechecked
 * snippet for the defaults, and the inline overrides it draws re-derive
 * the same theme an application would get from that code.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  codeOf,
  declared,
  defaults,
  fit,
  inLook,
  Knob,
  KNOB_GROUPS,
  knobStyleOf,
  looks,
  presetKnobs,
  presets,
  rangeOf,
  sameKnobs,
  ranges,
  shuffled,
  themeOf,
  type Knobs,
} from '../src/gallery/theme.js'

const snippet = readFileSync(join(import.meta.dirname, '../src/snippets/theme.ts'), 'utf8')

/** The theme's tokens outside the groups a knob sets. */
const derived = (knobs: Knobs) =>
  Object.fromEntries(Object.entries(themeOf(knobs)).filter(([group]) => !KNOB_GROUPS.has(group)))

describe('the theme creator', () => {
  it('hands out, for the defaults, the code the typecheck compiles', () => {
    expect(codeOf(defaults)).toBe(snippet)
  })

  it('writes every knob it changes into the code', () => {
    const code = codeOf({ ...defaults, hue: 12, radius: 0.35, font: 'serif', shadow: 40 })
    expect(code).toContain('h: 12,')
    expect(code).toContain(`'radius-factor': '0.35'`)
    expect(code).toContain(`'shadow-strength': '40%'`)
    expect(code).toContain('ui-serif')
  })

  it.each(presets.map(preset => [preset.name, presetKnobs(preset, 'ltr')] as const))(
    '%s differs from the defaults only in the knobs it overrides inline',
    (_, knobs) => {
      expect(derived(knobs)).toEqual(derived(defaults))
    },
  )

  it('overrides on the preview every declared token the knobs reach, and only those', () => {
    const style = knobStyleOf({ ...defaults, hue: 12, density: 0.8 }, 'dark')
    expect(style['--fk-knob-accent-h']).toBe('12')
    expect(style['--fk-knob-density']).toBe('0.8')
    expect(style['colorScheme']).toBe('dark')
    expect(knobStyleOf(defaults, 'system')).toEqual({ colorScheme: 'light dark' })
    // A knob moved back to its default is the preview's own declaration again.
    expect(Object.keys(knobStyleOf({ ...defaults, hue: 12, density: 1 }, 'light'))).not.toContain(
      '--fk-knob-density',
    )
    const custom = Object.keys(style).filter(name => name.startsWith('--'))
    expect(custom.filter(name => !(name in declared))).toEqual([])
    expect(custom.every(name => /^--fk-(knob|font|motion|border|shadow|state)-/.test(name))).toBe(
      true,
    )
  })

  it('declares on the preview the derived tokens its knobs feed', () => {
    expect(declared['--fk-hue-accent']).toBe('var(--fk-knob-accent-h)')
    expect(declared['--fk-space-md']).toContain('var(--fk-knob-density)')
  })

  it('has a slider for every numeric knob', () => {
    const numeric = Object.entries(defaults)
      .filter(([, value]) => typeof value === 'number')
      .map(([key]) => key)
    expect(ranges.map(range => range.knob).sort()).toEqual(numeric.sort())
    expect([...Knob.literals].sort()).toEqual(numeric.sort())
  })

  it('writes a base color, a menu look and the spring into the code, and none by default', () => {
    expect(codeOf(defaults)).not.toMatch(/neutral: {|menu: {|motion: { ease/)
    const code = codeOf({
      ...defaults,
      base: 'stone',
      menuAccent: 'bold',
      menuColor: 'inverted',
      easing: 'spring',
      headingFont: 'serif',
    })
    expect(code).toContain('neutral: { h: 75 },')
    expect(code).toContain("menu: { accent: 'bold', color: 'inverted' },")
    expect(code).toContain("motion: { ease: 'var(--fk-motion-spring)' },")
    expect(code).toContain("heading: 'ui-serif, Georgia")
  })

  it('draws a base color, a menu look and the spring through the preview', () => {
    const style = knobStyleOf(
      { ...defaults, base: 'olive', menuAccent: 'bold', easing: 'spring' },
      'light',
    )
    expect(style['--fk-knob-neutral-h']).toBe('106')
    expect(style['--fk-knob-popup-bold']).toBe('1')
    expect(style['--fk-motion-ease']).toBe('var(--fk-motion-spring)')
    // The accent's hue, by default, which follows the accent knob.
    expect(declared['--fk-knob-neutral-h']).toBe('var(--fk-hue-accent)')
  })

  it('writes compact as the ladder step, in the code and the preview, and nothing by default', () => {
    expect(codeOf(defaults)).not.toContain('step:')
    expect(codeOf({ ...defaults, size: 'compact' })).toContain("    step: '1',")
    expect(knobStyleOf({ ...defaults, size: 'compact' }, 'light')['--fk-knob-step']).toBe('1')
    expect(declared['--fk-knob-step']).toBe('0')
  })

  it('tells a style by its shape and knobs by every choice', () => {
    const lyra = looks.find(look => look.name === 'Lyra')!
    expect(inLook({ ...defaults, ...lyra.shape }, lyra)).toBe(true)
    expect(inLook({ ...defaults, ...lyra.shape, radius: 1 }, lyra)).toBe(false)
    // A style leaves the colors alone.
    expect({ ...defaults, ...lyra.shape }.hue).toBe(defaults.hue)
    expect(sameKnobs(defaults, { ...defaults, menuColor: 'translucent' })).toBe(false)
    expect(sameKnobs(defaults, { ...defaults })).toBe(true)
  })

  it('writes hard shadows, borders, the page lightness and the hover into the code', () => {
    expect(codeOf(defaults)).not.toMatch(/hardShadows|border: {|'base-l'|stateHue/)
    const code = codeOf({
      ...defaults,
      shadowStyle: 'hard',
      border: 2,
      surfaceLightness: 80,
      hover: 'accent',
    })
    expect(code).toContain('    Theme.compose(\n      Theme.hardShadows,\n      Theme.oklch({')
    expect(code).toContain("  border: { thin: '2px', thick: '3px', heavy: '4px' },")
    expect(code).toContain("    'base-l': '80%',")
    expect(code).toContain("  stateHue: 'accent',")
  })

  it('draws hard shadows, borders, the page lightness and the hover through the preview', () => {
    const style = knobStyleOf(
      { ...defaults, shadowStyle: 'hard', border: 3, surfaceLightness: 80, hover: 'neutral' },
      'light',
    )
    expect(style['--fk-shadow-md']).toMatch(/^3px 3px 0 0 /)
    expect(style['--fk-border-thin']).toBe('3px')
    expect(style['--fk-border-heavy']).toBe('5px')
    expect(style['--fk-knob-base-l']).toBe('80%')
    expect(style['--fk-knob-surface-ink']).toBe('0')
    expect(knobStyleOf({ ...defaults, hover: 'accent' }, 'light')['--fk-state-ink']).toBe(
      'var(--fk-accent-ink)',
    )
    expect(declared['--fk-shadow-md']).toMatch(/^0 4px 6px/)
  })

  it('writes and draws the controls’ relief over the shadow scale', () => {
    expect(codeOf(defaults)).not.toContain('Theme.relief')
    expect(codeOf({ ...defaults, relief: 'soft' })).toContain(
      '    Theme.compose(\n      Theme.relief.soft,\n      Theme.oklch({',
    )
    // Hard shadows outermost, then the relief, then the palette.
    expect(codeOf({ ...defaults, shadowStyle: 'hard', relief: 'bevel' })).toContain(
      '      Theme.hardShadows,\n      Theme.compose(\n        Theme.relief.bevel,\n',
    )
    const bevel = knobStyleOf({ ...defaults, relief: 'bevel' }, 'light')
    expect(bevel['--fk-shadow-raised']).toMatch(/^inset -1px -1px 0 0 /)
    expect(bevel['--fk-shadow-field']).toMatch(/^inset 1px 1px 0 0 /)
    expect(knobStyleOf(defaults, 'light')['--fk-shadow-raised']).toBeUndefined()
  })

  it('tells a preset by its knobs, whichever way the preview reads', () => {
    const win = presets.find(preset => preset.name === 'Windows 95')!
    expect(
      sameKnobs(presetKnobs(win, 'rtl'), { ...presetKnobs(win, 'ltr'), direction: 'rtl' }),
    ).toBe(true)
    expect(new Set(presets.map(preset => preset.name)).size).toBe(presets.length)
    // No two presets are the same theme.
    expect(new Set(presets.map(preset => JSON.stringify(preset.knobs))).size).toBe(presets.length)
  })

  it('shuffles knobs each a slider can show, and every choice it can make', () => {
    let seed = 1
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const fonts = new Set<string>()
    for (let draw = 0; draw < 200; draw++) {
      const knobs = shuffled(random, 'rtl')
      expect(knobs.direction).toBe('rtl')
      for (const range of ranges) expect(fit(range, knobs[range.knob])).toBe(knobs[range.knob])
      fonts.add(knobs.font)
    }
    expect(fonts.size).toBe(6)
    // Even at the ends of what `random` returns.
    for (const end of [0, 0.9999999]) {
      const knobs = shuffled(() => end, 'ltr')
      for (const range of ranges) expect(fit(range, knobs[range.knob])).toBe(knobs[range.knob])
    }
    expect(shuffled(() => 0, 'ltr').lightness).toBeGreaterThanOrEqual(rangeOf('lightness').min)
  })

  it('keeps a slider value in its range and on its step', () => {
    const hue = ranges.find(range => range.knob === 'hue')!
    const chroma = ranges.find(range => range.knob === 'chroma')!
    expect(fit(hue, -4)).toBe(0)
    expect(fit(hue, 400)).toBe(360)
    expect(fit(chroma, 0.1234)).toBe(0.125)
  })
})
