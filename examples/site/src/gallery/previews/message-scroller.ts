import { MessageScrollerSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/message-scroller/basic.js'
import configure from '../../examples/message-scroller/configure.js'
import start from '../../examples/message-scroller/start.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('message-scroller'),
  MessageScrollerSlots,
  Recipes.MessageScroller,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'start', example: start },
    { name: 'configure', example: configure },
  ],
)
