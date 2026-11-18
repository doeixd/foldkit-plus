import { Option, Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ files: Schema.Array(Schema.String), chosen: Schema.String }).pipe(
  Bundle.withMessages({ Closed: { file: Schema.String } }),
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'files' },
    onOut: out => model => ({ model: { ...model, chosen: out.value } }),
  }),
)

// Each tab closes with its cross or Delete. `Tabs.closing` says what is left
// and which tab takes focus, the one that followed the closed one.
export default example({
  title: 'Closable',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { files: ['index.ts', 'view.ts', 'update.ts'], chosen: 'view.ts' },
    update: App.placements.update((model, { file }) => {
      const after = Tabs.closing(model.files, model.chosen, file)
      return {
        model: modifyFields(model, {
          files: () => after.tabs,
          chosen: chosen => Option.getOrElse(after.selected, () => chosen),
        }),
        commands: Command.mapMessages(
          Option.toArray(
            Option.map(after.focus, index => UiTabs.FocusTab({ id: model.tabs.id, index })),
          ),
          message => App.Message.GotTabsMessage({ message }),
        ),
      }
    }),
  }),
  view: ({ style, model, onMessage, h }) =>
    Tabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Open files',
        value: model.chosen,
        tabs: model.files.map(file => ({ value: file, label: file })),
        close: { onClose: file => onMessage(App.Message.Closed({ file })) },
        style,
        mixins: [...Tabs.fluid],
      },
      h,
    ),
})
