/**
 * The toolbar and file input previews: each Message reaches their
 * state through the site's update, and the Commands a clear or a remove asks
 * for are the ones that put focus and the input's files right.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Fields from '../src/gallery/fields.js'
import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update, type Model } from '../src/main.js'

const send = (model: Model, message: Fields.Message) =>
  update(model, Message.GotWidget({ message: Widgets.Message.GotFields({ message }) }))

const after = (...messages: ReadonlyArray<Fields.Message>): Model =>
  messages.reduce((model, message) => send(model, message).model, initial)

const file = (name: string, size = 10) => new File(['x'.repeat(size)], name)

describe('the file input previews', () => {
  it('add each pick to a multiple list once, and replace a single one', () => {
    const names = (model: Model, example: Fields.FilesExample) =>
      model.widgets.fields.files[example].map(held => held.name)
    const a = file('a.png')
    const b = file('b.png')
    const picked = after(
      Fields.Message.PickedFiles({ example: 'multiple', files: [a] }),
      Fields.Message.PickedFiles({ example: 'multiple', files: [a, b] }),
      Fields.Message.PickedFiles({ example: 'required', files: [a] }),
      Fields.Message.PickedFiles({ example: 'required', files: [b] }),
    )
    expect(names(picked, 'multiple')).toEqual(['a.png', 'b.png'])
    expect(names(picked, 'required')).toEqual(['b.png'])
  })

  it('write the list back into the input on a pick, and ask for focus on a remove', () => {
    const a = file('a.png')
    const b = file('b.png')
    const picked = send(initial, Fields.Message.PickedFiles({ example: 'multiple', files: [a, b] }))
    expect(picked.commands?.map(command => command.name)).toEqual(['FileInput.Sync'])
    const removed = send(picked.model, Fields.Message.RemovedFile({ example: 'multiple', file: a }))
    // By identity: a file of the same name and size is another file.
    expect(removed.model.widgets.fields.files.multiple).toEqual([b])
    expect(removed.model.widgets.fields.files.multiple[0]).toBe(b)
    expect(removed.commands?.map(command => command.name)).toEqual([
      'FileInput.Sync',
      'FileInput.Focus',
    ])
    const same = send(
      picked.model,
      Fields.Message.RemovedFile({ example: 'multiple', file: file('a.png') }),
    )
    expect(same.model.widgets.fields.files.multiple).toHaveLength(2)
  })
})

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
