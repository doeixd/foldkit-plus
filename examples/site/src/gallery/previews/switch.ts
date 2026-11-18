import { Recipes, SwitchSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/switch/basic.js'
import configure from '../../examples/switch/configure.js'
import danger from '../../examples/switch/danger.js'
import draggable from '../../examples/switch/draggable.js'
import settings from '../../examples/switch/settings.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('switch'), SwitchSlots, Recipes.Switch, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'settings', example: settings },
  { name: 'danger', example: danger },
  { name: 'draggable', example: draggable },
  { name: 'configure', example: configure },
])
