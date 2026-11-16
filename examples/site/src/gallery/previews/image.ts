import { Recipes, ImageSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('image'),
  ImageSlots,
  Recipes.Image,
  style => Snippet.image(style, inert),
  undefined,
  [
    {
      name: 'basic',
      title: 'Described and decorative',
      draw: style => Snippet.image(style, inert),
    },
  ],
)
