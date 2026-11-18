import { Recipes, ThinkingIndicatorSlots } from 'foldkit-mixins-ui'
import accent from '../../examples/thinking-indicator/accent.js'
import basic from '../../examples/thinking-indicator/basic.js'
import configure from '../../examples/thinking-indicator/configure.js'
import kinds from '../../examples/thinking-indicator/kinds.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('thinking-indicator'),
  ThinkingIndicatorSlots,
  Recipes.ThinkingIndicator,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'kinds', example: kinds },
    { name: 'accent', example: accent },
    { name: 'configure', example: configure },
  ],
)
