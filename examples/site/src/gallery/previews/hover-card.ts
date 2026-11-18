import { HoverIntentSlots, Recipes } from 'foldkit-mixins-ui'
import profile from '../../examples/hover-card/profile.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('hover-card'),
  HoverIntentSlots,
  Recipes.HoverCard,
  profile,
  undefined,
  [{ name: 'profile', example: profile }],
)
