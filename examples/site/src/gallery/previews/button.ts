import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/button/add.js'
import basic from '../../examples/button/basic.js'
import configure from '../../examples/button/configure.js'
import icon from '../../examples/button/icon.js'
import toggle from '../../examples/button/toggle.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('button'),
  ButtonSlots,
  Recipes.Button,
  basic,
  // A square shows no words, which every example but the icons draws.
  ['tone', 'variant', 'size'],
  [
    { name: 'basic', example: basic },
    { name: 'icon', example: icon },
    { name: 'toggle', example: toggle },
    { name: 'configure', example: configure },
    { name: 'add', example: add },
  ],
)
