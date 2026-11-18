import * as UiDialog from '@foldkit/ui/dialog'
import { Bundles, Button, ButtonSlots, Dialog, DialogSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Danger = forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
const Quiet = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'ghost' }))

// A dialog that asks before something that cannot be undone. Escape, a press
// on the backdrop and Cancel close it; `isAnimated` keeps it drawn while it
// leaves, so it fades out as it faded in.
export default example({
  title: 'Confirm',
  slots: DialogSlots,
  recipe: Recipes.Dialog,
  state: Bundles.Dialog.with({ id: 'confirm', isAnimated: true }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Delete project',
            onClick: onMessage(UiDialog.Message.RequestedOpen()),
            style: Danger,
          },
          h,
        ),
        h.submodel({
          slotId: model.id,
          model,
          view: UiDialog.view,
          viewInputs: {
            hasDescription: true,
            toView: Dialog.toView([style.mixin], { h }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.button(dialog.closeButton, ['✕']),
                        h.h2(dialog.title, ['Delete this project?']),
                        h.p(dialog.description, [
                          'Its pages and their history go for good. Escape keeps it.',
                        ]),
                        h.div(dialog.footer, [
                          Button.view(
                            {
                              label: 'Cancel',
                              onClick: onMessage(UiDialog.Message.RequestedClose()),
                              style: Quiet,
                            },
                            h,
                          ),
                          Button.view(
                            {
                              label: 'Delete',
                              onClick: onMessage(UiDialog.Message.RequestedClose()),
                              style: Danger,
                            },
                            h,
                          ),
                        ]),
                      ]),
                    ]
                  : [],
              ),
            ),
          },
          toParentMessage: onMessage,
        }),
      ],
    ),
})
