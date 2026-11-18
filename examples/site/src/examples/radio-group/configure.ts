import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, RadioGroup, RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Cards = forSlots(RadioGroupSlots)(Recipes.RadioGroup({ variant: 'card' }))

// Every group of the application is a row of cards with the arrows as the
// APG asks them; a preset stacks them. The Message lift and the Model stay
// at the use.
const AppRadioGroup = RadioGroup.configure({
  base: { style: Cards, orientation: 'horizontal', mixins: [RadioGroup.readingKeys] },
  presets: { stacked: { orientation: 'vertical' } },
})

const App = Bundle.compose({ tier: Schema.OptionFromNullOr(Schema.String) }).pipe(
  Bundle.withChild('tiers', Bundles.RadioGroup, {
    args: { id: 'tier' },
    onOut: out => model => ({ model: { ...model, tier: Option.some(out.value) } }),
  }),
)

export default example({
  title: 'Configure once',
  slots: RadioGroupSlots,
  recipe: Recipes.RadioGroup,
  state: App.placements.runtime({ Model: App.Model, initial: { tier: Option.some('b') } }),
  view: ({ model, onMessage, h }) =>
    AppRadioGroup.view(
      {
        model: model.tiers,
        onMessage: message => onMessage(App.Message.GotTiersMessage({ message })),
        legend: 'Tier',
        options: [
          { value: 'a', label: 'Basic' },
          { value: 'b', label: 'Pro' },
        ],
        value: model.tier,
      },
      h,
    ),
})
