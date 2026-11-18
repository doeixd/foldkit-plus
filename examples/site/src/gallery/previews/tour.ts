import { Recipes, TourSlots } from 'foldkit-mixins-ui'
import advance from '../../examples/tour/advance.js'
import basic from '../../examples/tour/basic.js'
import configure from '../../examples/tour/configure.js'
import content from '../../examples/tour/content.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('tour'), TourSlots, Recipes.Tour, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'content', example: content },
  { name: 'advance', example: advance },
  { name: 'configure', example: configure },
])
