import { Recipes, SelectSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/select/basic.js'
import configure from '../../examples/select/configure.js'
import groups from '../../examples/select/groups.js'
import placeholder from '../../examples/select/placeholder.js'
import states from '../../examples/select/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

// The native `select`. The custom one, drawn over Listbox, is the Listbox
// page's: its look and its rows are that widget's.
export const showcase = fromRecipe(about('select'), SelectSlots, Recipes.Select, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'placeholder', example: placeholder },
  { name: 'groups', example: groups },
  { name: 'states', example: states },
  { name: 'configure', example: configure },
])
