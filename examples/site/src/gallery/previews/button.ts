import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import add from '../../examples/button/add.js'
import basic from '../../examples/button/basic.js'
import busy from '../../examples/button/busy.js'
import configure from '../../examples/button/configure.js'
import description from '../../examples/button/description.js'
import icon from '../../examples/button/icon.js'
import link from '../../examples/button/link.js'
import mark from '../../examples/button/mark.js'
import sizes from '../../examples/button/sizes.js'
import toggle from '../../examples/button/toggle.js'
import trailing from '../../examples/button/trailing.js'
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
    { name: 'sizes', example: sizes },
    { name: 'icon', example: icon },
    { name: 'trailing', example: trailing },
    { name: 'description', example: description },
    { name: 'mark', example: mark },
    { name: 'link', example: link },
    { name: 'busy', example: busy },
    { name: 'toggle', example: toggle },
    { name: 'configure', example: configure },
    { name: 'add', example: add },
  ],
)
