import { Recipes, FigureSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('figure'),
  FigureSlots,
  Recipes.Figure,
  style => Snippet.figure(style, inert),
  undefined,
  [{ name: 'basic', title: 'A listing', draw: style => Snippet.figure(style, inert) }],
)
