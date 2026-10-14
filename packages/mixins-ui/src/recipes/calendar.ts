/**
 * A month grid, in every mode the calendar has: days in seven columns, months
 * and years in three. Cell buttons read their state off the cell (today,
 * selected, focused, disabled, outside the month). `size` is the cell, on
 * the ladder's two steps. No card: a picker's panel or the page gives it one.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { CalendarSlots } from '../calendar.js'
import { ladder, role } from 'foldkit-mixins/theme'
import { component, focusRing, hover, ref, steps } from './design.js'

// Read on each cell, so a cell steps with the calendar's size or the region's.
const cell = ladder('height')

const quiet: StyleValue = component(
  Style.self({
    display: 'inline-grid',
    placeItems: 'center',
    minInlineSize: cell,
    blockSize: cell,
    padding: `0 ${ref.space.xs}`,
    border: '0',
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: ref.text.muted,
    font: 'inherit',
    ...role('body'),
    cursor: 'pointer',
  }),
  hover({ background: ref.surface.muted, color: ref.text.overt }),
  focusRing,
  Style.pseudo(':disabled', { opacity: '0.4', cursor: 'not-allowed' }),
)

/** A day, month or year button: its state is on the cell around it. */
const choice = (shape: 'round' | 'wide'): StyleValue =>
  component(
    Style.self({
      inlineSize: shape === 'round' ? cell : '100%',
      blockSize: cell,
      padding: '0',
      border: '0',
      borderRadius: shape === 'round' ? ref.radius.full : ref.radius.md,
      background: 'transparent',
      color: ref.text.default,
      font: 'inherit',
      ...role('body'),
      fontVariantNumeric: 'tabular-nums',
      cursor: 'pointer',
    }),
    hover({ background: ref.surface.muted }),
    Style.nest('[data-today] > &', { boxShadow: `inset 0 0 0 1px ${ref.outline.overt}` }),
    Style.nest('[data-outside-month] > &', { color: ref.text.muted }),
    Style.nest('[data-selected] > &, [data-selected] > &:hover', {
      background: ref.accent.default,
      color: ref.accent['on-fill'],
    }),
    Style.nest('[data-focused] > &', {
      outline: `${ref.border.thick} solid ${ref.outline.focus}`,
      outlineOffset: '-2px',
    }),
    Style.nest('[data-disabled] > &', { opacity: '0.4', cursor: 'not-allowed' }),
  )

const centered = component(Style.self({ display: 'grid', placeItems: 'center' }))
const week = component(
  Style.self({
    display: 'grid',
    gridTemplateColumns: `repeat(7, ${cell})`,
    gap: ref.space['3xs'],
  }),
)

export const Calendar = Style.recipeFor(CalendarSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space.xs, justifyItems: 'center' })),
    // The paging buttons at the ends, the heading between them; alone, as
    // when picking a month, the heading sits in the middle.
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ref.space.xs,
        justifySelf: 'stretch',
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.semibold,
      }),
    ),
    previousMonthButton: quiet,
    nextMonthButton: quiet,
    previousPageButton: quiet,
    nextPageButton: quiet,
    headingButton: component(
      quiet,
      Style.self({
        marginInline: 'auto',
        color: ref.text.overt,
        fontWeight: ref.weight.semibold,
      }),
    ),
    // Months and years fill a three-column grid; the day grid stacks its
    // weeks, and only it carries `aria-rowcount`.
    grid: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(4.5rem, 1fr))',
        gap: ref.space['3xs'],
      }),
      Style.pseudo('[aria-rowcount]', {
        display: 'flex',
        flexDirection: 'column',
      }),
    ),
    headerRow: week,
    columnHeader: component(
      Style.self({ color: ref.text.muted, ...role('caption'), textAlign: 'center' }),
    ),
    weekRow: week,
    dayCell: centered,
    dayButton: choice('round'),
    monthCell: centered,
    monthButton: choice('wide'),
    yearCell: centered,
    yearButton: choice('wide'),
  },
  variants: {
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
    },
  },
})
