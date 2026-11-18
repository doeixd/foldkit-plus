import { DialogSlots, Recipes } from 'foldkit-mixins-ui'
import alert from '../../examples/dialog/alert.js'
import confirm from '../../examples/dialog/confirm.js'
import form from '../../examples/dialog/form.js'
import nested from '../../examples/dialog/nested.js'
import terms from '../../examples/dialog/terms.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('dialog'),
  DialogSlots,
  Recipes.Dialog,
  confirm,
  undefined,
  [
    { name: 'confirm', example: confirm },
    { name: 'alert', example: alert },
    { name: 'terms', example: terms },
    { name: 'form', example: form },
    { name: 'nested', example: nested },
  ],
)
