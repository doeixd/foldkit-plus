import { Recipes, ToolbarSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/toolbar/basic.js'
import configure from '../../examples/toolbar/configure.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('toolbar'),
  ToolbarSlots,
  Recipes.Toolbar,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'configure', example: configure },
  ],
)
