import { BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/breadcrumb/basic.js'
import collapsed from '../../examples/breadcrumb/collapsed.js'
import feature from '../../examples/breadcrumb/feature.js'
import icons from '../../examples/breadcrumb/icons.js'
import menu from '../../examples/breadcrumb/menu.js'
import separator from '../../examples/breadcrumb/separator.js'
import words from '../../examples/breadcrumb/words.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('breadcrumb'),
  BreadcrumbSlots,
  Recipes.Breadcrumb,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'icons', example: icons },
    { name: 'separator', example: separator },
    { name: 'collapsed', example: collapsed },
    { name: 'menu', example: menu },
    { name: 'words', example: words },
    { name: 'feature', example: feature },
  ],
)
