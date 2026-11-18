import type { NamedStyle } from 'foldkit-mixins'
import { MenuSlots, Recipes } from 'foldkit-mixins-ui'
import account from '../../examples/menu/account.js'
import configure from '../../examples/menu/configure.js'
import context from '../../examples/menu/context.js'
import content from '../../examples/menu/content.js'
import placement from '../../examples/menu/placement.js'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const menuActions = <Message>(style: NamedStyle<typeof MenuSlots>, live: Live<Message>) =>
  Snippet.menu(
    style,
    {
      pageMenu: live.widgets.pageMenu,
      pageChoice: live.widgets.pageChoice,
      fileMenu: live.widgets.fileMenu,
      fileChoice: live.widgets.fileChoice,
    },
    message => live.onWidget(Widgets.Message.GotPageMenu({ message })),
    message => live.onWidget(Widgets.Message.GotFileMenu({ message })),
    live.direction,
    live.h,
  )

export const showcase = fromRecipe(about('menu'), MenuSlots, Recipes.Menu, menuActions, undefined, [
  { name: 'actions', title: 'Actions', draw: menuActions },
  {
    name: 'view-options',
    title: 'View options',
    draw: (style, live) =>
      Snippet.viewOptionsMenu(
        style,
        { menu: live.widgets.viewMenu, options: live.widgets.viewOptions },
        message => live.onWidget(Widgets.Message.GotViewMenu({ message })),
        live.direction,
        live.h,
      ),
  },
  { name: 'account', example: account },
  { name: 'content', example: content },
  { name: 'context', example: context },
  { name: 'placement', example: placement },
  { name: 'configure', example: configure },
])
