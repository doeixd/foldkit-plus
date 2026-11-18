import { Recipes, ResizableSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/resizable/basic.js'
import collapsible from '../../examples/resizable/collapsible.js'
import configure from '../../examples/resizable/configure.js'
import nested from '../../examples/resizable/nested.js'
import pill from '../../examples/resizable/pill.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('resizable'),
  ResizableSlots,
  Recipes.Resizable,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'collapsible', example: collapsible },
    { name: 'nested', example: nested },
    { name: 'pill', example: pill },
    { name: 'configure', example: configure },
  ],
)
