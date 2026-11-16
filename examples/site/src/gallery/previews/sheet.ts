import type { NamedStyle } from 'foldkit-mixins'
import { DialogSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const sheetMessages = <Message>(
  live: Live<Message>,
  example: Widgets.SheetExample,
): Snippet.SheetMessages<Message> => ({
  onOpen: live.onWidget(Widgets.Message.OpenedSheet({ example })),
  onClose: live.onWidget(Widgets.Message.ClosedSheet({ example })),
  toMessage: message => live.onWidget(Widgets.Message.GotSheet({ example, message })),
})

const sheetDrawer = <Message>(style: NamedStyle<typeof DialogSlots>, live: Live<Message>) =>
  Snippet.sheetDrawer(style, live.widgets.sheets.drawer, sheetMessages(live, 'drawer'), live.h)

export const showcase = fromRecipe(
  about('sheet'),
  DialogSlots,
  Recipes.Sheet,
  sheetDrawer,
  undefined,
  [
    { name: 'drawer', title: 'A drawer', draw: sheetDrawer },
    {
      name: 'right',
      title: 'From the side',
      draw: (style, live) =>
        Snippet.sheetSide(style, live.widgets.sheets.right, sheetMessages(live, 'right'), live.h),
      pins: { handle: 'none' },
    },
    {
      name: 'fixed',
      title: 'Not dismissible',
      draw: (style, live) =>
        Snippet.sheetFixed(style, live.widgets.sheets.fixed, sheetMessages(live, 'fixed'), live.h),
    },
    {
      name: 'nested',
      title: 'Nested',
      draw: (style, live) =>
        Snippet.sheetNested(
          style,
          {
            outer: live.widgets.sheets.nested,
            inner: live.widgets.sheets['nested-inner'],
            outerMessages: sheetMessages(live, 'nested'),
            innerMessages: sheetMessages(live, 'nested-inner'),
          },
          live.h,
        ),
    },
  ],
)
