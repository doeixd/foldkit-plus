import { Recipes, TooltipSlots } from 'foldkit-mixins-ui'
import above from '../../examples/tooltip/above.js'
import edge from '../../examples/tooltip/edge.js'
import right from '../../examples/tooltip/right.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('tooltip'),
  TooltipSlots,
  Recipes.Tooltip,
  above,
  undefined,
  [
    { name: 'above', example: above },
    { name: 'right', example: right },
    { name: 'edge', example: edge },
  ],
)
