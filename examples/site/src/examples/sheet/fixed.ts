import * as UiDialog from '@foldkit/ui/dialog'
import { Bundles, Button, DialogSlots, Recipes, Sheet } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'ghost' })

const open = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedOpen() })
const close = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() })

// `dismissible: false`: a drag moves it between its points and springs back,
// but never takes it away; only its button closes it.
export default example({
  title: 'Not dismissible',
  slots: DialogSlots,
  recipe: Recipes.Sheet,
  state: Bundles.Sheet.with({ id: 'checkout', points: [0.4, 0.8], dismissible: false }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view({ label: 'Start checkout', onClick: onMessage(open), style: Quiet }, h),
        Sheet.view(
          {
            model,
            onMessage,
            mixins: [style.mixin],
            draw: sheet =>
              h.dialog(
                sheet.dialog,
                sheet.isVisible
                  ? [
                      h.div(sheet.backdrop),
                      h.div(sheet.panel, [
                        h.div(sheet.handle),
                        h.h2(sheet.title, ['Confirm your order']),
                        h.p([], ['Two items, delivered on Thursday.']),
                        Button.view(
                          { label: 'Place order', onClick: onMessage(close), style: Primary },
                          h,
                        ),
                      ]),
                    ]
                  : [],
              ),
          },
          h,
        ),
      ],
    ),
})
