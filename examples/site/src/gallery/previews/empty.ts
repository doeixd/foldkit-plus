import { EmptySlots, Recipes } from 'foldkit-mixins-ui'
import error from '../../examples/empty/error.js'
import firstUse from '../../examples/empty/first-use.js'
import results from '../../examples/empty/results.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('empty'), EmptySlots, Recipes.Empty, results, undefined, [
  { name: 'results', example: results },
  { name: 'first-use', example: firstUse },
  { name: 'error', example: error },
])
