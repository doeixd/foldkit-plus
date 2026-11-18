import { NumberFieldSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/number-field/basic.js'
import locale from '../../examples/number-field/locale.js'
import states from '../../examples/number-field/states.js'
import words from '../../examples/number-field/words.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('number-field'),
  NumberFieldSlots,
  Recipes.NumberField,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'locale', example: locale },
    { name: 'states', example: states },
    { name: 'words', example: words },
  ],
)
