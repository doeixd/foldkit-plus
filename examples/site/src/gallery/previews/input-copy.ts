import { InputCopySlots, Recipes } from 'foldkit-mixins-ui'
import adorned from '../../examples/input-copy/adorned.js'
import basic from '../../examples/input-copy/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('input-copy'),
  InputCopySlots,
  Recipes.InputCopy,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'adorned', example: adorned },
  ],
)
