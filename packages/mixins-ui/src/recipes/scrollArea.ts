/**
 * A scroll area: the box scrolls instead of the page, chained scrolling
 * stops at its edge, and the bars stay thin. The orientation chooses which
 * axes may scroll; the height that makes it scroll stays the caller's.
 */
import { Style } from 'foldkit-mixins'
import { ScrollAreaSlots } from '../scrollArea.js'
import { component, focusRing, ref, variant } from './design.js'

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
    viewport: component(Style.self({ overscrollBehavior: 'contain' }), bars, focusRing),
  },
  variants: {
    orientation: {
      vertical: {
        viewport: variant(Style.self({ overflowBlock: 'auto', overflowInline: 'hidden' })),
      },
      horizontal: {
        viewport: variant(Style.self({ overflowBlock: 'hidden', overflowInline: 'auto' })),
      },
      both: {
        viewport: variant(Style.self({ overflow: 'auto' })),
      },
    },
  },
  defaults: { orientation: 'vertical' },
})
