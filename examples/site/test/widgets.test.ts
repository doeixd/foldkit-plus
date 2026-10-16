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
import { Calendar as DateSelection, Menu } from 'foldkit-mixins-ui'
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

  it('keep the volume and the price range the sliders moved to', () => {
    const turned = send(Widgets.Message.TurnedVolume({ value: 65 }))
    expect(initial.widgets.volume).toBe(60)
    expect(turned.widgets.volume).toBe(65)
    const moved = send(Widgets.Message.MovedPriceRange({ value: { low: 120, high: 350 } }))
    expect(initial.widgets.priceRange).toEqual({ low: 100, high: 350 })
    expect(moved.widgets.priceRange).toEqual({ low: 120, high: 350 })
    const again = update(
      turned,
      Message.GotWidget({ message: Widgets.Message.TurnedVolume({ value: 65 }) }),
    )
    expect(again.model.widgets).toBe(turned.widgets)
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
      Widgets.Message.GotPageMenu({
        message: Menu.Message.GotMenu({
          message: UiMenu.Message.SelectedItem({ index: 0, item: 'Rename' }),
        }),
      }),
    )
    expect(acted.widgets.pageChoice).toEqual(Option.some('Rename'))
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
    expect(picked.widgets.selection).toEqual(
      DateSelection.Selection.Single({ date: Option.some(day) }),
    )
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

  it('press the range that was chosen, and stay put on the same one', () => {
    const chosen = send(Widgets.Message.ChoseRange({ range: 'month' }))
    expect(chosen.widgets.range).toBe('month')
    const again = update(
      chosen,
      Message.GotWidget({ message: Widgets.Message.ChoseRange({ range: 'month' }) }),
    )
    expect(again.model.widgets).toBe(chosen.widgets)
  })
})

describe('the menu previews', () => {
  it('fade their menus and submenus in and out', () => {
    for (const menu of [initial.widgets.fileMenu, initial.widgets.pageMenu])
      expect(
        [menu.menu, ...menu.submenus.map(submenu => submenu.menu)].map(m => m.isAnimated),
      ).toEqual([menu.menu, ...menu.submenus].map(() => true))
    expect(initial.widgets.fileMenu.submenus.length).toBeGreaterThan(0)
  })
})

describe('the checkbox previews', () => {
  it('each hold their own state', () => {
    const terms = send(Widgets.Message.ToggledTerms({ checked: true })).widgets
    expect([terms.terms, terms.toppings, terms.teamPlan]).toEqual([true, 'some', false])
    const team = send(Widgets.Message.ToggledTeamPlan({ checked: true })).widgets
    expect([team.terms, team.toppings, team.teamPlan]).toEqual([false, 'some', true])
  })

  it('turn the indeterminate one from some to all, then to none', () => {
    const all = send(Widgets.Message.ToggledToppings({ checked: true }))
    expect(all.widgets.toppings).toBe('all')
    const none = update(
      all,
      Message.GotWidget({ message: Widgets.Message.ToggledToppings({ checked: false }) }),
    ).model
    expect(none.widgets.toppings).toBe('none')
  })
})
