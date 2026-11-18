import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, RadioGroup, RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ size: Schema.OptionFromNullOr(Schema.String) }).pipe(
  Bundle.withChild('sizes', Bundles.RadioGroup, {
    args: { id: 'shirt' },
    onOut: out => model => ({ model: { ...model, size: Option.some(out.value) } }),
  }),
)

// A grid is a look: the rows set in columns that wrap as the room allows.
export default example({
  title: 'Grid',
  slots: RadioGroupSlots,
  recipe: Recipes.RadioGroup,
  pins: { variant: 'card', layout: 'grid' },
  state: App.placements.runtime({ Model: App.Model, initial: { size: Option.some('m') } }),
  view: ({ style, model, onMessage, h }) =>
    RadioGroup.view(
      {
        model: model.sizes,
        onMessage: message => onMessage(App.Message.GotSizesMessage({ message })),
        legend: 'Size',
        options: ['xs', 's', 'm', 'l', 'xl', 'xxl'].map(value => ({
          value,
          label: value.toUpperCase(),
        })),
        value: model.size,
        style,
      },
      h,
    ),
})
