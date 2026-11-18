import { RatingSlots, Recipes } from 'foldkit-mixins-ui'
import average from '../../examples/rating/average.js'
import basic from '../../examples/rating/basic.js'
import configure from '../../examples/rating/configure.js'
import half from '../../examples/rating/half.js'
import hearts from '../../examples/rating/hearts.js'
import labels from '../../examples/rating/labels.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('rating'), RatingSlots, Recipes.Rating, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'half', example: half },
  { name: 'average', example: average },
  { name: 'hearts', example: hearts },
  { name: 'labels', example: labels },
  { name: 'configure', example: configure },
])
