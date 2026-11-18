import { Style } from 'foldkit-mixins'
import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A look the recipe lacks, as a new value of an axis it has: `add` gives the
// connector a `dashed` value, and the shipped values still apply.
const Dashed = Recipes.Steps.add({
  connector: {
    dashed: {
      connector: Style.self({
        background: 'transparent',
        backgroundImage:
          'repeating-linear-gradient(to right, var(--fk-outline-default) 0 0.375rem, transparent 0.375rem 0.625rem)',
      }),
    },
  },
})

export default example({
  title: 'A look of your own',
  slots: StepsSlots,
  recipe: Dashed,
  pins: { connector: 'dashed' },
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Checkout',
        steps: [{ title: 'Account' }, { title: 'Plan' }, { title: 'Review' }],
        current: 1,
        style,
      },
      h,
    ),
})
