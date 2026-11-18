import { FrameSlots, Recipes } from 'foldkit-mixins-ui'
import alerts from '../../examples/frame/alerts.js'
import basic from '../../examples/frame/basic.js'
import configure from '../../examples/frame/configure.js'
import items from '../../examples/frame/items.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('frame'), FrameSlots, Recipes.Frame, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'alerts', example: alerts },
  { name: 'items', example: items },
  { name: 'configure', example: configure },
])
