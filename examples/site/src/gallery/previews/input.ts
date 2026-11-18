import { InputSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/input/add.js'
import affixes from '../../examples/input/affixes.js'
import amount from '../../examples/input/amount.js'
import aside from '../../examples/input/aside.js'
import basic from '../../examples/input/basic.js'
import phone from '../../examples/input/phone.js'
import states from '../../examples/input/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('input'), InputSlots, Recipes.Input, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'affixes', example: affixes },
  { name: 'aside', example: aside },
  { name: 'amount', example: amount },
  { name: 'phone', example: phone },
  { name: 'states', example: states },
  { name: 'add', example: add },
])
