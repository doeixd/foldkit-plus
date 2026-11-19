import * as UiDialog from '@foldkit/ui/dialog'
import { SlotView } from 'foldkit-mixins'
import {
  Bundles,
  Button,
  ButtonSlots,
  Dialog,
  DialogSlots,
  Input,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'ghost' })
const Field = Recipes.Input.style({})

// A form in the body, its submit button in the footer: `form` ties the two,
// so Enter in a field submits it too. `Dialog.keyboard` keeps the panel above
// the on-screen keyboard of a phone while a field has focus.
export default example({
  title: 'A form',
  slots: DialogSlots,
  recipe: Recipes.Dialog,
  state: Bundles.Dialog.with({ id: 'rename', isAnimated: true }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Rename page',
            onClick: onMessage(UiDialog.Message.RequestedOpen()),
            style: Quiet,
          },
          h,
        ),
        h.submodel({
          slotId: model.id,
          model,
          view: UiDialog.view,
          viewInputs: {
            toView: Dialog.toView([style.mixin, ...Dialog.keyboard], { h }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.button(dialog.closeButton, ['✕']),
                        h.h2(dialog.title, ['Rename page']),
                        h.div(dialog.body, [
                          h.div(dialog.scroll, [
                            h.form(
                              [
                                h.Id('rename-form'),
                                h.OnSubmit(onMessage(UiDialog.Message.RequestedClose())),
                              ],
                              [
                                Input.view(
                                  {
                                    id: 'rename-title',
                                    value: 'Quarterly plan',
                                    style: Field,
                                    draw: (resolved, h) =>
                                      h.div(
                                        [],
                                        [
                                          h.label(resolved.label, ['Title']),
                                          h.input(resolved.input),
                                        ],
                                      ),
                                  },
                                  h,
                                ),
                              ],
                            ),
                          ]),
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
                          h.button(
                            SlotView.buildersFor(ButtonSlots, [Primary.mixin], {
                              input: undefined,
                              h,
                            }).button.attrs([h.Type('submit'), h.FormAttr('rename-form')]),
                            ['Rename'],
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
