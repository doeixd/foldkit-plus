/**
 * `/create`'s theme in its address: what it writes reads back as the same
 * theme, the default theme writes nothing, an address of the flat names it
 * wrote before reads as the same theme, and what a hand-edited or hostile
 * link names wrongly is dropped rather than drawn.
 */
import { describe, expect, it } from 'vitest'
import { modifyFields } from 'foldkit/struct'
import { Theme } from 'foldkit-mixins/theme'

import { defaults, presets, sameTheme, valueAt, withValue } from '../src/gallery/theme.js'
import { addressOf, queryOf } from '../src/gallery/themeUrl.js'
import {
  Message,
  Page,
  addressIn,
  initial,
  openedTheme,
  plan,
  update,
  type Model,
} from '../src/main.js'

const home = { values: defaults, scheme: 'system', canvas: 'components', direction: 'ltr' } as const

describe("/create's address", () => {
  it('writes nothing for the default theme, and only what differs otherwise', () => {
    expect(queryOf(home)).toBe('')
    const values = withValue(withValue(defaults, 'accent.hue', 145), 'type.body', Theme.fonts.mono)
    expect(queryOf({ ...home, values, scheme: 'dark' })).toBe(
      'accent.hue=145&type.body=mono&scheme=dark',
    )
    // A schemed knob's dark value under a name of its own.
    const dark = withValue(defaults, 'surface.lightness', { light: 97.5, dark: 30 })
    expect(queryOf({ ...home, values: dark })).toBe('surface.lightness.dark=30')
  })

  it.each(presets.map(preset => [preset.name, preset] as const))(
    'reads %s back as it was written',
    (_, preset) => {
      const address = {
        values: preset.values,
        scheme: preset.scheme ?? 'system',
        canvas: 'dashboard',
        direction: 'rtl',
      } as const
      const read = addressOf(queryOf(address))
      expect(sameTheme(read.values, preset.values)).toBe(true)
      expect([read.scheme, read.canvas, read.direction]).toEqual([
        address.scheme,
        'dashboard',
        'rtl',
      ])
    },
  )

  it('drops what is none of the knobs, and fits a number to its slider', () => {
    const address = addressOf(
      '?accent.hue=999&shape.radius=abc&type.body=comic&motion.easing=bouncy&__proto__=1&constructor=2&shape.border=2&scheme=sepia&view=gallery&shape.density=0.83',
    )
    const expected = withValue(
      withValue(withValue(defaults, 'accent.hue', 360), 'shape.border', 2),
      'shape.density',
      0.85,
    )
    expect(sameTheme(address.values, expected)).toBe(true)
    // A font by its name only: a link sets no stack of its own.
    expect(valueAt(address.values, 'type.body')).toBe(Theme.fonts.geist)
    expect(address.scheme).toBe('system')
    expect(address.canvas).toBe('components')
    expect(Object.getPrototypeOf(address.values)).toBe(Object.prototype)
  })

  it('reads the flat names it wrote before as the same theme', () => {
    const address = addressOf(
      '?hue=145&font=mono&surfaceLightnessDark=30&controlShape=pill&base=stone&direction=rtl',
    )
    expect(valueAt(address.values, 'accent.hue')).toBe(145)
    expect(valueAt(address.values, 'type.body')).toBe(Theme.fonts.mono)
    expect(valueAt(address.values, 'surface.lightness')).toEqual({ light: 97.5, dark: 30 })
    expect(valueAt(address.values, 'shape.controls')).toBe('pill')
    expect(address.values.surface?.hue).toBe(75)
    expect(address.direction).toBe('rtl')
  })
})

describe("/create's Model and its address", () => {
  const create: Model = modifyFields(initial, { page: () => Page.Create() })

  it('reads the theme as the browser takes any page over', () => {
    const names = (model: Model) => (plan.boot?.(model) ?? []).map(command => command.name)
    expect(names(create)).toContain('ReadThemeAddress')
    expect(names(initial)).toContain('ReadThemeAddress')
  })

  it('takes the address’s theme when it names one, and the one kept only otherwise', () => {
    let reads = 0
    const kept = () => {
      reads += 1
      return 'type.body=mono'
    }
    expect(openedTheme('?type.body=serif', kept)).toBe('?type.body=serif')
    expect(reads).toBe(0)
    expect(openedTheme('', kept)).toBe('type.body=mono')
  })

  it('takes the theme the page was opened at, once, on any page', () => {
    const opened = update(
      create,
      Message.FoundThemeAddress({ query: '?type.body=serif&view=palette' }),
    ).model
    expect([valueAt(opened.theme, 'type.body'), opened.canvas, opened.addressRead]).toEqual([
      Theme.fonts.serif,
      'palette',
      true,
    ])
    // Once read, the address is the Model's: a second read changes nothing.
    expect(update(opened, Message.FoundThemeAddress({ query: '?type.body=mono' })).model).toBe(
      opened,
    )
    // Any page draws its previews in the theme it was opened with; which
    // canvas `/create` shows goes into no other page's address.
    const home = update(
      initial,
      Message.FoundThemeAddress({ query: '?type.body=serif&view=palette' }),
    ).model
    expect(valueAt(home.theme, 'type.body')).toBe(Theme.fonts.serif)
    expect(queryOf(addressIn(home))).toBe('type.body=serif')
    expect(queryOf(addressIn(opened))).toBe('type.body=serif&view=palette')
  })

  it('copies a link holding the theme shown', () => {
    const serif = update(
      create,
      Message.ChoseValues({ values: withValue(defaults, 'type.body', Theme.fonts.serif) }),
    ).model
    const copied = update(serif, Message.PressedCopyLink())
    expect(copied.commands?.map(command => [command.name, command.args])).toEqual([
      ['CopyLink', { query: 'type.body=serif' }],
    ])
    const linked = update(serif, Message.CopiedLink()).model
    expect(linked.linkCopied).toBe(true)
    // Moving a knob makes the copied link stale.
    expect(
      update(linked, Message.SetKnob({ path: 'accent.hue', value: 10, dark: false })).model
        .linkCopied,
    ).toBe(false)
  })
})
