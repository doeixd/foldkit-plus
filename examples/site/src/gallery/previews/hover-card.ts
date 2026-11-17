import { HoverIntentSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('hover-card'),
  HoverIntentSlots,
  Recipes.HoverCard,
  (style, live) =>
    Snippet.hoverCard(
      style,
      live.widgets.hoverCard,
      message => live.onWidget(Widgets.Message.GotHoverCard({ message })),
      live.h,
    ),
)
