import { MeterSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('meter'), MeterSlots, Recipes.Meter, (style, live) =>
  Snippet.meter(style, live.h),
)
