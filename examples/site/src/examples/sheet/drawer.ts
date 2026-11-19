import * as UiDialog from '@foldkit/ui/dialog'
import { SlotView } from 'foldkit-mixins'
import { Bundles, Button, DialogSlots, Recipes, Sheet } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { slots } from '../../snippets/theme.js'

const Primary = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'ghost' })
// The application's page, stepped back behind a sheet drawn with `scalesPage`.
const Page = slots({ page: Recipes.sheetPage })

// Opens at half its height (`points: [0.5, 1]`): its handle drags it to the
// next point, and down past the first one away. The page beside it, not
// around it, steps back while it is open. The buttons send the Dialog's own
// Messages, which the Sheet's Message wraps.
const open = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedOpen() })
const close = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() })

export default example({
  title: 'A drawer',
  slots: DialogSlots,
  recipe: Recipes.Sheet,
  state: Bundles.Sheet.with({ id: 'filters', side: 'bottom', points: [0.5, 1] }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
      [
        h.div(
          SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h }).page.attrs([
            h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' }),
          ]),
          [
            h.p([], ['Twelve results near you.']),
            Button.view({ label: 'Filters', onClick: onMessage(open), style: Quiet }, h),
          ],
        ),
        Sheet.view(
          {
            model,
            onMessage,
            mixins: [style.mixin],
            scalesPage: true,
            draw: sheet =>
              h.dialog(
                sheet.dialog,
                sheet.isVisible
                  ? [
                      h.div(sheet.backdrop),
                      h.div(sheet.panel, [
                        h.div(sheet.handle),
                        h.h2(sheet.title, ['Filters']),
                        h.p([], ['Only what is in stock, nearest first.']),
                        h.p([], ['Drag the handle up for every filter, or down to close.']),
                        Button.view(
                          { label: 'Show results', onClick: onMessage(close), style: Primary },
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
