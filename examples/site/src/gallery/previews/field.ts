import { FieldSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/field/basic.js'
import errors from '../../examples/field/errors.js'
import horizontal from '../../examples/field/horizontal.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('field'), FieldSlots, Recipes.Field, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'errors', example: errors },
  { name: 'horizontal', example: horizontal },
])
