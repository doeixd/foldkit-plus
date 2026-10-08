/**
 * A menu: the trigger opens the shared popup panel, whose rows commit on
 * click. `size` is the density of each row.
 */
import { Style } from 'foldkit-mixins'
import { MenuSlots } from '../menu.js'
import { component, disabled, focusRing, hover, listScroll, ref } from './design.js'
import { backdrop, density, heading, item, panel, separator } from './popup.js'

export const Menu = Style.recipeFor(MenuSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
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
      }),
      hover({ background: ref.surface.muted }),
      focusRing,
      // The contract lets the trigger disable, like the items it opens.
      disabled,
    ),
    backdrop,
    items: panel,
    scroll: listScroll,
    item,
    heading,
    separator,
  },
  variants: {
    size: {
      sm: { item: density(ref.space['3xs'], ref.space.sm, ref.size.sm) },
      md: { item: density(ref.space['2xs'], ref.space.sm, ref.size.sm) },
    },
  },
  defaults: { size: 'md' },
})
