/**
 * `/create`'s theme in its address: what it writes reads back as the same
 * theme, the defaults write nothing, and what a hand-edited or hostile link
 * names wrongly is dropped rather than drawn.
 */
import { describe, expect, it } from 'vitest'
import { modifyFields } from 'foldkit/struct'

import { defaults, presetKnobs, presets } from '../src/gallery/theme.js'
import { addressOf, queryOf } from '../src/gallery/themeUrl.js'
import { Message, Page, initial, plan, update, type Model } from '../src/main.js'

const home = { knobs: defaults, scheme: 'system', canvas: 'components' } as const

describe("/create's address", () => {
  it('writes nothing for the defaults, and only what differs otherwise', () => {
    expect(queryOf(home)).toBe('')
    expect(
      queryOf({ ...home, knobs: { ...defaults, hue: 145, font: 'mono' }, scheme: 'dark' }),
    ).toBe('hue=145&font=mono&scheme=dark')
  })

  it.each(presets.map(preset => [preset.name, preset] as const))(
    'reads %s back as it was written',
    (_, preset) => {
      const address = {
        knobs: presetKnobs(preset, 'rtl'),
        scheme: preset.scheme ?? 'system',
        canvas: 'app',
      } as const
      expect(addressOf(queryOf(address))).toEqual(address)
    },
  )

  it('drops what is none of the knobs, and fits a number to its slider', () => {
    const address = addressOf(
      '?hue=999&radius=abc&font=comic&__proto__=1&constructor=2&border=2&scheme=sepia&view=gallery&density=0.83',
    )
    expect(address.knobs).toEqual({ ...defaults, hue: 360, border: 2, density: 0.85 })
    expect(address.scheme).toBe('system')
    expect(address.canvas).toBe('components')
    expect(Object.getPrototypeOf(address.knobs)).toBe(Object.prototype)
  })
})

describe("/create's Model and its address", () => {
  const create: Model = modifyFields(initial, { page: () => Page.Create() })

  it('reads its address as the browser takes /create over, and no other page', () => {
    const names = (model: Model) => (plan.boot?.(model) ?? []).map(command => command.name)
    expect(names(create)).toContain('ReadThemeAddress')
    expect(names(initial)).not.toContain('ReadThemeAddress')
  })

  it('takes the theme the page was opened at, once, and on /create only', () => {
    const opened = update(
      create,
      Message.FoundThemeAddress({ query: '?font=serif&view=palette' }),
    ).model
    expect([opened.knobs.font, opened.canvas, opened.addressRead]).toEqual([
      'serif',
      'palette',
      true,
    ])
    // Once read, the address is the Model's: a second read changes nothing.
    expect(update(opened, Message.FoundThemeAddress({ query: '?font=mono' })).model).toBe(opened)
    expect(update(initial, Message.FoundThemeAddress({ query: '?font=serif' })).model).toBe(initial)
  })

  it('copies a link holding the theme shown', () => {
    const serif = update(
      create,
      Message.ChosePreset({ knobs: { ...defaults, font: 'serif' } }),
    ).model
    const copied = update(serif, Message.PressedCopyLink())
    expect(copied.commands?.map(command => [command.name, command.args])).toEqual([
      ['CopyLink', { query: 'font=serif' }],
    ])
    const linked = update(serif, Message.CopiedLink()).model
    expect(linked.linkCopied).toBe(true)
    // Moving a knob makes the copied link stale.
    expect(update(linked, Message.MovedKnob({ knob: 'hue', value: 10 })).model.linkCopied).toBe(
      false,
    )
  })
})
