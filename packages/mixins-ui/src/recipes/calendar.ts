/**
 * A month grid, in every mode the calendar has: days in seven columns (eight
 * with week numbers), months and years in three. The type follows shadcn's
 * and ReUI's: the heading in a medium weight, the weekday names and week
 * numbers small and muted, the days in tabular figures of the regular
 * weight, a chosen day in medium; a day outside the month is muted, today is
 * a quiet fill. Cell buttons read their state off the cell (today, selected,
 * focused, disabled, outside the month). A range's ends fill as a chosen day
 * does, and a band runs behind every day between them: each day cell's
 * `::before`, cut to the cell's inner half at either end, over weeks with no
 * gap between columns so the band is unbroken; it reads the marks
 * `Calendar.toView` adds. A range waiting for its end shows the days a hover
 * would add as a fainter band, its far end ringed. The caption is a heading
 * button, a label, or month and year selects centered between the paging
 * buttons, whose arrows the bidi algorithm mirrors right to left. `size` is
 * the cell, on the ladder's two steps; `outside: 'hidden'` leaves the days of
 * other months blank. No card: a picker's panel or the page gives it one.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { CalendarSlots } from '../calendar.js'
import { ladder, role } from 'foldkit-mixins/theme'
import {
  component,
  disabled,
  focusRing,
  hover,
  ref,
  steps,
  transition,
  unfilledHover,
  variant,
} from './design.js'

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
  hover({ background: unfilledHover, color: ref.text.overt }),
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
      fontWeight: ref.weight.normal,
      fontVariantNumeric: 'tabular-nums',
      cursor: 'pointer',
      ...transition('background-color, color'),
    }),
    hover({ background: unfilledHover }),
    Style.nest('[data-today] > &', {
      background: ref.surface.muted,
      color: ref.text.overt,
      fontWeight: ref.weight.medium,
    }),
    Style.nest('[data-outside-month] > &', { color: ref.text.muted }),
    Style.nest('[data-in-range] > &', { color: ref.accent.ink }),
    Style.nest('[data-selected] > &, [data-selected] > &:hover', {
      background: ref.accent.default,
      color: ref.accent['on-fill'],
      fontWeight: ref.weight.medium,
    }),
    Style.nest('[data-preview-end] > &', {
      boxShadow: `inset 0 0 0 ${ref.border.thin} ${ref.accent.default}`,
    }),
    Style.nest('[data-focused] > &', {
      outline: `${ref.border.thick} solid ${ref.outline.focus}`,
      outlineOffset: '-2px',
    }),
    Style.nest('[data-disabled] > &', {
      opacity: '0.4',
      cursor: 'not-allowed',
      textDecoration: 'line-through',
    }),
  )

const centered = component(Style.self({ display: 'grid', placeItems: 'center' }))
// As many columns as the row has cells: seven days, and a week number before them.
const week = component(
  Style.self({ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: cell }),
)

const band = (background: string): Declarations => ({
  content: "''",
  position: 'absolute',
  inset: '0',
  zIndex: '-1',
  background,
})

const day = component(
  centered,
  Style.self({ position: 'relative', isolation: 'isolate' }),
  Style.pseudo('[data-preview]::before', {
    ...band(`color-mix(in oklab, ${ref.accent.subtle} 50%, transparent)`),
  }),
  Style.pseudo('[data-in-range]::before', band(ref.accent.subtle)),
  Style.pseudo('[data-range-start]::before', { insetInlineStart: '50%' }),
  Style.pseudo('[data-range-end]::before', { insetInlineEnd: '50%' }),
)

/** The month and year selects: quiet until hovered, centered as a pair between the paging buttons. */
const select: Declarations = {
  blockSize: cell,
  paddingInline: ref.space.xs,
  border: `${ref.border.thin} solid transparent`,
  borderRadius: ref.radius.md,
  background: 'transparent',
  color: ref.text.overt,
  font: 'inherit',
  ...role('body'),
  fontWeight: ref.weight.medium,
  cursor: 'pointer',
}

const small: Declarations = {
  color: ref.text.muted,
  ...role('caption'),
  fontWeight: ref.weight.normal,
  textAlign: 'center',
}

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
        gap: ref.space['2xs'],
        justifySelf: 'stretch',
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.medium,
      }),
    ),
    heading: component(Style.self({ marginInline: 'auto', fontWeight: ref.weight.medium })),
    // Their arrows need no flip right to left: the bidi algorithm mirrors `‹` and `›` there.
    previousMonthButton: quiet,
    nextMonthButton: quiet,
    previousPageButton: quiet,
    nextPageButton: quiet,
    headingButton: component(
      quiet,
      Style.self({
        marginInline: 'auto',
        color: ref.text.overt,
        fontWeight: ref.weight.medium,
      }),
    ),
    monthSelect: component(
      Style.self({ ...select, marginInlineStart: 'auto' }),
      hover({ borderColor: ref.outline.default }),
      focusRing,
      disabled,
    ),
    yearSelect: component(
      Style.self({ ...select, marginInlineEnd: 'auto', fontVariantNumeric: 'tabular-nums' }),
      hover({ borderColor: ref.outline.default }),
      focusRing,
      disabled,
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
    weekNumberHeader: component(centered, Style.self(small)),
    columnHeader: component(Style.self(small)),
    weekRow: week,
    weekNumber: component(centered, Style.self({ ...small, fontVariantNumeric: 'tabular-nums' })),
    dayCell: day,
    dayButton: choice('round'),
    monthCell: centered,
    monthButton: choice('wide'),
    yearCell: centered,
    yearButton: choice('wide'),
    presets: component(
      Style.self({ display: 'grid', alignContent: 'start', gap: ref.space['3xs'] }),
    ),
    preset: component(
      quiet,
      Style.self({
        justifyContent: 'start',
        justifyItems: 'start',
        inlineSize: '100%',
        color: ref.text.default,
        textAlign: 'start',
      }),
      Style.pseudo('[aria-pressed="true"]', {
        background: ref.surface.muted,
        color: ref.text.overt,
        fontWeight: ref.weight.medium,
      }),
    ),
  },
  variants: {
    size: {
      sm: { root: steps.sm, presets: steps.sm },
      md: { root: steps.md, presets: steps.md },
    },
    outside: {
      shown: {},
      // Blank, band and all; the grid keeps its six rows, so the size does not jump between months.
      hidden: { dayCell: variant(Style.pseudo('[data-outside-month]', { visibility: 'hidden' })) },
    },
  },
  defaults: { outside: 'shown' },
})
