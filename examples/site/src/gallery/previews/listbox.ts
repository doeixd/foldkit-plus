import { ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/listbox/add.js'
import basic from '../../examples/listbox/basic.js'
import choice from '../../examples/listbox/choice.js'
import clear from '../../examples/listbox/clear.js'
import configure from '../../examples/listbox/configure.js'
import descriptions from '../../examples/listbox/descriptions.js'
import dots from '../../examples/listbox/dots.js'
import groups from '../../examples/listbox/groups.js'
import icons from '../../examples/listbox/icons.js'
import multiple from '../../examples/listbox/multiple.js'
import states from '../../examples/listbox/states.js'
import trailing from '../../examples/listbox/trailing.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('listbox'),
  ListboxSlots,
  Recipes.Listbox,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'icons', example: icons },
    { name: 'descriptions', example: descriptions },
    { name: 'groups', example: groups },
    { name: 'trailing', example: trailing },
    { name: 'multiple', example: multiple },
    { name: 'dots', example: dots },
    { name: 'clear', example: clear },
    { name: 'states', example: states },
    { name: 'choice', example: choice },
    { name: 'configure', example: configure },
    { name: 'add', example: add },
  ],
)
