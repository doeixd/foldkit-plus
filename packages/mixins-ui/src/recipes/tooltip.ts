/**
 * A tooltip: dotted trigger text with a dark pill beside it. The pill reads
 * on any ground, so no tone axis. No axes.
 */
import { Style } from 'foldkit-mixins'
import { TooltipSlots } from '../tooltip.js'
import { component, ref } from './design.js'

export const Tooltip = Style.recipeFor(TooltipSlots)({
  base: {
    trigger: component(
      Style.self({
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontSize: ref.size.sm,
        fontWeight: ref.weight.medium,
        textDecoration: 'underline dotted',
        textUnderlineOffset: '3px',
        cursor: 'default',
      }),
    ),
    panel: component(
      Style.self({
        display: 'inline-block',
        marginInlineStart: ref.space.xs,
        paddingBlock: ref.space['3xs'],
        paddingInline: ref.space.xs,
        borderRadius: ref.radius.md,
        background: ref.text.overt,
        color: ref.surface.base,
        fontSize: ref.size.xs,
      }),
    ),
  },
})
