/**
 * The themes `/create` makes: the code it hands out for the default theme is
 * the typechecked snippet, a knob it changes reaches the code, the preview's
 * inline overrides are only the knob variables that differ, and the presets,
 * the styles and a shuffle are themes the knobs take.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'
import { exportName } from 'foldkit-media/vite'
import { Theme } from 'foldkit-mixins/theme'
import { describe, expect, it } from 'vitest'

import {
  ThemeValues,
  bases,
  baseOf,
  codeOf,
  declared,
  defaults,
  fit,
  inLook,
  knobAt,
  knobPaths,
  looks,
  packStyleOf,
  packs,
  presets,
  sameTheme,
  schemeStyleOf,
  shuffled,
  valueAt,
  withBase,
  withLook,
  withValue,
} from '../src/gallery/theme.js'

const snippet = readFileSync(join(import.meta.dirname, '../src/snippets/theme.ts'), 'utf8')

describe('the theme creator', () => {
  it('hands out, for the default theme, the code the typecheck compiles', () => {
    expect(codeOf(defaults)).toBe(snippet)
  })

  it('writes every knob it changes into the code, and no knob at its default', () => {
    const values = withValue(
      withValue(withValue(defaults, 'accent.hue', 12), 'shape.radius', 0.35),
      'shadow.strength',
      40,
    )
    const code = codeOf(withValue(values, 'type.body', Theme.fonts.serif))
    expect(code).toContain('accent: { hue: 12 }')
    expect(code).toContain('radius: 0.35')
    expect(code).toContain('strength: 40')
    expect(code).toContain('ui-serif')
    expect(codeOf(defaults)).not.toContain('hue')
  })

  it('writes the fluid knobs into the code, and leaves a still theme alone', () => {
    const code = codeOf(withValue(defaults, 'type.fluid', 0))
    expect(code).toContain('fluid: 0')
    expect(codeOf(withValue(defaults, 'type.viewportMax', 1600))).toContain('viewportMax: 1600')
    expect(codeOf(defaults)).not.toContain('fluid')
  })

  it('declares the fluid ratio and strength on a preview', () => {
    expect(declared['--fk-fluid-ratio']).toContain('tan(atan2(')
    expect(declared['--fk-fluid-progress']).toBe(
      'calc(var(--fk-fluid-ratio) * var(--fk-knob-fluid))',
    )
    expect(declared['--fk-knob-fluid']).toBe('1')
    expect(declared['--fk-knob-fluid-viewport-min']).toBe('320px')
    expect(declared['--fk-knob-fluid-viewport-max']).toBe('1440px')
  })

  it('writes the reading measure, wrap and alignment into the code', () => {
    expect(codeOf(withValue(defaults, 'reading.measure', 70))).toContain('measure: 70')
    expect(codeOf(withValue(defaults, 'reading.headingWrap', 'pretty'))).toContain(
      "headingWrap: 'pretty'",
    )
    expect(codeOf(withValue(defaults, 'reading.align', 'center'))).toContain("align: 'center'")
  })

  it('declares the reading tokens on a preview', () => {
    expect(declared['--fk-reading-measure']).toBe('var(--fk-knob-measure)')
    expect(declared['--fk-reading-heading-wrap']).toBe('var(--fk-knob-heading-wrap)')
    expect(declared['--fk-reading-body-wrap']).toBe('var(--fk-knob-body-wrap)')
    expect(declared['--fk-reading-align']).toBe('var(--fk-knob-reading-align)')
    expect(declared['--fk-knob-measure']).toBe('68ch')
    expect(declared['--fk-knob-heading-wrap']).toBe('balance')
    expect(declared['--fk-knob-body-wrap']).toBe('pretty')
    expect(declared['--fk-knob-reading-align']).toBe('start')
  })

  it('writes a pack beside the theme as the icons an application imports, and Heroicons as nothing', () => {
    const code = codeOf(defaults, 'tabler')
    expect(code).toContain("import { Icons } from 'foldkit-mixins-ui'")
    expect(code).toContain(
      "import { search, eye, eyeOff, colorPicker, rotate, rotateClockwise, circleCheck, alertTriangle, circleX, infoCircle, lock, x } from 'virtual:foldkit-icons/tabler'",
    )
    expect(code).toContain(
      "tokens: Icons.tokens({ search, eye, 'eye-off': eyeOff, pipette: colorPicker, 'rotate-ccw': rotate, 'rotate-cw': rotateClockwise, success: circleCheck, warning: alertTriangle, error: circleX, info: infoCircle, lock, close: x }, { width: 2 })",
    )
    expect(codeOf(defaults, 'heroicons')).toBe(codeOf(defaults))
  })

  it('imports each pack icon by a name the icons plugin exports from its set', () => {
    for (const pack of Object.values(packs)) {
      for (const { set, name } of Object.values(pack.imports)) {
        const icons: object = JSON.parse(
          readFileSync(
            join(import.meta.dirname, `../../../node_modules/@iconify-json/${set}/icons.json`),
            'utf8',
          ),
        ).icons
        expect(Object.keys(icons).map(exportName), `${set}:${name}`).toContain(name)
      }
    }
  })

  it('draws a pack’s icons on a preview at the glyph stroke, the shipped pack’s too', () => {
    // The theme already draws the shipped pack at its own stroke.
    expect(packStyleOf('heroicons', 2)).toEqual({})
    const tabler = packStyleOf('tabler', 2)
    expect(Object.keys(tabler)).toHaveLength(12)
    expect(tabler['--fk-icon-search']).toMatch(/^url\("data:image\/svg\+xml,/)
    expect(tabler['--fk-icon-search']).not.toBe(packStyleOf('phosphor', 2)['--fk-icon-search'])
    // A stroke redraws every pack's drawings, the shipped pack's included.
    expect(packStyleOf('heroicons', 3)['--fk-icon-search']).toContain('stroke-width=%223%22')
    expect(packStyleOf('heroicons', 3)['--fk-icon-search']).not.toBe(declared['--fk-icon-search'])
  })

  it('writes the pack it hands out at the icon stroke’s width', () => {
    const thicker = withValue(defaults, 'icon.stroke', 3)
    expect(codeOf(thicker, 'tabler')).toContain('}, { width: 3 })')
    // The shipped pack needs its own drawing only once the stroke leaves its own.
    expect(codeOf(defaults, 'heroicons')).not.toContain('Icons.tokens')
    expect(codeOf(thicker, 'heroicons')).toContain("from 'virtual:foldkit-icons/heroicons'")
    expect(codeOf(thicker, 'heroicons')).toContain('Icons.tokens({ search: magnifyingGlass, eye')
    expect(codeOf(thicker, 'heroicons')).toContain('}, { width: 3 })')
  })

  it("draws a preview in the scheme chosen, or the reader's for system", () => {
    expect(schemeStyleOf('dark')).toEqual({ colorScheme: 'dark' })
    expect(schemeStyleOf('system')).toEqual({ colorScheme: 'light dark' })
  })

  it('declares on the preview every derived token, over the default theme’s knobs', () => {
    expect(declared['--fk-radius-md']).toBe('calc(6px * var(--fk-knob-radius-factor))')
    expect(declared['--fk-knob-radius-factor']).toBe('0.45')
    expect(declared['--fk-accent-default']).toContain('var(--fk-knob-accent-l)')
  })

  it('names every preset once, and no two are the same theme', () => {
    expect(new Set(presets.map(preset => preset.name)).size).toBe(presets.length)
    for (const [index, preset] of presets.entries())
      for (const other of presets.slice(index + 1))
        expect(sameTheme(preset.values, other.values), `${preset.name} ${other.name}`).toBe(false)
  })

  it('tells a style by its shape, and installs it over the colors', () => {
    const lyra = looks.find(look => look.name === 'Lyra')!
    const styled = withLook(defaults, lyra)
    expect(inLook(styled, lyra)).toBe(true)
    expect(inLook(defaults, lyra)).toBe(false)
    // The colors stay.
    expect(valueAt(styled, 'accent.hue')).toBe(valueAt(defaults, 'accent.hue'))
    expect(valueAt(styled, 'type.body')).toBe(Theme.fonts.mono)
  })

  it('brings a base color’s tint, and follows the accent again for none', () => {
    const stone = withBase(defaults, 'stone')
    expect([stone.surface?.hue, stone.surface?.saturation]).toEqual([bases.stone.h, bases.stone.c])
    expect(baseOf(stone)).toBe('stone')
    const back = withBase(stone, 'accent')
    expect(back.surface?.hue).toBeUndefined()
    expect(baseOf(back)).toBe('accent')
  })

  it('shuffles themes the knobs take, every slider on its step, and every font', () => {
    let seed = 1
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const decode = Schema.decodeUnknownSync(ThemeValues)
    const fonts = new Set<unknown>()
    const sliders = knobPaths.filter(path => knobAt(path).control.kind === 'range')
    for (const draw of [...Array.from({ length: 200 }, random), 0, 0.9999999]) {
      const values = shuffled(typeof draw === 'number' && draw >= 0.9999 ? () => draw : random)
      expect(() => decode(values)).not.toThrow()
      for (const path of sliders) {
        const value = valueAt(values, path)
        const control = knobAt(path).control
        if (typeof value === 'number' && control.kind === 'range')
          expect(fit(control, value), path).toBe(value)
      }
      expect(valueAt(values, 'type.viewportMin')).toBeLessThan(valueAt(values, 'type.viewportMax'))
      fonts.add(valueAt(values, 'type.body'))
    }
    expect(fonts.size).toBe(Object.keys(Theme.fonts).length)
  })

  it('keeps a slider value in its range and on its step', () => {
    const hue = knobAt('accent.hue').control
    const chroma = knobAt('accent.chroma').control
    if (hue.kind !== 'range' || chroma.kind !== 'range') throw new Error('not sliders')
    expect(fit(hue, -4)).toBe(0)
    expect(fit(hue, 400)).toBe(360)
    expect(fit(chroma, 0.1234)).toBe(0.125)
  })
})
