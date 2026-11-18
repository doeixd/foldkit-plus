import { AspectRatioSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/aspect-ratio/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('aspect-ratio'),
  AspectRatioSlots,
  Recipes.AspectRatio,
  basic,
  undefined,
  [{ name: 'basic', example: basic }],
)
