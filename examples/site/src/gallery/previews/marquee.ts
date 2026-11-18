import { MarqueeSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/marquee/basic.js'
import paused from '../../examples/marquee/paused.js'
import reverse from '../../examples/marquee/reverse.js'
import vertical from '../../examples/marquee/vertical.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('marquee'),
  MarqueeSlots,
  Recipes.Marquee,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'reverse', example: reverse },
    { name: 'vertical', example: vertical },
    { name: 'paused', example: paused },
  ],
)
