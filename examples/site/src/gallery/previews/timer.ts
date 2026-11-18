import { Recipes, TimerSlots } from 'foldkit-mixins-ui'
import configure from '../../examples/timer/configure.js'
import countdown from '../../examples/timer/countdown.js'
import stopwatch from '../../examples/timer/stopwatch.js'
import tiles from '../../examples/timer/tiles.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('timer'),
  TimerSlots,
  Recipes.Timer,
  countdown,
  undefined,
  [
    { name: 'countdown', example: countdown },
    { name: 'stopwatch', example: stopwatch },
    { name: 'tiles', example: tiles },
    { name: 'configure', example: configure },
  ],
)
