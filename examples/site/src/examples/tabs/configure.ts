import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Pills = Recipes.Tabs.style({ variant: 'pill' })

// The look every tab list of the application starts from, and a named preset
// over it. `fluid` is imported here, in the application's own module, so a
// site that never names it never loads it.
const AppTabs = Tabs.configure({
  base: { style: Pills, mixins: [...Tabs.fluid] },
  presets: { sidebar: { orientation: 'vertical' } },
})

const App = Bundle.compose({ topic: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'topics' },
    onOut: out => model => ({ model: { ...model, topic: out.value } }),
  }),
)

export default example({
  title: 'Configure once',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  state: App.placements.runtime({ Model: App.Model, initial: { topic: 'styles' } }),
  view: ({ model, onMessage, h }) =>
    AppTabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Topics',
        preset: 'sidebar',
        value: model.topic,
        tabs: [
          { value: 'styles', label: 'Styles', panel: h.p([], ['Recipes and tokens.']) },
          { value: 'behaviour', label: 'Behaviour', panel: h.p([], ['Mounts and keys.']) },
        ],
      },
      h,
    ),
})
