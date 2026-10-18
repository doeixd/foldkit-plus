/**
 * What a reader sets on the component pages, through `update`: a no-op hands
 * back the Model it was given, and a knob is kept to its slider's range.
 */
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

  it('open the drawer on the pane chosen, and hand back the Model for the one open', () => {
    const closed = after(initial, Message.ToggledDrawer())
    expect(closed.drawerOpen).toBe(false)
    const color = after(closed, Message.ChoseSection({ section: 'color' }))
    expect(color.section).toBe('color')
    expect(color.drawerOpen).toBe(true)
    // The pane already shown, in a closed drawer, opens it all the same.
    expect(
      after(after(color, Message.ToggledDrawer()), Message.ChoseSection({ section: 'color' }))
        .drawerOpen,
    ).toBe(true)
    expect(update(color, Message.ChoseSection({ section: 'color' })).model).toBe(color)
  })

  it('shuffle through a Command, in the direction the preview reads', () => {
    const rtl = after(initial, Message.ChoseDirection({ direction: 'rtl' }))
    const shuffled = update(rtl, Message.PressedShuffle())
    expect(shuffled.model).toBe(rtl)
    expect(shuffled.commands?.map(command => command.name)).toEqual(['Shuffle'])
    expect(shuffled.commands?.[0]?.args).toEqual({ direction: 'rtl' })
  })
})
