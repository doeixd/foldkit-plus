import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ThinkingIndicatorSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

const thinkingBasic = (style: NamedStyle<typeof ThinkingIndicatorSlots>) =>
  Snippet.thinkingIndicator(style, inert)

export const showcase = fromRecipe(
  about('thinking-indicator'),
  ThinkingIndicatorSlots,
  Recipes.ThinkingIndicator,
  thinkingBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: thinkingBasic },
    { name: 'kinds', title: 'Kinds', draw: () => Snippet.thinkingIndicatorKinds(inert) },
    { name: 'accent', title: 'Accent', draw: thinkingBasic, pins: { tone: 'accent' } },
  ],
)
