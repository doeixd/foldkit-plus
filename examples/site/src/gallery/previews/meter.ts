import { MeterSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/meter/add.js'
import basic from '../../examples/meter/basic.js'
import levels from '../../examples/meter/levels.js'
import segments from '../../examples/meter/segments.js'
import vertical from '../../examples/meter/vertical.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('meter'), MeterSlots, Recipes.Meter, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'levels', example: levels },
  { name: 'vertical', example: vertical },
  { name: 'segments', example: segments },
  { name: 'add', example: add },
])
