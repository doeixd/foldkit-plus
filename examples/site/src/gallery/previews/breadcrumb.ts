import { BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('breadcrumb'),
  BreadcrumbSlots,
  Recipes.Breadcrumb,
  style => Snippet.breadcrumb(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.breadcrumb(style, inert) },
    { name: 'icons', title: 'Icons', draw: style => Snippet.breadcrumbIcons(style, inert) },
    {
      name: 'custom',
      title: 'A separator of your own',
      draw: style => Snippet.breadcrumbCustom(style, inert),
    },
    {
      name: 'collapsed',
      title: 'Collapsed',
      draw: (style, live) =>
        Snippet.breadcrumbCollapsed(
          style,
          live.widgets.trailExpanded,
          live.onWidget(Widgets.Message.ExpandedTrail()),
          live.h,
        ),
    },
    {
      name: 'menu',
      title: 'The hidden steps in a menu',
      draw: (style, live) =>
        Snippet.breadcrumbMenu(
          style,
          live.widgets.trailMenu,
          message => live.onWidget(Widgets.Message.GotTrailMenu({ message })),
          live.h,
        ),
    },
  ],
)
