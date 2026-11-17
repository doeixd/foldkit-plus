import { Recipes, SpinnerSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('spinner'),
  SpinnerSlots,
  Recipes.Spinner,
  style => Snippet.spinner(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.spinner(style, inert) },
    { name: 'kinds', title: 'Kinds', draw: () => Snippet.spinnerKinds(inert) },
    { name: 'label', title: 'A label', draw: style => Snippet.spinnerLabel(style, inert) },
    { name: 'sizes', title: 'Sizes', draw: () => Snippet.spinnerSizes(inert) },
  ],
)
