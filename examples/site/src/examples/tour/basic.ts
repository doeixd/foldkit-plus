import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, ButtonSlots, Recipes, Tour, TourSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))
const Plain = forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' }))

// Each step stands beside the element it explains, the page dimmed around a
// cutout over it; the arrows move on and back and Escape skips. The steps are
// the Bundle's args, kept in its Model. `Tour.focusReturn` gives focus back to
// the button that started it.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Started: {} }),
  Bundle.withChild('tour', Bundles.Tour, {
    args: {
      id: 'basic-tour',
      steps: [
        { title: 'Search', description: 'Find any page by its name.', target: 'basic-search' },
        {
          title: 'Save',
          description: 'Keep your work as you go.',
          target: 'basic-save',
          placement: 'right',
        },
        { title: 'That is all', description: 'Start the tour again from its button.' },
      ],
    },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Three steps',
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
          { label: 'Search', attributes: { button: [h.Id('basic-search')] }, style: Plain },
          h,
        ),
        Button.view(
          { label: 'Save', attributes: { button: [h.Id('basic-save')] }, style: Plain },
          h,
        ),
        Tour.view(
          {
            model: model.tour,
            onMessage: message => onMessage(App.Message.GotTourMessage({ message })),
            style,
            mixins: Tour.focusReturn,
          },
          h,
        ),
      ],
    ),
})
