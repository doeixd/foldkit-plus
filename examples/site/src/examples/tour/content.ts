import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, Kbd, Recipes, Tour, TourSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// The steps are data in the Model; `content` draws Html in place of a step's
// words, here a key to press. Steps with no target stand in the middle,
// and `words` renames the buttons and the step's place.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Started: {} }),
  Bundle.withChild('tour', Bundles.Tour, {
    args: {
      id: 'content-tour',
      steps: [
        { title: 'Welcome', description: 'A short look around.' },
        { title: 'Search anywhere', description: 'Press K with Control to search.' },
      ],
    },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Rich content, in the middle',
  slots: TourSlots,
  recipe: Recipes.Tour,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model => App.children.tour.helpers.start()(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Take the tour', onClick: onMessage(App.Message.Started()), style: Primary },
          h,
        ),
        Tour.view(
          {
            model: model.tour,
            onMessage: message => onMessage(App.Message.GotTourMessage({ message })),
            content: (step, index) =>
              index === 1
                ? h.p(
                    [],
                    ['Press ', Kbd.combo({ keys: ['Ctrl', 'K'], joiner: '+' }, h), ' to search.'],
                  )
                : h.p([], [step.description]),
            words: { skip: 'Not now', done: 'Got it', progress: 'Step {step} of {count}' },
            style,
            mixins: Tour.focusReturn,
          },
          h,
        ),
      ],
    ),
})
