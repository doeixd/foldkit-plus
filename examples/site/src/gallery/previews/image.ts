import { ImageSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/image/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('image'), ImageSlots, Recipes.Image, basic, undefined, [
  { name: 'basic', example: basic },
])
