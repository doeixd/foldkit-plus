import { Recipes, SeparatorSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('separator'),
  SeparatorSlots,
  Recipes.Separator,
  style => Snippet.separator(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.separator(style, inert) },
    { name: 'label', title: 'A label', draw: style => Snippet.separatorLabel(style, inert) },
    {
      name: 'vertical',
      title: 'In a toolbar',
      draw: style => Snippet.separatorVertical(style, inert),
      pins: { spacing: 'sm', inset: 'sm' },
    },
    {
      name: 'dashed',
      title: 'Dashed',
      draw: style => Snippet.separatorDashed(style, inert),
      pins: { line: 'dashed', thickness: 'thick', spacing: 'md' },
    },
  ],
)
