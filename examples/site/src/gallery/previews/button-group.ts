import { ButtonGroupSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('button-group'),
  ButtonGroupSlots,
  Recipes.ButtonGroup,
  style => Snippet.buttonGroup(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.buttonGroup(style, inert) },
    { name: 'icons', title: 'Icons', draw: style => Snippet.buttonGroupIcons(style, inert) },
    {
      name: 'toolbar',
      title: 'Toolbar',
      draw: style => Snippet.buttonGroupToolbar(style, inert),
    },
    {
      name: 'split',
      title: 'Split button',
      draw: (style, live) =>
        Snippet.buttonGroupSplit(
          style,
          live.widgets.saveMenu,
          message => live.onWidget(Widgets.Message.GotSaveMenu({ message })),
          live.h,
        ),
    },
    {
      name: 'separated',
      title: 'Separated',
      draw: style => Snippet.buttonGroupSeparated(style, inert),
    },
    {
      name: 'input',
      title: 'Input',
      draw: style => Snippet.buttonGroupInput(style, inert),
      pins: { width: 'fill' },
    },
    {
      name: 'text',
      title: 'Text',
      draw: style => Snippet.buttonGroupText(style, inert),
      pins: { width: 'fill' },
    },
    {
      name: 'vertical',
      title: 'Vertical',
      draw: style => Snippet.buttonGroupVertical(style, inert),
    },
    { name: 'sizes', title: 'Sizes', draw: () => Snippet.buttonGroupSizes(inert) },
    {
      name: 'pagination',
      title: 'Pagination',
      draw: (style, live) =>
        Snippet.buttonGroupPagination(
          style,
          live.widgets.pages.group,
          12,
          page => live.onWidget(Widgets.Message.ChosePage({ example: 'group', page })),
          live.h,
        ),
    },
  ],
)
