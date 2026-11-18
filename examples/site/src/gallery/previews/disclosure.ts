import { DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/disclosure/basic.js'
import below from '../../examples/disclosure/below.js'
import card from '../../examples/disclosure/card.js'
import configure from '../../examples/disclosure/configure.js'
import icon from '../../examples/disclosure/icon.js'
import peek from '../../examples/disclosure/peek.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('disclosure'),
  DisclosureSlots,
  Recipes.Disclosure,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'card', example: card },
    { name: 'icon', example: icon },
    { name: 'peek', example: peek },
    { name: 'below', example: below },
    { name: 'configure', example: configure },
  ],
)
