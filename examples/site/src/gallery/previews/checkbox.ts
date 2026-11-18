import { CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import aside from '../../examples/checkbox/aside.js'
import basic from '../../examples/checkbox/basic.js'
import card from '../../examples/checkbox/card.js'
import configure from '../../examples/checkbox/configure.js'
import description from '../../examples/checkbox/description.js'
import indeterminate from '../../examples/checkbox/indeterminate.js'
import states from '../../examples/checkbox/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('checkbox'),
  CheckboxSlots,
  Recipes.Checkbox,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'description', example: description },
    { name: 'indeterminate', example: indeterminate },
    { name: 'card', example: card },
    { name: 'aside', example: aside },
    { name: 'states', example: states },
    { name: 'configure', example: configure },
  ],
)
