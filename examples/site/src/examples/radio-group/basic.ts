import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, RadioGroup, RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The focus cursor is the Bundle's; which option is chosen is the
// application's, set from the `Selected` the Bundle reports and given back
// as `value`.
const App = Bundle.compose({ plan: Schema.OptionFromNullOr(Schema.String) }).pipe(
  Bundle.withChild('plans', Bundles.RadioGroup, {
    args: { id: 'billing' },
    onOut: out => model => ({ model: { ...model, plan: Option.some(out.value) } }),
  }),
)

export default example({
  title: 'Descriptions',
  slots: RadioGroupSlots,
  recipe: Recipes.RadioGroup,
  state: App.placements.runtime({ Model: App.Model, initial: { plan: Option.some('annual') } }),
  view: ({ style, model, onMessage, h }) =>
    RadioGroup.view(
      {
        model: model.plans,
        onMessage: message => onMessage(App.Message.GotPlansMessage({ message })),
        legend: 'Billing',
        options: [
          {
            value: 'monthly',
            label: 'Monthly',
            description: '12 dollars a month, cancel any time.',
          },
          { value: 'annual', label: 'Annual', description: '100 dollars a year, two months free.' },
          { value: 'lifetime', label: 'Lifetime', description: 'Sold out.', disabled: true },
        ],
        value: model.plan,
        name: 'billing',
        style,
      },
      h,
    ),
})
