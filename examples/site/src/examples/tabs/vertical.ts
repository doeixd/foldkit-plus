import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ folder: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'folders' },
    onOut: out => model => ({ model: { ...model, folder: out.value } }),
  }),
)

// Upright: the arrows go up and down, the underline stands at the tabs' inline
// end, and the panel sits beside them.
export default example({
  title: 'Vertical',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  state: App.placements.runtime({ Model: App.Model, initial: { folder: 'inbox' } }),
  view: ({ style, model, onMessage, h }) =>
    Tabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Mail',
        orientation: 'vertical',
        value: model.folder,
        tabs: [
          { value: 'inbox', label: 'Inbox', panel: h.p([], ['Inbox is empty.']) },
          { value: 'drafts', label: 'Drafts', panel: h.p([], ['Drafts is empty.']) },
          { value: 'sent', label: 'Sent', panel: h.p([], ['Sent is empty.']) },
        ],
        style,
        mixins: [...Tabs.fluid, Tabs.readingKeys],
      },
      h,
    ),
})
