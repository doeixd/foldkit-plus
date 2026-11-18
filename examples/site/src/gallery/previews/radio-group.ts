import { RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/radio-group/basic.js'
import cards from '../../examples/radio-group/cards.js'
import configure from '../../examples/radio-group/configure.js'
import grid from '../../examples/radio-group/grid.js'
import invalid from '../../examples/radio-group/invalid.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('radio-group'),
  RadioGroupSlots,
  Recipes.RadioGroup,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'cards', example: cards },
    { name: 'grid', example: grid },
    { name: 'invalid', example: invalid },
    { name: 'configure', example: configure },
  ],
)
