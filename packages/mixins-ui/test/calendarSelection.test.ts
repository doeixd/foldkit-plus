/**
 * The Calendar's selection: `picked` folds a day into each mode (Single takes
 * it; Range takes a start, then an end, the two swapped when the end comes
 * first, then a new start; Multiple adds or removes it), `isComplete` says
 * when a picker may close, and `toView` marks the Calendar's day cells. The
 * band itself is the recipe's CSS, checked in `calendar.browser.test.ts`.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import * as CalendarUi from '@foldkit/ui/calendar'
import * as Dates from 'foldkit/calendar'
import { modifyFields } from 'foldkit/struct'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import { Calendar } from '../src/index.js'
import { h } from './fixture.js'

const { Selection } = Calendar

const day = (date: number) => Dates.make(2026, 2, date)
const single = (date: Option.Option<number>) => Selection.Single({ date: Option.map(date, day) })
const range = (start: Option.Option<number>, end: Option.Option<number>) =>
  Selection.Range({ start: Option.map(start, day), end: Option.map(end, day) })
const multiple = (...dates: ReadonlyArray<number>) => Selection.Multiple({ dates: dates.map(day) })
const none = Option.none<number>()
const some = Option.some<number>

describe('Calendar.picked', () => {
  it.each([
    ['single, nothing chosen: the day', single(none), 12, single(some(12))],
    ['single, a day chosen: the new day', single(some(3)), 12, single(some(12))],
    ['range, nothing chosen: the day starts', range(none, none), 12, range(some(12), none)],
    ['range, a start: a later day ends', range(some(10), none), 14, range(some(10), some(14))],
    [
      'range, a start: an earlier day ends, the two swapped',
      range(some(10), none),
      3,
      range(some(3), some(10)),
    ],
    [
      'range, a start: the same day ends, one day long',
      range(some(10), none),
      10,
      range(some(10), some(10)),
    ],
    [
      'range, a whole range: the day starts again',
      range(some(3), some(10)),
      20,
      range(some(20), none),
    ],
    ['range, an end with no start: the day starts', range(none, some(10)), 5, range(some(5), none)],
    ['multiple, nothing chosen: the day', multiple(), 12, multiple(12)],
    ['multiple: an earlier day goes in order', multiple(5, 20), 12, multiple(5, 12, 20)],
    ['multiple: a chosen day is removed', multiple(5, 12, 20), 12, multiple(5, 20)],
  ] as const)('%s', (_, given, date, expected) => {
    expect(Calendar.picked(given, day(date))).toEqual(expected)
  })
})

describe('Calendar.isComplete', () => {
  it.each([
    ['single, nothing chosen', single(none), false],
    ['single, a day', single(some(3)), true],
    ['range, a start alone', range(some(3), none), false],
    ['range, both ends', range(some(3), some(9)), true],
    ['multiple, however many days', multiple(1, 2, 3), false],
  ] as const)('%s: %s', (_, selection, whole) => {
    expect(Calendar.isComplete(selection)).toBe(whole)
  })
})

describe('Calendar.selectedDate and Calendar.empty', () => {
  it("is a Single selection's day, and nothing for the others", () => {
    expect(Calendar.selectedDate(single(some(4)))).toEqual(Option.some(day(4)))
    expect(Calendar.selectedDate(range(some(4), some(6)))).toEqual(Option.none())
    expect(Calendar.selectedDate(multiple(4))).toEqual(Option.none())
  })

  it('makes each mode with nothing chosen', () => {
    expect(Calendar.empty('Single')).toEqual(single(none))
    expect(Calendar.empty('Range')).toEqual(range(none, none))
    expect(Calendar.empty('Multiple')).toEqual(multiple())
  })
})

interface Picking {
  readonly calendar: CalendarUi.Model
  readonly selection: Calendar.Selection
}

const update = (model: Picking, message: CalendarUi.Message) => {
  const next = CalendarUi.update(model.calendar, message)
  const selection = Option.match(Option.fromNullishOr(next.outMessage), {
    onNone: () => model.selection,
    onSome: out =>
      CalendarUi.OutMessage.match<Calendar.Selection>(out, {
        SelectedDate: ({ date }) => Calendar.picked(model.selection, date),
        ChangedViewMonth: () => model.selection,
      }),
  })
  return {
    model: modifyFields(model, { calendar: () => next.model, selection: () => selection }),
    commands: next.commands ?? [],
  }
}

const given = (selection: Calendar.Selection): Picking => ({
  calendar: CalendarUi.init({ id: 'trip', today: day(1) }),
  selection,
})

const cell = (date: number) => Scene.selector(`#trip-cell-2026-2-${date}`)
const press = (date: number) => Scene.click(Scene.selector(`#trip-cell-2026-2-${date} button`))

// Upstream marks nothing: every mark comes from `toView`.
const app = {
  update,
  view: (model: Picking, h: HtmlBuilder<CalendarUi.Message>) =>
    CalendarUi.view(
      model.calendar,
      {
        maybeSelectedDate: Option.none(),
        toView: Calendar.toView(model.selection, [], { h }),
      },
      h,
    ),
}

describe('Calendar.toView', () => {
  it('marks a Single selection’s day chosen, and no other', () => {
    Scene.scene(
      app,
      Scene.given(given(single(some(10)))),
      Scene.expect(cell(10)).toHaveAttr('data-selected'),
      Scene.expect(cell(10)).toHaveAttr('aria-selected', 'true'),
      Scene.expectAll(Scene.all.selector('[data-selected]')).toHaveCount(1),
      Scene.expect(cell(11)).toHaveAttr('aria-selected', 'false'),
    )
  })

  it('marks the ends, and every day between them chosen', () => {
    Scene.scene(
      app,
      Scene.given(given(range(some(10), some(13)))),
      Scene.expect(cell(10)).toHaveAttr('data-range-start'),
      Scene.expect(cell(10)).toHaveAttr('data-selected'),
      Scene.expect(cell(10)).toHaveAttr('data-in-range'),
      Scene.expect(cell(10)).not.toHaveAttr('data-range-end'),
      Scene.expect(cell(12)).toHaveAttr('data-in-range'),
      Scene.expect(cell(12)).toHaveAttr('aria-selected', 'true'),
      Scene.expect(cell(12)).not.toHaveAttr('data-selected'),
      Scene.expect(cell(12)).not.toHaveAttr('data-range-start'),
      Scene.expect(cell(13)).toHaveAttr('data-range-end'),
      Scene.expect(cell(13)).toHaveAttr('data-selected'),
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

  it('marks every day of a Multiple selection, and no band', () => {
    Scene.scene(
      app,
      Scene.given(given(multiple(3, 17, 24))),
      Scene.expect(cell(3)).toHaveAttr('data-selected'),
      Scene.expect(cell(17)).toHaveAttr('data-selected'),
      Scene.expect(cell(24)).toHaveAttr('aria-selected', 'true'),
      Scene.expect(cell(10)).toHaveAttr('aria-selected', 'false'),
      Scene.expectAll(Scene.all.selector('[data-selected]')).toHaveCount(3),
      Scene.expectAll(Scene.all.selector('[data-in-range]')).toHaveCount(0),
    )
  })

  it('takes two presses as a range, the earlier one its start', () => {
    Scene.scene(
      app,
      Scene.given(given(Calendar.empty('Range'))),
      press(20),
      press(16),
      Scene.expect(cell(16)).toHaveAttr('data-range-start'),
      Scene.expect(cell(20)).toHaveAttr('data-range-end'),
      Scene.expectAll(Scene.all.selector('[data-in-range]')).toHaveCount(5),
    )
  })

  it('takes a second press on a chosen day as removing it', () => {
    Scene.scene(
      app,
      Scene.given(given(Calendar.empty('Multiple'))),
      press(4),
      press(9),
      press(4),
      Scene.expect(cell(4)).not.toHaveAttr('data-selected'),
      Scene.expect(cell(9)).toHaveAttr('data-selected'),
    )
  })

  it.each([
    ['a Single', single(some(10)), false],
    ['a Range', range(some(10), some(13)), true],
    ['a Multiple', multiple(3, 17), true],
  ] as const)('says whether the grid holds many days, for %s selection', (_, selection, many) => {
    const grid = Scene.expect(Scene.role('grid'))
    Scene.scene(
      app,
      Scene.given(given(selection)),
      many
        ? grid.toHaveAttr('aria-multiselectable', 'true')
        : grid.not.toHaveAttr('aria-multiselectable'),
    )
  })
})

describe('Calendar.inputs', () => {
  it.each([
    ['a Single selection: its day', single(some(10)), Option.some(day(10))],
    ['a Range: nothing, its days marked by toView', range(some(10), some(13)), Option.none()],
  ] as const)('gives upstream %s', (_, selection, expected) => {
    expect(Calendar.inputs(selection, [], { h }).maybeSelectedDate).toEqual(expected)
  })
})
