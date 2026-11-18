import { Style } from 'foldkit-mixins'
import { Meter, MeterSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The shipped sizes stop at `lg`. `add` gives the recipe one more: the track
// reads its thickness from the custom property the sizes set, flat or upright.
const Meters = Recipes.Meter.add({
  size: { xl: { root: Style.self({ '--_fk-meter-thick': '1.25rem' }) } },
})

export default example({
  title: 'A size of your own',
  slots: MeterSlots,
  recipe: Meters,
  pins: { size: 'xl' },
  view: ({ style, h }) =>
    Meter.view(
      { id: 'cpu', label: 'CPU load', value: 64, low: 50, high: 85, optimum: 0, style },
      h,
    ),
})
