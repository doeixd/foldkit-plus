/**
 * What a reader sets on the component pages, through `update`: a no-op hands
 * back the Model it was given, and a knob is kept to its slider's range.
 */
import { Listbox as UiListbox, Tabs as UiTabs } from '@foldkit/ui'
import { describe, expect, it } from 'vitest'

import { defaults, presetKnobs, presets } from '../src/gallery/theme.js'
import { Message, initial, update, type Model } from '../src/main.js'

const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

describe('the component pages', () => {
  it('keep a picked variant, by axis', () => {
    const picked = after(
      initial,
      Message.PickedVariant({ axis: 'tone', value: 'danger' }),
      Message.PickedVariant({ axis: 'size', value: 'lg' }),
    )
    expect(picked.selection).toEqual({ tone: 'danger', size: 'lg' })
    expect(update(picked, Message.PickedVariant({ axis: 'tone', value: 'danger' })).model).toBe(
      picked,
    )
  })

  it("hand back the Model for a preview's control already in that state", () => {
    expect(update(initial, Message.ToggledSwitch({ on: initial.switched })).model).toBe(initial)
    expect(update(initial, Message.ChoseScheme({ scheme: initial.scheme })).model).toBe(initial)
    expect(update(initial, Message.ChosePreset({ knobs: { ...defaults } })).model).toBe(initial)
    expect(
      update(initial, Message.ChoseDirection({ direction: initial.knobs.direction })).model,
    ).toBe(initial)
  })

  it('turns the page right to left and back', () => {
    const rtl = after(initial, Message.ChoseDirection({ direction: 'rtl' }))
    expect(rtl.knobs.direction).toBe('rtl')
    expect(rtl === initial).toBe(false)
    expect(after(rtl, Message.ChoseDirection({ direction: 'ltr' })).knobs.direction).toBe('ltr')
  })

  it('keep a knob within its slider, and ignore a value that is no number', () => {
    expect(after(initial, Message.MovedKnob({ knob: 'hue', value: 500 })).knobs.hue).toBe(360)
    expect(after(initial, Message.MovedKnob({ knob: 'radius', value: 0.42 })).knobs.radius).toBe(
      0.4,
    )
    expect(update(initial, Message.MovedKnob({ knob: 'hue', value: Number.NaN })).model).toBe(
      initial,
    )
  })

  it('mark the copied code stale once a knob moves', () => {
    const copied = after(initial, Message.CopiedText())
    expect(copied.copied).toBe(true)
    expect(
      after(copied, Message.ChosePreset({ knobs: presetKnobs(presets[1]!, 'ltr') })).copied,
    ).toBe(false)
    expect(after(copied, Message.MovedKnob({ knob: 'border', value: 2 })).copied).toBe(false)
    expect(after(copied, Message.ChoseScheme({ scheme: 'dark' })).copied).toBe(true)
  })

  it('open the drawer on the pane its tabs choose', () => {
    const tab = (index: number, value: string) =>
      Message.GotSectionTabs({ message: UiTabs.Message.SelectedTab({ index, value }) })
    const closed = initial
    expect(closed.drawer.open).toBe(false)
    const color = after(closed, tab(1, 'color'))
    expect(color.section).toBe('color')
    expect(color.drawer.open).toBe(true)
  })

  it('install a choice a picker makes, and refuse one that is no choice of it', () => {
    const pick = (picker: 'font' | 'base', item: string) =>
      Message.GotPicker({ picker, message: UiListbox.Message.SelectedItem({ item }) })
    expect(after(initial, pick('font', 'serif')).knobs.font).toBe('serif')
    // A base color brings its surface tint.
    const stone = after(initial, pick('base', 'stone')).knobs
    expect([stone.base, stone.surfaceSaturation]).toEqual(['stone', 0.004])
    // A font is not a base color, though both are words.
    expect(after(initial, pick('base', 'serif')).knobs).toBe(initial.knobs)
  })

  it('choose a theme by name, in its own scheme when it has one, and ignore a name of none', () => {
    const nord = after(initial, Message.ChoseTheme({ name: 'Nord' }))
    expect(nord.scheme).toBe('dark')
    expect(nord.knobs.hue).toBe(presets.find(preset => preset.name === 'Nord')!.knobs.hue)
    // A theme known in no scheme leaves the reader's.
    expect(after(nord, Message.ChoseTheme({ name: 'Ocean' })).scheme).toBe('dark')
    expect(update(nord, Message.ChoseTheme({ name: 'Nordic' })).model).toBe(nord)
    // The preview's direction stays.
    const rtl = after(
      initial,
      Message.ChoseDirection({ direction: 'rtl' }),
      Message.ChoseTheme({ name: 'Material' }),
    )
    expect(rtl.knobs.direction).toBe('rtl')
  })

  it('show the preview its tabs choose', () => {
    const palette = after(
      initial,
      Message.GotCanvasTabs({
        message: UiTabs.Message.SelectedTab({ index: 2, value: 'palette' }),
      }),
    )
    expect(palette.canvas).toBe('palette')
  })

  it('shuffle through a Command, in the direction the preview reads', () => {
    const rtl = after(initial, Message.ChoseDirection({ direction: 'rtl' }))
    const shuffled = update(rtl, Message.PressedShuffle())
    expect(shuffled.model).toBe(rtl)
    expect(shuffled.commands?.map(command => command.name)).toEqual(['Shuffle'])
    expect(shuffled.commands?.[0]?.args).toEqual({ direction: 'rtl' })
  })
})
