/**
 * A window list's behaviour on a page without scripts, and no look: there the
 * spacers take no room, so the rows a server drew lie in the page's flow and
 * links page through them (`WindowList.pageOf`). The application draws the
 * rows' look.
 */
import { Style } from 'foldkit-mixins'
import { Utilities } from 'foldkit-mixins/utilities'
import { WindowListSlots } from '../windowList.js'
import { component } from './design.js'

export const WindowList = Style.recipeFor(WindowListSlots)({
  base: {
    spacer: component(Utilities.scriptedOnly),
  },
})
