import * as UiDialog from '@foldkit/ui/dialog'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, DialogSlots, Recipes, Sheet } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'ghost' })

const open = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedOpen() })
const close = Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() })

// Two Sheets in two fields. The second is drawn inside the first one's
// `dialog`, beside its panel, as nested dialogs are, and the first steps back
// while it is open (`covered`).
const App = Bundle.compose({}).pipe(
  Bundle.withChild('plans', Bundles.Sheet, {
    args: { id: 'plans' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('compare', Bundles.Sheet, {
    args: { id: 'compare', points: [0.6] },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Nested',
  slots: DialogSlots,
  recipe: Recipes.Sheet,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) => {
    const toPlans = (message: Sheet.Message) => onMessage(App.Message.GotPlansMessage({ message }))
    const toCompare = (message: Sheet.Message) =>
      onMessage(App.Message.GotCompareMessage({ message }))
    const inner = Sheet.view(
      {
        model: model.compare,
        onMessage: toCompare,
        mixins: [style.mixin],
        draw: sheet =>
          h.dialog(
            sheet.dialog,
            sheet.isVisible
              ? [
                  h.div(sheet.backdrop),
                  h.div(sheet.panel, [
                    h.div(sheet.handle),
                    h.h2(sheet.title, ['Compare plans']),
                    h.p([], ['Starter is free; Team is $12 an editor; Business adds sign-on.']),
                    Button.view({ label: 'Back', onClick: toCompare(close), style: Primary }, h),
                  ]),
                ]
              : [],
          ),
      },
      h,
    )
    return h.div(
      [],
      [
        Button.view({ label: 'Choose a plan', onClick: toPlans(open), style: Quiet }, h),
        Sheet.view(
          {
            model: model.plans,
            onMessage: toPlans,
            mixins: [style.mixin],
            covered: Sheet.isOpen(model.compare),
            draw: sheet =>
              h.dialog(
                sheet.dialog,
                sheet.isVisible
                  ? [
                      h.div(sheet.backdrop),
                      h.div(sheet.panel, [
                        h.div(sheet.handle),
                        h.h2(sheet.title, ['Plans']),
                        h.p([], ['Team: ten editors and every page.']),
                        Button.view(
                          { label: 'Compare plans', onClick: toCompare(open), style: Primary },
                          h,
                        ),
                      ]),
                      inner,
                    ]
                  : [],
              ),
          },
          h,
        ),
      ],
    )
  },
})
