import * as UiDialog from '@foldkit/ui/dialog'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, ButtonSlots, Dialog, DialogSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Danger = forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
const Quiet = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'ghost' }))

// An alert dialog asks for an answer: `role: 'alertdialog'`, no close button,
// and `dismissible: false`, so Escape and the backdrop send a Message the
// Bundle drops. Its answers close it through the placement's `close` helper,
// which a dismissal does not take. Focus opens on the answer that loses
// nothing, though it comes second.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Answered: {} }),
  Bundle.withChild('alert', Bundles.Dialog, {
    args: { id: 'remove-member', dismissible: false, isAnimated: true },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'An alert dialog',
  slots: DialogSlots,
  recipe: Recipes.Dialog,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model => App.children.alert.helpers.close()(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Remove member',
            onClick: onMessage(
              App.Message.GotAlertMessage({ message: UiDialog.Message.RequestedOpen() }),
            ),
            style: Danger,
          },
          h,
        ),
        h.submodel({
          slotId: model.alert.id,
          model: model.alert,
          view: UiDialog.view,
          viewInputs: {
            hasDescription: true,
            toView: Dialog.toView([style.mixin], { h, role: 'alertdialog' }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.h2(dialog.title, ['Remove Ada from the team?']),
                        h.p(dialog.description, [
                          'She loses access to every project at once. Only an answer closes this.',
                        ]),
                        h.div(dialog.footer, [
                          Button.view(
                            {
                              label: 'Cancel',
                              onClick: onMessage(App.Message.Answered()),
                              style: Quiet,
                              attributes: { button: dialog.initialFocus },
                            },
                            h,
                          ),
                          Button.view(
                            {
                              label: 'Remove',
                              onClick: onMessage(App.Message.Answered()),
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
          toParentMessage: message => onMessage(App.Message.GotAlertMessage({ message })),
        }),
      ],
    ),
})
