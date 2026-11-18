import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ section: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'pills' },
    onOut: out => model => ({ model: { ...model, section: out.value } }),
  }),
)

// A pill that glides to the chosen tab and a highlight that follows the
// pointer: `Tabs.fluid` is a value the application passes, so a page that
// never passes it never loads what moves them.
export default example({
  title: 'Pill',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  pins: { variant: 'pill' },
  state: App.placements.runtime({ Model: App.Model, initial: { section: 'overview' } }),
  view: ({ style, model, onMessage, h }) =>
    Tabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Project',
        value: model.section,
        tabs: [
          { value: 'overview', label: 'Overview', panel: h.p([], ['Six people, one launch.']) },
          { value: 'activity', label: 'Activity', panel: h.p([], ['Ada published a page.']) },
          { value: 'settings', label: 'Settings', panel: h.p([], ['Who can edit it.']) },
        ],
        style,
        mixins: [...Tabs.fluid],
      },
      h,
    ),
})
