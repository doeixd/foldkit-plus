import { InputCopySlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('input-copy'),
  InputCopySlots,
  Recipes.InputCopy,
  (style, live) =>
    Snippet.inputCopy(
      style,
      live.widgets.inputCopy,
      text => live.onWidget(Widgets.Message.PressedCopy({ text })),
      live.h,
    ),
)
