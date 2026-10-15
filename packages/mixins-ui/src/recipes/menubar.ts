/**
 * A menu bar: a strip on the muted surface whose triggers are flat rungs of
 * the size ladder, the open one filled as a hovered one is, and whose menus
 * open the shared popup panel. `Menubar` styles the bar; `MenubarMenu` is
 * the Menu recipe with its trigger made one of the bar's.
 */
import { Style } from 'foldkit-mixins'
import { nested, nests } from 'foldkit-mixins/theme'
import { MenubarSlots } from '../menubar.js'
import { component, ref, unfilledHover, variant } from './design.js'
import { Menu } from './menu.js'

export const Menubar = Style.recipeFor(MenubarSlots)({
  base: {
    bar: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space['3xs'],
        inlineSize: 'fit-content',
        padding: ref.space['3xs'],
        background: ref.surface.muted,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        // Its triggers take their corners from these.
        ...nests(ref.radius.lg, ref.space['3xs'], ref.border.thin),
      }),
    ),
    // Above an open menu's backdrop, so pointing at a neighbour reaches it.
    menu: component(Style.self({ position: 'relative', zIndex: '1' })),
  },
})

// In `variants`, so it beats the Menu's own trigger in `components`.
export const MenubarMenu = Menu.extend({
  base: {
    button: variant(
      // Concentric with the bar's corner, inside its padding and border.
      Style.self({ border: '0', background: 'transparent', borderRadius: nested() }),
      Style.pseudo('[data-open]', { background: unfilledHover, color: ref.text.overt }),
    ),
  },
})
