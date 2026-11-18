import { ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/progress/add.js'
import basic from '../../examples/progress/basic.js'
import buffer from '../../examples/progress/buffer.js'
import ring from '../../examples/progress/ring.js'
import steps from '../../examples/progress/steps.js'
import striped from '../../examples/progress/striped.js'
import stacked from '../../examples/progress/stacked.js'
import tones from '../../examples/progress/tones.js'
import value from '../../examples/progress/value.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('progress'),
  ProgressSlots,
  Recipes.Progress,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'value', example: value },
    { name: 'stacked', example: stacked },
    { name: 'buffer', example: buffer },
    { name: 'striped', example: striped },
    { name: 'ring', example: ring },
    { name: 'steps', example: steps },
    { name: 'tones', example: tones },
    { name: 'add', example: add },
  ],
)
