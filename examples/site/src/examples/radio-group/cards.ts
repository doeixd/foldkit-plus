import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Badge, Bundles, RadioGroup, RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Tag = Recipes.Badge.style({})

const App = Bundle.compose({ plan: Schema.OptionFromNullOr(Schema.String) }).pipe(
  Bundle.withChild('plans', Bundles.RadioGroup, {
    args: { id: 'pricing' },
    onOut: out => model => ({ model: { ...model, plan: Option.some(out.value) } }),
  }),
)

// `variant: 'card'` boxes each row and fills the chosen one. A row's mark
// (`icon`) and its `trailing` badge are drawn in slots of their own, so a
// pricing card is data and two Html.
export default example({
  title: 'Cards',
  slots: RadioGroupSlots,
  recipe: Recipes.RadioGroup,
  pins: { variant: 'card' },
  state: App.placements.runtime({ Model: App.Model, initial: { plan: Option.some('team') } }),
  view: ({ style, model, onMessage, h }) =>
    RadioGroup.view(
      {
        model: model.plans,
        onMessage: message => onMessage(App.Message.GotPlansMessage({ message })),
        legend: 'Plan',
        options: [
          { value: 'solo', label: 'Solo', description: 'One editor.', icon: h.span([], ['1']) },
          {
            value: 'team',
            label: 'Team',
            description: 'Ten editors.',
            icon: h.span([], ['10']),
            trailing: Badge.view({ text: 'Popular', tone: 'accent', style: Tag }, h),
          },
        ],
        value: model.plan,
        style,
      },
      h,
    ),
})
