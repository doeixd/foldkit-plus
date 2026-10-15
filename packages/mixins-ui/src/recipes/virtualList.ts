/**
 * A virtual list: a bordered box the list scrolls within, 18rem tall until
 * the application sizes it, whose rows are rungs of the size ladder with a
 * hairline between them and the hover fill.
 */
import { Style } from 'foldkit-mixins'
import { VirtualListSlots } from '../virtualList.js'
import { component, ref, rowOnLadder, transition, unfilledHover } from './design.js'

export const VirtualList = Style.recipeFor(VirtualListSlots)({
  base: {
    // One grid row of at least nothing, so upstream's scrolling list fits the box.
    root: component(
      Style.self({
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr)',
        blockSize: '18rem',
        overflow: 'hidden',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.md,
        background: ref.surface.default,
      }),
    ),
    row: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        ...rowOnLadder,
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        ...transition('background-color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover }),
    ),
  },
})
