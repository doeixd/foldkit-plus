import { DialogSlots, Recipes } from 'foldkit-mixins-ui'
import drawer from '../../examples/sheet/drawer.js'
import fixed from '../../examples/sheet/fixed.js'
import nested from '../../examples/sheet/nested.js'
import side from '../../examples/sheet/side.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('sheet'), DialogSlots, Recipes.Sheet, drawer, undefined, [
  { name: 'drawer', example: drawer },
  { name: 'side', example: side },
  { name: 'fixed', example: fixed },
  { name: 'nested', example: nested },
])
