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
import { Calendar as DateSelection, InputCopy, Menu } from 'foldkit-mixins-ui'
import { ClipboardMessage } from 'foldkit-primitives/dom'
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

describe('the pagination previews', () => {
  it('each move their own page', () => {
    const moved = send(Widgets.Message.ChosePage({ example: 'ends', page: 3 })).widgets.pages
    expect(moved).toEqual({ ...initial.widgets.pages, ends: 3 })
  })

  it('keep the first row shown in view when a page holds more rows', () => {
    // Page 3 of tens starts at row 21, which is on page 2 of twenties.
    const third = send(Widgets.Message.ChosePage({ example: 'range', page: 3 }))
    const larger = update(
      third,
      Message.GotWidget({ message: Widgets.Message.ChosePerPage({ perPage: 20 }) }),
    ).model.widgets
    expect([larger.perPage, larger.pages.range]).toEqual([20, 2])
  })
})

describe('the toggle buttons preview', () => {
  it('turns a format on, and off again', () => {
    const on = send(Widgets.Message.ToggledFormat({ format: 'italic' }))
    expect(on.widgets.formats).toEqual(['bold', 'italic'])
    const off = update(
      on,
      Message.GotWidget({ message: Widgets.Message.ToggledFormat({ format: 'bold' }) }),
    ).model
    expect(off.widgets.formats).toEqual(['italic'])
  })
})

describe('the breadcrumb preview', () => {
  it('unfolds its trail once, and stays unfolded', () => {
    const expanded = send(Widgets.Message.ExpandedTrail())
    expect([initial.widgets.trailExpanded, expanded.widgets.trailExpanded]).toEqual([false, true])
    expect(
      update(expanded, Message.GotWidget({ message: Widgets.Message.ExpandedTrail() })).model,
    ).toBe(expanded)
  })
})

describe('the checkbox group previews', () => {
  it('each check their own alerts', () => {
    const toggled = send(Widgets.Message.ToggledAlert({ example: 'described', value: 'digest' }))
      .widgets.alerts
    expect(toggled).toEqual({
      ...initial.widgets.alerts,
      described: ['mentions', 'replies', 'digest'],
    })
  })
})

describe('the range picker preview', () => {
  it('takes a start, then an end, from the days picked', () => {
    const pick = (day: number) =>
      Message.GotWidget({
        message: Widgets.Message.GotStayPicker({
          message: UiDatePicker.Message.GotCalendarMessage({
            message: UiCalendar.Message.ClickedDay({ date: { year: 2026, month: 11, day } }),
          }),
        }),
      })
    const started = update(initial, pick(12)).model
    const ended = update(started, pick(9)).model
    expect([started.widgets.stayDates, ended.widgets.stayDates]).toEqual([
      DateSelection.Selection.Range({
        start: Option.some({ year: 2026, month: 11, day: 12 }),
        end: Option.none(),
      }),
      DateSelection.Selection.Range({
        start: Option.some({ year: 2026, month: 11, day: 9 }),
        end: Option.some({ year: 2026, month: 11, day: 12 }),
      }),
    ])
  })
})

describe('the form previews', () => {
  it('keep each custom select its own fruit', () => {
    const picked = send(
      Widgets.Message.GotSelect({
        example: 'icons',
        message: UiListbox.Message.SelectedItem({ item: 'Banana' }),
      }),
    )
    expect(picked.widgets.selects.icons.fruit).toEqual(Option.some('Banana'))
    expect(picked.widgets.selects.custom.fruit).toEqual(initial.widgets.selects.custom.fruit)
  })

  it('take a chosen city off the multiple combobox when it is chosen again', () => {
    const choose = (item: string) =>
      Message.GotWidget({
        message: Widgets.Message.GotCityTags({
          message: UiCombobox.Message.SelectedItem({ item, displayText: item, wasSelected: false }),
        }),
      })
    const added = update(initial, choose('Oslo')).model
    expect(added.widgets.cityTags.cities).toEqual(['Lima', 'Seoul', 'Oslo'])
    expect(update(added, choose('Lima')).model.widgets.cityTags.cities).toEqual(['Seoul', 'Oslo'])
  })

  it('add a city typed into the creatable combobox, and not a known one', () => {
    const choose = (item: string) =>
      send(
        Widgets.Message.GotCityBox({
          example: 'creatable',
          message: UiCombobox.Message.SelectedItem({ item, displayText: item, wasSelected: false }),
        }),
      )
    expect(choose('Accra').widgets.createdCities).toEqual(['Accra'])
    expect(choose('Accra').widgets.cityBoxes.creatable.city).toEqual(Option.some('Accra'))
    expect(choose('Oslo').widgets.createdCities).toEqual([])
  })

  it('show the key copied until its reset, and not after a refused copy', () => {
    const copied = send(Widgets.Message.GotCopy({ message: ClipboardMessage.Copied() }))
    expect(copied.widgets.inputCopy.copied).toBe(true)
    const reset = update(
      copied,
      Message.GotWidget({
        message: Widgets.Message.GotInputCopy({
          message: InputCopy.Message.ElapsedReset({ copy: copied.widgets.inputCopy.copies }),
        }),
      }),
    ).model
    expect(reset.widgets.inputCopy.copied).toBe(false)
    const refused = send(
      Widgets.Message.GotCopy({ message: ClipboardMessage.CopyFailed({ message: 'denied' }) }),
    )
    expect(refused.widgets).toBe(initial.widgets)
  })

  it('keep what Caps Lock was read as through a key that says nothing of it', () => {
    const on = send(Widgets.Message.ReadCapsLock({ reading: Option.some(true) }))
    expect(on.widgets.capsLock).toBe(true)
    const digit = update(
      on,
      Message.GotWidget({ message: Widgets.Message.ReadCapsLock({ reading: Option.none() }) }),
    ).model
    expect(digit.widgets).toBe(on.widgets)
  })
})
