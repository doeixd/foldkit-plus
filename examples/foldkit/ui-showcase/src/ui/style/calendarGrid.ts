/**
 * The calendar the Calendar and Date Picker pages both draw: the month's day
 * grid, and the month and year pickers its heading opens. `@foldkit/ui` marks
 * each cell `data-today`, `data-selected`, `data-focused`, `data-outside-month`
 * or `data-disabled`, which the cell's button reads.
 */
import { Style, type NamedStyle, type StyleValue } from 'foldkit-mixins'
import { CalendarSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { container, icon } from './shared.js'

export const calendarGridSlots = {
  calendarHeader: container,
  monthsHeader: container,
  yearsHeading: container,
  navIcon: container,
  headingIcon: container,
} as const

const header = Style.self({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: t.space.xs,
})

const headingText = Style.self({
  fontSize: t.size.sm,
  fontWeight: t.weight.semibold,
  fontVariantNumeric: 'tabular-nums',
  color: t.text.overt,
})

export const calendarGridStyles = {
  calendarHeader: header,
  monthsHeader: Style.compose(header, Style.self({ justifyContent: 'center' })),
  yearsHeading: Style.compose(headingText, Style.self({ margin: '0' })),
  navIcon: icon('1.25rem'),
  headingIcon: icon('0.75rem'),
} as const

const ghostButton = (hover: string): StyleValue =>
  Style.compose(
    Style.self({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      border: '0',
      background: 'transparent',
      font: 'inherit',
      cursor: 'pointer',
    }),
    Style.pseudo(':hover', { background: hover }),
  )

const navButton = Style.compose(
  ghostButton(t.surface.muted),
  Style.self({ width: '2rem', height: '2rem', borderRadius: t.radius.md, color: t.text.muted }),
)

const row = Style.self({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' })

const cell = Style.self({ display: 'flex', alignItems: 'center', justifyContent: 'center' })

/**
 * The month and year pickers lay their cells out three by four; the day
 * grid, the one that counts its rows with `aria-rowcount`, stacks its weeks.
 */
const grid = Style.compose(
  Style.self({
    flex: '1',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(4, 1fr)',
    gap: '0.25rem',
    outline: 'none',
  }),
  Style.pseudo('[aria-rowcount]', { flex: 'none', display: 'flex', flexDirection: 'column' }),
)

/** A day, month or year button, read from its cell's state. */
const cellButton = (shape: StyleValue): StyleValue =>
  Style.compose(
    ghostButton(t.surface.muted),
    shape,
    Style.self({
      fontSize: t.size.sm,
      fontVariantNumeric: 'tabular-nums',
      color: t.text.overt,
    }),
    Style.nest('[data-today] > &', { boxShadow: `0 0 0 1px ${t.outline.overt}` }),
    Style.nest('[data-outside-month] > &', { color: t.text.muted }),
    Style.nest('[data-selected] > &, [data-selected] > &:hover', {
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    Style.nest('[data-focused] > &', {
      outline: `${t.border.thick} solid ${t.accent.default}`,
      outlineOffset: '2px',
    }),
    Style.nest('[data-disabled] > &', { opacity: '0.4', cursor: 'not-allowed' }),
  )

/** The grid's look; `root` is the frame, which differs on the two pages. */
const calendarPieces = (root: StyleValue) =>
  ({
    root: Style.compose(
      Style.self({ display: 'flex', flexDirection: 'column', gap: t.space.sm, userSelect: 'none' }),
      root,
    ),
    previousMonthButton: navButton,
    nextMonthButton: navButton,
    previousPageButton: navButton,
    nextPageButton: navButton,
    headingButton: Style.compose(
      ghostButton(t.surface.muted),
      headingText,
      Style.self({
        gap: t.space.xs,
        padding: `${t.space['2xs']} ${t.space.xs}`,
        borderRadius: t.radius.md,
      }),
    ),
    grid,
    headerRow: row,
    weekRow: row,
    columnHeader: Style.self({
      paddingBlock: t.space['2xs'],
      textAlign: 'center',
      fontSize: t.size.xs,
      fontWeight: t.weight.medium,
      letterSpacing: '0.025em',
      textTransform: 'uppercase',
      color: t.text.muted,
    }),
    dayCell: cell,
    monthCell: cell,
    yearCell: cell,
    dayButton: cellButton(
      Style.self({ width: '2.25rem', height: '2.25rem', borderRadius: t.radius.full }),
    ),
    monthButton: cellButton(
      Style.self({ width: '100%', height: '100%', borderRadius: t.radius.md }),
    ),
    yearButton: cellButton(
      Style.self({ width: '100%', height: '100%', borderRadius: t.radius.md }),
    ),
  }) as const

/** `foldkit-mixins-ui` ships no Calendar recipe; this is upstream's card. */
export const CardCalendarStyle: NamedStyle<typeof CalendarSlots> = forSlots(CalendarSlots)(
  calendarPieces(
    Style.self({
      display: 'inline-flex',
      minWidth: '304px',
      minHeight: '324px',
      padding: t.space.md,
      border: `${t.border.thin} solid ${t.outline.subtle}`,
      borderRadius: t.radius.xl,
      background: t.surface.base,
      boxShadow: '0 1px 2px rgb(0 0 0 / 5%)',
    }),
  ),
  { name: 'CardCalendarStyle' },
)

/** Inside the Date Picker's panel, which is the card. */
export const PanelCalendarStyle: NamedStyle<typeof CalendarSlots> = forSlots(CalendarSlots)(
  calendarPieces(Style.self({ minWidth: '268px', minHeight: '284px' })),
  { name: 'PanelCalendarStyle' },
)
