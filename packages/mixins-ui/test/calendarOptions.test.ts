/**
 * What a Calendar draws beyond upstream's grid: ISO week numbers, a caption
 * of a label or of month and year selects (`show` answering them), paging
 * buttons hidden for two months side by side (`alongside` keeping the second
 * a month on), a range's hover preview, and presets (`lastDays`, `monthOf`,
 * `presetsView`).
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import * as CalendarUi from '@foldkit/ui/calendar'
import * as Dates from 'foldkit/calendar'
import type { HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import { Scene } from 'foldkit/test'
import { Calendar } from '../src/index.js'
import { sends, tagsOf } from './fixture.js'

const { Selection } = Calendar
const feb = (date: number) => Dates.make(2026, 2, date)
const calendar = (more: Partial<CalendarUi.InitConfig> = {}) =>
  CalendarUi.init({ id: 'trip', today: feb(11), ...more })

type Options = Calendar.CalendarOptions<CalendarUi.Message>

/** A calendar of February 2026 drawn with `options`, `selection` marked. */
const app = (selection: Calendar.Selection, options: (model: CalendarUi.Model) => Options) => ({
  update: (model: CalendarUi.Model, message: CalendarUi.Message) =>
    CalendarUi.update(model, message),
  view: (model: CalendarUi.Model, h: HtmlBuilder<CalendarUi.Message>) =>
    CalendarUi.view(
      model,
      {
        maybeSelectedDate: Option.none(),
        toView: Calendar.toView(selection, [], { h }, options(model)),
      },
      h,
    ),
})

const cell = (date: number) => Scene.selector(`#trip-cell-2026-2-${date}`)

/** The Days bundles `toView` hands its `render`, for `selection` and `options`. */
const resolvedDays = (
  selection: Calendar.Selection,
  options: Options,
  model: CalendarUi.Model = calendar(),
): Calendar.ResolvedDays<CalendarUi.Message> => {
  let captured: Option.Option<Calendar.ResolvedCalendar<CalendarUi.Message>> = Option.none()
  Scene.scene(
    {
      update: (given: CalendarUi.Model) => ({ model: given }),
      view: (given: CalendarUi.Model, h: HtmlBuilder<CalendarUi.Message>) =>
        CalendarUi.view(
          given,
          {
            maybeSelectedDate: Option.none(),
            toView: Calendar.toView(
              selection,
              [],
              { h },
              {
                ...options,
                render: resolved => {
                  captured = Option.some(resolved)
                  return Calendar.draw(resolved, h)
                },
              },
            ),
          },
          h,
        ),
    },
    Scene.given(model),
  )
  const days = Option.getOrThrow(captured)
  if (days._tag !== 'Days') throw new Error(`expected Days, got ${days._tag}`)
  return days
}

/** What a calendar in a page sends: its own Messages lifted, or one of the options'. */
type Sent =
  | { readonly _tag: 'Child' }
  | { readonly _tag: 'Shown'; readonly shown: Calendar.Shown }
  | { readonly _tag: 'Previewed'; readonly date: Option.Option<Dates.CalendarDate> }

const embedded =
  (
    model: CalendarUi.Model,
    selection: Calendar.Selection,
    options: Calendar.CalendarOptions<Sent>,
  ) =>
  (h: HtmlBuilder<Sent>) =>
    h.submodel({
      slotId: model.id,
      model,
      view: CalendarUi.view,
      viewInputs: Calendar.inputs(selection, [], { h }, options),
      toParentMessage: (): Sent => ({ _tag: 'Child' }),
    })

describe('Calendar.isoWeek', () => {
  it.each([
    ['a Thursday 1 January', Dates.make(2026, 1, 1), 1],
    ['a Monday in the year before, in week 1', Dates.make(2025, 12, 29), 1],
    ['a Sunday in January, in the last week before', Dates.make(2021, 1, 3), 53],
    ['a Monday in December, in next year’s first', Dates.make(2024, 12, 30), 1],
    ['a Wednesday in February', feb(4), 6],
    ['a Sunday, the end of its ISO week', feb(8), 6],
  ] as const)('%s', (_, date, week) => {
    expect(Calendar.isoWeek(date)).toBe(week)
  })
})

describe('week numbers', () => {
  it('numbers each week by its fourth day, with a header over them', () => {
    const days = resolvedDays(Calendar.empty('Single'), { weekNumbers: true })
    // February 2026 starts on a Sunday, the first column.
    expect(days.weeks[0]?.cells[0]?.date).toEqual(feb(1))
    expect(days.weeks.map(week => Option.map(week.weekNumber, ({ number }) => number))).toEqual(
      [6, 7, 8, 9, 10, 11].map(Option.some),
    )
    expect(Option.isSome(days.weekNumberHeader)).toBe(true)
  })

  it('draws the header hidden, as each row names its week already', () => {
    Scene.scene(
      app(Calendar.empty('Single'), () => ({ weekNumbers: true })),
      Scene.given(calendar()),
      Scene.expect(Scene.text('#')).toHaveAttr('aria-hidden', 'true'),
    )
  })

  it('numbers none unless asked', () => {
    const days = resolvedDays(Calendar.empty('Single'), {})
    expect(days.weeks.every(week => Option.isNone(week.weekNumber))).toBe(true)
    expect(Option.isNone(days.weekNumberHeader)).toBe(true)
  })
})

describe('the caption', () => {
  it('is the heading button by default, and the month as words for a label', () => {
    Scene.scene(
      app(Calendar.empty('Single'), () => ({})),
      Scene.given(calendar()),
      Scene.expect(Scene.role('button', { name: 'Switch to month picker' })).toHaveText(
        'February 2026',
      ),
    )
    Scene.scene(
      app(Calendar.empty('Single'), () => ({ caption: 'label' })),
      Scene.given(calendar()),
      Scene.expect(Scene.selector('span#trip-heading')).toHaveText('February 2026'),
      Scene.expect(Scene.selector('span#trip-heading')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.role('button', { name: 'Switch to month picker' })).not.toExist(),
    )
  })

  it('hides the paging button the options leave out', () => {
    Scene.scene(
      app(Calendar.empty('Single'), () => ({ paging: 'next' })),
      Scene.given(calendar()),
      Scene.expect(Scene.label('Next month')).toExist(),
      Scene.expect(Scene.label('Previous month')).not.toExist(),
    )
  })
})

describe('the caption’s dropdowns', () => {
  const bounded = calendar({ minDate: Dates.make(2025, 3, 15), maxDate: Dates.make(2026, 10, 1) })
  const dropdowns = (model: CalendarUi.Model): Options => ({
    dropdowns: { model, onShow: () => CalendarUi.Message.FocusedGrid() },
  })

  it('choose a month of the year shown and a year in the bounds, the shown ones selected', () => {
    Scene.scene(
      app(Calendar.empty('Single'), dropdowns),
      Scene.given(bounded),
      Scene.expect(Scene.label('Month')).toHaveAttr('value', '2'),
      Scene.expectAll(Scene.all.selector('[aria-label="Month"] option')).toHaveCount(12),
      Scene.expect(Scene.selector('[aria-label="Month"] option[value="11"]')).toHaveAttr(
        'disabled',
      ),
      Scene.expect(Scene.selector('[aria-label="Month"] option[value="10"]')).not.toHaveAttr(
        'disabled',
      ),
      Scene.expectAll(Scene.all.selector('[aria-label="Year"] option')).toHaveCount(2),
      Scene.expect(Scene.label('Year')).toHaveAttr('value', '2026'),
      Scene.expect(Scene.role('button', { name: 'Switch to month picker' })).not.toExist(),
    )
  })

  it('send only what changed', () => {
    sends<Sent>(
      embedded(bounded, Calendar.empty('Single'), {
        dropdowns: { model: bounded, onShow: (shown): Sent => ({ _tag: 'Shown', shown }) },
      }),
      Scene.change(Scene.label('Month'), '5'),
      Scene.expectOutMessage<Sent>({ _tag: 'Shown', shown: Calendar.Shown.Month({ month: 5 }) }),
    )
  })
})

describe('Calendar.show', () => {
  const focused = CalendarUi.focusDate(calendar(), Dates.make(2026, 1, 31))

  it('moves to another month, keeping the day where the month has it', () => {
    const moved = Calendar.show(focused, Calendar.Shown.Month({ month: 2 }))
    expect([moved.viewYear, moved.viewMonth]).toEqual([2026, 2])
    expect(moved.maybeFocusedDate).toEqual(Option.some(feb(28)))
    const later = Calendar.show(focused, Calendar.Shown.Year({ year: 2028 }))
    expect([later.viewYear, later.viewMonth]).toEqual([2028, 1])
  })

  it('stays inside the bounds', () => {
    const bounded = CalendarUi.reflectMinDate(focused, Option.some(Dates.make(2025, 6, 20)))
    const moved = Calendar.show(bounded, Calendar.Shown.Year({ year: 2025 }))
    expect(moved.maybeFocusedDate).toEqual(Option.some(Dates.make(2025, 6, 20)))
  })

  it('keeps its Model for the month already shown', () => {
    expect(Calendar.show(focused, Calendar.Shown.Month({ month: 1 }))).toBe(focused)
  })
})

describe('Calendar.alongside', () => {
  it('shows the month after the other’s, across a year', () => {
    const december = CalendarUi.focusDate(calendar(), Dates.make(2026, 12, 5))
    const next = Calendar.alongside(calendar({ id: 'second' }), december, 1)
    expect([next.viewYear, next.viewMonth]).toEqual([2027, 1])
    const before = Calendar.alongside(calendar({ id: 'first' }), next, -1)
    expect([before.viewYear, before.viewMonth]).toEqual([2026, 12])
  })

  it('keeps its Model when it already shows that month', () => {
    const march = CalendarUi.focusDate(calendar({ id: 'second' }), Dates.make(2026, 3, 1))
    expect(Calendar.alongside(march, calendar(), 1)).toBe(march)
  })
})

describe('a range’s preview', () => {
  const waiting = Selection.Range({ start: Option.some(feb(10)), end: Option.none() })
  const preview = (date: Option.Option<number>) => (): Options => ({
    preview: { date: Option.map(date, feb), onPreview: () => CalendarUi.Message.FocusedGrid() },
  })

  it('marks the days from the start to the day pointed at, either way', () => {
    Scene.scene(
      app(waiting, preview(Option.some(13))),
      Scene.given(calendar()),
      Scene.expectAll(Scene.all.selector('[data-preview]')).toHaveCount(4),
      Scene.expect(cell(13)).toHaveAttr('data-preview-end'),
      Scene.expect(cell(10)).toHaveAttr('data-preview'),
      Scene.expect(cell(14)).not.toHaveAttr('data-preview'),
    )
    Scene.scene(
      app(waiting, preview(Option.some(7))),
      Scene.given(calendar()),
      Scene.expectAll(Scene.all.selector('[data-preview]')).toHaveCount(4),
      Scene.expect(cell(7)).toHaveAttr('data-preview-end'),
    )
  })

  it('marks nothing once the range has its end', () => {
    Scene.scene(
      app(
        Selection.Range({ start: Option.some(feb(10)), end: Option.some(feb(12)) }),
        preview(Option.some(20)),
      ),
      Scene.given(calendar()),
      Scene.expectAll(Scene.all.selector('[data-preview]')).toHaveCount(0),
    )
  })

  it('sends the day the pointer enters', () => {
    sends<Sent>(
      embedded(calendar(), waiting, {
        preview: { date: Option.none(), onPreview: (date): Sent => ({ _tag: 'Previewed', date }) },
      }),
      Scene.hover(Scene.selector('#trip-cell-2026-2-13 button')),
      Scene.expectOutMessage<Sent>({ _tag: 'Previewed', date: Option.some(feb(13)) }),
    )
  })

  it('listens on the days and the grid only while a range waits for its end', () => {
    const listening = (selection: Calendar.Selection) => {
      const days = resolvedDays(selection, preview(Option.none())())
      return {
        grid: tagsOf(days.grid).includes('OnMouseLeave'),
        days: days.weeks
          .flatMap(week => week.cells)
          .filter(each => tagsOf(each.buttonAttributes).includes('OnMouseEnter')).length,
      }
    }
    expect(listening(waiting)).toEqual({ grid: true, days: 42 })
    expect(listening(Calendar.empty('Range'))).toEqual({ grid: false, days: 0 })
    expect(listening(Calendar.day(feb(3)))).toEqual({ grid: false, days: 0 })
  })

  it('does not listen on a disabled day', () => {
    const days = resolvedDays(
      waiting,
      preview(Option.none())(),
      calendar({ disabledDates: [feb(13)] }),
    )
    const thirteenth = days.weeks
      .flatMap(week => week.cells)
      .find(each => each.date.day === 13 && each.isInViewMonth)
    expect(tagsOf(thirteenth?.buttonAttributes ?? []).includes('OnMouseEnter')).toBe(false)
  })
})

describe('presets', () => {
  const today = feb(11)

  it('make the ranges and days they name', () => {
    expect(Calendar.lastDays(today, 7)).toEqual(
      Selection.Range({ start: Option.some(feb(5)), end: Option.some(today) }),
    )
    expect(Calendar.nextDays(today, 3)).toEqual(
      Selection.Range({ start: Option.some(today), end: Option.some(feb(13)) }),
    )
    expect(Calendar.monthOf(today, -1)).toEqual(
      Selection.Range({
        start: Option.some(Dates.make(2026, 1, 1)),
        end: Option.some(Dates.make(2026, 1, 31)),
      }),
    )
    expect(Calendar.monthOf(today)).toEqual(
      Selection.Range({ start: Option.some(feb(1)), end: Option.some(feb(28)) }),
    )
    expect(Calendar.firstDate(Calendar.lastDays(today, 7))).toEqual(Option.some(feb(5)))
    expect(Calendar.firstDate(Calendar.day(today))).toEqual(Option.some(today))
  })

  it.each([
    ['the same range', Calendar.lastDays(today, 7), Calendar.lastDays(today, 7), true],
    ['a range a day longer', Calendar.lastDays(today, 7), Calendar.lastDays(today, 8), false],
    ['a day and a range of it', Calendar.day(today), Calendar.lastDays(today, 1), false],
    [
      'the same days in Multiple',
      Selection.Multiple({ dates: [feb(1), feb(3)] }),
      Selection.Multiple({ dates: [feb(1), feb(3)] }),
      true,
    ],
    [
      'other days in Multiple',
      Selection.Multiple({ dates: [feb(1), feb(3)] }),
      Selection.Multiple({ dates: [feb(1), feb(4)] }),
      false,
    ],
  ] as const)('isSame: %s', (_, left, right, same) => {
    expect(Calendar.isSame(left, right)).toBe(same)
  })

  const presets = [
    { label: 'Today', selection: Calendar.day(today) },
    { label: 'Last 7 days', selection: Calendar.lastDays(today, 7) },
  ]

  it('draw a group of buttons, the one holding the selection pressed, each sending its own', () => {
    sends<Calendar.Selection>(
      h =>
        Calendar.presetsView(
          { presets, selection: Calendar.lastDays(today, 7), onPick: selection => selection },
          h,
        ),
      Scene.expect(Scene.role('group', { name: 'Presets' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Last 7 days' })).toHaveAttr(
        'aria-pressed',
        'true',
      ),
      Scene.expect(Scene.role('button', { name: 'Today' })).toHaveAttr('aria-pressed', 'false'),
      Scene.click(Scene.role('button', { name: 'Today' })),
      Scene.expectOutMessage(Calendar.day(today)),
    )
  })
})

describe('an app holding a preview', () => {
  interface Trip {
    readonly calendar: CalendarUi.Model
    readonly selection: Calendar.Selection
    readonly preview: Option.Option<Dates.CalendarDate>
  }
  type TripMessage =
    | { readonly _tag: 'Got'; readonly message: CalendarUi.Message }
    | { readonly _tag: 'Previewed'; readonly date: Option.Option<Dates.CalendarDate> }

  it('previews on hover and stops once the end is picked', () => {
    Scene.scene(
      {
        update: (model: Trip, message: TripMessage) => {
          if (message._tag === 'Previewed') {
            return { model: modifyFields(model, { preview: () => message.date }) }
          }
          const next = CalendarUi.update(model.calendar, message.message)
          const picked = Option.fromNullishOr(next.outMessage).pipe(
            Option.flatMap(out =>
              CalendarUi.OutMessage.match<Option.Option<Dates.CalendarDate>>(out, {
                SelectedDate: ({ date }) => Option.some(date),
                ChangedViewMonth: () => Option.none(),
              }),
            ),
          )
          return {
            model: modifyFields(model, {
              calendar: () => next.model,
              selection: selection =>
                Option.match(picked, {
                  onNone: () => selection,
                  onSome: date => Calendar.picked(selection, date),
                }),
            }),
          }
        },
        view: (model: Trip, h: HtmlBuilder<TripMessage>) =>
          h.submodel({
            slotId: 'trip',
            model: model.calendar,
            view: CalendarUi.view,
            viewInputs: Calendar.inputs(
              model.selection,
              [],
              { h },
              {
                preview: {
                  date: model.preview,
                  onPreview: date => ({ _tag: 'Previewed', date }),
                },
              },
            ),
            toParentMessage: (message: CalendarUi.Message): TripMessage => ({
              _tag: 'Got',
              message,
            }),
          }),
      },
      Scene.given<Trip>({
        calendar: calendar(),
        selection: Calendar.empty('Range'),
        preview: Option.none(),
      }),
      Scene.click(Scene.selector('#trip-cell-2026-2-10 button')),
      Scene.hover(Scene.selector('#trip-cell-2026-2-12 button')),
      Scene.expectAll(Scene.all.selector('[data-preview]')).toHaveCount(3),
      Scene.click(Scene.selector('#trip-cell-2026-2-12 button')),
      Scene.expectAll(Scene.all.selector('[data-preview]')).toHaveCount(0),
      Scene.expectAll(Scene.all.selector('[data-in-range]')).toHaveCount(3),
    )
  })
})
