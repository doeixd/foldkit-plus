/**
 * A tooltip: dotted trigger text with a dark pill beside it and an arrow at
 * the trigger. The pill reads on any ground, so no tone axis; `arrow: 'none'`
 * hides the arrow.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { TooltipSlots } from '../tooltip.js'
import { component, disabled, presence, ref, variant } from './design.js'
import { arrow } from './popover.js'

export const Tooltip = Style.recipeFor(TooltipSlots)({
  base: {
    trigger: component(
      Style.self({
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        ...role('body'),
        fontWeight: ref.weight.medium,
        textDecoration: 'underline dotted',
        textUnderlineOffset: '3px',
        cursor: 'default',
      }),
      // The contract lets the trigger disable; a dead trigger dims instead
      // of inviting hover it will not answer.
      disabled,
    ),
    panel: component(
      Style.self({
        maxInlineSize: 'min(20rem, 100% - 1rem)',
        paddingBlock: ref.space['3xs'],
        paddingInline: ref.space.xs,
        borderRadius: ref.radius.md,
        background: ref.text.overt,
        color: ref.surface.base,
        ...role('caption'),
        // Upstream's anchor, told of no arrow, makes the panel scroll, which
        // clips the arrow standing half outside it; a pill never scrolls.
        overflow: 'visible !important',
      }),
      // Fades in on the fast tier, sliding 4px toward its trigger from the side it opens on.
      presence('fast', { translate: '0 -4px' }),
      Style.pseudo('[data-placement="top"][data-closed]', { translate: '0 4px' }),
      Style.pseudo('[data-placement="left"][data-closed]', { translate: '4px 0' }),
      Style.pseudo('[data-placement="right"][data-closed]', { translate: '-4px 0' }),
    ),
    arrow: arrow({ fill: ref.text.overt, line: ref.text.overt, corner: ref.radius.md }),
  },
  variants: {
    arrow: {
      shown: {},
      none: { arrow: variant(Style.self({ display: 'none' })) },
    },
  },
  defaults: { arrow: 'shown' },
})
