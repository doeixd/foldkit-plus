import { DrawerSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/drawer/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

// The dock axis is the viewport's width, which a frame in the page does not change: the page shows it docked.
export const showcase = fromRecipe(
  about('drawer'),
  DrawerSlots,
  Recipes.Drawer,
  basic,
  [],
  [{ name: 'basic', example: basic }],
)
