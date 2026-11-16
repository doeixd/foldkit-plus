import { ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('listbox'), ListboxSlots, Recipes.Listbox, (style, live) =>
  Snippet.listbox(
    style,
    live.widgets,
    message => live.onWidget(Widgets.Message.GotListbox({ message })),
    live.direction,
    live.h,
  ),
)
