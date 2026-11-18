import { Recipes, TabsSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/tabs/basic.js'
import closable from '../../examples/tabs/closable.js'
import configure from '../../examples/tabs/configure.js'
import disabled from '../../examples/tabs/disabled.js'
import icons from '../../examples/tabs/icons.js'
import pill from '../../examples/tabs/pill.js'
import scrolling from '../../examples/tabs/scrolling.js'
import vertical from '../../examples/tabs/vertical.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('tabs'), TabsSlots, Recipes.Tabs, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'pill', example: pill },
  { name: 'icons', example: icons },
  { name: 'vertical', example: vertical },
  { name: 'closable', example: closable },
  { name: 'scrolling', example: scrolling },
  { name: 'disabled', example: disabled },
  { name: 'configure', example: configure },
])
