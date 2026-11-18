import { CardGroupSlots, Recipes } from 'foldkit-mixins-ui'
import grid from '../../examples/card-group/grid.js'
import plain from '../../examples/card-group/plain.js'
import plans from '../../examples/card-group/plans.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('card-group'),
  CardGroupSlots,
  Recipes.CardGroup,
  plans,
  undefined,
  [
    { name: 'plans', example: plans },
    { name: 'grid', example: grid },
    { name: 'plain', example: plain },
  ],
)
