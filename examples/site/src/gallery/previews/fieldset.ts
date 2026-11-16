import { Recipes, FieldsetSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('fieldset'),
  FieldsetSlots,
  Recipes.Fieldset,
  style => Snippet.fieldset(style, inert),
  undefined,
  [
    {
      name: 'basic',
      title: 'Enabled and disabled',
      draw: style => Snippet.fieldset(style, inert),
    },
  ],
)
