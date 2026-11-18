import { Recipes, SpinnerSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/spinner/basic.js'
import button from '../../examples/spinner/button.js'
import kinds from '../../examples/spinner/kinds.js'
import label from '../../examples/spinner/label.js'
import sizes from '../../examples/spinner/sizes.js'
import tones from '../../examples/spinner/tones.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('spinner'),
  SpinnerSlots,
  Recipes.Spinner,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'kinds', example: kinds },
    { name: 'label', example: label },
    { name: 'sizes', example: sizes },
    { name: 'tones', example: tones },
    { name: 'button', example: button },
  ],
)
