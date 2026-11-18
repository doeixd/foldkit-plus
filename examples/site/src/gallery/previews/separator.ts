import { Recipes, SeparatorSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/separator/basic.js'
import dashed from '../../examples/separator/dashed.js'
import label from '../../examples/separator/label.js'
import toolbar from '../../examples/separator/toolbar.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('separator'),
  SeparatorSlots,
  Recipes.Separator,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'label', example: label },
    { name: 'toolbar', example: toolbar },
    { name: 'dashed', example: dashed },
  ],
)
