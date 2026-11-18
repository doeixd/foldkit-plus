import { Meter, MeterSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// `orientation: 'vertical'` stands the track upright, the fill growing from
// its foot: a tank, a level, an equalizer. The size is still the thickness.
const tanks = [
  { id: 'water', label: 'Water', value: 72 },
  { id: 'fuel', label: 'Fuel', value: 38 },
  { id: 'waste', label: 'Waste', value: 88 },
]

export default example({
  title: 'Vertical',
  slots: MeterSlots,
  recipe: Recipes.Meter,
  view: ({ style, h }) =>
    row(
      h,
      tanks.map(({ id, label, value }) =>
        Meter.view(
          {
            id,
            label,
            value,
            low: 25,
            high: 75,
            optimum: id === 'waste' ? 0 : 100,
            orientation: 'vertical',
            style,
          },
          h,
        ),
      ),
    ),
})
