/**
 * What a reader sets on the component pages, through `update`: a no-op hands
 * back the Model it was given, and a knob is kept to its slider's range,
 * a schemed knob's dark half to its own.
 */
import { Listbox as UiListbox, Tabs as UiTabs } from '@foldkit/ui'
import { describe, expect, it } from 'vitest'

import { Theme } from 'foldkit-mixins/theme'

import { defaults, presets, valueAt } from '../src/gallery/theme.js'
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
    expect(update(initial, Message.ChoseValues({ values: { ...defaults } })).model).toBe(initial)
    expect(update(initial, Message.ChoseDirection({ direction: initial.direction })).model).toBe(
      initial,
    )
  })

  it('draws the previews in an icon pack chosen, and ignores one that is no pack', () => {
    const pick = (item: string) =>
      Message.GotPicker({ picker: 'pack', message: UiListbox.Message.SelectedItem({ item }) })
    expect(after(initial, pick('hugeicons')).pack).toBe('hugeicons')
    expect(after(initial, pick(initial.pack)).pack).toBe(initial.pack)
    expect(after(initial, pick('nonsense')).pack).toBe(initial.pack)
  })

  it('turns the page right to left and back', () => {
    const rtl = after(initial, Message.ChoseDirection({ direction: 'rtl' }))
    expect(rtl.direction).toBe('rtl')
    expect(rtl === initial).toBe(false)
    expect(after(rtl, Message.ChoseDirection({ direction: 'ltr' })).direction).toBe('ltr')
  })

  it('keep a knob within its slider, and ignore a value that is no number', () => {
    const set = (
      path: 'accent.hue' | 'shape.radius' | 'surface.lightness',
      value: number,
      dark = false,
    ) => Message.SetKnob({ path, value, dark })
    expect(valueAt(after(initial, set('accent.hue', 500)).theme, 'accent.hue')).toBe(360)
    expect(valueAt(after(initial, set('shape.radius', 0.42)).theme, 'shape.radius')).toBe(0.4)
    expect(update(initial, set('accent.hue', Number.NaN)).model).toBe(initial)
    // A dark half within its own range, not the light one's.
    expect(
      valueAt(after(initial, set('surface.lightness', 30, true)).theme, 'surface.lightness'),
    ).toEqual({
      light: 97.5,
      dark: 30,
    })
    // A word where a choice goes is refused.
    expect(
      update(initial, Message.SetKnob({ path: 'shape.size', value: 'huge', dark: false })).model,
    ).toBe(initial)
  })

  it('mark the copied code stale once a knob moves', () => {
    const copied = after(initial, Message.CopiedText())
    expect(copied.copied).toBe(true)
    expect(after(copied, Message.ChoseValues({ values: presets[1]!.values })).copied).toBe(false)
    expect(
      after(copied, Message.SetKnob({ path: 'shape.border', value: 2, dark: false })).copied,
    ).toBe(false)
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
    expect(valueAt(after(initial, pick('font', 'serif')).theme, 'type.body')).toBe(
      Theme.fonts.serif,
    )
    // A base color brings its surface tint.
    const stone = after(initial, pick('base', 'stone')).theme
    expect([stone.surface?.hue, stone.surface?.saturation]).toEqual([75, 0.004])
    // A font is not a base color, though both are words.
    expect(after(initial, pick('base', 'serif')).theme).toBe(initial.theme)
  })

  it('choose a theme by name, in its own scheme when it has one, and ignore a name of none', () => {
    const nord = after(initial, Message.ChoseTheme({ name: 'Nord' }))
    expect(nord.scheme).toBe('dark')
    expect(valueAt(nord.theme, 'accent.hue')).toBe(213)
    // A theme known in no scheme leaves the reader's.
    expect(after(nord, Message.ChoseTheme({ name: 'Ocean' })).scheme).toBe('dark')
    expect(update(nord, Message.ChoseTheme({ name: 'Nordic' })).model).toBe(nord)
    // The preview's direction stays.
    const rtl = after(
      initial,
      Message.ChoseDirection({ direction: 'rtl' }),
      Message.ChoseTheme({ name: 'Material' }),
    )
    expect(rtl.direction).toBe('rtl')
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

  it('shuffle through a Command', () => {
    const shuffled = update(initial, Message.PressedShuffle())
    expect(shuffled.model).toBe(initial)
    expect(shuffled.commands?.map(command => command.name)).toEqual(['Shuffle'])
  })
})
