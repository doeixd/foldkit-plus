import { NavSlots, Recipes, type Nav } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const navMessage =
  <Message>(live: Live<Message>, example: Widgets.NavExample) =>
  (message: Nav.Message) =>
    live.onWidget(Widgets.Message.GotNav({ example, message }))

export const showcase = fromRecipe(
  about('navigation-menu'),
  NavSlots,
  Recipes.Nav,
  (style, live) => Snippet.nav(style, live.h),
  undefined,
  [
    { name: 'links', title: 'Links', draw: (style, live) => Snippet.nav(style, live.h) },
    {
      name: 'panels',
      title: 'Panels',
      draw: (style, live) =>
        Snippet.navPanels(style, live.widgets.navs.panels, navMessage(live, 'panels'), live.h),
    },
    {
      name: 'pill',
      title: 'A pill',
      draw: (style, live) =>
        Snippet.navPanels(style, live.widgets.navs.pill, navMessage(live, 'pill'), live.h),
      pins: { indicator: 'pill' },
    },
    {
      name: 'vertical',
      title: 'Vertical',
      draw: (style, live) =>
        Snippet.navVertical(
          style,
          live.widgets.navs.vertical,
          navMessage(live, 'vertical'),
          live.h,
        ),
    },
  ],
)
