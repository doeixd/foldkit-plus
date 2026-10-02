import { Slots, Style, type StyleValue } from 'foldkit-mixins'

import { forSlots, t } from '../../style.js'
import {
  backdrop,
  container,
  demoSlots,
  demoStyles,
  fadeScale,
  floatingPanel,
  icon,
  triggerLook,
} from './shared.js'

/**
 * `foldkit-mixins-ui` has no Menu adapter: `@foldkit/ui` draws the menu's
 * elements itself and takes only attributes for its button, items, backdrop
 * and wrapper, so those are the page's own Slots. Each item takes only a
 * class name, so the items are styled from their container, by the role and
 * the `data-active` and `data-disabled` the component writes.
 */
export const MenuPageSlots = Slots.define({
  ...demoSlots,
  menu: container,
  button: container,
  buttonContent: container,
  buttonLabel: container,
  chevron: container,
  items: container,
  animatedItems: container,
  backdrop: container,
  itemContent: container,
  itemIcon: container,
  itemLabel: container,
  groupHeading: container,
})

const items: StyleValue = Style.compose(
  floatingPanel,
  Style.self({ width: '12rem', overflow: 'hidden' }),
  Style.nest('[role="menuitem"]', {
    padding: `${t.space.xs} ${t.space.sm}`,
    color: t.text.default,
    cursor: 'pointer',
  }),
  Style.nest('[role="menuitem"][data-active]', { background: t.surface.muted }),
  Style.nest('[role="menuitem"][data-disabled]', { opacity: '0.5', cursor: 'not-allowed' }),
)

export const MenuPageStyle = forSlots(MenuPageSlots)(
  {
    ...demoStyles,
    menu: Style.self({ position: 'relative', display: 'inline-block' }),
    button: triggerLook,
    buttonContent: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.md }),
    chevron: icon('1rem'),
    items,
    animatedItems: Style.compose(items, fadeScale),
    backdrop,
    itemContent: Style.self({ display: 'flex', alignItems: 'center', gap: '0.625rem' }),
    itemIcon: icon('1rem'),
    groupHeading: Style.self({
      display: 'block',
      padding: `${t.space.sm} ${t.space.sm} 0.375rem`,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: t.text.muted,
    }),
  },
  { name: 'MenuPageStyle' },
)
