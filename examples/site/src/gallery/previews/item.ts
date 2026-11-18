import { ItemSlots, Recipes } from 'foldkit-mixins-ui'
import bands from '../../examples/item/bands.js'
import basic from '../../examples/item/basic.js'
import choice from '../../examples/item/choice.js'
import settings from '../../examples/item/settings.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('item'), ItemSlots, Recipes.Item, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'settings', example: settings },
  { name: 'choice', example: choice },
  { name: 'bands', example: bands },
])
