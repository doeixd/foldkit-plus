/**
 * The slider and segmented previews: each Message reaches their state
 * through the site's update.
 */
import { describe, expect, it } from 'vitest'

import * as Fields from '../src/gallery/fields.js'
import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update, type Model } from '../src/main.js'

const send = (model: Model, message: Fields.Message) =>
  update(model, Message.GotWidget({ message: Widgets.Message.GotFields({ message }) }))

const after = (...messages: ReadonlyArray<Fields.Message>): Model =>
  messages.reduce((model, message) => send(model, message).model, initial)

describe('the slider and segmented previews', () => {
  it('move the slider without saving, and save only on a commit', () => {
    const moved = after(Fields.Message.MovedBrightness({ value: 30 }))
    expect(moved.widgets.fields.brightness).toEqual({ value: 30, saved: 60 })
    const saved = send(moved, Fields.Message.CommittedBrightness({ value: 30 })).model
    expect(saved.widgets.fields.brightness).toEqual({ value: 30, saved: 30 })
    expect(send(saved, Fields.Message.CommittedBrightness({ value: 30 })).model).toBe(saved)
  })

  it('turn a weekday on and off without touching the others', () => {
    const days = (model: Model) => model.widgets.fields.repeatOn
    const toggled = after(Fields.Message.ToggledDay({ day: 'fri' }))
    expect(days(toggled)).toEqual(['mon', 'wed', 'fri'])
    expect(days(send(toggled, Fields.Message.ToggledDay({ day: 'mon' })).model)).toEqual([
      'wed',
      'fri',
    ])
  })
})
