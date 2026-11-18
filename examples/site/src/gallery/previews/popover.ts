import { PopoverSlots, Recipes } from 'foldkit-mixins-ui'
import below from '../../examples/popover/below.js'
import clipped from '../../examples/popover/clipped.js'
import noArrow from '../../examples/popover/no-arrow.js'
import topStart from '../../examples/popover/top-start.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('popover'),
  PopoverSlots,
  Recipes.Popover,
  below,
  undefined,
  [
    { name: 'below', example: below },
    { name: 'top-start', example: topStart },
    { name: 'no-arrow', example: noArrow },
    { name: 'clipped', example: clipped },
  ],
)
