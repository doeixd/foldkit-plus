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
  Knob,
  knobStyleOf,
  presets,
  ranges,
  themeOf,
  type Knobs,
} from '../src/gallery/theme.js'

const snippet = readFileSync(join(import.meta.dirname, '../src/snippets/theme.ts'), 'utf8')

/** The theme's tokens outside the groups a knob sets. */
const derived = (knobs: Knobs) =>
  Object.fromEntries(
    Object.entries(themeOf(knobs)).filter(([group]) => group !== 'knob' && group !== 'font'),
  )

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

  it.each(presets.map(preset => [preset.name, preset.knobs] as const))(
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
    expect(knobStyleOf(defaults, 'system')['colorScheme']).toBe('light dark')
    const custom = Object.keys(style).filter(name => name.startsWith('--'))
    expect(custom.filter(name => !(name in declared))).toEqual([])
    expect(custom.every(name => /^--fk-(knob|font)-/.test(name))).toBe(true)
  })

  it('declares on the preview the derived tokens its knobs feed', () => {
    expect(declared['--fk-hue-accent']).toBe('var(--fk-knob-accent-h)')
    expect(declared['--fk-space-md']).toContain('var(--fk-knob-density)')
  })

  it('has a slider for every numeric knob', () => {
    const numeric = Object.keys(defaults).filter(key => key !== 'font')
    expect(ranges.map(range => range.knob).sort()).toEqual(numeric.sort())
    expect([...Knob.literals].sort()).toEqual(numeric.sort())
  })

  it('keeps a slider value in its range and on its step', () => {
    const hue = ranges.find(range => range.knob === 'hue')!
    const chroma = ranges.find(range => range.knob === 'chroma')!
    expect(fit(hue, -4)).toBe(0)
    expect(fit(hue, 400)).toBe(360)
    expect(fit(chroma, 0.1234)).toBe(0.125)
  })
})
