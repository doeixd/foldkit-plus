import { Recipes, CodeBlockSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('code-block'),
  CodeBlockSlots,
  Recipes.CodeBlock,
  style => Snippet.codeBlock(style, inert),
  undefined,
  [
    {
      name: 'basic',
      title: 'Tokens and line numbers',
      draw: style => Snippet.codeBlock(style, inert),
    },
    {
      name: 'copy',
      title: 'The copy button',
      draw: style => Snippet.codeBlockCopy(style, inert),
    },
  ],
)
