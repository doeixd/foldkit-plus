/**
 * A plain table: hairline rows with room to read, headings small and muted,
 * numbers end-aligned through `data-numeric`. A sortable heading is a quiet
 * button whose chevron shows on hover and turns with `aria-sort`; a chosen
 * row takes an accent wash and an open one loses its line, so its detail
 * reads as its own. The washes are see-through, so the `fluid` highlight
 * behind the rows still shows. `rows` lines, stripes or leaves them plain,
 * `density` steps the rows down or up the ladder (unset, they follow the
 * region), and `header: 'sticky'` holds the headings at the top of a
 * scrolling ancestor, on the page's base surface (`.extend` its `headerCell`
 * for a table on another).
 */
import { Style } from 'foldkit-mixins'
import { Utilities } from 'foldkit-mixins/utilities'
import { TableSlots } from '../table.js'
import { ladder, role } from 'foldkit-mixins/theme'
import {
  component,
  cornerSides,
  focusRing,
  glide,
  ref,
  steps,
  transition,
  travelled,
  variant,
} from './design.js'

const lit = '[data-fluid-lit]'

// A chosen row's wash and a stripe, mixed with nothing so the highlight shows through.
const chosenWash = `color-mix(in oklab, ${ref.accent.default} ${ref.knob['state-hover']}, transparent)`
const stripe = `color-mix(in oklab, currentColor calc(${ref.knob['state-tint']} / 2), transparent)`

// A button with no look of its own: the heading or the cell draws it.
const bare = {
  appearance: 'none',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  letterSpacing: 'inherit',
  textTransform: 'inherit',
  cursor: 'pointer',
} as const

const chevron = {
  inlineSize: '0.4em',
  blockSize: '0.4em',
  ...cornerSides(ref.border.thick, 'currentColor'),
  transitionProperty: 'rotate, opacity',
  transitionDuration: `${travelled(ref.motion.fast)}, ${ref.motion.fast}`,
  transitionTimingFunction: ref.motion.settle,
} as const

export const Table = Style.recipeFor(TableSlots)({
  base: {
    // A positioned box for the highlight, under the rows (`fluid`).
    frame: component(Style.self({ position: 'relative', isolation: 'isolate' })),
    highlight: component(
      Style.self({
        position: 'absolute',
        // Physical: the Mount measures from the left, in either direction.
        top: '0',
        left: '0',
        zIndex: '-1',
        inlineSize: 'var(--fk-table-hover-w)',
        blockSize: 'var(--fk-table-hover-h)',
        translate: 'var(--fk-table-hover-x) var(--fk-table-hover-y)',
        opacity: 'var(--fk-table-hover-shown)',
        borderRadius: ref.radius.md,
        background: ref.state.hover,
        pointerEvents: 'none',
        ...glide('fast', 'var(--fk-table-hover-moving)'),
      }),
    ),
    root: component(
      Style.self({
        inlineSize: '100%',
        borderCollapse: 'collapse',
        ...role('body'),
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    caption: component(
      Style.self({
        textAlign: 'start',
        paddingBlockEnd: ref.space.sm,
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    headerRow: component(
      Style.self({
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.default}`,
        ...transition('border-color'),
      }),
      // The first row lit: the line above it goes too, so the highlight sits clean.
      Style.nest(`:where(table:has(tbody > tr:first-child${lit})) &`, {
        borderBlockEndColor: 'transparent',
      }),
    ),
    headerCell: component(
      Style.self({
        // A table cell's height is its least: each row is a rung of the ladder.
        blockSize: ladder('height'),
        paddingBlock: '0',
        paddingInline: ladder('pad'),
        textAlign: 'start',
        ...role('caption'),
        fontWeight: ref.weight.medium,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
        color: ref.text.muted,
      }),
      Style.nest('&[data-numeric]', { textAlign: 'end' }),
      Style.nest('&[aria-sort]', { color: ref.text.overt }),
    ),
    sortButton: component(
      Style.self({
        ...bare,
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space['2xs'],
        borderRadius: ref.radius.sm,
        ...transition('color'),
      }),
      Style.pseudo(':hover', { color: ref.text.overt }),
      focusRing,
    ),
    // Pointing down, hidden until the heading is pointed at or sorts the rows.
    sortIcon: component(
      Style.self({ ...chevron, rotate: '45deg', translate: '0 -0.1em', opacity: '0' }),
      Style.nest(':where(:hover, :focus-visible) > &', { opacity: '0.5' }),
      Style.nest(':where([aria-sort]) > * > &', { opacity: '1' }),
      Style.nest(':where([aria-sort="ascending"]) > * > &', {
        rotate: '-135deg',
        translate: '0 0.1em',
      }),
    ),
    row: component(
      Style.self({
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        ...transition('border-color, color, background-color'),
      }),
      // The lit row's lines, above and below it, go, and its text lifts.
      Style.nest(`&${lit}, &:has(+ ${lit})`, { borderBlockEndColor: 'transparent' }),
      Style.nest(`&${lit}`, { color: ref.text.overt }),
      Style.nest('&[data-selected]', { background: chosenWash }),
      // An open row and its detail read as one.
      Style.nest('&[data-expanded]', { borderBlockEndColor: 'transparent' }),
    ),
    cell: component(
      Style.self({ blockSize: ladder('height'), paddingBlock: '0', paddingInline: ladder('pad') }),
      Style.nest('&[data-numeric]', { textAlign: 'end' }),
    ),
    controlCell: component(
      Style.self({
        // As narrow as what it holds.
        inlineSize: '1%',
        blockSize: ladder('height'),
        paddingBlock: '0',
        paddingInlineStart: ladder('pad'),
        paddingInlineEnd: '0',
        verticalAlign: 'middle',
        lineHeight: '0',
      }),
    ),
    checkboxLabel: component(Utilities.srOnly),
    expandButton: component(
      Style.self({
        ...bare,
        display: 'inline-grid',
        placeItems: 'center',
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
        borderRadius: ref.radius.sm,
        color: ref.text.muted,
        ...transition('color, background-color'),
      }),
      Style.pseudo(':is(:hover, :active)', { color: ref.text.overt, background: ref.state.hover }),
      focusRing,
    ),
    // Pointing along the row shut, down open.
    expandIcon: component(
      Style.self({ ...chevron, rotate: '-45deg' }),
      Style.nest('&:where(:dir(rtl))', { rotate: '135deg' }),
      Style.nest(':where([aria-expanded="true"]) > &', { rotate: '45deg' }),
    ),
    detailRow: component(
      Style.self({
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        ...transition('border-color'),
      }),
      Style.nest(`&:has(+ ${lit})`, { borderBlockEndColor: 'transparent' }),
    ),
    detailCell: component(
      Style.self({
        paddingBlock: ref.space.sm,
        paddingInline: ladder('pad'),
        color: ref.text.muted,
      }),
    ),
    emptyCell: component(Style.self({ padding: ref.space.md })),
  },
  variants: {
    rows: {
      lined: {},
      striped: {
        row: variant(
          Style.self({ borderBlockEndColor: 'transparent' }),
          // A chosen row keeps its wash.
          Style.nest(
            '&:nth-child(even of :not([data-detail], [data-empty])):not([data-selected])',
            {
              background: stripe,
            },
          ),
        ),
        detailRow: variant(Style.self({ borderBlockEndColor: 'transparent' })),
      },
      plain: {
        row: variant(Style.self({ borderBlockEndColor: 'transparent' })),
        detailRow: variant(Style.self({ borderBlockEndColor: 'transparent' })),
      },
    },
    density: {
      compact: { root: steps.sm },
      regular: { root: steps.md },
      comfortable: { root: steps.lg },
    },
    header: {
      static: {},
      // The row's line belongs to the row, which does not stick: each heading draws its own.
      sticky: {
        headerCell: variant(
          Style.self({
            position: 'sticky',
            insetBlockStart: '0',
            zIndex: '1',
            background: ref.surface.base,
            boxShadow: `inset 0 calc(-1 * ${ref.border.thin}) 0 ${ref.outline.default}`,
          }),
        ),
      },
    },
  },
  defaults: { rows: 'lined', header: 'static' },
})
