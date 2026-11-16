import { VirtualListSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('virtual-list'),
  VirtualListSlots,
  Recipes.VirtualList,
  (style, live) =>
    Snippet.virtualList(
      style,
      live.widgets.virtualList,
      message => live.onWidget(Widgets.Message.GotVirtualList({ message })),
      live.h,
    ),
)
