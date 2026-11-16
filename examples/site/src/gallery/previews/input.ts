import { InputSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('input'),
  InputSlots,
  Recipes.Input,
  style => Snippet.input(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.input(style, inert) },
    { name: 'form', title: 'In a form', draw: style => Snippet.inputForm(style, inert) },
  ],
)
