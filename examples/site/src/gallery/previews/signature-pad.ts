import { Recipes, SignaturePadSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/signature-pad/basic.js'
import form from '../../examples/signature-pad/form.js'
import muted from '../../examples/signature-pad/muted.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('signature-pad'),
  SignaturePadSlots,
  Recipes.SignaturePad,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'muted', example: muted },
    { name: 'form', example: form },
  ],
)
