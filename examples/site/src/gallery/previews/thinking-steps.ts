import { Recipes, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/thinking-steps/basic.js'
import configure from '../../examples/thinking-steps/configure.js'
import flat from '../../examples/thinking-steps/flat.js'
import running from '../../examples/thinking-steps/running.js'
import sources from '../../examples/thinking-steps/sources.js'
import tools from '../../examples/thinking-steps/tools.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('thinking-steps'),
  ThinkingStepsSlots,
  Recipes.ThinkingSteps,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'running', example: running },
    { name: 'tools', example: tools },
    { name: 'sources', example: sources },
    { name: 'flat', example: flat },
    { name: 'configure', example: configure },
  ],
)
