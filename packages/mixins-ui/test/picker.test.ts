/**
 * The Picker's Model and Messages: a choice in the Listbox and a choice in the
 * Sheet reach the application as the same `Chose`, each closing what was
 * open; opening the Sheet closes a Listbox left open; a key between the
 * Sheet's options focuses one and leaves the Model as it was, as every other
 * Message that changes nothing does.
 */
import * as UiListbox from '@foldkit/ui/listbox'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Picker, Sheet } from '../src/index.js'

const closed = Picker.init({ id: 'sort' })
const step = (model: Picker.Model, message: Picker.Message) => Picker.update(model, message)
const listboxOpen = step(
  closed,
  Picker.Message.GotListbox({
    message: UiListbox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
  }),
).model

describe('Picker.init', () => {
  it('names its Listbox and its Sheet after its id, the Sheet on the bottom edge', () => {
    expect(closed.listbox.id).toBe('sort-listbox')
    expect(closed.sheet.dialog.id).toBe('sort-sheet')
    expect(closed.sheet.side).toBe('bottom')
    expect(Picker.init({ id: 'sort', sheet: { points: [0.5, 1] } }).sheet.points).toEqual([0.5, 1])
  })
})

describe('Picker.update', () => {
  it('reports a choice in the Listbox as Chose, closing it', () => {
    expect(listboxOpen.listbox.isOpen).toBe(true)
    const next = step(
      listboxOpen,
      Picker.Message.GotListbox({ message: UiListbox.Message.SelectedItem({ item: 'price' }) }),
    )
    expect(next.outMessage).toEqual(Picker.OutMessage.Chose({ value: 'price' }))
    expect(next.model.listbox.isOpen).toBe(false)
  })

  it('reports a choice in the Sheet as the same Chose, closing it', () => {
    const open = step(closed, Picker.Message.OpenedSheet()).model
    expect(Sheet.isOpen(open.sheet)).toBe(true)
    const next = step(open, Picker.Message.ChoseInSheet({ value: 'price' }))
    expect(next.outMessage).toEqual(Picker.OutMessage.Chose({ value: 'price' }))
    expect(Sheet.isOpen(next.model.sheet)).toBe(false)
  })

  it('opening the Sheet closes a Listbox left open', () => {
    const next = step(listboxOpen, Picker.Message.OpenedSheet())
    expect(next.model.listbox.isOpen).toBe(false)
    expect(Sheet.isOpen(next.model.sheet)).toBe(true)
    expect(next.outMessage).toBeUndefined()
  })

  it('a step between options focuses one and keeps the Model', () => {
    const next = step(closed, Picker.Message.Stepped({ to: 2 }))
    expect(next.model).toBe(closed)
    expect(next.commands?.map(command => [command.name, command.args])).toEqual([
      ['FocusPickerOption', { selector: `#${Picker.optionId('sort', 2)}` }],
    ])
  })

  it.each([
    ['a focus landing', Picker.Message.CompletedFocus()],
    [
      'a drag of a closed Sheet',
      Picker.Message.GotSheet({ message: Sheet.Message.Dragged({ delta: 4 }) }),
    ],
    ['a Listbox closed again', Picker.Message.GotListbox({ message: UiListbox.Message.Closed() })],
  ])('returns the Model given for %s', (_, message) => {
    expect(step(closed, message).model).toBe(closed)
  })
})
