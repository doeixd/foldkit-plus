import { MenubarSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('menubar'), MenubarSlots, Recipes.Menubar, (style, live) =>
  Snippet.menubar(
    style,
    { bar: live.widgets.menubar, chosen: live.widgets.menubarChoice },
    message => live.onWidget(Widgets.Message.GotMenubar({ message })),
    live.direction,
    live.h,
  ),
)
