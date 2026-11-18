import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, ButtonSlots, Recipes, Tour, TourSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))
const Plain = forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' }))

// Every tour of an application said once: focus goes back to what started it
// and a press on the dim skips. The `strict` preset keeps the target out of
// reach, so the reader follows the steps and not the page.
const AppTour = Tour.configure({
  base: { mixins: Tour.focusReturn, dismissOnOutside: true },
  presets: { strict: { interactive: false, words: { skip: 'Leave' } } },
})

const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Started: {} }),
  Bundle.withChild('tour', Bundles.Tour, {
    args: {
      id: 'configure-tour',
      steps: [
        { title: 'Export', description: 'Your data, as a file.', target: 'configure-export' },
      ],
    },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Configure once',
  slots: TourSlots,
  recipe: Recipes.Tour,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model => App.children.tour.helpers.start()(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' })],
      [
        Button.view(
          { label: 'Start the tour', onClick: onMessage(App.Message.Started()), style: Primary },
          h,
        ),
        Button.view(
          { label: 'Export', attributes: { button: [h.Id('configure-export')] }, style: Plain },
          h,
        ),
        AppTour.view(
          {
            preset: 'strict',
            model: model.tour,
            onMessage: message => onMessage(App.Message.GotTourMessage({ message })),
            style,
          },
          h,
        ),
      ],
    ),
})
