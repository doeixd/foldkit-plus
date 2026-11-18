import { Meter, MeterSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row, stack } from '../../snippets/layout.js'

// `segments` cuts the track into equal steps, as a battery icon or a
// password's strength is drawn. It cuts across an upright track too.
export default example({
  title: 'Segments',
  slots: MeterSlots,
  recipe: Recipes.Meter,
  view: ({ style, h }) =>
    row(h, [
      stack(h, [
        Meter.view(
          {
            id: 'strength',
            label: 'Password strength',
            value: 3,
            max: 4,
            low: 2,
            high: 3,
            optimum: 4,
            valueText: 'Good',
            segments: 4,
            style,
          },
          h,
        ),
        Meter.view(
          { id: 'cells', label: 'Charge', value: 40, optimum: 100, low: 20, segments: 5, style },
          h,
        ),
      ]),
      Meter.view(
        {
          id: 'volume',
          label: 'Volume',
          value: 60,
          low: 80,
          high: 90,
          optimum: 0,
          orientation: 'vertical',
          segments: 10,
          style,
        },
        h,
      ),
    ]),
})
