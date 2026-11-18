import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The tabs' focus is the Bundle's; which tab is chosen is the application's,
// set from the `Selected` the Bundle reports and given back as `value`.
const App = Bundle.compose({ section: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'project' },
    onOut: out => model => ({ model: { ...model, section: out.value } }),
  }),
)

export default example({
  title: 'Underline',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  state: App.placements.runtime({ Model: App.Model, initial: { section: 'overview' } }),
  view: ({ style, model, onMessage, h }) =>
    Tabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Project',
        value: model.section,
        tabs: [
          {
            value: 'overview',
            label: 'Overview',
            panel: h.p([], ['Six people, three open milestones, one launch.']),
          },
          {
            value: 'activity',
            label: 'Activity',
            panel: h.p([], ['Ada published the pricing page an hour ago.']),
          },
          {
            value: 'settings',
            label: 'Settings',
            panel: h.p([], ['Who can see the project, and who can edit it.']),
          },
        ],
        style,
      },
      h,
    ),
})
