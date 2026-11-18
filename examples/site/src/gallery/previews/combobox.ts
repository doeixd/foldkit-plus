import { ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/combobox/basic.js'
import choice from '../../examples/combobox/choice.js'
import clear from '../../examples/combobox/clear.js'
import creatable from '../../examples/combobox/creatable.js'
import empty from '../../examples/combobox/empty.js'
import groups from '../../examples/combobox/groups.js'
import multiple from '../../examples/combobox/multiple.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('combobox'),
  ComboboxSlots,
  Recipes.Combobox,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'multiple', example: multiple },
    { name: 'empty', example: empty },
    { name: 'clear', example: clear },
    { name: 'groups', example: groups },
    { name: 'creatable', example: creatable },
    { name: 'choice', example: choice },
  ],
)
