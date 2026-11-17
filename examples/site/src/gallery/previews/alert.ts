import { AlertSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('alert'),
  AlertSlots,
  Recipes.Alert,
  // One alert in a tile; the banner has its own example.
  style => Snippet.alertInline(style, inert),
  undefined,
  [
    {
      name: 'inline',
      title: 'Inline',
      draw: (style, _live) => Snippet.alertInline(style, inert),
    },
    {
      name: 'banner',
      title: 'Banner',
      draw: (style, _live) => Snippet.alertBanner(style, inert),
    },
  ],
)
