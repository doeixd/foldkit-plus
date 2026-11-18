/**
 * The search, toolbar and file input previews: each Message reaches their
 * state through the site's update, and the Commands a clear or a remove asks
 * for are the ones that put focus and the input's files right.
 */
import { Option } from 'effect'
import { Picker } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'

import * as Fields from '../src/gallery/fields.js'
import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update, type Model } from '../src/main.js'

const send = (model: Model, message: Fields.Message) =>
  update(model, Message.GotWidget({ message: Widgets.Message.GotFields({ message }) }))

const after = (...messages: ReadonlyArray<Fields.Message>): Model =>
  messages.reduce((model, message) => send(model, message).model, initial)

const file = (name: string, size = 10) => new File(['x'.repeat(size)], name)

describe('the search field previews', () => {
  it('keep what is typed, and clear it with a Command that puts focus back', () => {
    const typed = after(Fields.Message.TypedSearch({ value: 'pie' }))
    expect(typed.widgets.fields.search).toBe('pie')
    expect(send(typed, Fields.Message.TypedSearch({ value: 'pie' })).model).toBe(typed)
    const cleared = send(typed, Fields.Message.ClearedSearch())
    expect(cleared.model.widgets.fields.search).toBe('')
    expect(cleared.commands?.map(command => command.name)).toEqual(['SearchField.Focus'])
  })

  it('move the highlight within the results, and start again at the first for a new query', () => {
    const at = (model: Model) => model.widgets.fields.keyed.active
    // "apple" matches two recipes.
    const typed = after(Fields.Message.TypedKeyed({ value: 'apple' }))
    const down = send(typed, Fields.Message.MovedKeyed({ by: 1 })).model
    expect(at(down)).toBe(1)
    // Past the last result stays on it, and the Model it was given.
    expect(send(down, Fields.Message.MovedKeyed({ by: 1 })).model).toBe(down)
    expect(at(send(down, Fields.Message.MovedKeyed({ by: -1 })).model)).toBe(0)
    expect(at(send(down, Fields.Message.TypedKeyed({ value: 'app' })).model)).toBe(0)
    const cleared = send(down, Fields.Message.ClearedKeyed())
    expect(cleared.model.widgets.fields.keyed).toEqual({ query: '', active: 0 })
    expect(cleared.commands?.map(command => command.name)).toEqual(['SearchField.Focus'])
  })
})

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

describe('the number field, slider and segmented previews', () => {
  it('hold an empty price as none, and keep the Model for the same price', () => {
    const priced = after(Fields.Message.ChangedPrice({ value: Option.some(12.5) }))
    expect(priced.widgets.fields.price).toEqual(Option.some(12.5))
    expect(send(priced, Fields.Message.ChangedPrice({ value: Option.some(12.5) })).model).toBe(
      priced,
    )
    expect(
      send(priced, Fields.Message.ChangedPrice({ value: Option.none() })).model.widgets.fields
        .price,
    ).toEqual(Option.none())
    expect(send(initial, Fields.Message.ChangedPrice({ value: Option.none() })).model).toBe(initial)
  })

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

describe('the picker preview', () => {
  const picker = (message: Picker.Message) => Fields.Message.GotPicker({ message })

  it('keeps the order chosen in the sheet, and closes it', () => {
    const opened = after(picker(Picker.Message.OpenedSheet()))
    expect(opened.widgets.fields.picker.sheet.dialog.isOpen).toBe(true)
    const chosen = send(opened, picker(Picker.Message.ChoseInSheet({ value: 'price' }))).model
    expect(chosen.widgets.fields.sort).toEqual(Option.some('price'))
    expect(chosen.widgets.fields.picker.sheet.dialog.isOpen).toBe(false)
  })

  it('ignores a choice that is no order of the list', () => {
    const chosen = send(initial, picker(Picker.Message.ChoseInSheet({ value: 'oldest' })))
    expect(chosen.model.widgets.fields.sort).toEqual(Option.none())
  })
})
