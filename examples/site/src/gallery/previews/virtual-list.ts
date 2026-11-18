import { Recipes, VirtualListSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/virtual-list/basic.js'
import heights from '../../examples/virtual-list/heights.js'
import infinite from '../../examples/virtual-list/infinite.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('virtual-list'),
  VirtualListSlots,
  Recipes.VirtualList,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'heights', example: heights },
    { name: 'infinite', example: infinite },
  ],
)
