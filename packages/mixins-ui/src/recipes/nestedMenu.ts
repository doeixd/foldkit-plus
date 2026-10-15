/**
 * A nested menu's rows: the words take the row's room, and a submenu's row
 * ends in a chevron pointing the way the submenu opens. The panels and rows
 * themselves are the Menu recipe's, passed as the menu's and submenus' mixins.
 */
import { Style } from 'foldkit-mixins'
import { NestedMenuSlots } from '../nestedMenu.js'
import { component, ref } from './design.js'

export const NestedMenu = Style.recipeFor(NestedMenuSlots)({
  base: {
    label: component(Style.self({ flex: '1', minInlineSize: '0' })),
    // Two sides of a box, turned to point along the row.
    chevron: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        marginInlineStart: ref.space.sm,
        borderInlineEnd: `${ref.border.thick} solid currentColor`,
        borderBlockEnd: `${ref.border.thick} solid currentColor`,
        color: ref.text.muted,
        rotate: '-45deg',
      }),
      Style.nest(':where([dir="rtl"]) &', { rotate: '135deg' }),
    ),
  },
})
