/**
 * The previews with state of their own: each component's Message reaches its
 * own Model through the site's update, and what it reports becomes the
 * value the preview shows.
 */
import {
  Calendar as UiCalendar,
  Combobox as UiCombobox,
  DatePicker as UiDatePicker,
  Dialog as UiDialog,
  Listbox as UiListbox,
  Menu as UiMenu,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import { Option } from 'effect'
import * as UiSlider from '@foldkit/ui/slider'
import { describe, expect, it } from 'vitest'

import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update } from '../src/main.js'

const send = (message: Widgets.Message) => update(initial, Message.GotWidget({ message })).model

describe('the previews with state', () => {
  it('show the tab that was chosen', () => {
    const chosen = send(
      Widgets.Message.GotTabs({
        message: UiTabs.Message.SelectedTab({ index: 1, value: 'activity' }),
      }),
    )
    expect(chosen.widgets.section).toBe('activity')
    expect(initial.widgets.section).toBe('overview')
  })

  it('keep the billing that was chosen', () => {
    const chosen = send(
      Widgets.Message.GotBillingGroup({
        message: UiRadioGroup.Message.SelectedOption({ index: 2, value: 'lifetime' }),
      }),
    )
    expect(chosen.widgets.billing).toBe('lifetime')
  })

  it('step the volume from where it stands', () => {
    const stepped = send(
      Widgets.Message.GotSlider({
        message: UiSlider.Message.PressedKeyboardNavigation({
          direction: 'StepIncrement',
          value: initial.widgets.volume,
        }),
      }),
    )
    expect(initial.widgets.volume).toBe(60)
    expect(stepped.widgets.volume).toBe(65)
  })

  it('open the dialog and close it again', () => {
    const opened = send(Widgets.Message.OpenedDialog())
    expect(opened.widgets.dialog.isOpen).toBe(true)
    const closed = update(
      opened,
      Message.GotWidget({ message: Widgets.Message.ClosedDialog() }),
    ).model
    expect(closed.widgets.dialog.isOpen).toBe(false)
    expect(UiDialog.init({ id: 'x' }).isOpen).toBe(false)
  })

  it('keep the action, frequency and city that were chosen', () => {
    const acted = send(
      Widgets.Message.GotMenu({
        message: UiMenu.Message.SelectedItem({ index: 0, item: 'Rename' }),
      }),
    )
    expect(acted.widgets.action).toEqual(Option.some('Rename'))
    const backedUp = send(
      Widgets.Message.GotListbox({ message: UiListbox.Message.SelectedItem({ item: 'Weekly' }) }),
    )
    expect(initial.widgets.frequency).toEqual(Option.some('Daily'))
    expect(backedUp.widgets.frequency).toEqual(Option.some('Weekly'))
    const found = send(
      Widgets.Message.GotCombobox({
        message: UiCombobox.Message.SelectedItem({
          item: 'Oslo',
          displayText: 'Oslo',
          wasSelected: false,
        }),
      }),
    )
    expect(found.widgets.city).toEqual(Option.some('Oslo'))
  })

  it('keep the day picked on the calendar, and in the date picker', () => {
    const day = { year: 2026, month: 10, day: 20 }
    const picked = send(
      Widgets.Message.GotCalendar({ message: UiCalendar.Message.ClickedDay({ date: day }) }),
    )
    expect(picked.widgets.date).toEqual(Option.some(day))
    const due = send(
      Widgets.Message.GotDatePicker({
        message: UiDatePicker.Message.GotCalendarMessage({
          message: UiCalendar.Message.ClickedDay({ date: day }),
        }),
      }),
    )
    expect(due.widgets.due).toEqual(Option.some(day))
  })

  it('show a notice when the draft is saved', () => {
    expect(initial.widgets.notices.entries).toHaveLength(0)
    const saved = send(Widgets.Message.SavedDraft())
    expect(saved.widgets.notices.entries.map(entry => entry.payload.title)).toEqual(['Draft saved'])
  })
})
