import * as UiDialog from '@foldkit/ui/dialog'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, Dialog, DialogSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'ghost' })

// A dialog opened from another: the inner one is drawn inside the outer
// `dialog`, beside its panel, and the outer panel steps back while it is
// open (`covered`). Escape closes the inner one first.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('share', Bundles.Dialog, {
    args: { id: 'share', isAnimated: true },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('link', Bundles.Dialog, {
    args: { id: 'share-link', isAnimated: true },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Nested',
  slots: DialogSlots,
  recipe: Recipes.Dialog,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) => {
    const toShare = (message: UiDialog.Message) =>
      onMessage(App.Message.GotShareMessage({ message }))
    const toLink = (message: UiDialog.Message) => onMessage(App.Message.GotLinkMessage({ message }))
    const inner = h.submodel({
      slotId: model.link.id,
      model: model.link,
      view: UiDialog.view,
      viewInputs: {
        toView: Dialog.toView([style.mixin], { h }, dialog =>
          h.dialog(
            dialog.dialog,
            dialog.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [
                    h.h2(dialog.title, ['Invite by link']),
                    h.p([], ['Anyone with the link joins as a viewer.']),
                    h.div(dialog.footer, [
                      Button.view(
                        {
                          label: 'Done',
                          onClick: toLink(UiDialog.Message.RequestedClose()),
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
      toParentMessage: toLink,
    })
    return h.div(
      [],
      [
        Button.view(
          { label: 'Share', onClick: toShare(UiDialog.Message.RequestedOpen()), style: Quiet },
          h,
        ),
        h.submodel({
          slotId: model.share.id,
          model: model.share,
          view: UiDialog.view,
          viewInputs: {
            toView: Dialog.toView([style.mixin], { h, covered: model.link.isOpen }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.button(dialog.closeButton, ['✕']),
                        h.h2(dialog.title, ['Share “Quarterly plan”']),
                        h.p([], ['Three people can edit it.']),
                        h.div(dialog.footer, [
                          Button.view(
                            {
                              label: 'Invite by link',
                              onClick: toLink(UiDialog.Message.RequestedOpen()),
                              style: Primary,
                            },
                            h,
                          ),
                        ]),
                      ]),
                      inner,
                    ]
                  : [],
              ),
            ),
          },
          toParentMessage: toShare,
        }),
      ],
    )
  },
})
