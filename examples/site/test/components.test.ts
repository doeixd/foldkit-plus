/**
 * What a reader sets on the component pages, through `update`: a no-op hands
 * back the Model it was given, and a knob is kept to its slider's range.
 */
import { describe, expect, it } from 'vitest'

import { defaults, presets } from '../src/gallery/theme.js'
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
    expect(update(initial, Message.ToggledCheckbox({ checked: initial.checked })).model).toBe(
      initial,
    )
    expect(update(initial, Message.ToggledSwitch({ on: initial.switched })).model).toBe(initial)
    expect(update(initial, Message.ChosePreviewPage({ page: initial.previewPage })).model).toBe(
      initial,
    )
    expect(update(initial, Message.ChoseScheme({ scheme: initial.scheme })).model).toBe(initial)
    expect(update(initial, Message.ChosePreset({ knobs: { ...defaults } })).model).toBe(initial)
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
    expect(after(copied, Message.ChosePreset({ knobs: presets[1]!.knobs })).copied).toBe(false)
    expect(after(copied, Message.ChoseFont({ font: 'serif' })).copied).toBe(false)
    expect(after(copied, Message.ChoseScheme({ scheme: 'dark' })).copied).toBe(true)
  })
})
