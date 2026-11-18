import * as UiDialog from '@foldkit/ui/dialog'
import { Bundles, Button, ButtonSlots, DialogSlots, Recipes, Sheet } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))
const Quiet = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'ghost' }))

const open = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedOpen() })
const close = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() })

// From the end edge (`side: 'right'`) with no handle: a side panel.
export default example({
  title: 'From the side',
  slots: DialogSlots,
  recipe: Recipes.Sheet,
  state: Bundles.Sheet.with({ id: 'profile', side: 'right' }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view({ label: 'Edit profile', onClick: onMessage(open), style: Quiet }, h),
        Sheet.view(
          {
            model,
            onMessage,
            mixins: [style.mixin],
            hasDescription: true,
            draw: sheet =>
              h.dialog(
                sheet.dialog,
                sheet.isVisible
                  ? [
                      h.div(sheet.backdrop),
                      h.div(sheet.panel, [
                        h.button(sheet.closeButton, ['✕']),
                        h.h2(sheet.title, ['Edit profile']),
                        h.p(sheet.description, ['Changes show once you save. Escape keeps them.']),
                        h.div(sheet.footer, [
                          Button.view(
                            { label: 'Cancel', onClick: onMessage(close), style: Quiet },
                            h,
                          ),
                          Button.view(
                            { label: 'Save', onClick: onMessage(close), style: Primary },
                            h,
                          ),
                        ]),
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
