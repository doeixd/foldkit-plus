/**
 * A virtual list: a bordered box the list scrolls within, 18rem tall until
 * the application sizes it, whose rows are rungs of the size ladder with a
 * hairline between them and the hover fill. The overlay bar of
 * `scrollBars.ts` stands over the list's edge where `ScrollBars` runs.
 */
import { Style } from 'foldkit-mixins'
import { VirtualListSlots } from '../virtualList.js'
import { component, ref, rowOnLadder, transition, unfilledHover } from './design.js'
import { bar, overlaidChild, thumb } from './scrollBars.js'

export const VirtualList = Style.recipeFor(VirtualListSlots)({
  base: {
    // One grid cell of at least nothing, so upstream's scrolling list fits the
    // box. The box fills its container's width, and where the container takes
    // its width from the box (an inline block, a flex item), the box offers a
    // fixed 20rem, not its rows: sized by the rows drawn it took the widest and
    // changed width as the list scrolled.
    root: Style.compose(
      component(
        Style.self({
          position: 'relative',
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns: 'minmax(0, 1fr)',
          inlineSize: '100%',
          contain: 'inline-size',
          containIntrinsicInlineSize: '20rem',
          blockSize: '18rem',
          overflow: 'hidden',
          border: `${ref.border.thin} solid ${ref.outline.subtle}`,
          borderRadius: ref.radius.md,
          background: ref.surface.default,
        }),
      ),
      overlaidChild,
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
    bar,
    thumb,
  },
})
