import { AppShellSlots, Recipes } from 'foldkit-mixins-ui'
import aside from '../../examples/app-shell/aside.js'
import basic from '../../examples/app-shell/basic.js'
import configure from '../../examples/app-shell/configure.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('app-shell'),
  AppShellSlots,
  Recipes.AppShell,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'aside', example: aside },
    { name: 'configure', example: configure },
  ],
)
