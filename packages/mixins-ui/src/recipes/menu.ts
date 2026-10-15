/**
 * A menu, opened by a button or at a point: the trigger opens the shared
 * popup panel, whose rows commit on click, and a row that opens a submenu
 * ends in a chevron pointing the way the submenu opens. The submenus' panels
 * are this recipe's too. `size` steps the trigger and its rows on the size
 * ladder.
 */
import { Style } from 'foldkit-mixins'
import { MenuSlots } from '../menu.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  hover,
  onLadder,
  ref,
  steps,
  unfilledHover,
} from './design.js'
import { backdrop, heading, highlight, item, panel, rows, scroll, separator } from './popup.js'
import { bar, thumb } from './scrollBars.js'

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
      hover({ background: unfilledHover }),
      focusRing,
      // The contract lets the trigger disable, like the items it opens.
      disabled,
    ),
    backdrop,
    items: panel,
    scroll,
    item,
    heading,
    separator,
    rows,
    highlight,
    scrollBar: bar,
    scrollThumb: thumb,
    label: component(Style.self({ flex: '1', minInlineSize: '0' })),
    // Two sides of a box, turned to point along the row.
    chevron: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        marginInlineStart: ref.space.sm,
        ...cornerSides(ref.border.thick, 'currentColor'),
        color: ref.text.muted,
        rotate: '-45deg',
      }),
      Style.nest(':where([dir="rtl"]) &', { rotate: '135deg' }),
    ),
    // A submenu is drawn inside its row, and the menu's panel scrolls: the
    // Anchor writes `overflow-y: auto` on it, which clipped away the submenu
    // placed beside it. While one shows, the panel holding it lets it out;
    // `!important`, since only that beats the Anchor's inline declaration.
    sub: component(
      Style.nest(':where([role="menu"]:has(&[data-open="true"]))', {
        overflow: 'visible !important',
      }),
    ),
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together,
      // and on the panel too, which upstream portals out of the wrapper by default.
      sm: { wrapper: steps.sm, items: steps.sm },
      md: { wrapper: steps.md, items: steps.md },
    },
  },
})
