/**
 * A card: the base surface with a hairline border, a large radius, and a
 * soft shadow; the header stacks the title over the description, the footer
 * spreads its action to the end. Padding is the one axis: media-heavy cards
 * go flush, text cards breathe.
 */
import { Style } from 'foldkit-mixins'
import { CardSlots } from '../card.js'
import { component, ref, variant } from './design.js'

export const Card = Style.recipeFor(CardSlots)({
  base: {
    root: component(
      Style.self({
        background: ref.surface.base,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        boxShadow: ref.shadow.sm,
        overflow: 'clip',
      }),
    ),
    header: component(Style.self({ display: 'grid', gap: ref.space['3xs'], paddingBlockEnd: '0' })),
    title: component(
      Style.self({
        margin: '0',
        fontSize: ref.size.lg,
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    description: component(
      Style.self({ margin: '0', fontSize: ref.size.sm, color: ref.text.muted }),
    ),
    content: component(Style.self({ display: 'block' })),
    footer: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: ref.space.sm,
        paddingBlockStart: '0',
      }),
    ),
    action: component(Style.self({ display: 'contents' })),
  },
  variants: {
    padding: {
      comfortable: {
        header: variant(Style.self({ padding: ref.space.md, paddingBlockEnd: '0' })),
        content: variant(Style.self({ padding: ref.space.md })),
        footer: variant(Style.self({ padding: ref.space.md, paddingBlockStart: '0' })),
      },
      roomy: {
        header: variant(Style.self({ padding: ref.space.lg, paddingBlockEnd: '0' })),
        content: variant(Style.self({ padding: ref.space.lg })),
        footer: variant(Style.self({ padding: ref.space.lg, paddingBlockStart: '0' })),
      },
      flush: {
        header: variant(Style.self({ padding: '0' })),
        content: variant(Style.self({ padding: '0' })),
        footer: variant(Style.self({ padding: '0' })),
      },
    },
  },
  defaults: { padding: 'comfortable' },
})
