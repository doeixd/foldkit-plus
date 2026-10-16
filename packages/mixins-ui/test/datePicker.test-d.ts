/**
 * The forked date picker's inputs: one day, as upstream's, or a whole
 * selection, whose trigger is handed the selection; never both at once.
 */
import { Option } from 'effect'
import type * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import type { HtmlBuilder } from 'foldkit/html'
import { expectTypeOf, test } from 'vitest'
import { Calendar, type DatePickerViewInputs } from '../src/index.js'

declare const h: HtmlBuilder<UpstreamDatePicker.Message>
const shared = {
  anchor: { placement: 'bottom-start' },
  toCalendarView: () => h.div([], []),
} as const

test('a selection types its trigger content by itself', () => {
  const inputs = {
    ...shared,
    selection: Calendar.empty('Range'),
    triggerContent: selection => {
      expectTypeOf(selection).toEqualTypeOf<Calendar.Selection>()
      return h.span([], [])
    },
  } satisfies DatePickerViewInputs
  expectTypeOf(inputs).toExtend<DatePickerViewInputs>()
})

test('one day and a selection together are refused', () => {
  const both = {
    ...shared,
    selection: Calendar.empty('Range'),
    maybeSelectedDate: Option.none(),
    triggerContent: () => h.span([], []),
  }
  // @ts-expect-error A picker shows one day or a selection, not both.
  const refused: DatePickerViewInputs = both
  expectTypeOf(refused).not.toBeAny()
})
