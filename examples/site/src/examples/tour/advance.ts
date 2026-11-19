import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, Recipes, Tour, TourSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})
const Plain = Recipes.Button.style({ variant: 'outline' })

// A step that asks the reader to press something goes on when they do:
// `advanceOnClick: Tour.advanceOnClick` hears a press on the step's target
// through the cutout. It is a value, so a tour without it loads no listener.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Started: {} }),
  Bundle.withChild('tour', Bundles.Tour, {
    args: {
      id: 'advance-tour',
      steps: [
        { title: 'Make a draft', description: 'Press New to go on.', target: 'advance-new' },
        { title: 'Share it', description: 'Press Share to finish.', target: 'advance-share' },
      ],
    },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Go on when the target is pressed',
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
          { label: 'New', attributes: { button: [h.Id('advance-new')] }, style: Plain },
          h,
        ),
        Button.view(
          { label: 'Share', attributes: { button: [h.Id('advance-share')] }, style: Plain },
          h,
        ),
        Tour.view(
          {
            model: model.tour,
            onMessage: message => onMessage(App.Message.GotTourMessage({ message })),
            advanceOnClick: Tour.advanceOnClick,
            style,
            mixins: Tour.focusReturn,
          },
          h,
        ),
      ],
    ),
})
