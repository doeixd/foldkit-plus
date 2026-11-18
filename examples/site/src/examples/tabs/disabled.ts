import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ plan: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    // `Manual`: the arrows move focus, and Enter or Space chooses.
    args: { id: 'plans', activationMode: 'Manual' },
    onOut: out => model => ({ model: { ...model, plan: out.value } }),
  }),
)

// A row may be `disabled`: it stays in the list, and the arrows pass over it.
export default example({
  title: 'Disabled, chosen with Enter',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  state: App.placements.runtime({ Model: App.Model, initial: { plan: 'free' } }),
  view: ({ style, model, onMessage, h }) =>
    Tabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Plans',
        value: model.plan,
        tabs: [
          { value: 'free', label: 'Free', panel: h.p([], ['Three projects.']) },
          { value: 'team', label: 'Team', panel: h.p([], ['Unlimited projects.']) },
          { value: 'enterprise', label: 'Enterprise', disabled: true },
        ],
        style,
      },
      h,
    ),
})
