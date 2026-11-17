import { DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('disclosure'),
  DisclosureSlots,
  Recipes.Disclosure,
  (style, live) =>
    Snippet.disclosure(
      style,
      live.widgets.details,
      isOpen => live.onWidget(Widgets.Message.ToggledDetails({ isOpen })),
      live.h,
    ),
  undefined,
  [
    {
      name: 'basic',
      title: 'Basic',
      draw: (style, live) =>
        Snippet.disclosure(
          style,
          live.widgets.details,
          isOpen => live.onWidget(Widgets.Message.ToggledDetails({ isOpen })),
          live.h,
        ),
    },
  ],
)
