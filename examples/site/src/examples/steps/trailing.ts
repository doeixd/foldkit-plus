import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A step's `trailing` Html ends its row: a time, a badge. Vertical, with
// each `description`, this is a timeline.
export default example({
  title: 'A timeline',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  pins: { orientation: 'vertical' },
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Flight',
        steps: [
          { title: 'Boarding', description: 'Gate 12', trailing: h.span([], ['09:30']) },
          { title: 'Departure', description: 'Runway 3', trailing: h.span([], ['10:05']) },
          { title: 'Landing', description: 'Terminal 2', trailing: h.span([], ['12:40']) },
        ],
        current: 1,
        style,
      },
      h,
    ),
})
