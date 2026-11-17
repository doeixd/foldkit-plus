import { Recipes, TypographySlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('typography'),
  TypographySlots,
  Recipes.Typography,
  () => Snippet.typography(inert),
  // Each voice draws its own level, so the page offers no axis to pick.
  [],
  [{ name: 'basic', title: 'The scale', draw: () => Snippet.typography(inert) }],
)
