import { Recipes, SidebarSlots } from 'foldkit-mixins-ui'
import floating from '../../examples/sidebar/floating.js'
import icons from '../../examples/sidebar/icons.js'
import inset from '../../examples/sidebar/inset.js'
import resizable from '../../examples/sidebar/resizable.js'
import sections from '../../examples/sidebar/sections.js'
import switcher from '../../examples/sidebar/switcher.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('sidebar'),
  SidebarSlots,
  Recipes.Sidebar,
  icons,
  undefined,
  [
    { name: 'icons', example: icons },
    { name: 'resizable', example: resizable },
    { name: 'floating', example: floating },
    { name: 'inset', example: inset },
    { name: 'sections', example: sections },
    { name: 'switcher', example: switcher },
  ],
)
