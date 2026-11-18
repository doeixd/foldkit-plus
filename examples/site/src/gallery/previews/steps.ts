import { Recipes, StepsSlots } from 'foldkit-mixins-ui'
import add from '../../examples/steps/add.js'
import basic from '../../examples/steps/basic.js'
import configure from '../../examples/steps/configure.js'
import controlled from '../../examples/steps/controlled.js'
import dots from '../../examples/steps/dots.js'
import icons from '../../examples/steps/icons.js'
import labels from '../../examples/steps/labels.js'
import progress from '../../examples/steps/progress.js'
import states from '../../examples/steps/states.js'
import trailing from '../../examples/steps/trailing.js'
import vertical from '../../examples/steps/vertical.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('steps'), StepsSlots, Recipes.Steps, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'controlled', example: controlled },
  { name: 'icons', example: icons },
  { name: 'vertical', example: vertical },
  { name: 'progress', example: progress },
  { name: 'dots', example: dots },
  { name: 'states', example: states },
  { name: 'trailing', example: trailing },
  { name: 'labels', example: labels },
  { name: 'configure', example: configure },
  { name: 'add', example: add },
])
