import { ButtonGroupSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/button-group/basic.js'
import icons from '../../examples/button-group/icons.js'
import input from '../../examples/button-group/input.js'
import pagination from '../../examples/button-group/pagination.js'
import separated from '../../examples/button-group/separated.js'
import sizes from '../../examples/button-group/sizes.js'
import split from '../../examples/button-group/split.js'
import text from '../../examples/button-group/text.js'
import toolbar from '../../examples/button-group/toolbar.js'
import vertical from '../../examples/button-group/vertical.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('button-group'),
  ButtonGroupSlots,
  Recipes.ButtonGroup,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'icons', example: icons },
    { name: 'toolbar', example: toolbar },
    { name: 'split', example: split },
    { name: 'separated', example: separated },
    { name: 'input', example: input },
    { name: 'text', example: text },
    { name: 'vertical', example: vertical },
    { name: 'sizes', example: sizes },
    { name: 'pagination', example: pagination },
  ],
)
