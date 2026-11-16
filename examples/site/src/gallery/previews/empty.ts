import { EmptySlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('empty'),
  EmptySlots,
  Recipes.Empty,
  style => Snippet.emptyResults(style, inert),
  undefined,
  [
    { name: 'results', title: 'No results', draw: style => Snippet.emptyResults(style, inert) },
    {
      name: 'first-use',
      title: 'First use',
      draw: style => Snippet.emptyFirstUse(style, inert),
      pins: { frame: 'dashed' },
    },
    {
      name: 'error',
      title: 'An error',
      draw: style => Snippet.emptyError(style, inert),
      pins: { tone: 'danger', frame: 'filled' },
    },
  ],
)
