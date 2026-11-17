import type { NamedStyle } from 'foldkit-mixins'
import { TreeViewSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const treeBasic = <Message>(style: NamedStyle<typeof TreeViewSlots>, live: Live<Message>) =>
  Snippet.treeView(
    style,
    live.widgets.treeView,
    message => live.onWidget(Widgets.Message.GotTreeView({ message })),
    live.direction,
    live.h,
  )

export const showcase = fromRecipe(
  about('tree-view'),
  TreeViewSlots,
  Recipes.TreeView,
  treeBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: treeBasic },
    {
      name: 'icons',
      title: 'Icons and guides',
      draw: (style, live) =>
        Snippet.treeViewIcons(
          style,
          live.widgets.treeIcons,
          message => live.onWidget(Widgets.Message.GotTreeIcons({ message })),
          live.h,
        ),
      pins: { guides: 'lines' },
    },
    {
      name: 'checkboxes',
      title: 'Checkboxes',
      draw: (style, live) =>
        Snippet.treeViewCheckboxes(
          style,
          live.widgets.treeChecks,
          message => live.onWidget(Widgets.Message.GotTreeChecks({ message })),
          live.h,
        ),
    },
  ],
)
