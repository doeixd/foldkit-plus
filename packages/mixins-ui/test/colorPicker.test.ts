/**
 * Color picker as markup: a group named by its label, a labelled native
 * range per channel with its bounds, value and spoken value, each sending
 * the color with only its channel moved, held to its range; the color as
 * text and as custom properties for the tracks; presets as radios, the one
 * equal to the value checked. `parse` reads back what `format` writes.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ColorPicker, ColorPickerSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))
const teal = { l: 62.5, c: 0.15, h: 190 }
const presets = [
  { label: 'Teal', value: teal },
  { label: 'Rose', value: { l: 70, c: 0.2, h: 10 } },
]

const drawn = (more: { readonly disabled?: boolean } = {}) =>
  ColorPicker.view(
    {
      id: 'accent',
      label: 'Accent',
      value: teal,
      onChange: () => message('Clicked'),
      presets,
      style,
      ...more,
    },
    h,
  )

describe('ColorPicker.view', () => {
  it('meets the color picker pattern', () => {
    expect(A11y.validate(Patterns.ColorPicker, ColorPickerSlots)).toEqual([])
  })

  it('is a group named by its label, of a labelled range per channel', () => {
    const picker = drawn()
    const [group] = Inert.byRole(picker, 'group')
    const [label] = Inert.byTag(group, 'span')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    for (const name of ['Lightness', 'Chroma', 'Hue']) {
      const [range] = Inert.byLabel(picker, name)
      expect(Inert.value(range, 'type')).toBe('range')
    }
    const ranges = Inert.byTag(picker, 'input').filter(node => Inert.value(node, 'type') === 'range')
    expect(ranges.map(range => Inert.value(range, 'max'))).toEqual(['100', '0.4', '360'])
    expect(ranges.map(range => Inert.value(range, 'value'))).toEqual(['62.5', '0.15', '190'])
    expect(ranges.map(range => Inert.value(range, 'aria-valuetext'))).toEqual([
      '62.5%',
      '0.15',
      '190 degrees',
    ])
  })

  it('shows the color as text and sets it on the root for the tracks', () => {
    const picker = drawn()
    const [group] = Inert.byRole(picker, 'group')
    expect(Inert.text(picker)).toContain('oklch(62.5% 0.15 190)')
    expect(Inert.style(group)).toEqual({
      '--fk-color': 'oklch(62.5% 0.15 190)',
      '--fk-color-l': '62.5%',
      '--fk-color-c': '0.15',
      '--fk-color-h': '190',
    })
  })

  it('listens on every range', () => {
    const ranges = Inert.byTag(drawn(), 'input').filter(node => Inert.value(node, 'type') === 'range')
    expect(ranges.map(range => typeof range.data?.on?.['input'])).toEqual(Array(3).fill('function'))
  })

  it('draws the presets as radios under one name, the one equal to the value checked', () => {
    const [group] = Inert.byRole(drawn(), 'radiogroup')
    const radios = Inert.byTag(group, 'input')
    expect(radios.map(radio => Inert.value(radio, 'aria-label'))).toEqual(['Teal', 'Rose'])
    expect(new Set(radios.map(radio => Inert.value(radio, 'name')))).toEqual(
      new Set(['accent-presets']),
    )
    expect(radios.map(radio => Inert.value(radio, 'checked'))).toEqual([true, false])
    expect(radios.map(radio => Inert.style(radio)['--fk-color'])).toEqual([
      'oklch(62.5% 0.15 190)',
      'oklch(70% 0.2 10)',
    ])
  })

  it('listens on nothing when disabled', () => {
    const inputs = Inert.byTag(drawn({ disabled: true }), 'input')
    expect(inputs).toHaveLength(5)
    expect(inputs.map(input => Inert.value(input, 'disabled'))).toEqual(Array(5).fill(true))
    expect(
      inputs.some(
        input => input.data?.on?.['input'] !== undefined || input.data?.on?.['change'] !== undefined,
      ),
    ).toBe(false)
  })
})

describe('ColorPicker.withChannel', () => {
  it.each([
    ['l', 40, { ...teal, l: 40 }],
    ['c', 0.3, { ...teal, c: 0.3 }],
    ['h', 300, { ...teal, h: 300 }],
    ['l', 140, { ...teal, l: 100 }],
    ['c', -1, { ...teal, c: 0 }],
    ['h', 400, { ...teal, h: 360 }],
    ['c', 0.15500000000000003, { ...teal, c: 0.155 }],
  ] as const)('sets %s to %s, held to its range', (channel, value, expected) => {
    expect(ColorPicker.withChannel(teal, channel, value)).toEqual(expected)
  })
})

describe('ColorPicker.parse', () => {
  it.each([
    { l: 0, c: 0, h: 0 },
    { l: 62.5, c: 0.15, h: 190 },
    { l: 100, c: 0.4, h: 359.5 },
    { l: 33.33, c: 0.0125, h: 12.25 },
  ])('reads back what format writes for %o', color => {
    expect(ColorPicker.parse(ColorPicker.format(color))).toEqual(Option.some(color))
  })

  it('takes CSS spellings: a 0–1 lightness, degrees, any case and spacing, a hue past a turn', () => {
    expect(ColorPicker.parse('  OKLCH( 0.7 0.1 370deg ) ')).toEqual(
      Option.some({ l: 70, c: 0.1, h: 10 }),
    )
  })

  it.each([
    'oklch(50% 0.1)',
    'oklch(50% 0.1 20 / 0.5)',
    'oklch(120% 0.1 20)',
    'oklch(50% 0.5 20)',
    'oklch(50% -0.1 20)',
    'rgb(0 0 0)',
    '',
  ])('is none for %j', text => {
    expect(ColorPicker.parse(text)).toEqual(Option.none())
  })
})
