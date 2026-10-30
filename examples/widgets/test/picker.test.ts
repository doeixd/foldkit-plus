/**
 * The sort Picker island: a choice in the sheet and a choice in the dropdown
 * both set the order, a value outside the orders is ignored, and a Picker
 * Message that changes nothing returns the Model given.
 */
import * as UiListbox from '@foldkit/ui/listbox'
import { Option } from 'effect'
import { Picker } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import { Message, initial, update } from '../src/picker/app.js'
import { runDemo } from '../src/picker/view.js'

const got = (message: Picker.Message) => Message.GotPicker({ message })

describe('update flows', () => {
  it('starts with no order', () => {
    expect(initial.sort).toEqual(Option.none())
  })

  it('takes an order chosen in the sheet', () => {
    const open = update(initial, got(Picker.Message.OpenedSheet())).model
    expect(update(open, got(Picker.Message.ChoseInSheet({ value: 'name' }))).model.sort).toEqual(
      Option.some('name'),
    )
  })

  it('takes an order chosen in the dropdown', () => {
    const open = update(
      initial,
      got(
        Picker.Message.GotListbox({
          message: UiListbox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
        }),
      ),
    ).model
    const chosen = update(
      open,
      got(
        Picker.Message.GotListbox({ message: UiListbox.Message.SelectedItem({ item: 'price' }) }),
      ),
    ).model
    expect(chosen.sort).toEqual(Option.some('price'))
  })

  it('ignores a value that is no order, and keeps the Model when nothing changed', () => {
    const open = update(initial, got(Picker.Message.OpenedSheet())).model
    expect(update(open, got(Picker.Message.ChoseInSheet({ value: 'rating' }))).model.sort).toEqual(
      Option.none(),
    )
    expect(update(initial, got(Picker.Message.CompletedFocus())).model).toBe(initial)
  })
})

describe('demo', () => {
  it('traces a choice in the sheet', () => {
    expect(runDemo()).toEqual([
      'start: sort=none',
      'opened the sheet: open=true',
      'chose in the sheet: sort=price open=false',
    ])
  })
})
