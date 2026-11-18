import { Recipes, SkeletonSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/skeleton/basic.js'
import lines from '../../examples/skeleton/lines.js'
import shapes from '../../examples/skeleton/shapes.js'
import shimmer from '../../examples/skeleton/shimmer.js'
import sized from '../../examples/skeleton/sized.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('skeleton'),
  SkeletonSlots,
  Recipes.Skeleton,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'lines', example: lines },
    { name: 'shapes', example: shapes },
    { name: 'shimmer', example: shimmer },
    { name: 'sized', example: sized },
  ],
)
