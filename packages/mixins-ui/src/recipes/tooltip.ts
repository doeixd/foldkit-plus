/**
 * A tooltip: dotted trigger text with a dark pill beside it. The pill reads
 * on any ground, so no tone axis. No axes.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { TooltipSlots } from '../tooltip.js'
import { component, disabled, presence, ref } from './design.js'

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
        display: 'inline-block',
        marginInlineStart: ref.space.xs,
        paddingBlock: ref.space['3xs'],
        paddingInline: ref.space.xs,
        borderRadius: ref.radius.md,
        background: ref.text.overt,
        color: ref.surface.base,
        ...role('caption'),
      }),
      // Fades in on the fast tier, sliding 4px toward its trigger from the side it opens on.
      presence('fast', { translate: '0 -4px' }),
      Style.pseudo('[data-placement="top"][data-closed]', { translate: '0 4px' }),
      Style.pseudo('[data-placement="left"][data-closed]', { translate: '4px 0' }),
      Style.pseudo('[data-placement="right"][data-closed]', { translate: '-4px 0' }),
    ),
  },
})
