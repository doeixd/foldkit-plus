import { OtpFieldSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/otp-field/basic.js'
import letters from '../../examples/otp-field/letters.js'
import masked from '../../examples/otp-field/masked.js'
import states from '../../examples/otp-field/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('otp-field'),
  OtpFieldSlots,
  Recipes.OtpField,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'masked', example: masked },
    { name: 'letters', example: letters },
    { name: 'states', example: states },
  ],
)
