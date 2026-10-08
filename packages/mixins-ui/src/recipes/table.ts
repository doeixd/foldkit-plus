/**
 * A plain table: hairline rows with room to read, headings small and muted,
 * numbers end-aligned through `data-numeric`. Sorting, selection, and
 * paging live where the data lives; this is the table underneath them.
 */
import { Style } from 'foldkit-mixins'
import { TableSlots } from '../table.js'
import { component, ref } from './design.js'

export const Table = Style.recipeFor(TableSlots)({
  base: {
    root: component(
      Style.self({
        inlineSize: '100%',
        borderCollapse: 'collapse',
        fontSize: ref.size.sm,
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
      Style.self({ borderBlockEnd: `${ref.border.thin} solid ${ref.outline.default}` }),
    ),
    headerCell: component(
      Style.self({
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.sm,
        textAlign: 'start',
        fontSize: ref.size.xs,
        fontWeight: ref.weight.medium,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
        color: ref.text.muted,
      }),
    ),
    row: component(
      Style.self({ borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}` }),
    ),
    cell: component(
      Style.self({ paddingBlock: ref.space.xs, paddingInline: ref.space.sm }),
      Style.nest('&[data-numeric]', { textAlign: 'end' }),
    ),
  },
})
