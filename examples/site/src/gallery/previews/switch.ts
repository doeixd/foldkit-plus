import { Recipes, SwitchSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('switch'), SwitchSlots, Recipes.Switch, (style, live) =>
  Snippet.toggle(style, live.switched, live.onSwitch, live.h),
)
