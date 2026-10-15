/**
 * A scroll area: the box scrolls instead of the page, chained scrolling
 * stops at its edge, and the bars stay thin: the overlay bars of
 * `scrollBars.ts` where `ScrollBars` runs, the browser's own, thin, where it
 * does not (a coarse pointer). A hairline marks an edge with more past it.
 * The orientation chooses which axes may scroll; the height that makes it
 * scroll stays the caller's.
 */
import { Style } from 'foldkit-mixins'
import { Utilities } from 'foldkit-mixins/utilities'
import { ScrollAreaSlots } from '../scrollArea.js'
import { component, focusRing, ref, variant } from './design.js'
import { bar, overlaid, thumb } from './scrollBars.js'

const bars = Style.compose(
  Style.self({
    scrollbarWidth: 'thin',
    scrollbarColor: `${ref.outline.default} transparent`,
  }),
  Style.nest('&::-webkit-scrollbar', { width: '8px', height: '8px' }),
  Style.nest('&::-webkit-scrollbar-thumb', {
    background: ref.outline.default,
    borderRadius: ref.radius.full,
  }),
)

export const ScrollArea = Style.recipeFor(ScrollAreaSlots)({
  base: {
    // The viewport fills the root, so the bars over the root lie over its edges.
    root: component(Style.self({ position: 'relative', display: 'grid', minBlockSize: '0' })),
    viewport: component(
      Style.self({ overscrollBehavior: 'contain', minBlockSize: '0' }),
      bars,
      overlaid,
      focusRing,
    ),
    bar,
    thumb,
  },
  variants: {
    orientation: {
      // Content dissolves toward an edge with more to scroll, and a line marks it.
      vertical: {
        root: variant(Utilities.scrollDivider('block')),
        viewport: variant(
          Style.self({ overflowBlock: 'auto', overflowInline: 'hidden' }),
          Utilities.scrollFade('block'),
          Utilities.scrollTimeline('block'),
        ),
      },
      horizontal: {
        root: variant(Utilities.scrollDivider('inline')),
        viewport: variant(
          Style.self({ overflowBlock: 'hidden', overflowInline: 'auto' }),
          Utilities.scrollFade('inline'),
          Utilities.scrollTimeline('inline'),
        ),
      },
      both: {
        viewport: variant(Style.self({ overflow: 'auto' })),
      },
    },
  },
  defaults: { orientation: 'vertical' },
})
