import { Recipes, LabelSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('label'),
  LabelSlots,
  Recipes.Label,
  style => Snippet.label(style, inert),
  undefined,
  [{ name: 'basic', title: 'Basic', draw: style => Snippet.label(style, inert) }],
)
