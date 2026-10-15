/**
 * The Calendar with a range drawn on it: the start and end days filled as a
 * chosen day is, and a band behind every day between them. The band is each
 * day cell's `::before`, cut to the cell's inner half at either end, so the
 * weeks lose the gap the Calendar puts between columns and the band runs
 * unbroken. It reads the marks `DateRange.toView` adds.
 */
import { Style } from 'foldkit-mixins'
import { Calendar } from './calendar.js'
import { component, ref } from './design.js'

const ends = [
  '[data-range-start] > &',
  '[data-range-start] > &:hover',
  '[data-range-end] > &',
  '[data-range-end] > &:hover',
].join(', ')

const joined = component(Style.self({ columnGap: '0' }))

export const DateRange = Calendar.extend({
  base: {
    headerRow: joined,
    weekRow: joined,
    dayCell: component(
      Style.self({ position: 'relative', isolation: 'isolate' }),
      Style.pseudo('[data-in-range]::before', {
        content: "''",
        position: 'absolute',
        inset: '0',
        zIndex: '-1',
        background: ref.accent.subtle,
      }),
      Style.pseudo('[data-range-start]::before', { insetInlineStart: '50%' }),
      Style.pseudo('[data-range-end]::before', { insetInlineEnd: '50%' }),
    ),
    // After the Calendar's own rules, so an end outside the month or under
    // the pointer keeps its fill.
    dayButton: component(
      Style.nest(ends, { background: ref.accent.default, color: ref.accent['on-fill'] }),
    ),
  },
})
