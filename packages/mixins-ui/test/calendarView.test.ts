/**
 * `Calendar.view` over the state `Calendar.init` makes, one test for each
 * reference calendar that is a call with options (the note's rows, numbered
 * as there): the args and options a row names are given through the public
 * API and its defining trait is asserted on the drawn page. Rows 14, 19 and
 * 22 are a second widget in `aside`, which the slots test at the end stands
 * for; rows 24 to 30 are the DatePicker's. Then what an application adds of
 * its own: a presets list it wrote, and its configured Calendar.
 */
import { Option } from 'effect'
import * as UiCalendar from '@foldkit/ui/calendar'
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import * as Dates from 'foldkit/calendar'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Calendar, CalendarSlots, Recipes } from '../src/index.js'

const feb = (date: number) => Dates.make(2026, 2, date)
const march = (date: number) => Dates.make(2026, 3, date)
const today = feb(11)

type Options = Omit<Calendar.CalendarView<Calendar.Message>, 'model' | 'onMessage' | 'label'>

const draw = (options: Options) => (model: Calendar.Model, h: HtmlBuilder<Calendar.Message>) =>
  Calendar.view({ model, onMessage: message => message, label: 'Trip', ...options }, h)

/** A Calendar as an application runs it: its own update, drawn with `options`. */
const app = (options: Options = {}) => ({ update: Calendar.update, view: draw(options) })
const given = (args: Partial<Calendar.Args> = {}) =>
  Scene.given(Calendar.init({ id: 'trip', today, ...args }))

const cell = (date: Dates.CalendarDate, id = 'trip') =>
  Scene.selector(`#${id}-cell-${date.year}-${date.month}-${date.day}`)
const press = (date: Dates.CalendarDate, id = 'trip') =>
  Scene.click(Scene.selector(`#${id}-cell-${date.year}-${date.month}-${date.day} button`))
const changedTo = (selection: Calendar.Selection) =>
  Scene.expectOutMessage(Calendar.OutMessage.Changed({ selection }))
const button = (name: string) => Scene.role('button', { name })
const focusedGrid = Scene.Command.resolve(
  UiCalendar.FocusGrid,
  UiCalendar.Message.CompletedFocusGrid(),
)

describe('the reference calendars that are a call with options', () => {
  it('1 basic: a named group holding one month, a press choosing one day', () => {
    Scene.scene(
      app(),
      given(),
      Scene.expect(Scene.role('group', { name: 'Trip' })).toHaveAttr('data-months', '1'),
      Scene.expectAll(Scene.all.role('grid')).toHaveCount(1),
      press(feb(14)),
      changedTo(Calendar.day(feb(14))),
      Scene.expect(cell(feb(14))).toHaveAttr('data-selected'),
      press(feb(20)),
      Scene.expect(cell(feb(14))).not.toHaveAttr('data-selected'),
    )
  })

  it('2 range: the selection arg sets the mode, and two presses make a range', () => {
    Scene.scene(
      app(),
      given({ selection: Calendar.empty('Range') }),
      press(feb(14)),
      press(feb(10)),
      changedTo(
        Calendar.Selection.Range({ start: Option.some(feb(10)), end: Option.some(feb(14)) }),
      ),
      Scene.expect(cell(feb(10))).toHaveAttr('data-range-start'),
      Scene.expect(cell(feb(12))).toHaveAttr('data-in-range'),
      Scene.expect(cell(feb(14))).toHaveAttr('data-range-end'),
    )
  })

  it('3 disabled dates: a date, a weekday and days before the minimum take no press', () => {
    Scene.scene(
      app(),
      given({ disabledDates: [feb(13)], disabledDaysOfWeek: ['Sunday'], minDate: feb(5) }),
      // 13 by its date, 15 as a Sunday, 4 as before the minimum.
      ...[feb(13), feb(15), feb(4)].flatMap(date => [
        Scene.expect(cell(date)).toHaveAttr('data-disabled'),
        Scene.expect(Scene.selector(`#trip-cell-2026-2-${date.day} button`)).toHaveAttr(
          'aria-disabled',
          'true',
        ),
      ]),
      Scene.expect(cell(feb(12))).not.toHaveAttr('data-disabled'),
    )
  })

  it('4 multiple: each press adds a day, and a press on a chosen day takes it out', () => {
    Scene.scene(
      app(),
      given({ selection: Calendar.empty('Multiple') }),
      press(feb(14)),
      press(feb(10)),
      changedTo(Calendar.Selection.Multiple({ dates: [feb(10), feb(14)] })),
      press(feb(14)),
      changedTo(Calendar.Selection.Multiple({ dates: [feb(10)] })),
      Scene.expect(cell(feb(14))).not.toHaveAttr('data-selected'),
    )
  })

  it('5 and 6 a look of the application’s: the recipe extended, on the day and its cell', () => {
    const style = Style.forSlots(CalendarSlots)(
      Recipes.Calendar.extend({
        base: { dayButton: Style.class('brand-day'), dayCell: Style.class('brand-band') },
      })({}),
    )
    Scene.scene(
      app({ style }),
      given(),
      Scene.expect(Scene.selector('#trip-cell-2026-2-14 button')).toHaveClass('brand-day'),
      Scene.expect(cell(feb(14))).toHaveClass('brand-band'),
    )
  })

  it('7 controls on the right: both paging buttons after the caption', () => {
    /** The header's three buttons by name, in the order drawn: they come before every day. */
    const headerIs = (...names: ReadonlyArray<string>) =>
      Scene.tap<Calendar.Model, Calendar.Message, Calendar.OutMessage>(({ html }) =>
        expect(
          Inert.byTag(html, 'button')
            .slice(0, 3)
            .map(node => Inert.value(node, 'aria-label')),
        ).toEqual(names),
      )
    Scene.scene(
      app({ paging: 'end' }),
      given(),
      Scene.expect(Scene.selector('[data-paging="end"]')).toExist(),
      headerIs('Switch to month picker', 'Previous month', 'Next month'),
    )
    // Either side of the caption otherwise, and the header unmarked.
    Scene.scene(
      app(),
      given(),
      Scene.expect(Scene.selector('[data-paging]')).not.toExist(),
      headerIs('Previous month', 'Switch to month picker', 'Next month'),
    )
  })

  it('8 month and year dropdowns: two selects that move the month', () => {
    Scene.scene(
      app({ caption: { dropdowns: { years: { from: 2024, to: 2028 } } } }),
      given(),
      Scene.expectAll(Scene.all.selector('[aria-label="Year"] option')).toHaveCount(5),
      Scene.change(Scene.label('Month'), '5'),
      Scene.expect(Scene.label('Month')).toHaveAttr('value', '5'),
      Scene.expect(cell(Dates.make(2026, 5, 20))).toExist(),
      Scene.change(Scene.label('Year'), '2027'),
      Scene.expect(cell(Dates.make(2027, 5, 20))).toExist(),
    )
  })

  it('9 year select with arrows: the month as text beside a select of years', () => {
    Scene.scene(
      app({ caption: { dropdowns: { month: 'label' } } }),
      given(),
      Scene.expect(Scene.label('Month')).not.toExist(),
      Scene.expect(Scene.selector('[data-beside-select]')).toHaveText('February'),
      Scene.expect(Scene.label('Previous month')).toExist(),
      Scene.change(Scene.label('Year'), '2027'),
      Scene.expect(cell(Dates.make(2027, 2, 20))).toExist(),
      Scene.click(Scene.label('Next month')),
      Scene.expect(Scene.selector('[data-beside-select]')).toHaveText('March'),
    )
  })

  it('10 week numbers: a column of them before the days', () => {
    Scene.scene(app({ weekNumbers: true }), given(), Scene.expect(Scene.text('#')).toExist())
    Scene.scene(app(), given(), Scene.expect(Scene.text('#')).not.toExist())
  })

  it('11 a current-month button: back to today’s month, choosing nothing', () => {
    Scene.scene(
      app({ today: { label: 'This month' } }),
      given(),
      Scene.click(Scene.label('Next month')),
      Scene.expect(cell(march(20))).not.toHaveAttr('data-outside-month'),
      Scene.click(button('This month')),
      Scene.expectNoOutMessage(),
      Scene.expect(cell(feb(20))).not.toHaveAttr('data-outside-month'),
      Scene.expect(cell(today)).not.toHaveAttr('data-selected'),
    )
  })

  it('12 a today button: back to today’s month, and today chosen', () => {
    Scene.scene(
      app({ today: { label: 'Today', selects: true } }),
      given(),
      Scene.click(Scene.label('Next month')),
      Scene.click(button('Today')),
      changedTo(Calendar.day(today)),
      Scene.expect(cell(today)).toHaveAttr('data-selected'),
    )
    Scene.scene(app(), given(), Scene.expect(button('Today')).not.toExist())
  })

  it('13 year view: the heading opens a grid of months, the default caption', () => {
    Scene.scene(
      app(),
      given(),
      Scene.click(button('Switch to month picker')),
      focusedGrid,
      Scene.expect(Scene.role('grid', { name: 'Month picker, 2026' })).toExist(),
    )
    Scene.scene(
      app({ caption: 'label' }),
      given(),
      Scene.expect(button('Switch to month picker')).not.toExist(),
      Scene.expect(Scene.selector('#trip-heading')).toHaveText('February 2026'),
    )
  })

  it('15 date presets: a press takes the preset’s day and turns to its month', () => {
    const presets = [
      { label: 'Today', selection: Calendar.day(today) },
      { label: 'In a month', selection: Calendar.day(march(11)) },
    ]
    Scene.scene(
      app({ presets }),
      given(),
      Scene.expect(Scene.role('group', { name: 'Presets' })).toExist(),
      Scene.click(button('In a month')),
      changedTo(Calendar.day(march(11))),
      Scene.expect(button('In a month')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(button('Today')).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(cell(march(11))).toHaveAttr('data-selected'),
    )
    Scene.scene(
      app(),
      given(),
      Scene.expect(Scene.role('group', { name: 'Presets' })).not.toExist(),
    )
  })

  it('16 range presets: built with lastDays and monthOf, each a whole range', () => {
    const presets = [
      { label: 'Last 7 days', selection: Calendar.lastDays(today, 7) },
      { label: 'This month', selection: Calendar.monthOf(today) },
    ]
    Scene.scene(
      app({ presets }),
      given({ selection: Calendar.empty('Range') }),
      Scene.click(button('Last 7 days')),
      changedTo(Calendar.lastDays(today, 7)),
      Scene.expect(cell(feb(5))).toHaveAttr('data-range-start'),
      Scene.expect(cell(today)).toHaveAttr('data-range-end'),
      Scene.click(button('This month')),
      Scene.expect(cell(feb(1))).toHaveAttr('data-range-start'),
      Scene.expect(cell(feb(28))).toHaveAttr('data-range-end'),
    )
  })

  it('17 a price on each day: a line under the number, in the recipe’s roomier cell', () => {
    const style = Style.forSlots(CalendarSlots)(Recipes.Calendar({ detail: 'text' }))
    const plain = Style.forSlots(CalendarSlots)(Recipes.Calendar({}))
    expect(style.css).not.toBe(plain.css)
    Scene.scene(
      app({ style, detail: date => Option.liftPredicate('$120', () => date.day === 12) }),
      given(),
      Scene.expect(Scene.selector('#trip-cell-2026-2-12 button span')).toHaveText('$120'),
      Scene.expect(Scene.selector('#trip-cell-2026-2-13 button span')).not.toExist(),
    )
  })

  it('18 presets in another layout: a recipe value the application adds', () => {
    const Calendars = Recipes.Calendar.add({
      presetsSide: { end: { presets: Style.class('presets-end') } },
    })
    const style = Style.forSlots(CalendarSlots)(Calendars({ presetsSide: 'end' }))
    Scene.scene(
      app({ style, presets: [{ label: 'Today', selection: Calendar.day(today) }] }),
      given(),
      Scene.expect(Scene.role('group', { name: 'Presets' })).toHaveClass('presets-end'),
    )
  })

  it('20 two months: two grids, a month apart, paged from their outer ends', () => {
    Scene.scene(
      app(),
      given({ months: 2 }),
      Scene.expect(Scene.role('group', { name: 'Trip' })).toHaveAttr('data-months', '2'),
      Scene.expectAll(Scene.all.role('grid')).toHaveCount(2),
      Scene.expect(Scene.role('grid', { name: 'Calendar, March 2026' })).toExist(),
      Scene.expectAll(Scene.all.label('Previous month')).toHaveCount(1),
      Scene.expectAll(Scene.all.label('Next month')).toHaveCount(1),
      Scene.click(Scene.label('Next month')),
      Scene.expect(Scene.role('grid', { name: 'Calendar, March 2026' })).toExist(),
      Scene.expect(Scene.role('grid', { name: 'Calendar, April 2026' })).toExist(),
      Scene.expect(Scene.role('grid', { name: 'Calendar, February 2026' })).not.toExist(),
    )
  })

  it('21 two months, range: one range from a press in each month', () => {
    const second = Calendar.secondId('trip')
    Scene.scene(
      app(),
      given({ months: 2, selection: Calendar.empty('Range') }),
      press(feb(20)),
      press(march(5), second),
      changedTo(
        Calendar.Selection.Range({ start: Option.some(feb(20)), end: Option.some(march(5)) }),
      ),
      Scene.expect(cell(feb(20))).toHaveAttr('data-range-start'),
      Scene.expect(cell(feb(25))).toHaveAttr('data-in-range'),
      Scene.expect(cell(march(5), second)).toHaveAttr('data-range-end'),
    )
  })

  it('23 localized: the locale arg names the months, and words name the controls', () => {
    Scene.scene(
      app({ words: { previousMonth: 'Mois précédent', daysGrid: 'Calendrier, {month}' } }),
      given({ locale: Calendar.localeOf('fr') }),
      Scene.expect(Scene.role('grid', { name: 'Calendrier, février 2026' })).toExist(),
      Scene.expect(Scene.label('Mois précédent')).toExist(),
      // A word not given keeps its default.
      Scene.expect(Scene.label('Next month')).toExist(),
    )
  })
})

describe('what the view lays around the months', () => {
  it('names the caption’s selects by its words', () => {
    Scene.scene(
      app({ caption: { dropdowns: {} }, words: { month: 'Mois', year: 'Année' } }),
      given(),
      Scene.expect(Scene.label('Mois')).toHaveAttr('value', '2'),
      Scene.expect(Scene.label('Année')).toHaveAttr('value', '2026'),
    )
  })

  it('draws the application’s aside beside them and its footer after, each in its slot', () => {
    const style = Style.forSlots(CalendarSlots)(
      Recipes.Calendar.extend({
        base: { aside: Style.class('the-aside'), footer: Style.class('the-footer') },
      })({}),
    )
    Scene.scene(
      {
        update: Calendar.update,
        view: (model: Calendar.Model, h: HtmlBuilder<Calendar.Message>) =>
          Calendar.view(
            {
              model,
              onMessage: message => message,
              label: 'Trip',
              style,
              aside: h.p([], ['09:30']),
              footer: h.p([], ['Times are local']),
            },
            h,
          ),
      },
      given(),
      Scene.expect(Scene.selector('.the-aside p')).toHaveText('09:30'),
      Scene.expect(Scene.selector('.the-footer p')).toHaveText('Times are local'),
    )
    Scene.scene(app({ style }), given(), Scene.expect(Scene.selector('.the-aside')).not.toExist())
  })

  it('previews a range waiting for its end at the day the pointer is on', () => {
    Scene.scene(
      app(),
      given({ selection: Calendar.empty('Range') }),
      press(feb(10)),
      Scene.hover(Scene.selector('#trip-cell-2026-2-13 button')),
      Scene.expect(cell(feb(12))).toHaveAttr('data-preview'),
      Scene.expect(cell(feb(13))).toHaveAttr('data-preview-end'),
    )
  })

  it('with two months, hides both paging buttons for `none`, and puts dropdowns on the first', () => {
    Scene.scene(
      app({ paging: 'none', caption: { dropdowns: {} } }),
      given({ months: 2 }),
      Scene.expect(Scene.label('Previous month')).not.toExist(),
      Scene.expect(Scene.label('Next month')).not.toExist(),
      Scene.expectAll(Scene.all.label('Month')).toHaveCount(1),
      Scene.expect(Scene.selector(`#${Calendar.secondId('trip')}-heading`)).toHaveText(
        'March 2026',
      ),
      Scene.change(Scene.label('Month'), '6'),
      Scene.expect(Scene.selector(`#${Calendar.secondId('trip')}-heading`)).toHaveText('July 2026'),
    )
  })
})

describe('what an application adds', () => {
  /** A presets list of the application's own: the weekend after `from`, written against `Calendar.Preset`. */
  const weekends = (from: Dates.CalendarDate, count: number): ReadonlyArray<Calendar.Preset> =>
    Array.from({ length: count }, (_, index) => {
      const saturday = Dates.addDays(
        from,
        ((6 - new Date(Date.UTC(from.year, from.month - 1, from.day)).getUTCDay() + 7) % 7) +
          index * 7,
      )
      return {
        label: `Weekend of ${saturday.month}/${saturday.day}`,
        selection: Calendar.Selection.Range({
          start: Option.some(saturday),
          end: Option.some(Dates.addDays(saturday, 1)),
        }),
      }
    })

  it('draws a presets list it wrote, each choosing its own range', () => {
    Scene.scene(
      app({ presets: weekends(today, 3) }),
      given({ selection: Calendar.empty('Range') }),
      Scene.expectAll(Scene.all.selector('[aria-pressed]')).toHaveCount(3),
      Scene.click(button('Weekend of 2/21')),
      changedTo(
        Calendar.Selection.Range({ start: Option.some(feb(21)), end: Option.some(feb(22)) }),
      ),
      Scene.expect(button('Weekend of 2/21')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(cell(feb(22))).toHaveAttr('data-range-end'),
    )
  })

  it('configures its own Calendar: base, a named preset, and the call over both', () => {
    const Trips = Calendar.configure({
      base: { weekNumbers: true, words: { presets: 'Shortcuts', nextMonth: 'Later' } },
      presets: {
        booking: {
          today: { label: 'Today', selects: true },
          presets: [{ label: 'Tonight', selection: Calendar.day(today) }],
          words: { nextMonth: 'Next' },
        },
      },
    })
    const drawn =
      (preset: boolean, more: Options = {}) =>
      (model: Calendar.Model, h: HtmlBuilder<Calendar.Message>) =>
        Trips.view(
          {
            model,
            onMessage: message => message,
            label: 'Trip',
            ...(preset ? { preset: 'booking' as const } : {}),
            ...more,
          },
          h,
        )
    Scene.scene(
      { update: Calendar.update, view: drawn(true) },
      given(),
      Scene.expect(Scene.text('#')).toExist(),
      Scene.expect(Scene.role('group', { name: 'Shortcuts' })).toExist(),
      Scene.expect(Scene.label('Next')).toExist(),
      Scene.click(button('Today')),
      changedTo(Calendar.day(today)),
    )
    Scene.scene(
      { update: Calendar.update, view: drawn(false, { weekNumbers: false }) },
      given(),
      Scene.expect(Scene.text('#')).not.toExist(),
      Scene.expect(button('Today')).not.toExist(),
      Scene.expect(Scene.label('Later')).toExist(),
    )
  })
})
