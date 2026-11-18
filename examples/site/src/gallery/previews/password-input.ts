import { PasswordInputSlots, Recipes } from 'foldkit-mixins-ui'
import aside from '../../examples/password-input/aside.js'
import basic from '../../examples/password-input/basic.js'
import newPassword from '../../examples/password-input/new.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('password-input'),
  PasswordInputSlots,
  Recipes.PasswordInput,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'new', example: newPassword },
    { name: 'aside', example: aside },
  ],
)
