import * as UiDialog from '@foldkit/ui/dialog'
import { Bundles, Button, Dialog, DialogSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'ghost' })

const TERMS = [
  'You keep the rights to what you make here. We keep a copy only to show it to the people you share it with.',
  'We delete a closed account’s pages after thirty days, unless the law asks us to keep them longer.',
  'We do not sell what we learn about you, and we tell you before a change to these terms takes effect.',
  'A page you publish is public: anyone with its link can read it, and search engines may list it.',
  'You may not use the service to break the law, or to send what no one asked for.',
  'Either of us may end this agreement with notice; what you made stays yours to download for thirty days.',
]

// A body longer than the screen scrolls under the heading, its own bar
// drawn by `Dialog.overlayBars`, while the footer's answers stay in view.
export default example({
  title: 'A long body',
  slots: DialogSlots,
  recipe: Recipes.Dialog,
  state: Bundles.Dialog.with({ id: 'terms-dialog', isAnimated: true }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Read the terms',
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
            toView: Dialog.toView([style.mixin, ...Dialog.overlayBars], { h }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.h2(dialog.title, ['Terms of service']),
                        h.div(dialog.body, [
                          h.div(
                            dialog.scroll,
                            // The reset zeroes a paragraph's margins: each term keeps a line between.
                            [...TERMS, ...TERMS].map(term =>
                              h.p([h.Style({ marginBlock: '0 0.75rem' })], [term]),
                            ),
                          ),
                          h.div(dialog.scrollBar, [h.div(dialog.scrollThumb)]),
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
                              label: 'Accept',
                              onClick: onMessage(UiDialog.Message.RequestedClose()),
                              style: Primary,
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
