import type { NamedStyle } from 'foldkit-mixins'
import { DialogSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const dialogMessages = <Message>(
  live: Live<Message>,
  example: Widgets.DialogExample,
): Snippet.DialogMessages<Message> => ({
  onOpen: live.onWidget(Widgets.Message.OpenedDialogAt({ example })),
  onClose: live.onWidget(Widgets.Message.ClosedDialogAt({ example })),
  toMessage: message => live.onWidget(Widgets.Message.GotDialogAt({ example, message })),
})

const dialogConfirm = <Message>(style: NamedStyle<typeof DialogSlots>, live: Live<Message>) =>
  Snippet.dialog(
    style,
    { dialog: live.widgets.dialog, alert: live.widgets.alertDialog },
    {
      dialog: {
        onOpen: live.onWidget(Widgets.Message.OpenedDialog()),
        onClose: live.onWidget(Widgets.Message.ClosedDialog()),
        toMessage: message => live.onWidget(Widgets.Message.GotDialog({ message })),
      },
      alert: {
        onOpen: live.onWidget(Widgets.Message.OpenedAlertDialog()),
        onClose: live.onWidget(Widgets.Message.ClosedAlertDialog()),
        toMessage: message => live.onWidget(Widgets.Message.GotAlertDialog({ message })),
      },
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('dialog'),
  DialogSlots,
  Recipes.Dialog,
  dialogConfirm,
  undefined,
  [
    { name: 'confirm', title: 'Confirm', draw: dialogConfirm },
    {
      name: 'terms',
      title: 'A long body',
      draw: (style, live) =>
        Snippet.dialogTerms(
          style,
          live.widgets.dialogs.terms,
          dialogMessages(live, 'terms'),
          live.h,
        ),
    },
    {
      name: 'form',
      title: 'A form',
      draw: (style, live) =>
        Snippet.dialogForm(style, live.widgets.dialogs.form, dialogMessages(live, 'form'), live.h),
    },
    {
      name: 'nested',
      title: 'Nested',
      draw: (style, live) =>
        Snippet.dialogNested(
          style,
          {
            outer: live.widgets.dialogs.nested,
            inner: live.widgets.dialogs['nested-inner'],
            outerMessages: dialogMessages(live, 'nested'),
            innerMessages: dialogMessages(live, 'nested-inner'),
          },
          live.h,
        ),
    },
  ],
)
