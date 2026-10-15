/**
 * DateRange: `picked` folds a day into the range (start, then end, the two
 * swapped when the end comes first, then a new start), and `toView` marks the
 * Calendar's day cells from start to end. The band itself is the recipe's CSS.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import * as CalendarUi from '@foldkit/ui/calendar'
import * as Dates from 'foldkit/calendar'
import { modifyFields } from 'foldkit/struct'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import { DateRange } from '../src/index.js'

const day = (date: number) => Dates.make(2026, 2, date)
const range = (start: Option.Option<number>, end: Option.Option<number>): DateRange.Range => ({
  start: Option.map(start, day),
  end: Option.map(end, day),
})
const none = Option.none<number>()
const some = Option.some<number>

describe('DateRange.picked', () => {
  it.each([
    ['nothing chosen: the day starts', range(none, none), 12, range(some(12), none)],
    ['a start: a later day ends', range(some(10), none), 14, range(some(10), some(14))],
    [
      'a start: an earlier day ends, the two swapped',
      range(some(10), none),
      3,
      range(some(3), some(10)),
    ],
    [
      'a start: the same day ends, one day long',
      range(some(10), none),
      10,
      range(some(10), some(10)),
    ],
    ['a whole range: the day starts again', range(some(3), some(10)), 20, range(some(20), none)],
    ['an end with no start: the day starts', range(none, some(10)), 5, range(some(5), none)],
  ] as const)('%s', (_, given, date, expected) => {
    expect(DateRange.picked(given, day(date))).toEqual(expected)
  })
})

interface Picking {
  readonly calendar: CalendarUi.Model
  readonly range: DateRange.Range
}

const update = (model: Picking, message: CalendarUi.Message) => {
  const next = CalendarUi.update(model.calendar, message)
  const range = Option.match(Option.fromNullishOr(next.outMessage), {
    onNone: () => model.range,
    onSome: out =>
      CalendarUi.OutMessage.match<DateRange.Range>(out, {
        SelectedDate: ({ date }) => DateRange.picked(model.range, date),
        ChangedViewMonth: () => model.range,
      }),
  })
  return {
    model: modifyFields(model, { calendar: () => next.model, range: () => range }),
    commands: next.commands ?? [],
  }
}

const given = (chosen: DateRange.Range): Picking => ({
  calendar: CalendarUi.init({ id: 'trip', today: day(1) }),
  range: chosen,
})

const cell = (date: number) => Scene.selector(`#trip-cell-2026-2-${date}`)

const app = {
  update,
  view: (model: Picking, h: HtmlBuilder<CalendarUi.Message>) =>
    CalendarUi.view(
      model.calendar,
      { maybeSelectedDate: Option.none(), toView: DateRange.toView(model.range, [], { h }) },
      h,
    ),
}

describe('DateRange.toView', () => {
  it('marks the ends, and every day between them chosen', () => {
    Scene.scene(
      app,
      Scene.given(given(range(some(10), some(13)))),
      Scene.expect(cell(10)).toHaveAttr('data-range-start'),
      Scene.expect(cell(10)).toHaveAttr('data-in-range'),
      Scene.expect(cell(10)).not.toHaveAttr('data-range-end'),
      Scene.expect(cell(12)).toHaveAttr('data-in-range'),
      Scene.expect(cell(12)).toHaveAttr('aria-selected', 'true'),
      Scene.expect(cell(12)).not.toHaveAttr('data-range-start'),
      Scene.expect(cell(13)).toHaveAttr('data-range-end'),
      Scene.expect(cell(9)).not.toHaveAttr('data-in-range'),
      Scene.expect(cell(14)).not.toHaveAttr('data-in-range'),
      Scene.expect(cell(14)).toHaveAttr('aria-selected', 'false'),
      Scene.expectAll(Scene.all.selector('[data-in-range]')).toHaveCount(4),
    )
  })

  it('marks a start alone chosen, with no band until the end', () => {
    Scene.scene(
      app,
      Scene.given(given(range(some(10), none))),
      Scene.expect(cell(10)).toHaveAttr('data-range-start'),
      Scene.expect(cell(10)).toHaveAttr('aria-selected', 'true'),
      Scene.expectAll(Scene.all.selector('[data-in-range]')).toHaveCount(0),
    )
  })

  it('takes two presses as a range, the earlier one its start', () => {
    Scene.scene(
      app,
      Scene.given(given(DateRange.empty)),
      Scene.click(Scene.selector('#trip-cell-2026-2-20 button')),
      Scene.click(Scene.selector('#trip-cell-2026-2-16 button')),
      Scene.expect(cell(16)).toHaveAttr('data-range-start'),
      Scene.expect(cell(20)).toHaveAttr('data-range-end'),
      Scene.expectAll(Scene.all.selector('[data-in-range]')).toHaveCount(5),
    )
  })
})
