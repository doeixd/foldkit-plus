import { Recipes, IconSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('icon'),
  IconSlots,
  Recipes.Icon,
  style => Snippet.icon(style, inert),
  undefined,
  [{ name: 'basic', title: 'Named and decorative', draw: style => Snippet.icon(style, inert) }],
)
