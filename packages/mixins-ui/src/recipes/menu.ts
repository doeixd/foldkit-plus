/**
 * A menu: the trigger opens the shared popup panel, whose rows commit on
 * click. `size` steps the trigger and its rows on the size ladder.
 */
import { Style } from 'foldkit-mixins'
import { MenuSlots } from '../menu.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  listScroll,
  onLadder,
  ref,
  steps,
} from './design.js'
import { backdrop, heading, highlight, item, panel, rows, separator } from './popup.js'

export const Menu = Style.recipeFor(MenuSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        ...onLadder,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
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
    rows,
    highlight,
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together.
      sm: { wrapper: steps.sm },
      md: { wrapper: steps.md },
    },
  },
})
