import { LabelSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/label/basic.js'
import markers from '../../examples/label/markers.js'
import states from '../../examples/label/states.js'
import trailing from '../../examples/label/trailing.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('label'), LabelSlots, Recipes.Label, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'markers', example: markers },
  { name: 'states', example: states },
  { name: 'trailing', example: trailing },
])
