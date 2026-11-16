import { ItemSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('item'),
  ItemSlots,
  Recipes.Item,
  style => Snippet.item(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.item(style, inert) },
    {
      name: 'settings',
      title: 'Settings',
      draw: style => Snippet.itemSettings(style, inert),
      pins: { media: 'icon' },
    },
    {
      name: 'selectable',
      title: 'A choice',
      draw: (style, live) =>
        Snippet.itemSelectable(
          style,
          {
            chosen: live.widgets.plan,
            onChoose: plan => live.onWidget(Widgets.Message.ChosePlan({ plan })),
          },
          live.h,
        ),
    },
  ],
)
