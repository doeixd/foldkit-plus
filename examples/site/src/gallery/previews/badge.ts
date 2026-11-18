import { BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/badge/add.js'
import basic from '../../examples/badge/basic.js'
import dismiss from '../../examples/badge/dismiss.js'
import icon from '../../examples/badge/icon.js'
import link from '../../examples/badge/link.js'
import sizes from '../../examples/badge/sizes.js'
import states from '../../examples/badge/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('badge'), BadgeSlots, Recipes.Badge, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'sizes', example: sizes },
  { name: 'icon', example: icon },
  { name: 'dismiss', example: dismiss },
  { name: 'link', example: link },
  { name: 'states', example: states },
  { name: 'add', example: add },
])
