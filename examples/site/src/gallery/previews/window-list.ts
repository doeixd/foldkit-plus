import { Recipes, WindowListSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/window-list/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('window-list'),
  WindowListSlots,
  Recipes.WindowList,
  basic,
  undefined,
  [{ name: 'basic', example: basic }],
)
