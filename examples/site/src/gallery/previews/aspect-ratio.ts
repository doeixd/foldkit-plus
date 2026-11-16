import { Recipes, AspectRatioSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('aspect-ratio'),
  AspectRatioSlots,
  Recipes.AspectRatio,
  style => Snippet.aspectRatio(style, inert),
  undefined,
  [{ name: 'basic', title: 'Basic', draw: style => Snippet.aspectRatio(style, inert) }],
)
