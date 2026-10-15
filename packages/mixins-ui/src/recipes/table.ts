/**
 * A plain table: hairline rows with room to read, headings small and muted,
 * numbers end-aligned through `data-numeric`. Sorting, selection, and
 * paging live where the data lives; this is the table underneath them.
 */
import { Style } from 'foldkit-mixins'
import { TableSlots } from '../table.js'
import { ladder, role } from 'foldkit-mixins/theme'
import { component, glide, ref, transition } from './design.js'

const lit = '[data-fluid-lit]'

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
    ),
    row: component(
      Style.self({
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        ...transition('border-color, color'),
      }),
      // The lit row's lines, above and below it, go, and its text lifts.
      Style.nest(`&${lit}, &:has(+ ${lit})`, { borderBlockEndColor: 'transparent' }),
      Style.nest(`&${lit}`, { color: ref.text.overt }),
    ),
    cell: component(
      Style.self({ blockSize: ladder('height'), paddingBlock: '0', paddingInline: ladder('pad') }),
      Style.nest('&[data-numeric]', { textAlign: 'end' }),
    ),
  },
})
