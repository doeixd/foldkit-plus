import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const plans = ['Hobby', 'Team', 'Business'] as const
const Plan = Listbox.one(plans)
const notes: Readonly<Record<(typeof plans)[number], string>> = {
  Hobby: 'For one person, free',
  Team: 'Shared projects and roles',
  Business: 'Single sign-on and audit logs',
}

const App = Bundle.compose({ plan: Schema.Option(Schema.Literals(plans)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'plan' },
    onOut: out => model => ({ model: { ...model, plan: Plan.picked(model.plan, out) } }),
  }),
)

// A line under each label, in the list only: the trigger shows the label.
export default example({
  title: 'Descriptions',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { plan: Option.some('Team') } }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Plan',
        choice: Plan,
        value: model.plan,
        option: plan => ({ label: plan, description: notes[plan] }),
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})
