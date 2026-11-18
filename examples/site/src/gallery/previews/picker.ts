import { PickerSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/picker/basic.js'
import clear from '../../examples/picker/clear.js'
import configure from '../../examples/picker/configure.js'
import groups from '../../examples/picker/groups.js'
import icons from '../../examples/picker/icons.js'
import states from '../../examples/picker/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('picker'), PickerSlots, Recipes.Picker, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'icons', example: icons },
  { name: 'groups', example: groups },
  { name: 'clear', example: clear },
  { name: 'states', example: states },
  { name: 'configure', example: configure },
])
