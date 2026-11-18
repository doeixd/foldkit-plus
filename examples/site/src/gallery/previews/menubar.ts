import type { NamedStyle } from 'foldkit-mixins'
import { MenubarSlots, Recipes } from 'foldkit-mixins-ui'
import bundle from '../../examples/menubar/bundle.js'
import configure from '../../examples/menubar/configure.js'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const basic = <Message>(style: NamedStyle<typeof MenubarSlots>, live: Live<Message>) =>
  Snippet.menubar(
    style,
    { bar: live.widgets.menubar, chosen: live.widgets.menubarChoice },
    message => live.onWidget(Widgets.Message.GotMenubar({ message })),
    live.direction,
    live.h,
  )

export const showcase = fromRecipe(
  about('menubar'),
  MenubarSlots,
  Recipes.Menubar,
  basic,
  undefined,
  [
    { name: 'basic', title: 'Menubar', draw: basic },
    { name: 'bundle', example: bundle },
    { name: 'configure', example: configure },
  ],
)
