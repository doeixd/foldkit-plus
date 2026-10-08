/**
 * A popover: a trigger opening a card anchored against it, with a click-away
 * behind it. `size` is the panel's maximum width.
 */
import { Style } from 'foldkit-mixins'
import { PopoverSlots } from '../popover.js'
import { component, disabled, focusRing, hover, ref, transition, variant } from './design.js'

const width = (max: string) =>
  variant(Style.self({ maxInlineSize: `min(${max}, 100% - 2rem)` }))

export const Popover = Style.recipeFor(PopoverSlots)({
  base: {
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space.xs,
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontSize: ref.size.sm,
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, border-color, color'),
      }),
      hover({ background: ref.surface.muted }),
      focusRing,
      disabled,
    ),
    panel: component(
      Style.self({
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: ref.surface.base,
        boxShadow: ref.shadow.lg,
        color: ref.text.muted,
        zIndex: '20',
      }),
    ),
    backdrop: component(Style.self({ position: 'fixed', inset: '0' })),
    arrow: component(
      Style.self({
        inlineSize: '0.75rem',
        blockSize: '0.75rem',
        background: ref.surface.base,
        borderBlockStart: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderInlineStart: `${ref.border.thin} solid ${ref.outline.subtle}`,
      }),
    ),
  },
  variants: {
    size: {
      sm: { panel: width('18rem') },
      md: { panel: width('24rem') },
      lg: { panel: width('32rem') },
    },
  },
  defaults: { size: 'sm' },
})
