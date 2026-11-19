import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Button, Combobox, ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const City = Combobox.one(cities)
const LoadingStyle = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

// Whether the cities are still being fetched is the application's fact. While
// it holds, no row is offered and `empty` says why; after, it says no city
// matches the text.
const App = Bundle.compose({
  city: Schema.Option(Schema.Literals(cities)),
  loading: Schema.Boolean,
}).pipe(
  Bundle.withMessages({ ToggledLoading: {} }),
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'empty-city' },
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
)

export default example({
  title: 'Empty and loading',
  slots: ComboboxSlots,
  recipe: Recipes.Combobox,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { city: Option.none(), loading: false },
    update: App.placements.update(model => ({
      model: modifyFields(model, { loading: loading => !loading }),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Button.view(
        {
          label: 'Still loading',
          pressed: model.loading,
          onClick: onMessage(App.Message.ToggledLoading()),
          style: LoadingStyle,
        },
        h,
      ),
      Combobox.view(
        {
          model: model.box,
          onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
          label: 'City',
          choice: City,
          value: model.city,
          items: model.loading ? [] : undefined,
          filter: Combobox.contains,
          placeholder: 'Find a city',
          empty: h.span([], [model.loading ? 'Loading cities…' : 'No cities match']),
          style,
          mixins: Combobox.fluid,
        },
        h,
      ),
    ]),
})
