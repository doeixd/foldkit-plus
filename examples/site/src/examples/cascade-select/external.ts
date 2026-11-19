import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { Places } from '../../snippets/places.js'

const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

// The path is the widget's own value, and `helpers.set` is how the parent
// writes it: buttons of the application's set it, or clear it with an empty
// path. A path that cannot be chosen is ignored, and nothing is reported.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Set: { path: Schema.Array(Schema.String) } }),
  Bundle.withChild('box', Bundles.CascadeSelect, {
    args: { id: 'city-external', config: Places },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Set from outside',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update((model, { path }) => App.children.box.helpers.set(path)(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    row(h, [
      CascadeSelect.view(
        {
          model: model.box,
          config: Places,
          onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
          label: 'City',
          style,
        },
        h,
      ),
      Button.view(
        {
          label: 'Tokyo',
          onClick: onMessage(App.Message.Set({ path: ['jp', 'kanto', 'tyo'] })),
          style: Quiet,
        },
        h,
      ),
      Button.view(
        { label: 'Reset', onClick: onMessage(App.Message.Set({ path: [] })), style: Quiet },
        h,
      ),
    ]),
})
