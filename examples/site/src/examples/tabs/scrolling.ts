import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ chosen: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'scrolling' },
    onOut: out => model => ({ model: { ...model, chosen: out.value } }),
  }),
)

const files = [
  'index.ts',
  'view.ts',
  'update.ts',
  'model.ts',
  'message.ts',
  'routes.ts',
  'theme.ts',
]

// More tabs than fit: one line that scrolls, its edges fading where more lies
// past, and focus scrolling a tab into view.
export default example({
  title: 'Scrolling',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  pins: { overflow: 'scroll' },
  state: App.placements.runtime({ Model: App.Model, initial: { chosen: 'view.ts' } }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(20rem, 100%)' })],
      [
        Tabs.view(
          {
            model: model.tabs,
            onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
            label: 'Open files',
            value: model.chosen,
            tabs: files.map(file => ({ value: file, label: file })),
            style,
            mixins: [...Tabs.fluid],
          },
          h,
        ),
      ],
    ),
})
